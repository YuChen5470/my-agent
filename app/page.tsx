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
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { PromptAttachments } from "@/components/prompt-attachments";
import {
  ThinkingIndicator,
  ToolActivity,
  ToolReceipt,
} from "@/components/tool-activity";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  FunctionPlot,
  type FunctionPlotProps,
} from "@/components/function-plot";
import { describeAgentError } from "@/lib/agent-error";
import { prepareImage } from "@/lib/prepare-image";
import { SigmaIcon } from "lucide-react";
import { useState } from "react";
import type { UserContent } from "ai";

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

/**
 * Attachment limits.
 *
 * The byte cap is checked against the file on disk, before the base64 growth
 * and the downscale in `prepareImage`. It exists to reject something absurd
 * early with a clear message; the downscale is what keeps a normal photo
 * inside the deployed request-body limit.
 */
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export default function Page() {
  const agent = useEveAgent();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

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

  // A turn that failed outright, as opposed to the model choosing to ask a
  // question. eve clears this the moment the next turn starts, so the alert
  // disappears on its own when the student tries again.
  const turnError =
    agent.status === "error" && agent.error
      ? describeAgentError(agent.error)
      : null;

  // The question to resend, recovered from the projection rather than kept in
  // component state. A turn that dies mid-flight was already confirmed by the
  // server, so the message's own `status` still reads "submitted" and cannot
  // be used to find it — but it is always the most recent user message.
  const lastQuestion = agent.data.messages
    .filter((message) => message.role === "user")
    .at(-1)
    ?.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
    .trim();

  const canRetry = Boolean(turnError?.canRetry && lastQuestion && !isBusy);

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

                  // An image the student attached. `url` is present only for
                  // client-resolvable `data:` and `http(s)` URLs, so a part
                  // without one has nothing to draw.
                  if (part.type === "file") {
                    if (!part.url?.startsWith("data:image/")) return null;
                    // next/image cannot optimise an inline data: URL, and
                    // there is no remote asset here to optimise.
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={part.filename ?? "Attached image"}
                        className="max-h-64 w-auto rounded-md border"
                        key={index}
                        src={part.url}
                      />
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

          {/* Without this, a failed turn just removes the spinner and shows no
              answer — indistinguishable from a hang, which is exactly what a
              reviewer hit when the free-tier quota ran out mid-question. */}
          {turnError ? (
            <Alert className="mb-4" variant="destructive">
              <AlertTitle>{turnError.title}</AlertTitle>
              <AlertDescription>{turnError.description}</AlertDescription>
              {canRetry && lastQuestion ? (
                <AlertAction>
                  <Button
                    className="h-8 px-3 text-sm"
                    onClick={() => void agent.send(lastQuestion)}
                    type="button"
                    variant="outline"
                  >
                    Try again
                  </Button>
                </AlertAction>
              ) : null}
            </Alert>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {attachmentError ? (
        <p className="text-destructive text-xs">{attachmentError}</p>
      ) : null}

      <PromptInput
        accept="image/*"
        maxFileSize={MAX_ATTACHMENT_BYTES}
        maxFiles={MAX_ATTACHMENTS}
        onError={(error) =>
          setAttachmentError(
            error.code === "max_files"
              ? `Please attach at most ${MAX_ATTACHMENTS} images.`
              : error.code === "max_file_size"
                ? "That image is too large. Please attach one under 10MB."
                : "Only images can be attached."
          )
        }
        onSubmit={async (message) => {
          const text = message.text.trim();
          const images = message.files.filter((file) =>
            file.mediaType?.startsWith("image/")
          );

          // A bare image with no question is a valid thing to send — "here is
          // where I am stuck" is the whole point of attaching one.
          if (text.length === 0 && images.length === 0) return;

          setAttachmentError(null);

          // Shrunk here rather than on selection so the thumbnails stay crisp
          // and only what actually goes to the model is re-encoded.
          const prepared = await Promise.all(
            images.map(async (file) => {
              const { url, mediaType } = await prepareImage(
                file.url,
                file.mediaType ?? "image/jpeg"
              );
              return { mediaType, url } as const;
            })
          );

          const content: UserContent = [
            ...prepared.map((image) => ({
              data: image.url,
              mediaType: image.mediaType,
              type: "file" as const,
            })),
            // Text last so the question reads as being about the images above
            // it, which is the order a student would write it in.
            ...(text.length > 0 ? [{ text, type: "text" as const }] : []),
          ];

          // Do not touch `event.currentTarget` here: PromptInput invokes
          // onSubmit after an await, so React has already nulled it, and the
          // component swallows any throw from this callback. It resets the
          // form itself.
          await agent.send(
            content,
            isBusy ? { turnPolicy: "steer" } : undefined
          );
        }}
      >
        <PromptInputBody>
          <PromptAttachments />
          <PromptInputTextarea placeholder="Differentiate x^3 + 2x, or attach a photo of where you are stuck…" />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="Add a photo" />
                <PromptInputActionAddScreenshot label="Take a screenshot" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          </PromptInputTools>
          <PromptInputSubmit
            onStop={() => void agent.cancel()}
            status={agent.status}
          />
        </PromptInputFooter>
      </PromptInput>
    </main>
  );
}
