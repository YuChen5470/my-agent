/**
 * Remembers what a tool has already been asked within one turn.
 *
 * The model re-calls a tool on input it has already computed — observed asking
 * `differentiate` for the same expression twice in a row, the second time to
 * "verify" the first. Each repeat is a whole model round trip, which is what
 * exhausts the free tier's request quota on a long question. Instructing it not
 * to was not enough: `instructions.md` already says results are settled and to
 * never double-check, and it double-checked anyway.
 *
 * So the guard lives here instead. A repeat still returns the right answer —
 * these tools are pure functions of their input — but it returns the *known*
 * answer along with an explicit note that nothing new was computed, which is a
 * far stronger signal to move on than silently recomputing and handing back
 * something that looks like fresh progress.
 *
 * Best-effort by design. This is process memory, and a deployed turn's steps
 * may not all run in the same instance, so a repeat can slip through when the
 * memo is cold. That degrades to the old behaviour and never to a wrong
 * answer, which is the right way for a cache like this to fail.
 */

/** Turns tracked before the oldest is dropped, bounding memory. */
const MAX_TURNS = 64;

/** turn key -> call key -> result */
const turns = new Map<string, Map<string, unknown>>();

export interface MemoResult<T> {
  value: T;
  /** True when this exact call was already answered in this turn. */
  repeated: boolean;
}

/**
 * Runs `compute`, or returns the result this turn already has for `callKey`.
 *
 * `turnKey` should identify one turn of one session, so a student asking the
 * same thing again later is not told they already have an answer.
 */
export function memoiseForTurn<T>(
  turnKey: string,
  callKey: string,
  compute: () => T
): MemoResult<T> {
  let calls = turns.get(turnKey);

  if (calls === undefined) {
    calls = new Map();
    turns.set(turnKey, calls);

    // Map iterates in insertion order, so the first key is the oldest turn.
    if (turns.size > MAX_TURNS) {
      const oldest = turns.keys().next();
      if (!oldest.done) {
        turns.delete(oldest.value);
      }
    }
  }

  if (calls.has(callKey)) {
    return { repeated: true, value: calls.get(callKey) as T };
  }

  const value = compute();
  calls.set(callKey, value);
  return { repeated: false, value };
}

/** Stable key for one tool call's inputs. */
export function callKeyOf(
  tool: string,
  input: Record<string, unknown>
): string {
  const parts = Object.keys(input)
    .sort()
    .map((key) => `${key}=${JSON.stringify(input[key]) ?? ""}`);
  return `${tool}(${parts.join(",")})`;
}
