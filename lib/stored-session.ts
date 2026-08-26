import type { ClientSessionState } from "eve/client";

/**
 * Remembers which durable eve session this browser was talking to.
 *
 * eve keeps the conversation server-side, so the only thing lost on a refresh
 * is the pointer to it: a session id and how far down its event stream the
 * client had read. Storing those two values is the whole of "my chat is still
 * here when I come back".
 *
 * Every access is wrapped, because `localStorage` is not merely empty but
 * throws in a private window or when a browser is set to block site data —
 * and a tutor that cannot open because it could not save a bookmark would be
 * a poor trade.
 */
const STORAGE_KEY = "maths-engine:session";

export function readStoredSession(): ClientSessionState | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ClientSessionState).sessionId === "string" &&
      typeof (parsed as ClientSessionState).streamIndex === "number"
    ) {
      return parsed as ClientSessionState;
    }

    // Written by an older build, or hand-edited. Drop it rather than
    // handing eve a cursor it cannot resume from.
    window.localStorage.removeItem(STORAGE_KEY);
    return undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredSession(session: ClientSessionState | undefined) {
  try {
    if (session === undefined) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Not being able to remember the session only costs history on refresh,
    // which is exactly the behaviour before this existed.
  }
}

export function clearStoredSession() {
  writeStoredSession(undefined);
}
