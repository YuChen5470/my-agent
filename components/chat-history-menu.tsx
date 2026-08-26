"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { type ArchivedChat, describeAge } from "@/lib/chat-history";
import { HistoryIcon } from "lucide-react";
import { useState } from "react";

export interface ChatHistoryMenuProps {
  chats: ArchivedChat[];
  onOpen: (chat: ArchivedChat) => void;
  onClear: () => void;
}

export function ChatHistoryMenu({
  chats,
  onOpen,
  onClear,
}: ChatHistoryMenuProps) {
  /**
   * The clock is read when the menu opens, never during render.
   *
   * `Date.now()` in a render body differs between the server pass and
   * hydration, which is a mismatch. Reading it on open also keeps the ages
   * honest each time the list is looked at, rather than frozen at page load.
   */
  const [now, setNow] = useState<number | null>(null);

  if (chats.length === 0) {
    return null;
  }

  return (
    <DropdownMenu onOpenChange={(open) => setNow(open ? Date.now() : null)}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Previous chats"
            className="h-8 px-2 text-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <HistoryIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Previous chats</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {chats.map((chat) => (
          <DropdownMenuItem
            key={chat.session.sessionId}
            onClick={() => onOpen(chat)}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{chat.title}</span>
              <span className="text-muted-foreground text-xs">
                {now === null ? "" : describeAge(chat.savedAt, now)}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onClear}>
          <span className="text-muted-foreground">Clear history</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
