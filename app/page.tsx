"use client";

import { useEveAgent } from "eve/react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  ThinkingIndicator,
  ToolActivity,
  ToolReceipt,
} from "@/components/tool-activity";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  FunctionPlot,
  type FunctionPlotProps,
} from "@/components/function-plot";
import { SigmaIcon } from "lucide-react";

/**
 * Recognise a successful plot_function result so it can be drawn as a graph.
 *
 * Narrowed by shape rather than by trusting the tool name, because the output
 * arrives as `unknown` through eve's dynamic-tool part and a failed plot has a
 * different shape from a successful one.
 */
function asPlot(part: {
  toolName: string;
  output?: unknown;
}): FunctionPlotProps | null {
  if (part.toolName !== "plot_function") return null;

  const output = part.output as Partial<FunctionPlotProps> & { ok?: boolean };
  if (!output || output.ok !== true) return null;
  if (!Array.isArray(output.segments) || output.segments.length === 0) {
    return null;
  }
  if (
    typeof output.from !== "number" ||
    typeof output.to !== "number" ||
    typeof output.expression !== "string"
  ) {
    return null;
  }

  return {
    expression: output.expression,
    variable: output.variable ?? "x",
    from: output.from,
    to: output.to,
    segments: output.segments,
    yWindow: output.yWindow ?? null,
  };
}

export default function Page() {
  const agent = useEveAgent();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  // HITL requests ride on dynamic-tool parts. Scan every message, not just the
  // last one: an unrelated turn can append newer messages while a question
  // stays open.
  const pendingRequests = agent.data.messages
    .flatMap((message) => message.parts)
    .flatMap((part) => {
      if (part.type !== "dynamic-tool" || part.state !== "approval-requested") {
        return [];
      }
      const request = part.toolMetadata?.eve?.inputRequest;
      return request ? [request] : [];
    });

  return (
    <main className="mx-auto flex h-dvh max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center gap-2 border-b pb-3">
        <SigmaIcon className="size-5 text-muted-foreground" />
        <div>
          <h1 className="font-semibold leading-none">The Maths Engine</h1>
          <p className="text-muted-foreground text-xs">
            Explains method. Never does the arithmetic itself.
          </p>
        </div>
      </header>

      <Conversation className="flex-1">
        <ConversationContent>
          {agent.data.messages.length === 0 ? (
            <ConversationEmptyState
              icon={<SigmaIcon className="size-8" />}
              title="Ask a maths question"
              description="Every number you see comes from a tool call, not from the model's head."
            />
          ) : null}

          {agent.data.messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <MessageResponse key={index}>{part.text}</MessageResponse>
                    );
                  }

                  if (part.type === "dynamic-tool") {
                    // ask_question is rendered as its own confirmation prompt
                    // below, so it should not also appear as machinery here.
                    if (part.toolName === "ask_question") return null;

                    const plot = asPlot(part);
                    const running =
                      part.state === "input-streaming" ||
                      part.state === "input-available";

                    return (
                      <div key={index}>
                        {running ? (
                          <ToolActivity
                            input={part.input}
                            toolName={part.toolName}
                          />
                        ) : (
                          <ToolReceipt
                            errorText={part.errorText}
                            input={part.input}
                            output={part.output}
                            toolName={part.toolName}
                          />
                        )}
                        {plot ? <FunctionPlot {...plot} /> : null}
                      </div>
                    );
                  }

                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {/* The wait a student actually notices is the model thinking, not the
              tools — mathjs returns in milliseconds, so a per-tool spinner
              flashes past unseen. This covers the real latency. */}
          {isBusy ? <ThinkingIndicator /> : null}

          {/* AI Elements' <Confirmation> is coupled to the AI SDK tool-approval
              shape (it requires an `approval` object and renders null without
              one). eve's HITL requests carry a different shape, so this is a
              plain Alert instead of a forced adaptation. */}
          {pendingRequests.map((request) => (
            <Alert className="mb-4" key={request.requestId}>
              <AlertDescription className="flex flex-col gap-3">
                <span>{request.prompt}</span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {request.options?.map((option) => (
                    <Button
                      className="h-8 px-3 text-sm"
                      key={option.id}
                      onClick={() =>
                        void agent.respond([
                          { requestId: request.requestId, optionId: option.id },
                        ])
                      }
                      type="button"
                    >
                      {option.label}
                    </Button>
                  ))}
                </span>
              </AlertDescription>
            </Alert>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        onSubmit={(message) => {
          const text = message.text.trim();
          if (text.length === 0) return;
          // Do not touch `event.currentTarget` here: PromptInput invokes
          // onSubmit after an await, so React has already nulled it, and the
          // component swallows any throw from this callback. It resets the
          // form itself.
          void agent.send(text, isBusy ? { turnPolicy: "steer" } : undefined);
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea placeholder="Differentiate x^3 + 2x, or ask about a word problem…" />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputSubmit
            onStop={() => void agent.cancel()}
            status={agent.status}
          />
        </PromptInputFooter>
      </PromptInput>
    </main>
  );
}
