"use client";

import { Spinner } from "@/components/ui/spinner";
import { CheckIcon, ChevronRightIcon } from "lucide-react";

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
  const failed = Boolean(errorText);

  return (
    <details className="group mb-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground">
        <ChevronRightIcon className="size-3 transition-transform group-open:rotate-90" />
        {failed ? (
          <span className="text-destructive">
            {toolName} failed
          </span>
        ) : (
          <>
            <CheckIcon className="size-3" />
            <span>
              {describeWork(toolName, input).toLowerCase()} — show working
            </span>
          </>
        )}
      </summary>

      <div className="mt-2 space-y-2 border-muted border-l-2 pl-3">
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
          {JSON.stringify(input, null, 2)}
        </pre>
        <pre
          className={`overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] ${
            failed ? "text-destructive" : "text-foreground"
          }`}
        >
          {errorText ?? JSON.stringify(output, null, 2)}
        </pre>
      </div>
    </details>
  );
}
