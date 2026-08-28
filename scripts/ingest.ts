// Ingest corpus/ -> chunk -> embed (Workers AI) -> upsert (Vectorize).
// Resumable: every chunk that lands is appended to ingest-log.jsonl immediately,
// and a re-run skips anything already in that log.
//
//   CF_ACCOUNT_ID=... CF_API_TOKEN=... npx tsx scripts/ingest.ts

import { readdir, readFile } from "node:fs/promises";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { processPdfAsync } from "@firecrawl/pdf-inspector";
import { embed, upsert, waitForMutation, INDEX_NAME, EMBED_MODEL, type VectorRecord } from "./cf.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(ROOT, "corpus");
const LOG = join(ROOT, "ingest-log.jsonl");

// 500/50 is a sensible default for a real corpus. If your documents are short,
// set CHUNK_WORDS=150 OVERLAP_WORDS=30 to actually see chunking happen.
const CHUNK_WORDS = Number(process.env.CHUNK_WORDS ?? 500);
const OVERLAP_WORDS = Number(process.env.OVERLAP_WORDS ?? 50);
const BATCH = 20; // embeddings per Workers AI call

function chunk(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= CHUNK_WORDS) return [words.join(" ")];
  const out: string[] = [];
  const step = CHUNK_WORDS - OVERLAP_WORDS;
  for (let i = 0; i < words.length; i += step) {
    out.push(words.slice(i, i + CHUNK_WORDS).join(" "));
    if (i + CHUNK_WORDS >= words.length) break;
  }
  return out;
}

async function fileToText(path: string): Promise<string> {
  if (path.endsWith(".pdf")) {
    // pdf-inspector parses the PDF natively (Rust) and hands back markdown.
    const result = await processPdfAsync(await readFile(path));
    return result.markdown ?? "";
  }
  return readFile(path, "utf8");
}

function alreadyDone(): Set<string> {
  if (!existsSync(LOG)) return new Set();
  const ids = readFileSync(LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).id as string);
  return new Set(ids);
}

async function main() {
  console.log(`index=${INDEX_NAME} model=${EMBED_MODEL}`);
  const done = alreadyDone();
  if (done.size) console.log(`resuming: ${done.size} chunks already ingested`);

  // corpus/README.md explains what to put in this folder — it is instructions
  // for a human, not course material. Indexing it puts a chunk about the ingest
  // pipeline in front of a student asking about their syllabus.
  const files = (await readdir(CORPUS))
    .filter((f) => /\.(md|txt|pdf)$/i.test(f))
    .filter((f) => f.toLowerCase() !== "readme.md")
    .sort();

  if (files.length === 0) {
    console.log(
      "corpus/ has no .pdf, .md or .txt files in it, so there is nothing to ingest.\n" +
        "Put your documents in corpus/ and run this again — see corpus/README.md."
    );
    return;
  }

  let embedded = 0;
  let skipped = 0;
  let lastMutation = "";

  for (const file of files) {
    const t0 = Date.now();
    const text = await fileToText(join(CORPUS, file));
    const chunks = chunk(text);
    console.log(`${file}: ${text.split(/\s+/).length} words -> ${chunks.length} chunks (${Date.now() - t0}ms to text)`);

    const pending = chunks
      .map((body, chunkIndex) => ({ id: `${file}#${chunkIndex}`, body, chunkIndex }))
      .filter((c) => {
        if (done.has(c.id)) {
          skipped++;
          return false;
        }
        return true;
      });

    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const te = Date.now();
      const vectors = await embed(batch.map((c) => c.body));
      console.log(`  embedded ${batch.length} chunks in ${Date.now() - te}ms (dims=${vectors[0].length})`);

      const records: VectorRecord[] = batch.map((c, j) => ({
        id: c.id,
        values: vectors[j],
        metadata: { source: file, chunkIndex: c.chunkIndex, text: c.body.slice(0, 3000) },
      }));

      const tu = Date.now();
      const result = await upsert(records);
      lastMutation = result.mutationId;
      console.log(`  upserted ${records.length} -> mutationId=${result.mutationId} (${Date.now() - tu}ms)`);

      // Flush one line per chunk immediately, so a crash costs one batch, not the run.
      for (const c of batch) {
        appendFileSync(
          LOG,
          JSON.stringify({ id: c.id, source: file, chunkIndex: c.chunkIndex, at: new Date().toISOString() }) + "\n",
        );
      }
      embedded += batch.length;
    }
  }

  console.log(`done: ${embedded} chunks ingested, ${skipped} skipped (already logged)`);
  if (embedded && lastMutation) {
    console.log("waiting for Vectorize to process the last mutation (usually 45-70s)...");
    await waitForMutation(lastMutation);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
