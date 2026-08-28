"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRightIcon, FileTextIcon, SearchXIcon } from "lucide-react";
import { useState } from "react";

/**
 * Shows the passages a `search_documents` call retrieved, with their relevance
 * scores and the file each came from.
 *
 * This exists for the same reason `ToolReceipt` does: an answer built on
 * retrieved text is only trustworthy if the student can see what it was built
 * on. Where a maths tool's receipt fits on one line, a retrieval receipt cannot
 * — so the sources are listed as a summary and the passage text stays one click
 * away, rather than the whole prompt context being pasted into the transcript.
 *
 * A refusal is rendered too, and prominently. "The documents do not cover this"
 * is the most easily doubted thing the agent says, and showing the near-misses
 * with the scores that failed the gate is what makes it credible.
 */

export interface RetrievedChunk {
  source: string;
  chunkIndex: number;
  score: number;
  text: string;
}

/**
 * `found` — a passage clearly answers the question.
 * `uncertain` — relevant but nothing stands out; the model was asked to read
 *   the passages and judge, so its answer may still cite them or may refuse.
 * `none` — below the relevance threshold; the documents do not cover this.
 */
export type RetrievalVerdict = "found" | "uncertain" | "none";

export interface RetrievedSourcesProps {
  verdict: RetrievalVerdict;
  question: string;
  chunks: RetrievedChunk[];
  gate: {
    topScore: number;
    lead: number | null;
    minScore: number;
    strongScore: number;
    minLead: number;
  } | null;
}

export function RetrievedSources({
  verdict,
  question,
  chunks,
  gate,
}: RetrievedSourcesProps) {
  const [open, setOpen] = useState(false);

  if (chunks.length === 0) {
    return (
      <div className="mb-3 flex items-start gap-2 rounded-md border border-dashed p-3 text-muted-foreground text-xs">
        <SearchXIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Nothing found in the course documents for &ldquo;{question}&rdquo;.
        </span>
      </div>
    );
  }

  /** Distinct filenames, in the order they first appear, best match first. */
  const files = [...new Set(chunks.map((chunk) => chunk.source))];

  return (
    <div className="mb-3 rounded-md border text-xs">
      <Collapsible onOpenChange={setOpen} open={open}>
        <CollapsibleTrigger className="flex w-full items-start gap-2 p-3 text-left hover:bg-muted/50">
          {verdict === "none" ? (
            <SearchXIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FileTextIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          )}

          <span className="flex-1 space-y-1">
            <span className="block font-medium">
              {headline(verdict, chunks.length)}
            </span>

            <span className="block text-muted-foreground">
              {files.join(", ")}
            </span>

            {gate ? <GateExplanation gate={gate} verdict={verdict} /> : null}
          </span>

          <ChevronRightIcon
            className={`mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <ul className="space-y-3 border-t p-3">
            {chunks.map((chunk) => (
              <li key={`${chunk.source}#${chunk.chunkIndex}`}>
                <p className="mb-1 flex items-baseline gap-2">
                  <span className="font-mono text-muted-foreground">
                    {chunk.score.toFixed(4)}
                  </span>
                  <span className="font-medium">
                    {chunk.source}
                    <span className="text-muted-foreground">
                      #{chunk.chunkIndex}
                    </span>
                  </span>
                </p>
                {/* Retrieved chunks are extracted PDF text: broken ligatures,
                    stray markdown, collapsed tables. Shown verbatim rather than
                    tidied, because this is the receipt — what the model was
                    actually given, not a cleaned-up version of it. */}
                <p className="whitespace-pre-wrap break-words text-muted-foreground leading-relaxed">
                  {chunk.text}
                </p>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function headline(verdict: RetrievalVerdict, count: number): string {
  const passages = `${count} ${count === 1 ? "passage" : "passages"}`;

  switch (verdict) {
    case "found":
      return `Searched the course documents — ${passages} used`;
    case "uncertain":
      return `Searched the course documents — ${passages}, none decisive`;
    case "none":
      return "Searched the course documents — nothing relevant enough to use";
  }
}

/**
 * The retrieval gate's arithmetic, in a sentence.
 *
 * The unintuitive case is the middle one: scores that look respectable while no
 * passage stands out, which on this corpus means the topic was found and the
 * answer was not. It says that in words rather than leaving a student to read a
 * number that looks fine.
 */
function GateExplanation({
  gate,
  verdict,
}: {
  gate: NonNullable<RetrievedSourcesProps["gate"]>;
  verdict: RetrievalVerdict;
}) {
  const lead = gate.lead === null ? "—" : gate.lead.toFixed(2);

  if (verdict === "found") {
    return (
      <span className="block text-muted-foreground">
        Best match {gate.topScore.toFixed(2)}
        {gate.topScore >= gate.strongScore
          ? " — a strong match."
          : `, clear of the next by ${lead}.`}
      </span>
    );
  }

  if (verdict === "none") {
    return (
      <span className="block text-muted-foreground">
        Best match {gate.topScore.toFixed(2)}, below the {gate.minScore}{" "}
        threshold.
      </span>
    );
  }

  return (
    <span className="block text-muted-foreground">
      Best match {gate.topScore.toFixed(2)}, but only {lead} clear of the next —
      no passage stands out, so this may be the right topic rather than the
      answer.
    </span>
  );
}
