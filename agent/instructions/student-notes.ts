import { defineDynamic, defineInstructions } from "eve/instructions";
import { formatStudentNotes, studentNotes } from "../lib/student-notes";

/**
 * Puts what the tutor knows about the student into the prompt each turn.
 *
 * Deliberately not a "recall" tool. A tool call to read memory would cost a
 * model round trip on every question, which is the exact cost the rest of this
 * agent works to avoid — and the model would have to remember to ask. Resolved
 * instructions are free and always present.
 *
 * Returning `null` when there is nothing recorded leaves the prompt untouched
 * on a first question.
 */
export default defineDynamic({
  events: {
    "turn.started": () => {
      const content = formatStudentNotes(studentNotes.get());
      return content === null ? null : defineInstructions({ content });
    },
  },
});
