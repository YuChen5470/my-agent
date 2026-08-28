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

  // Bounded, not a plain substring. A short stem otherwise matches inside
  // ordinary words — a file called "A.pdf" has the stem "a", which a naive
  // includes() finds in "marks" and calls a citation. Boundaries are
  // non-alphanumeric rather than \b so that a stem ending in a symbol still
  // terminates cleanly.
  const bounded = (needle: string) =>
    new RegExp(
      `(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`
    ).test(answer);

  return bounded(name) || bounded(stem);
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

  // All or nothing, deliberately.
  //
  // Retrieval returns five chunks and an answer legitimately rests on one of
  // them. The first version of this reported every retrieved file the answer
  // did not name, which meant a correct, properly cited answer about the
  // specification was accused of silently using three exam papers it had only
  // been offered and had rightly ignored. Retrieved is not used, and nothing
  // here can tell the two apart — only the model knows which passage it leaned
  // on.
  //
  // So this checks the one thing that is knowable from outside: whether an
  // answer built on retrieved passages named any of them at all. That is the
  // failure worth catching — an answer with no traceable source. Which of five
  // candidates deserved the credit is a question this cannot answer, and
  // guessing at it produced false accusations against good answers.
  const citedAny = [...used].some((source) => isCited(source, answer));
  return citedAny ? [] : [...used];
}
