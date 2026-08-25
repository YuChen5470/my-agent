import { defineEval } from "eve/evals";

/**
 * A word problem must park on a confirmation before computing anything.
 *
 * The assertion is `parked()`, not `succeeded()`: a clean park on unanswered
 * HITL input is exactly the desired end state here, and `succeeded()` would
 * reject it. The failure this catches is the agent charging ahead and answering
 * "2.04 seconds" — silently having chosen g, a sign convention, a zero initial
 * height and no air resistance, any of which could be wrong for the student's
 * actual problem.
 */
export default defineEval({
  description:
    "A word problem asks the student to confirm the interpretation before computing.",
  async test(t) {
    await t.send(
      "A ball is thrown upward at 20 m/s. When does it hit the ground?"
    );
    t.parked();
    t.calledTool("ask_question");
  },
});
