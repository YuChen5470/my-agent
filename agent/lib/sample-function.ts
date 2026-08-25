import type { MathNode } from "mathjs";
import { toRealNumber } from "./safe-math";

export type Point = { x: number; y: number };
export type Segment = Point[];

export type SampleResult = {
  segments: Segment[];
  /** Samples with no real value at all, e.g. sqrt(x) for x < 0. */
  undefinedCount: number;
  /** Samples dropped for being far outside the plotting window (poles). */
  clippedCount: number;
  yWindow: { min: number; max: number } | null;
};

/**
 * How far outside the interquartile range a value must be to count as
 * off-screen. Tuned empirically: 12 keeps `exp(x)` and `x^3` whole over
 * [-5, 5] while cutting `1/x`, `1/x^2` and `tan(x)` at their poles.
 */
const IQR_FACTOR = 12;

/**
 * How many times the typical sample-to-sample change a jump must exceed to
 * count as a discontinuity. Only catches genuine jumps (step functions); poles
 * are handled by the window clip instead.
 */
const JUMP_FACTOR = 40;

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Sample a compiled expression across a range and split it into continuous
 * segments.
 *
 * The approach is to clip to a robust vertical window, the way a real plotter
 * draws inside a viewport: points outside the window are simply not drawn,
 * which breaks the curve at a pole for free. Three earlier approaches failed,
 * each caught by probing rather than reasoning:
 *
 *   - Checking for NaN alone. mathjs returns *complex* numbers for real-domain
 *     violations — `sqrt(-1)` is `i`, `log(-1)` is `3.14i` — so `sqrt(x)` grew
 *     a phantom curve left of the origin.
 *   - Checking for Infinity. `tan(pi/2)` is about 1.6e16, a large finite
 *     number, so poles slipped through.
 *   - A jump test requiring a sign flip. `1/(x^2)` approaches +inf from both
 *     sides, and its samples either side of the pole are nearly *equal*, so no
 *     jump test of any threshold can see it.
 *
 * Verified against x^2, x^3, sin, abs, exp (1 segment each), 1/x, 1/x^2,
 * 1/(x-2) (2 each), x^2/(x^2-1) (3), and tan over [-5,5] (5, one per pole).
 */
export function sampleFunction(
  compiled: { evaluate: (scope: Record<string, number>) => unknown },
  variable: string,
  from: number,
  to: number,
  samples: number
): SampleResult {
  const step = (to - from) / (samples - 1);
  const raw: (Point | null)[] = [];
  let undefinedCount = 0;

  for (let i = 0; i < samples; i++) {
    const x = from + i * step;
    let y: number | null;

    try {
      y = toRealNumber(compiled.evaluate({ [variable]: x }));
    } catch {
      // Per-sample failures are ordinary (domain errors, division by zero) and
      // mean only "nothing to draw at this x".
      y = null;
    }

    if (y === null) {
      undefinedCount++;
      raw.push(null);
    } else {
      raw.push({ x, y });
    }
  }

  const defined = raw.filter((p): p is Point => p !== null);
  const sortedYs = defined.map((p) => p.y).sort((a, b) => a - b);

  let min = -Infinity;
  let max = Infinity;
  if (sortedYs.length > 3) {
    const q1 = quantile(sortedYs, 0.25);
    const q3 = quantile(sortedYs, 0.75);
    const iqr = q3 - q1;
    if (iqr > 0) {
      min = q1 - IQR_FACTOR * iqr;
      max = q3 + IQR_FACTOR * iqr;
    }
  }

  const clipped = raw.map((p) =>
    p !== null && p.y >= min && p.y <= max ? p : null
  );
  const clippedCount = defined.length - clipped.filter((p) => p !== null).length;

  const inWindow = clipped
    .filter((p): p is Point => p !== null)
    .map((p) => p.y);
  const span =
    inWindow.length > 0 ? Math.max(...inWindow) - Math.min(...inWindow) : 0;
  const jumpThreshold =
    span > 0 ? (span / samples) * JUMP_FACTOR : Number.POSITIVE_INFINITY;

  const segments: Segment[] = [];
  let current: Segment = [];

  const flush = () => {
    // A single point cannot be drawn as a line, so it is not a segment.
    if (current.length > 1) {
      segments.push(current);
    }
    current = [];
  };

  for (const point of clipped) {
    if (point === null) {
      flush();
      continue;
    }

    const previous = current.at(-1);
    if (previous && Math.abs(point.y - previous.y) > jumpThreshold) {
      flush();
    }

    current.push(point);
  }

  flush();

  return {
    segments,
    undefinedCount,
    clippedCount,
    yWindow:
      Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null,
  };
}

/**
 * Free variables in an expression, so multivariate input can be rejected.
 *
 * The `path !== "fn"` filter matters: without it, mathjs reports the function
 * name as a symbol too, so `sin(x)` comes back as ["sin", "x"] and every
 * trigonometric plot looks multivariate.
 */
export function freeVariables(node: MathNode): string[] {
  const found = new Set<string>();
  node
    .filter((child, path) => child.type === "SymbolNode" && path !== "fn")
    .forEach((child) => {
      found.add((child as unknown as { name: string }).name);
    });
  return [...found];
}
