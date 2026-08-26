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

    // Stored order is preserved rather than re-sorted: the list is written
    // newest-first and a row never moves, so sorting could only introduce the
    // shuffling this is meant to avoid.
    //
    // Unrecognised entries are dropped individually, so one bad record from an
    // older build cannot take every other conversation with it.
    return parsed.filter(isArchivedChat).slice(0, MAX_CHATS);
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
 * Records a conversation the first time it has a name, and leaves it alone
 * afterwards.
 *
 * A chat holds its place in the list for good. Reopening an old conversation
 * and asking two more questions must not shuffle it to the top: the list is
 * something a student learns the shape of, and rows that move when touched
 * make it useless for finding the chat you half-remember. So a session already
 * on the list is returned untouched — same position, same timestamp, same
 * title, which stays the question the conversation opened with.
 */
export function rememberChat(chat: ArchivedChat): ArchivedChat[] {
  const existing = readHistory();
  if (
    existing.some(
      (entry) => entry.session.sessionId === chat.session.sessionId
    )
  ) {
    return existing;
  }

  const next = [chat, ...existing].slice(0, MAX_CHATS);
  writeHistory(next);
  return next;
}

export function removeChat(sessionId: string): ArchivedChat[] {
  const next = readHistory().filter(
    (chat) => chat.session.sessionId !== sessionId
  );
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
