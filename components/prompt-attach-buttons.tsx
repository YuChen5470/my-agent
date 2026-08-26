"use client";

import {
  captureScreenshot,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { ImageIcon, MonitorIcon } from "lucide-react";

/**
 * Buttons for attaching a photo or a screenshot.
 *
 * These were a dropdown menu, and the menu never opened: its trigger carried
 * every attribute base-ui puts on a trigger, yet `aria-expanded` stayed false
 * on a real click, so both items were unreachable. Two plain buttons need no
 * popup to work, are one tap rather than two, and say what they do without
 * being opened first.
 */
export function PromptAttachButtons() {
  const attachments = usePromptInputAttachments();

  const takeScreenshot = async () => {
    try {
      const screenshot = await captureScreenshot();
      if (screenshot) {
        attachments.add([screenshot]);
      }
    } catch (error) {
      // Declining the browser's screen-share prompt is a normal answer, not a
      // failure worth surfacing.
      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "AbortError")
      ) {
        return;
      }
      throw error;
    }
  };

  return (
    <>
      <Button
        aria-label="Add a photo"
        className="size-8 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => attachments.openFileDialog()}
        type="button"
        variant="ghost"
      >
        <ImageIcon className="size-4" />
      </Button>
      {/* Screen capture is a desktop affordance — `getDisplayMedia` is absent
          or useless on most phones, so the button is not offered there. */}
      <Button
        aria-label="Take a screenshot"
        className="hidden size-8 p-0 text-muted-foreground hover:text-foreground md:inline-flex"
        onClick={() => void takeScreenshot()}
        type="button"
        variant="ghost"
      >
        <MonitorIcon className="size-4" />
      </Button>
    </>
  );
}
