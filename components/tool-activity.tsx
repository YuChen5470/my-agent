"use client";

import { Spinner } from "@/components/ui/spinner";
import { CheckIcon, XIcon } from "lucide-react";

/**
 * Human-readable present-tense labels, so a student sees "Differentiating"
 * rather than the raw tool name and an operation enum.
 */
function describeWork(toolName: string, input: unknown): string {
  const operation =
    input && typeof input === "object" && "operation" in input
      ? String((input as { operation?: unknown }).operation)
      : undefined;

  if (toolName === "calculate") {
    switch (operation) {
      case "differentiate":
        return "Differentiating";
      case "simplify":
        return "Simplifying";
      case "integrate":
        return "Integrating";
      case "solve":
        return "Solving";
      case "limit":
        return "Taking the limit";
      case "series":
        return "Expanding the series";
      default:
        return "Calculating";
    }
  }

  if (toolName === "plot_function") return "Plotting";
  if (toolName === "number_theory") return "Checking the factors";
  return "Working";
}

/**
 * Shown for the whole time the agent is working, which is where the real wait
 * is. The per-tool spinner below almost never appears: mathjs answers in
 * milliseconds, so a tool's running state is over before it can be painted.
 */
export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Spinner className="size-3.5" />
      <span>Thinking…</span>
    </div>
  );
}

export function ToolActivity({
  toolName,
  input,
}: {
  toolName: string;
  input: unknown;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-muted-foreground text-sm">
      <Spinner className="size-3.5" />
      <span>{describeWork(toolName, input)}…</span>
    </div>
  );
}

/**
 * The single most useful fact about a finished tool call, as one short line.
 *
 * Nothing is expandable and no raw payload is ever rendered: `plot_function`
 * returns 400 coordinate pairs, and even a tidied list of them cluttered the
 * transcript. What matters to a student is that a tool ran and what it
 * returned, which fits on one line.
 */
function summariseOneLine(
  toolName: string,
  input: unknown,
  output: unknown
): string {
  const verb = describeWork(toolName, input).toLowerCase();

  if (!output || typeof output !== "object") {
    return verb;
  }

  const record = output as Record<string, unknown>;

  // plot_function: the branch count is the interesting part — it is what tells
  // the student the curve was broken at an asymptote rather than drawn through.
  if (Array.isArray(record.segments)) {
    const count = record.segments.length;
    return `${verb} — ${count} ${count === 1 ? "branch" : "branches"}`;
  }

  // number_theory factorisation ships a pre-rendered form so the model never
  // has to reassemble it; prefer that over the raw array.
  if (typeof record.display === "string") {
    return `${verb} — ${record.display}`;
  }

  if (record.result !== undefined && typeof record.result !== "object") {
    return `${verb} — ${String(record.result)}`;
  }

  return verb;
}

/**
 * The quiet, collapsed record of a finished tool call.
 *
 * This deliberately stays in the transcript rather than disappearing. The
 * product's whole claim is that every number came from a tool, and a claim the
 * student cannot check is just a claim — so the receipt remains one click away
 * instead of filling the conversation by default.
 */
export function ToolReceipt({
  toolName,
  input,
  output,
  errorText,
}: {
  toolName: string;
  input: unknown;
  output: unknown;
  errorText?: string;
}) {
  if (errorText) {
    return (
      <p className="mb-3 flex items-center gap-1.5 text-destructive text-xs">
        <XIcon className="size-3 shrink-0" />
        <span>{errorText}</span>
      </p>
    );
  }

  return (
    <p className="mb-3 flex items-center gap-1.5 text-muted-foreground text-xs">
      <CheckIcon className="size-3 shrink-0" />
      <span>{summariseOneLine(toolName, input, output)}</span>
    </p>
  );
}
