import type { ClientSessionState } from "eve/client";

/**
 * The list of conversations this browser can go back to.
 *
 * eve keeps every session on the server indefinitely, so a conversation the
 * student "closed" was never actually gone — the only thing lost was the
 * pointer to it. Keeping those pointers turns New chat from a deletion into
 * filing something away, which is what a student revising across several
 * sittings actually wants.
 *
 * Only the pointer and a title live here. The messages themselves are never
 * copied into the browser: replaying them is `resume`'s job, and duplicating
 * them locally would mean two versions of the truth.
 */
const HISTORY_KEY = "maths-engine:history";

/** Kept small on purpose: this is a revision aid, not an archive. */
const MAX_CHATS = 20;

/** Titles come from the student's own words, so they need trimming. */
const MAX_TITLE_LENGTH = 70;

export interface ArchivedChat {
  session: ClientSessionState;
  /** First thing the student asked, used as the label. */
  title: string;
  /** Epoch milliseconds, for ordering and for "2 hours ago". */
  savedAt: number;
}

function isArchivedChat(value: unknown): value is ArchivedChat {
  if (typeof value !== "object" || value === null) return false;
  const chat = value as ArchivedChat;
  return (
    typeof chat.title === "string" &&
    typeof chat.savedAt === "number" &&
    typeof chat.session === "object" &&
    chat.session !== null &&
    typeof chat.session.sessionId === "string" &&
    typeof chat.session.streamIndex === "number"
  );
}

export function readHistory(): ArchivedChat[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(HISTORY_KEY);
      return [];
    }

    // Drop unrecognised entries rather than the whole list, so one bad record
    // from an older build cannot lose every other conversation.
    return parsed
      .filter(isArchivedChat)
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_CHATS);
  } catch {
    return [];
  }
}

function writeHistory(chats: ArchivedChat[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
  } catch {
    // Storage full or blocked. The active conversation is unaffected; only the
    // ability to come back to this one later is lost.
  }
}

/** Turns the opening question into something recognisable in a list. */
export function titleFrom(firstMessage: string): string {
  const collapsed = firstMessage.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "Untitled chat";
  return collapsed.length > MAX_TITLE_LENGTH
    ? `${collapsed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : collapsed;
}

/**
 * Files a conversation away, replacing any earlier entry for the same session.
 *
 * Re-archiving matters: a student can open an old chat, ask two more
 * questions, and file it again. That should update the one entry rather than
 * leave a stale duplicate pointing at the same conversation.
 */
export function archiveChat(chat: ArchivedChat): ArchivedChat[] {
  const others = readHistory().filter(
    (existing) => existing.session.sessionId !== chat.session.sessionId
  );
  const next = [chat, ...others]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_CHATS);
  writeHistory(next);
  return next;
}

export function clearHistory() {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Nothing to do; the list simply stays as it was.
  }
}

/** Compact relative age, e.g. "just now", "3h ago", "2d ago". */
export function describeAge(savedAt: number, now: number): string {
  const minutes = Math.floor((now - savedAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}
