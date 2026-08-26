"use client";

import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/**
 * Thumbnails of the images staged for the next message.
 *
 * AI Elements ships the attachment *state* and the menu items that add to it,
 * but no component that shows what is currently attached — so a student would
 * otherwise pick a photo and get no confirmation it was picked up.
 */
export function PromptAttachments() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {attachments.files.map((file) => (
        <div
          className="group/attachment relative size-16 overflow-hidden rounded-md border bg-muted"
          key={file.id}
        >
          {/* A blob: URL straight from the file picker — next/image has no
              remote asset to optimise here. */}
          {file.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={file.filename ?? "Attached image"}
              className="size-full object-cover"
              src={file.url}
            />
          ) : null}
          <Button
            aria-label={`Remove ${file.filename ?? "attachment"}`}
            className="absolute top-0.5 right-0.5 size-5 rounded-full p-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/attachment:opacity-100"
            onClick={() => attachments.remove(file.id)}
            size="icon"
            type="button"
            variant="secondary"
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
