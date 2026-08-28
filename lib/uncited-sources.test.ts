/**
 * Rules for `uncitedSources`, run with `npm run test:citations`.
 *
 * Node's own test runner, driven through tsx — the project has no test
 * framework and this does not warrant adding one. eve's evals cover model
 * behaviour; this covers a pure function whose failure mode is silent.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { type AnswerPart, uncitedSources } from "./uncited-sources";

const chunk = (source: string) => ({
  source,
  chunkIndex: 0,
  score: 0.8,
  text: "passage",
});

const search = (verdict: string, sources: string[]): AnswerPart => ({
  type: "dynamic-tool",
  toolName: "search_documents",
  output: {
    ok: true,
    verdict,
    question: "q",
    chunks: sources.map(chunk),
    gate: null,
  },
});

const text = (t: string): AnswerPart => ({ type: "text", text: t });

const run = (parts: AnswerPart[]) => uncitedSources({ parts });

test("a filename written verbatim counts as cited", () => {
  assert.deepEqual(
    run([search("found", ["SPEC.pdf"]), text("The spec (SPEC.pdf) says 100 marks.")]),
    []
  );
});

test("a document used but never named is reported", () => {
  assert.deepEqual(
    run([search("found", ["SPEC.pdf"]), text("Paper 1 is 100 marks.")]),
    ["SPEC.pdf"]
  );
});

test("dropping the extension still counts as a citation", () => {
  assert.deepEqual(
    run([search("found", ["SPEC.pdf"]), text("The SPEC specification says so.")]),
    []
  );
});

test("citation matching ignores case", () => {
  assert.deepEqual(
    run([search("found", ["Spec.PDF"]), text("see spec.pdf for detail")]),
    []
  );
});

test("naming one of several retrieved files is enough", () => {
  // Retrieval offers five chunks and an answer rests on one. The others were
  // available, not used, and must not be reported as silently used.
  assert.deepEqual(
    run([search("found", ["A.pdf", "B.pdf"]), text("According to A.pdf, yes.")]),
    []
  );
});

test("naming none of them reports all of them", () => {
  assert.deepEqual(
    run([search("found", ["A.pdf", "B.pdf"]), text("The answer is 100 marks.")]),
    ["A.pdf", "B.pdf"]
  );
});

test("a citation in one search covers passages from another", () => {
  // Two searches in one turn is normal. What matters is that the finished
  // answer is traceable to something, not that each call was cited.
  assert.deepEqual(
    run([
      search("found", ["A.pdf"]),
      search("found", ["B.pdf"]),
      text("According to A.pdf, yes."),
    ]),
    []
  );
});

test("an uncertain verdict carries the same obligation as found", () => {
  assert.deepEqual(
    run([search("uncertain", ["SPEC.pdf"]), text("Probably 100 marks.")]),
    ["SPEC.pdf"]
  );
});

test("a verdict of none fed nothing, so nothing is owed", () => {
  assert.deepEqual(
    run([search("none", ["SPEC.pdf"]), text("The documents do not cover this.")]),
    []
  );
});

test("stays silent while the answer is still empty", () => {
  assert.deepEqual(run([search("found", ["SPEC.pdf"])]), []);
});

test("stays silent when no search ran at all", () => {
  assert.deepEqual(run([text("The derivative is 2x.")]), []);
});

test("ignores a failed search", () => {
  const failed: AnswerPart = {
    type: "dynamic-tool",
    toolName: "search_documents",
    output: { ok: false, error: "not configured" },
  };
  assert.deepEqual(run([failed, text("I could not search.")]), []);
});

test("ignores other tools' output", () => {
  const calc: AnswerPart = {
    type: "dynamic-tool",
    toolName: "calculate",
    output: { ok: true, result: "2x" },
  };
  assert.deepEqual(run([calc, text("The derivative is 2x.")]), []);
});

test("a short filename stem does not match inside an ordinary word", () => {
  // "A.pdf" has the stem "a", which a plain substring check finds in "marks".
  assert.deepEqual(
    run([search("found", ["A.pdf"]), text("The answer is 100 marks.")]),
    ["A.pdf"]
  );
});

test("a real filename is still matched when the answer names it", () => {
  assert.deepEqual(
    run([
      search("found", ["ALEVELEDEXGOVAIWRK.pdf"]),
      text("According to the specification (ALEVELEDEXGOVAIWRK.pdf), 100 marks."),
    ]),
    []
  );
});
