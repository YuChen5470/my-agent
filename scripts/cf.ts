// Shared Cloudflare REST helpers. No SDK, no Worker — just fetch.

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CF_API_TOKEN;
const INDEX = process.env.CF_VECTORIZE_INDEX ?? "my-rag-index";

if (!ACCOUNT_ID || !API_TOKEN) {
  const missing = [
    !ACCOUNT_ID && "CF_ACCOUNT_ID",
    !API_TOKEN && "CF_API_TOKEN",
  ].filter(Boolean);

  // A CLI failure a person reads directly, so it names what is missing and
  // where to put it rather than leaving them to read the source.
  console.error(
    `Cannot reach Cloudflare: ${missing.join(" and ")} ${
      missing.length === 1 ? "is" : "are"
    } not set.\n` +
      "Copy .env.example to .env.local and fill in your Cloudflare account id and\n" +
      "API token — the README's 'Building the document index' section says where\n" +
      "to find them."
  );
  process.exit(1);
}

export const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5"; // 768 dims

/**
 * Every Cloudflare REST response has this envelope: a success flag, an errors
 * array, and the payload under result. Typing it once here is what lets the
 * five call sites below check for failure without reaching for `any`.
 */
interface CloudflareResponse<T> {
  success?: boolean;
  errors?: unknown;
  result?: T;
}
export const INDEX_NAME = INDEX;

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;
const auth = { Authorization: `Bearer ${API_TOKEN}` };

/** Embed a batch of strings. Returns one 768-float array per input, in order. */
export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${BASE}/ai/run/${EMBED_MODEL}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts }),
  });
  const json = (await res.json()) as CloudflareResponse<{ data: number[][] }>;
  if (!res.ok || !json.success || !json.result) {
    throw new Error(`Workers AI ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.result.data;
}

export type VectorRecord = {
  id: string;
  values: number[];
  metadata: Record<string, string | number>;
};

/** Upsert vectors. Body is NDJSON (one JSON object per line), not a JSON array. */
export async function upsert(records: VectorRecord[]) {
  const ndjson = records.map((r) => JSON.stringify(r)).join("\n");
  const res = await fetch(`${BASE}/vectorize/v2/indexes/${INDEX}/upsert`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/x-ndjson" },
    body: ndjson,
  });
  const json = (await res.json()) as CloudflareResponse<{ mutationId: string }>;
  if (!res.ok || !json.success || !json.result) {
    throw new Error(`Vectorize upsert ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.result; // { mutationId }
}

/** Index stats, including how far the index has processed. */
export async function info(): Promise<{
  dimensions: number;
  vectorCount: number;
  processedUpToMutation: string | null;
}> {
  const res = await fetch(`${BASE}/vectorize/v2/indexes/${INDEX}/info`, { headers: auth });
  const json = (await res.json()) as CloudflareResponse<{
    dimensions: number;
    vectorCount: number;
    processedUpToMutation: string | null;
  }>;
  if (!res.ok || !json.success || !json.result) {
    throw new Error(`Vectorize info ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.result;
}

/**
 * Vectorize is eventually consistent: upserted vectors are not immediately
 * queryable, and — worse — they become queryable a few at a time, so a query
 * run too early returns confident but WRONG results. Poll until the index has
 * processed the mutation we care about. Observed lag: 45-70s.
 */
export async function waitForMutation(mutationId: string, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const i = await info();
    if (i.processedUpToMutation === mutationId) {
      console.log(`index caught up after ${Math.round((Date.now() - start) / 1000)}s (${i.vectorCount} vectors)`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.warn(`index did not report mutation ${mutationId} within ${timeoutMs / 1000}s`);
  return false;
}

export type Match = {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
};

/** Query the index with a single vector. */
export async function query(vector: number[], topK = 5): Promise<Match[]> {
  const res = await fetch(`${BASE}/vectorize/v2/indexes/${INDEX}/query`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ vector, topK, returnMetadata: "all" }),
  });
  const json = (await res.json()) as CloudflareResponse<{ matches: Match[] }>;
  if (!res.ok || !json.success || !json.result) {
    throw new Error(`Vectorize query ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.result.matches;
}
