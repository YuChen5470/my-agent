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
import { readStoredSession, writeStoredSession } from "@/lib/stored-session";
import {
  type ArchivedChat,
  readHistory,
  rememberChat,
  removeChat,
  titleFrom,
} from "@/lib/chat-history";
import { ChatSidebar } from "@/components/chat-sidebar";
import { PanelLeftIcon } from "lucide-react";
import { SigmaIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useIsHydrated } from "@/lib/use-is-hydrated";
import type { UserContent } from "ai";
import type { ClientSessionState } from "eve/client";

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

/**
 * Restores the remembered session once the page is interactive.
 *
 * Two constraints meet here. `useEveAgent` reads its session configuration
 * once, when it builds its internal store, so the session has to be present at
 * the chat's first render — passing it later does nothing, and the documented
 * way to point at a different session is to remount. But handing it over
 * during hydration would break hydration: resuming immediately reports a busy
 * agent and draws the thinking indicator, which the server never rendered.
 *
 * So the chat mounts session-less to match the server HTML, then the `key`
 * flips and it remounts with the stored session, which is the point at which
 * `resume` replays the conversation.
 */
export default function Page() {
  const hydrated = useIsHydrated();
  const [active, setActive] = useState<ClientSessionState | undefined>(() =>
    typeof window === "undefined" ? undefined : readStoredSession()
  );
  const [history, setHistory] = useState<ArchivedChat[]>(() =>
    typeof window === "undefined" ? [] : readHistory()
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /** Points at another conversation; `undefined` starts a fresh one. */
  const switchTo = (next: ClientSessionState | undefined) => {
    setSidebarOpen(false);
    if (next?.sessionId === active?.sessionId) return;
    writeStoredSession(next);
    setActive(next);
  };

  return (
    <div className="flex h-dvh">
      {/*
        A sibling of the chat, never a child of it.

        The chat below is remounted whenever the conversation changes, because
        `useEveAgent` reads its session once when it builds its store and a
        remount is the documented way to point it somewhere else. The sidebar
        used to live inside that subtree, so every switch tore the list down
        and rebuilt it — the list visibly blinked out and came back. Out here
        it survives.
      */}
      <ChatSidebar
        activeSessionId={active?.sessionId}
        chats={history}
        onClose={() => setSidebarOpen(false)}
        onDelete={(sessionId) => setHistory(removeChat(sessionId))}
        onNewChat={() => switchTo(undefined)}
        onOpen={(chat) => switchTo(chat.session)}
        open={sidebarOpen}
      />

      <MathsEngine
        initialSession={hydrated ? active : undefined}
        /**
         * Keyed by the conversation, so choosing a different one rebuilds the
         * agent around it.
         */
        key={hydrated ? (active?.sessionId ?? "new") : "initial"}
        onOpenSidebar={() => setSidebarOpen(true)}
        onRemember={(chat) => setHistory(rememberChat(chat))}
      />
    </div>
  );
}

function MathsEngine({
  initialSession,
  onOpenSidebar,
  onRemember,
}: {
  initialSession: ClientSessionState | undefined;
  onOpenSidebar: () => void;
  onRemember: (chat: ArchivedChat) => void;
}) {
  const agent = useEveAgent({
    initialSession,
    // Replay the stored session's history, and pick up a turn that was still
    // running when the page was closed.
    resume: initialSession !== undefined,
    onSessionChange: writeStoredSession,
  });
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  /**
   * How this conversation is labelled in the sidebar: its opening question.
   *
   * Empty for a chat with nothing in it yet — including one holding only an
   * attachment and no words, which has no sensible title and is not worth a
   * row someone has to read past.
   */
  const firstQuestion = agent.data.messages
    .filter((message) => message.role === "user")
    .at(0)
    ?.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
    .trim();

  const sessionId = agent.session?.sessionId;
  const streamIndex = agent.session?.streamIndex;

  /**
   * Files the conversation as soon as it has a name, rather than when it is
   * left behind.
   *
   * Waiting until the student navigated away meant a chat abandoned by closing
   * the tab never reached the list at all. Recording it the moment it has both
   * an id and an opening question also means the sidebar no longer needs to be
   * told what the live conversation is called, which is what allowed it out of
   * this component and stopped the list flickering.
   *
   * `rememberChat` ignores a session it already holds, so this settling
   * repeatedly cannot reorder or relabel anything.
   */
  useEffect(() => {
    if (sessionId === undefined || streamIndex === undefined) return;
    if (!firstQuestion) return;

    onRemember({
      savedAt: Date.now(),
      session: { sessionId, streamIndex },
      title: titleFrom(firstQuestion),
    });
  }, [sessionId, streamIndex, firstQuestion, onRemember]);

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
    <main className="mx-auto flex min-w-0 max-w-3xl flex-1 flex-col gap-4 p-4">
      <header className="flex items-center gap-2 border-b pb-3">
        <Button
          aria-label="Show chats"
          className="size-8 shrink-0 p-0 md:hidden"
          onClick={onOpenSidebar}
          type="button"
          variant="ghost"
        >
          <PanelLeftIcon className="size-4" />
        </Button>
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
