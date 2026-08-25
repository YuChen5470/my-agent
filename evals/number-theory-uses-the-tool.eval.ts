import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

/**
 * 561 is a Carmichael number: it passes Fermat's test for many bases despite
 * being composite (3 x 11 x 17). A model reasoning about divisibility from
 * memory is exactly the kind of question it can get confidently wrong, which
 * makes it a better probe than an obvious composite.
 */
export default defineEval({
  description:
    "Primality and factorisation go through the number_theory tool, not recalled divisibility.",
  async test(t) {
    await t.send("Is 561 prime? Give me its prime factorisation.");
    t.succeeded();
    t.calledTool("number_theory");
    t.check(t.reply, includes("17"));
  },
});
