/**
 * Turns a failed turn's raw Error into copy a student can act on.
 *
 * The message text comes from whatever the model provider (or eve's stream)
 * threw, so it's matched loosely rather than on an exact shape — a Gemini
 * quota error surfaces as "429 Too Many Requests" or a RESOURCE_EXHAUSTED
 * status depending on which layer raises it.
 */
export function describeAgentError(error: Error): {
  title: string;
  description: string;
} {
  const message = error.message.toLowerCase();
  const isRateLimit =
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("rate limit") ||
    message.includes("quota");

  if (isRateLimit) {
    return {
      title: "Out of requests for now",
      description:
        "The model's free-tier quota has been used up for today. Please try again later.",
    };
  }

  return {
    title: "Something went wrong",
    description:
      "That question could not be answered. Please try again, or rephrase it.",
  };
}
