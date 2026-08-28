/**
 * Talks to Cloudflare Workers AI and Vectorize over REST.
 *
 * The reference implementation is the ingest pipeline in the sibling
 * `gai-rag-skeleton` folder (`scripts/cf.ts`). Only the read half is needed
 * here: the agent searches an index that has already been built, so `embed`
 * and `query` are ported and `upsert`/`waitForMutation` are not.
 *
 * EMBED_MODEL must stay identical to the one ingest used. An embedding is only
 * comparable to other embeddings from the same model, so a mismatch here does
 * not error — it silently returns confident nonsense, which is far worse.
 */

/** 768 dimensions, matching the index's configured dimensionality. */
export const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

export interface Match {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  index: string;
}

/**
 * Read at call time rather than at module load.
 *
 * A missing variable should surface as a tool error the model can report, not
 * as a throw during module initialisation that takes the whole route down. This
 * matters on Vercel, where an environment variable added after the last build
 * is simply absent.
 */
function config(): CloudflareConfig | { error: string } {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const index = process.env.CF_VECTORIZE_INDEX;

  const missing = [
    ["CF_ACCOUNT_ID", accountId],
    ["CF_API_TOKEN", apiToken],
    ["CF_VECTORIZE_INDEX", index],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    return {
      error: `Document search is not configured: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set.`,
    };
  }

  return {
    accountId: accountId as string,
    apiToken: apiToken as string,
    index: index as string,
  };
}

/** Embed one string. Returns the 768 numbers describing its meaning. */
async function embed(
  cf: CloudflareConfig,
  text: string
): Promise<number[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/ai/run/${EMBED_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cf.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: [text] }),
    }
  );

  const json = (await res.json()) as {
    success?: boolean;
    errors?: unknown;
    result?: { data?: number[][] };
  };

  if (!res.ok || !json.success) {
    throw new Error(
      `Workers AI ${res.status}: ${JSON.stringify(json.errors ?? json)}`
    );
  }

  const vector = json.result?.data?.[0];
  if (!vector) {
    throw new Error("Workers AI returned no embedding.");
  }
  return vector;
}

/**
 * Ask the index which stored chunks sit closest to `vector`.
 *
 * `returnMetadata: "all"` is the string "all", not `true`. Without it the
 * matches come back with ids and scores but no text, which is the one thing
 * that is actually needed.
 */
async function queryIndex(
  cf: CloudflareConfig,
  vector: number[],
  topK: number
): Promise<Match[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/vectorize/v2/indexes/${cf.index}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cf.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ vector, topK, returnMetadata: "all" }),
    }
  );

  const json = (await res.json()) as {
    success?: boolean;
    errors?: unknown;
    result?: { matches?: Match[] };
  };

  if (!res.ok || !json.success) {
    throw new Error(
      `Vectorize query ${res.status}: ${JSON.stringify(json.errors ?? json)}`
    );
  }

  return json.result?.matches ?? [];
}

/** Embed a question and return the closest stored chunks. */
export async function searchIndex(
  question: string,
  topK: number
): Promise<{ ok: true; matches: Match[] } | { ok: false; error: string }> {
  const cf = config();
  if ("error" in cf) {
    return { ok: false, error: cf.error };
  }

  try {
    const vector = await embed(cf, question);
    return { ok: true, matches: await queryIndex(cf, vector, topK) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
