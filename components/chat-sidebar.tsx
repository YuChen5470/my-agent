"use client";

import { Button } from "@/components/ui/button";
import { type ArchivedChat, describeAge } from "@/lib/chat-history";
import { cn } from "@/lib/utils";
import { useIsHydrated } from "@/lib/use-is-hydrated";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

export interface ChatSidebarProps {
  chats: ArchivedChat[];
  /** Title of the conversation on screen, or null when it is empty. */
  currentTitle: string | null;
  /**
   * Session on screen, so it is not also listed below as somewhere to go.
   * A conversation can be both open and already archived — reopening a filed
   * chat leaves it in the list — and showing it twice reads as two chats.
   */
  currentSessionId: string | undefined;
  onNewChat: () => void;
  onOpen: (chat: ArchivedChat) => void;
  onDelete: (sessionId: string) => void;
  /** Mobile only: the panel is always present from `md` upwards. */
  open: boolean;
  onClose: () => void;
}

export function ChatSidebar({
  chats,
  currentTitle,
  currentSessionId,
  onNewChat,
  onOpen,
  onDelete,
  open,
  onClose,
}: ChatSidebarProps) {
  const others = chats.filter(
    (chat) => chat.session.sessionId !== currentSessionId
  );
  /**
   * The clock behind the "3h ago" labels.
   *
   * Gated on hydration rather than read during render: `Date.now()` differs
   * between the server pass and the client, so the ages stay blank until the
   * markup has settled. Refreshed each minute, because a panel left open
   * should not keep insisting a chat was "just now" an hour later.
   */
  const hydrated = useIsHydrated();
  const [now, setNow] = useState(() =>
    typeof window === "undefined" ? 0 : Date.now()
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {/* Tapping away closes the panel on a phone, where it sits over the
          conversation rather than beside it. */}
      {open ? (
        <button
          aria-label="Close chat list"
          className="fixed inset-0 z-10 bg-black/20 md:hidden"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside
        className={cn(
          "z-20 w-64 shrink-0 flex-col gap-2 border-r bg-card p-3",
          "max-md:fixed max-md:inset-y-0 max-md:left-0",
          open ? "flex" : "hidden md:flex"
        )}
      >
        <div className="flex items-center gap-1">
          <Button
            className="h-8 flex-1 justify-start px-2 text-sm"
            onClick={onNewChat}
            type="button"
            variant="outline"
          >
            <PlusIcon className="mr-1 size-4" />
            New chat
          </Button>
          <Button
            aria-label="Close chat list"
            className="size-8 shrink-0 p-0 md:hidden"
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        </div>

        <p className="px-2 pt-2 font-medium text-muted-foreground text-xs">
          Chats
        </p>

        <div className="-mr-1 flex-1 overflow-y-auto pr-1">
          {currentTitle === null && others.length === 0 ? (
            <p className="px-2 py-1 text-muted-foreground text-xs">
              Your chats will appear here.
            </p>
          ) : null}

          {/* The conversation on screen, shown so the list accounts for every
              chat rather than seeming to lose the one being worked on. */}
          {currentTitle === null ? null : (
            <div className="rounded-md bg-accent px-2 py-1.5">
              <p className="truncate text-sm">{currentTitle}</p>
              <p className="text-muted-foreground text-xs">Current</p>
            </div>
          )}

          {others.map((chat) => (
            <div
              className="group/chat flex items-center gap-1 rounded-md hover:bg-accent"
              key={chat.session.sessionId}
            >
              <button
                className="min-w-0 flex-1 px-2 py-1.5 text-left"
                onClick={() => onOpen(chat)}
                type="button"
              >
                <span className="block truncate text-sm">{chat.title}</span>
                <span className="block text-muted-foreground text-xs">
                  {hydrated ? describeAge(chat.savedAt, now) : ""}
                </span>
              </button>
              <Button
                aria-label={`Delete chat: ${chat.title}`}
                className="mr-1 size-7 shrink-0 p-0 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/chat:opacity-100"
                onClick={() => onDelete(chat.session.sessionId)}
                type="button"
                variant="ghost"
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
