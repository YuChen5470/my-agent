import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

/**
 * The most important eval in the suite.
 *
 * "What is 2+2?" is precisely the question a model is most tempted to answer
 * from its own head, and the answer would be *correct* — which is what makes
 * the failure invisible. Before eve's built-in tools were disabled, the agent
 * answered this by running `echo $((2 + 2))` in a sandbox, producing a right
 * answer with no tool of ours involved and nothing visibly wrong.
 *
 * If this eval ever fails, the product's central claim has stopped being true,
 * regardless of how good the replies look.
 */
export default defineEval({
  description:
    "Even trivial arithmetic goes through the calculate tool, never the model's head.",
  async test(t) {
    await t.send("What is 2+2?");
    t.succeeded();
    t.calledTool("calculate");
    t.check(t.reply, includes("4"));
  },
});
