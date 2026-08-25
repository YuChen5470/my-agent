import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description:
    "Symbolic differentiation goes through the tool, and the reply names the technique.",
  async test(t) {
    await t.send("Differentiate sin(x^2) with respect to x.");
    t.succeeded();
    t.calledTool("calculate", { input: { operation: "differentiate" } });

    // The derivative itself, however mathjs spaces it.
    t.check(t.reply, includes(/2\s*\*?\s*x\s*\*?\s*cos/i));

    // Naming the method is the tutoring, not a nicety: a student who is only
    // given 2x*cos(x^2) has learned this one answer and nothing transferable.
    t.check(t.reply, includes(/chain rule/i));
  },
});
