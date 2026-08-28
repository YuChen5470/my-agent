/**
 * Finds the documents a turn retrieved and then failed to name in its answer.
 *
 * Citing a source is asked for in the instructions, and the model does it
 * reliably — but "reliably" is a weaker guarantee than the rest of this app
 * makes. Everywhere else a claim on screen is backed by something structural: a
 * number is on screen because a tool returned it. A citation was on screen only
 * because the model remembered a rule from three thousand tokens ago.
 *
 * This closes that gap from the other side. It cannot make the model write a
 * filename, but it can stop a document being used invisibly: if retrieved
 * passages fed an answer and the answer names none of them, the interface says
 * so itself. An uncited source becomes visibly uncited.
 *
 * It lives in its own module rather than inside the page component so it can be
 * tested directly — the rules below are exactly the kind that rot silently.
 */

/** The part shape this needs, kept loose so eve's message parts satisfy it. */
export interface AnswerPart {
  type: string;
  text?: string;
  toolName?: string;
  output?: unknown;
}

/** A retrieval result, as `search_documents` returns it. */
interface RetrievalOutput {
  ok?: boolean;
  verdict?: string;
  chunks?: { source?: unknown }[];
}

/**
 * Whether a citation of `source` appears anywhere in `answer`.
 *
 * The model usually writes the filename verbatim, but dropping the extension
 * ("the ALEVELEDEXGOVAIWRK specification") is still a citation a student can
 * trace, so it counts. Both sides are lowercased: a filename's case is not
 * something the model reproduces reliably, and a case difference is not a
 * missing citation.
 */
function isCited(source: string, answer: string): boolean {
  const name = source.toLowerCase();
  const stem = name.replace(/\.(pdf|md|txt)$/, "");
  return answer.includes(name) || answer.includes(stem);
}

export function uncitedSources(message: {
  parts: readonly AnswerPart[];
}): string[] {
  const used = new Set<string>();

  for (const part of message.parts) {
    if (part.type !== "dynamic-tool") continue;
    if (part.toolName !== "search_documents") continue;

    const output = part.output as RetrievalOutput | undefined;
    if (!output || output.ok !== true) continue;
    if (!Array.isArray(output.chunks)) continue;

    // A verdict of "none" fed nothing into the answer, so there is nothing the
    // answer should have cited. Only passages actually offered as evidence
    // carry an obligation.
    if (output.verdict !== "found" && output.verdict !== "uncertain") continue;

    for (const chunk of output.chunks) {
      if (typeof chunk?.source === "string") used.add(chunk.source);
    }
  }

  if (used.size === 0) return [];

  const answer = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
    .toLowerCase();

  // Nothing written yet means the turn is still streaming. Listing every source
  // as uncited here would flash a warning that retracts itself a second later.
  if (answer.trim() === "") return [];

  return [...used].filter((source) => !isCited(source, answer));
}
