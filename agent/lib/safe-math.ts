import { all, create, type MathNode } from "mathjs";

/**
 * A mathjs instance hardened for untrusted input.
 *
 * The capability-bearing functions are captured *before* they are disabled, so
 * this module can still differentiate and simplify while an expression string
 * evaluated through it cannot reach them. mathjs's own security guidance is to
 * disable `derivative`/`simplify`/`parse` outright; capturing first keeps them
 * available to us without exposing them to the expression scope.
 *
 * mathjs is a parser rather than a wrapper around `eval`, so an expression can
 * never reach JS scope. Verified against 15.2: `config.constructor` and
 * `process` are both rejected by the parser itself.
 */
const math = create(all);

const capturedEvaluate = math.evaluate;
const capturedDerivative = math.derivative;
const capturedSimplify = math.simplify;
const capturedParse = math.parse;
const capturedFormat = math.format;
const capturedLeafCount = math.leafCount;

const disabled = (name: string) => () => {
  throw new Error(`Function ${name} is disabled`);
};

math.import(
  {
    import: disabled("import"),
    createUnit: disabled("createUnit"),
    reviver: disabled("reviver"),
    evaluate: disabled("evaluate"),
    parse: disabled("parse"),
    simplify: disabled("simplify"),
    derivative: disabled("derivative"),
    resolve: disabled("resolve"),
  },
  { override: true }
);

/**
 * Guards against expensive-to-evaluate input.
 *
 * The realistic threat is denial of service, not code execution: mathjs runs
 * synchronously on the event loop, so a single expensive expression blocks the
 * process and there is no way to interrupt it from the outside. A wall-clock
 * timeout is therefore not achievable in-process — the only real defence is to
 * refuse the expression before evaluating it. Running the parser in a worker
 * thread would allow true termination and is the upgrade path if this proves
 * insufficient.
 */
const MAX_EXPRESSION_LENGTH = 500;
const MAX_LEAF_COUNT = 100;

export class MathInputError extends Error {}

export function assertSafeExpression(expression: string): void {
  const trimmed = expression.trim();

  if (trimmed.length === 0) {
    throw new MathInputError("The expression is empty.");
  }

  if (trimmed.length > MAX_EXPRESSION_LENGTH) {
    throw new MathInputError(
      `The expression is too long (${trimmed.length} characters, limit ${MAX_EXPRESSION_LENGTH}).`
    );
  }

  let node: MathNode;
  try {
    node = capturedParse(trimmed);
  } catch (error) {
    throw new MathInputError(
      `That expression could not be parsed: ${describe(error)}`
    );
  }

  const leaves = capturedLeafCount(node);
  if (leaves > MAX_LEAF_COUNT) {
    throw new MathInputError(
      `The expression is too complex (${leaves} terms, limit ${MAX_LEAF_COUNT}).`
    );
  }
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse a validated expression into a node. */
export function parseExpression(expression: string): MathNode {
  assertSafeExpression(expression);
  return capturedParse(expression.trim());
}

/** Evaluate an expression to a value, with an optional variable scope. */
export function evaluateExpression(
  expression: string,
  scope: Record<string, number> = {}
): unknown {
  assertSafeExpression(expression);
  return capturedEvaluate(expression.trim(), scope);
}

export function differentiate(expression: string, variable: string): MathNode {
  assertSafeExpression(expression);
  return capturedDerivative(expression.trim(), variable);
}

export function simplifyExpression(expression: string): MathNode {
  assertSafeExpression(expression);
  return capturedSimplify(expression.trim());
}

/** Render any mathjs result (number, complex, matrix, unit) as a string. */
export function formatValue(value: unknown): string {
  return capturedFormat(value, { precision: 14 });
}

/**
 * Reduce a mathjs result to a real number, or null when there isn't one.
 *
 * `null` covers three distinct cases that all mean "no real value here", and
 * conflating them is deliberate — a plot cannot draw any of them:
 *
 *   - genuine NaN
 *   - infinities (`1/0`)
 *   - complex results, which mathjs returns instead of NaN for real-domain
 *     violations: `sqrt(-1)` is `i` and `log(-1)` is `3.14i`, not NaN
 *
 * That last case is the surprising one. Checking only for NaN would let
 * `sqrt(x)` plot a phantom curve left of the origin.
 */
export function toRealNumber(value: unknown): number | null {
  if (typeof value !== "number") {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}
