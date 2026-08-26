import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  formatStudentNotes,
  recordLevel,
  recordSlip,
  recordTopic,
  studentNotes,
} from "../lib/student-notes";

export default defineTool({
  description:
    "Record something durable about this student so later answers can build on it: their level or course, a topic they are working through, or a mistake they made. Use it when you learn something that would still be useful several questions from now — not for the contents of one calculation. Recording a mistake is what lets you later tell them it is one they have made before.",
  inputSchema: z.object({
    level: z
      .string()
      .optional()
      .describe(
        "Their level or course, in their own words, e.g. 'first-year engineering' or 'A-level Further Maths'. Only when they have said it."
      ),
    topic: z
      .string()
      .optional()
      .describe(
        "The mathematical topic this question belongs to, e.g. 'integration by parts', 'eigenvalues'."
      ),
    slip: z
      .string()
      .optional()
      .describe(
        "A mistake they actually made, phrased so it can be read back to them, e.g. 'kept the x on a constant term when differentiating'. Only record a mistake they made, never one they avoided."
      ),
  }),
  async execute({ level, topic, slip }) {
    if (
      level === undefined &&
      topic === undefined &&
      slip === undefined
    ) {
      return {
        ok: false as const,
        error:
          "Nothing was given to record. Pass at least one of level, topic or slip.",
      };
    }

    if (level !== undefined) recordLevel(level);
    if (topic !== undefined) recordTopic(topic);
    if (slip !== undefined) recordSlip(slip);

    const notes = studentNotes.get();
    const repeated = slip
      ? notes.slips.find(
          (entry) =>
            entry.description.toLowerCase() === slip.trim().toLowerCase()
        )
      : undefined;

    return {
      ok: true as const,
      recorded: { level, slip, topic },
      // Surfaced so the model can say "that is the third time" without
      // needing a second call to read the notes back.
      timesSeen: repeated?.timesSeen,
      notes: formatStudentNotes(notes),
      method:
        repeated !== undefined && repeated.timesSeen > 1
          ? `Recorded. They have now made this mistake ${repeated.timesSeen} times — say so, and point at the pattern rather than just correcting it again.`
          : "Recorded. Do not mention the bookkeeping to the student; just use it.",
    };
  },
});
