import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchIndex, type Match } from "../lib/retrieval";

/**
 * Searches the course documents: the Edexcel A level Mathematics specification
 * and a set of KCL past papers with their solutions.
 *
 * Retrieval is by meaning, not keyword, so the index always returns its five
 * closest chunks whether or not any of them answer the question. Deciding
 * "nothing relevant came back" is this tool's job, and the two rules below both
 * come from measurements on this corpus.
 */

/** How many chunks to ask for. Five is enough context without flooding the prompt. */
const TOP_K = 5;

/**
 * Below this, treat the corpus as having no answer.
 *
 * Measured on this corpus: a well-aimed question scores 0.75-0.80 against the
 * right chunk, while a question the documents cannot touch at all ("what is the
 * capital of Peru") tops out at 0.50. Cosine similarity with this model never
 * approaches zero, so a low score is nowhere near 0 and cannot be eyeballed.
 */
const MIN_SCORE = 0.65;

/**
 * At or above this, the match is strong enough to trust on its own.
 *
 * Measured: a question the specification directly answers ("how long is Paper 1
 * and how many marks") scores 0.84 against it. Nothing off-topic came close to
 * this in testing.
 */
const STRONG_SCORE = 0.75;

/**
 * The score gap between the best hit and the second best, below which mid-range
 * results are treated as unresolved rather than as an answer.
 *
 * Asked "what do I get marks for if I show working but get the wrong answer" —
 * which this corpus cannot answer, holding worked solutions rather than
 * method-mark rubrics — the top hit scored 0.694, comfortably past MIN_SCORE.
 * But all five hits landed within 0.03 of each other and were exam-hall
 * boilerplate and university regulations. No passage standing out, at a middling
 * score, means the index found the subject area and no specific answer.
 *
 * This check applies only *below* STRONG_SCORE, which is the correction to a
 * first version that applied it everywhere. Chunks from a document that genuinely
 * covers a topic also cluster tightly — the specification question above scored
 * 0.84 with a lead of 0.01 — and refusing those treated the strongest possible
 * evidence as a failure. A tight cluster is only suspicious when it is tight and
 * mediocre.
 */
const MIN_LEAD = 0.04;

interface Chunk {
  source: string;
  chunkIndex: number;
  score: number;
  text: string;
}

export default defineTool({
  description:
    "Search the course documents — the Edexcel A level Mathematics specification (9MA0) and KCL past exam papers with solutions — for passages relevant to a question. Use this for anything the documents are the authority on: what the specification requires, how a paper is structured, mark allocations, module content, or how a past paper question was solved. It returns the closest passages with a relevance score and the filename each came from. It may report that nothing relevant was found, which is a real answer and must be passed on to the student rather than filled in from your own knowledge.",
  inputSchema: z.object({
    question: z
      .string()
      .min(3)
      .describe(
        "What to look for, as a full question or descriptive phrase rather than keywords. Retrieval matches on meaning, so 'how many marks is the hypothesis testing question worth' works better than 'marks hypothesis'."
      ),
  }),
  async execute({ question }) {
    const result = await searchIndex(question, TOP_K);

    if (!result.ok) {
      return {
        ok: false as const,
        error: `The document search could not run: ${result.error}`,
        method:
          "Tell the student the documents could not be searched. Do not answer from your own knowledge of the syllabus as though it were sourced.",
      };
    }

    const chunks = result.matches.map(toChunk);

    if (chunks.length === 0) {
      return {
        ok: true as const,
        verdict: "none" as const,
        question,
        chunks: [],
        method:
          "The index returned nothing at all. Tell the student the documents do not cover this.",
      };
    }

    const top = chunks[0];
    const lead = chunks.length > 1 ? top.score - chunks[1].score : Infinity;

    // Reported whatever the verdict, so the UI can show the student the numbers
    // the decision was made on.
    const gate = {
      topScore: Number(top.score.toFixed(4)),
      lead: Number.isFinite(lead) ? Number(lead.toFixed(4)) : null,
      minScore: MIN_SCORE,
      strongScore: STRONG_SCORE,
      minLead: MIN_LEAD,
    };

    if (top.score < MIN_SCORE) {
      return {
        ok: true as const,
        verdict: "none" as const,
        question,
        gate,
        // Still returned so the student can see what was rejected and why.
        chunks,
        method: `Nothing relevant. The closest passage scored ${gate.topScore}, below the ${MIN_SCORE} relevance threshold. Tell the student these documents do not cover this, and do not answer it from your own knowledge as though the documents had said it.`,
      };
    }

    // The uncertain band: relevant enough not to dismiss, not distinctive
    // enough to trust blind. The model is the only thing here that can read the
    // passages and tell, so it is asked to — and told to refuse if they do not
    // answer, rather than assembling something out of near-misses.
    if (top.score < STRONG_SCORE && lead < MIN_LEAD) {
      return {
        ok: true as const,
        verdict: "uncertain" as const,
        question,
        gate,
        chunks,
        method: `Unresolved. The best passage scored ${gate.topScore} — relevant, but only ${gate.lead} clear of the next, so no passage stands out. On this corpus that usually means the search found the subject area rather than an answer. Read the passages and judge for yourself: if one genuinely answers the question, use it and cite it. If none does, say the documents do not cover this. Do not stitch an answer together from several near-misses.`,
      };
    }

    return {
      ok: true as const,
      verdict: "found" as const,
      question,
      gate,
      chunks,
      method:
        "Relevant passages found. Answer from these, and cite the filename each fact came from. Quote figures such as mark allocations and exam durations directly; anything you have to work out still goes through calculate or number_theory.",
    };
  },
});

/**
 * Reshape one Vectorize match into the fields the prompt and the UI need.
 *
 * Metadata arrives as `unknown` because it is whatever ingest chose to store,
 * so the source filename and chunk index are read defensively and fall back to
 * the vector id, which ingest builds as `filename#chunkIndex`.
 */
function toChunk(match: Match): Chunk {
  const metadata = match.metadata ?? {};
  const [idSource, idIndex] = String(match.id).split("#");

  return {
    source:
      typeof metadata.source === "string" ? metadata.source : (idSource ?? match.id),
    chunkIndex:
      typeof metadata.chunkIndex === "number"
        ? metadata.chunkIndex
        : Number(idIndex ?? 0),
    score: match.score,
    text: typeof metadata.text === "string" ? metadata.text : "",
  };
}
