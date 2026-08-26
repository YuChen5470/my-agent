import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  MathInputError,
  describe,
  differentiate,
  evaluateExpression,
  formatValue,
  parseExpression,
  simplifyExpression,
} from "../lib/safe-math";

/**
 * Operations this tool can actually perform, versus those that need a real CAS.
 *
 * The unsupported ones are listed explicitly rather than omitted so the model
 * gets a clear refusal it can relay, instead of silently reaching for
 * `evaluate` and approximating an integral it was asked to derive.
 */
const SUPPORTED = ["evaluate", "differentiate", "simplify"] as const;
const NEEDS_CAS = ["integrate", "solve", "limit", "series"] as const;

const METHOD_NOTES: Record<(typeof SUPPORTED)[number], string> = {
  evaluate: "Evaluated numerically.",
  differentiate: "Differentiated symbolically.",
  simplify: "Simplified by collecting like terms and reducing constants.",
};

export default defineTool({
  description:
    "Evaluate or symbolically manipulate a mathematical expression. Use this for EVERY number you state, including trivial arithmetic. Supports numeric evaluation (including complex numbers and matrices), symbolic differentiation, and simplification.",
  inputSchema: z.object({
    operation: z
      .enum([...SUPPORTED, ...NEEDS_CAS])
      .describe("What to do with the expression."),
    expression: z
      .string()
      .describe(
        "The expression, in standard mathematical notation, e.g. 'x^3 + 2x', 'sqrt(16)', 'det([[1,2],[3,4]])'."
      ),
    variable: z
      .string()
      .optional()
      .describe(
        "The variable to differentiate with respect to. Defaults to 'x'."
      ),
    at: z
      .record(z.string(), z.number())
      .optional()
      .describe(
        "Values to substitute for variables before evaluating, e.g. { x: 2 }."
      ),
  }),
  async execute({ operation, expression, variable = "x", at = {} }) {
    if ((NEEDS_CAS as readonly string[]).includes(operation)) {
      return {
        ok: false as const,
        unsupported: true as const,
        error: `Symbolic ${operation} is not available in this build — it needs a full computer algebra system, which is not wired up yet. Tell the student plainly that you cannot compute this rather than attempting it yourself, and offer to walk the method instead.`,
      };
    }

    try {
      if (operation === "evaluate") {
        const value = evaluateExpression(expression, at);
        const exact = formatValue(value);
        const decimal =
          typeof value === "number" && !Number.isInteger(value)
            ? value.toPrecision(10).replace(/\.?0+$/, "")
            : undefined;

        return {
          ok: true as const,
          operation,
          expression,
          result: exact,
          // Only present when it differs from the exact form, so the model
          // isn't tempted to state "4 (or 4.000)".
          decimal: decimal === exact ? undefined : decimal,
          method: METHOD_NOTES.evaluate,
        };
      }

      if (operation === "differentiate") {
        const node = differentiate(expression, variable);
        return {
          ok: true as const,
          operation,
          expression,
          variable,
          result: node.toString(),
          method: METHOD_NOTES.differentiate,
        };
      }

      const node = simplifyExpression(expression);
      const result = node.toString();

      /**
       * Detect a simplify fixpoint and say so in the result.
       *
       * The model was observed simplifying its own answer three or four times
       * in a row on longer problems, which costs a model call per attempt and
       * burns the free tier's daily quota for no change in the maths. Both
       * sides are compared as parsed trees so that formatting alone — "x^2+1"
       * against "x^2 + 1" — does not read as progress.
       *
       * The instruction lives in `method` because that is the field the model
       * already quotes back when narrating a step.
       */
      const alreadySimplest = parseExpression(expression).toString() === result;

      return {
        ok: true as const,
        operation,
        expression,
        result,
        alreadySimplest,
        method: alreadySimplest
          ? "Already in its simplest form — simplifying changed nothing. State the expression as it stands and move on; do not call simplify on it again."
          : METHOD_NOTES.simplify,
      };
    } catch (error) {
      // A parse failure is the student's typo far more often than a bug, so
      // the message is meant to be shown to them.
      return {
        ok: false as const,
        unsupported: false as const,
        error:
          error instanceof MathInputError
            ? error.message
            : `That could not be computed: ${describe(error)}`,
      };
    }
  },
});
