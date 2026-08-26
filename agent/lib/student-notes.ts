import { defineState } from "eve/context";

/**
 * What the tutor has learned about the student it is helping.
 *
 * A tutor is worth more on the tenth question than the first, and only if it
 * remembers the nine before. The valuable thing to remember is not the maths —
 * the tools compute that every time — but the person: what course they are on,
 * what they are working through, and which mistakes they keep making. Naming a
 * repeated slip as a pattern ("this is the same step as last time") is the
 * thing a real tutor does that a stateless one cannot.
 *
 * Durable for the life of the eve session, which now outlives a page refresh,
 * so it persists until the student starts a new chat.
 */
export interface Slip {
  /** The mistake, phrased so it can be read back to the student. */
  description: string;
  timesSeen: number;
}

export interface StudentNotes {
  /** Their level or course, in their own words. */
  level?: string;
  /** Topics asked about, oldest first. */
  topics: string[];
  slips: Slip[];
}

/**
 * Caps, so a long session cannot grow the system prompt without bound. The
 * oldest topics fall off; slips are kept by how often they have been seen,
 * because a mistake made four times matters more than a newer one made once.
 */
const MAX_TOPICS = 8;
const MAX_SLIPS = 6;

export const studentNotes = defineState<StudentNotes>(
  "maths-engine.student-notes",
  () => ({ slips: [], topics: [] })
);

/*
 * The reducers below are pure so they can be tested without an eve context —
 * `studentNotes.get()` and `.update()` throw outside one, and the behaviour
 * worth pinning down (a repeat incrementing rather than duplicating, the caps,
 * what the prompt block reads like) is all in here.
 */

export function withLevel(notes: StudentNotes, level: string): StudentNotes {
  const trimmed = level.trim();
  return trimmed.length === 0 ? notes : { ...notes, level: trimmed };
}

export function withTopic(notes: StudentNotes, topic: string): StudentNotes {
  const trimmed = topic.trim();
  if (trimmed.length === 0) return notes;

  const withoutDuplicate = notes.topics.filter(
    (existing) => existing.toLowerCase() !== trimmed.toLowerCase()
  );
  // Re-appended rather than skipped, so asking again marks it as current.
  return {
    ...notes,
    topics: [...withoutDuplicate, trimmed].slice(-MAX_TOPICS),
  };
}

export function withSlip(
  notes: StudentNotes,
  description: string
): StudentNotes {
  const trimmed = description.trim();
  if (trimmed.length === 0) return notes;

  const index = notes.slips.findIndex(
    (slip) => slip.description.toLowerCase() === trimmed.toLowerCase()
  );

  const slips =
    index === -1
      ? [...notes.slips, { description: trimmed, timesSeen: 1 }]
      : notes.slips.map((slip, at) =>
          at === index ? { ...slip, timesSeen: slip.timesSeen + 1 } : slip
        );

  return {
    ...notes,
    slips: [...slips]
      .sort((a, b) => b.timesSeen - a.timesSeen)
      .slice(0, MAX_SLIPS),
  };
}

export function recordLevel(level: string) {
  studentNotes.update((current) => withLevel(current, level));
}

export function recordTopic(topic: string) {
  studentNotes.update((current) => withTopic(current, topic));
}

export function recordSlip(description: string) {
  studentNotes.update((current) => withSlip(current, description));
}

/**
 * Renders the notes for the system prompt, or `null` when there is nothing
 * worth saying — an empty "here is what you know: nothing" block would just
 * spend tokens and invite the model to invent history.
 */
export function formatStudentNotes(notes: StudentNotes): string | null {
  const lines: string[] = [];

  if (notes.level) {
    lines.push(`- Level: ${notes.level}`);
  }

  if (notes.topics.length > 0) {
    lines.push(`- Topics so far: ${notes.topics.join(", ")}`);
  }

  if (notes.slips.length > 0) {
    lines.push("- Mistakes they have made before:");
    for (const slip of notes.slips) {
      const seen =
        slip.timesSeen > 1 ? ` (seen ${slip.timesSeen} times)` : "";
      lines.push(`  - ${slip.description}${seen}`);
    }
  }

  if (lines.length === 0) {
    return null;
  }

  return [
    "## What you know about this student",
    "",
    ...lines,
    "",
    "This is your own record from earlier in this conversation, not something",
    "they just told you. Use it to connect a new question to what they have",
    "already seen — especially to point out when a mistake is one they have",
    "made before. Never present it back as fact if they contradict it; their",
    "correction wins, and you should record the correction.",
  ].join("\n");
}
