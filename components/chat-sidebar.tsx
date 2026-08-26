"use client";

import { Button } from "@/components/ui/button";
import type { ArchivedChat } from "@/lib/chat-history";
import { cn } from "@/lib/utils";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";

export interface ChatSidebarProps {
  chats: ArchivedChat[];
  /** The conversation on screen, marked in the list rather than duplicated. */
  activeSessionId: string | undefined;
  /**
   * False until the browser has taken over.
   *
   * The list comes from `localStorage`, which does not exist while the page is
   * prerendered, so rendering it before hydration would mean the server's
   * markup and the browser's first pass disagree — a hydration error, which is
   * exactly what shipped here the first time.
   */
  ready: boolean;
  onNewChat: () => void;
  onOpen: (chat: ArchivedChat) => void;
  onDelete: (sessionId: string) => void;
  /** Mobile only: the panel is always present from `md` upwards. */
  open: boolean;
  onClose: () => void;
}

export function ChatSidebar({
  chats,
  activeSessionId,
  ready,
  onNewChat,
  onOpen,
  onDelete,
  open,
  onClose,
}: ChatSidebarProps) {
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
          {ready && chats.length === 0 ? (
            <p className="px-2 py-1 text-muted-foreground text-xs">
              Your chats will appear here.
            </p>
          ) : null}

          {(ready ? chats : []).map((chat) => {
            const isActive = chat.session.sessionId === activeSessionId;
            return (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-md",
                  isActive ? "bg-accent" : "hover:bg-accent"
                )}
                key={chat.session.sessionId}
              >
                <button
                  aria-current={isActive ? "true" : undefined}
                  className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
                  onClick={() => onOpen(chat)}
                  type="button"
                >
                  {chat.title}
                </button>
                {/* Always visible rather than revealed on hover: a control
                    that only exists once you find it is one people report as
                    broken. */}
                <Button
                  aria-label={`Delete chat: ${chat.title}`}
                  className="mr-1 size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => onDelete(chat.session.sessionId)}
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
