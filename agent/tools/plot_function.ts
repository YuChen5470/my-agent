import { defineTool } from "eve/tools";
import { z } from "zod";
import { MathInputError, describe, parseExpression } from "../lib/safe-math";
import { freeVariables, sampleFunction } from "../lib/sample-function";

const SAMPLES = 400;

export default defineTool({
  description:
    "Plot a single real-valued function of one variable over a range. Returns the points for the UI to draw as a graph. Use this whenever a student would benefit from seeing a function's shape.",
  inputSchema: z.object({
    expression: z
      .string()
      .describe("The function to plot, e.g. 'sin(x)', '1/x', 'x^2 - 4'."),
    variable: z
      .string()
      .optional()
      .describe("The independent variable. Defaults to 'x'."),
    from: z.number().describe("Left end of the range."),
    to: z.number().describe("Right end of the range."),
  }),
  async execute({ expression, variable = "x", from, to }) {
    try {
      if (!(Number.isFinite(from) && Number.isFinite(to))) {
        return { ok: false as const, error: "The range must be finite." };
      }
      if (from >= to) {
        return {
          ok: false as const,
          error: `The range is empty: 'from' (${from}) must be less than 'to' (${to}).`,
        };
      }

      const node = parseExpression(expression);

      const variables = freeVariables(node);
      const unexpected = variables.filter((name) => name !== variable);
      if (unexpected.length > 0) {
        return {
          ok: false as const,
          error: `This tool plots a single function of ${variable} only, but the expression also contains ${unexpected.join(", ")}. Tell the student that surfaces and parametric curves are not supported.`,
        };
      }

      const compiled = node.compile();
      const { segments, undefinedCount, clippedCount, yWindow } =
        sampleFunction(compiled, variable, from, to, SAMPLES);

      if (segments.length === 0) {
        return {
          ok: false as const,
          error: `${expression} has no real values anywhere in [${from}, ${to}], so there is nothing to draw.`,
        };
      }

      return {
        ok: true as const,
        expression,
        variable,
        from,
        to,
        segments,
        yWindow,
      };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof MathInputError
            ? error.message
            : `That function could not be plotted: ${describe(error)}`,
      };
    }
  },
  /**
   * The model gets a description, not the coordinates.
   *
   * Several hundred {x, y} pairs would flood its context to no purpose — it
   * needs to know the curve was drawn and whether it broke into branches so it
   * can talk about the asymptotes. The full payload still reaches the UI.
   */
  toModelOutput(output) {
    if (!output.ok) {
      return { type: "text", value: output.error };
    }

    const pointCount = output.segments.reduce(
      (total, segment) => total + segment.length,
      0
    );
    const branches =
      output.segments.length === 1
        ? "a single continuous curve"
        : `${output.segments.length} separate branches, split at discontinuities`;

    return {
      type: "text",
      value: `Plotted ${output.expression} over [${output.from}, ${output.to}] as ${branches} (${pointCount} points). The graph is now displayed to the student. Do not restate the coordinates.`,
    };
  },
});
