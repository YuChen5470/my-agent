"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type PlotPoint = { x: number; y: number };

export type FunctionPlotProps = {
  expression: string;
  variable: string;
  from: number;
  to: number;
  segments: PlotPoint[][];
  yWindow: { min: number; max: number } | null;
};

/**
 * The SVG's internal coordinate space. The element scales itself to its
 * container via `viewBox` + `preserveAspectRatio="none"`, so it is responsive
 * without measuring anything.
 *
 * This is why the plot is hand-rolled rather than using Mafs: Mafs gates all
 * rendering behind `width > 0` from a ResizeObserver, which never fires in a
 * non-composited context, so the graph silently renders nothing and cannot be
 * verified headlessly. We were also already disabling Mafs's aspect-ratio, pan
 * and zoom to keep the hover mapping exact, so little of it was left in use.
 */
const WIDTH = 640;
const HEIGHT = 280;
const PADDING = 8;

export function FunctionPlot({
  expression,
  variable,
  from,
  to,
  segments,
  yWindow,
}: FunctionPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<PlotPoint | null>(null);

  const allPoints = useMemo(() => segments.flat(), [segments]);

  const [yMin, yMax] = useMemo<[number, number]>(() => {
    if (yWindow && yWindow.min < yWindow.max) {
      return [yWindow.min, yWindow.max];
    }
    if (allPoints.length === 0) return [-10, 10];
    const ys = allPoints.map((p) => p.y);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    // A constant function would otherwise give a zero-height window.
    return min === max ? [min - 1, max + 1] : [min, max];
  }, [allPoints, yWindow]);

  const toSvgX = useCallback(
    (x: number) =>
      PADDING + ((x - from) / (to - from)) * (WIDTH - 2 * PADDING),
    [from, to]
  );
  const toSvgY = useCallback(
    (y: number) =>
      HEIGHT - PADDING - ((y - yMin) / (yMax - yMin)) * (HEIGHT - 2 * PADDING),
    [yMax, yMin]
  );

  const xTicks = useMemo(() => niceTicks(from, to), [from, to]);
  const yTicks = useMemo(() => niceTicks(yMin, yMax), [yMax, yMin]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || allPoints.length === 0) return;

      // Undo the padding, which is in SVG units, before mapping to maths units.
      const paddingFraction = PADDING / WIDTH;
      const raw = (event.clientX - rect.left) / rect.width;
      const inner =
        (raw - paddingFraction) / (1 - 2 * paddingFraction);
      const mathX = from + inner * (to - from);

      // Snap to the nearest *sampled* point. Evaluating f(x) here in the
      // browser would put a number on screen with no tool call behind it,
      // which is the one thing this application promises never to do.
      let nearest = allPoints[0];
      let best = Math.abs(nearest.x - mathX);
      for (const point of allPoints) {
        const distance = Math.abs(point.x - mathX);
        if (distance < best) {
          best = distance;
          nearest = point;
        }
      }
      setHovered(nearest);
    },
    [allPoints, from, to]
  );

  const axisY = yMin <= 0 && 0 <= yMax ? toSvgY(0) : null;
  const axisX = from <= 0 && 0 <= to ? toSvgX(0) : null;

  return (
    <div className="not-prose my-3 w-full">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">
          {expression}
          {segments.length > 1 ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {segments.length} branches
            </span>
          ) : null}
        </span>
        <span className="font-mono text-muted-foreground tabular-nums">
          {hovered
            ? `${variable} = ${formatNumber(hovered.x)},  y = ${formatNumber(hovered.y)}`
            : "hover to read off coordinates"}
        </span>
      </div>

      <div
        className="overflow-hidden rounded-md border bg-card"
        onMouseLeave={() => setHovered(null)}
        onMouseMove={handleMouseMove}
        ref={containerRef}
      >
        <svg
          aria-label={`Graph of ${expression} from ${from} to ${to}`}
          className="block h-[280px] w-full"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          {/* Gridlines */}
          <g className="stroke-border" strokeWidth={1}>
            {xTicks.map((tick) => (
              <line
                key={`gx-${tick}`}
                x1={toSvgX(tick)}
                x2={toSvgX(tick)}
                y1={PADDING}
                y2={HEIGHT - PADDING}
              />
            ))}
            {yTicks.map((tick) => (
              <line
                key={`gy-${tick}`}
                x1={PADDING}
                x2={WIDTH - PADDING}
                y1={toSvgY(tick)}
                y2={toSvgY(tick)}
              />
            ))}
          </g>

          {/* Axes, drawn only when the origin is actually in view */}
          <g className="stroke-muted-foreground" strokeWidth={1.5}>
            {axisY !== null ? (
              <line x1={PADDING} x2={WIDTH - PADDING} y1={axisY} y2={axisY} />
            ) : null}
            {axisX !== null ? (
              <line x1={axisX} x2={axisX} y1={PADDING} y2={HEIGHT - PADDING} />
            ) : null}
          </g>

          {/* Tick labels */}
          <g className="fill-muted-foreground text-[9px]">
            {xTicks.map((tick) =>
              tick === 0 ? null : (
                <text
                  key={`tx-${tick}`}
                  textAnchor="middle"
                  x={toSvgX(tick)}
                  y={(axisY ?? HEIGHT - PADDING) + 10}
                >
                  {formatNumber(tick)}
                </text>
              )
            )}
            {yTicks.map((tick) =>
              tick === 0 ? null : (
                <text
                  key={`ty-${tick}`}
                  textAnchor="start"
                  x={(axisX ?? PADDING) + 3}
                  y={toSvgY(tick) - 2}
                >
                  {formatNumber(tick)}
                </text>
              )
            )}
          </g>

          {/* One polyline per segment. Separate elements make it structurally
              impossible to draw a line across a discontinuity. */}
          <g
            className="stroke-primary"
            fill="none"
            strokeLinecap="round"
            strokeWidth={2}
          >
            {segments.map((segment, index) => (
              <polyline
                key={index}
                points={segment
                  .map(({ x, y }) => `${toSvgX(x)},${toSvgY(y)}`)
                  .join(" ")}
              />
            ))}
          </g>

          {hovered ? (
            <g>
              <line
                className="stroke-muted-foreground"
                strokeDasharray="3 3"
                strokeWidth={1}
                x1={toSvgX(hovered.x)}
                x2={toSvgX(hovered.x)}
                y1={PADDING}
                y2={HEIGHT - PADDING}
              />
              <circle
                className="fill-primary"
                cx={toSvgX(hovered.x)}
                cy={toSvgY(hovered.y)}
                r={4}
              />
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

/**
 * Tick positions at 1, 2 or 5 times a power of ten — the spacings that read as
 * "round numbers" at any zoom level, rather than an arbitrary division of the
 * range which would produce ticks at 0.3333.
 */
function niceTicks(min: number, max: number, target = 8): number[] {
  const range = max - min;
  if (!(range > 0) || !Number.isFinite(range)) return [];

  const rough = range / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step =
    (normalised >= 5 ? 10 : normalised >= 2 ? 5 : normalised >= 1 ? 2 : 1) *
    magnitude;

  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let tick = first; tick <= max + step * 1e-9; tick += step) {
    // Snap away floating-point dust so 0.30000000000000004 prints as 0.3.
    ticks.push(Number(tick.toPrecision(12)));
  }
  return ticks;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 1000 || (value !== 0 && Math.abs(value) < 0.01)) {
    return value.toExponential(2);
  }
  return String(Number(value.toFixed(3)));
}
