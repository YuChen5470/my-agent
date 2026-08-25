import { defineEval } from "eve/evals";

/**
 * Guards the segment contract at the agent boundary.
 *
 * A single segment spanning the pole would mean the student is shown a line
 * appearing to cross x = 0, implying 1/x has a value there. The assertion is on
 * the tool's *output* rather than the reply text, because the reply could
 * describe the asymptote correctly while the graph drawn underneath it is wrong.
 */
export default defineEval({
  description: "Plotting 1/x returns two branches, never one line through the pole.",
  async test(t) {
    await t.send("Plot 1/x from -5 to 5.");
    t.succeeded();
    t.calledTool("plot_function", {
      output: (value) => {
        const result = value as { ok?: boolean; segments?: unknown[] };
        return result?.ok === true && result.segments?.length === 2;
      },
    });
  },
});
