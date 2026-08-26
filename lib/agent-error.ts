/**
 * Turns a failed turn's raw Error into copy a student can act on.
 *
 * Two different shapes arrive here, which is why both fields are inspected:
 *
 * - A request that never reached the model (fetch rejected, transport gone)
 *   throws, and only `message` carries anything useful.
 * - A turn that failed mid-flight arrives as a `session.failed` stream event,
 *   which eve converts into an Error carrying the failure *code* in `name` and
 *   the provider's own text in `message`.
 *
 * The mid-flight case is the one a student actually hits: the model runs a few
 * tool calls, then the provider refuses the next call. Matching only on
 * `message` missed the code entirely and fell through to the generic message.
 */
export function describeAgentError(error: Error): {
  title: string;
  description: string;
  /**
   * Whether resending the same question could plausibly work.
   *
   * Gemini's free tier caps requests per minute as well as per day, and a
   * chatty turn trips the per-minute cap first, so a retry a moment later
   * often does succeed — offering it is not false hope. A conversation that
   * has spent its whole token budget is the exception: the same question in
   * the same session fails identically every time.
   */
  canRetry: boolean;
} {
  const code = error.name.toUpperCase();
  const message = error.message.toLowerCase();

  // eve's own cap on how much one conversation may spend, hit by a long
  // session rather than by the provider refusing. Telling the student to
  // "try again later" here would be wrong — this one needs a fresh chat.
  if (code === "SESSION_TOKEN_LIMIT_REACHED") {
    return {
      canRetry: false,
      title: "This conversation got too long",
      description:
        "This chat has used up its budget. Use New chat above to start a fresh one — this conversation stays readable until you do.",
    };
  }

  if (code === "TIMEOUT") {
    return {
      canRetry: true,
      title: "That took too long",
      description: "The answer did not come back in time.",
    };
  }

  const isRateLimit =
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("rate limit") ||
    message.includes("rate_limit") ||
    message.includes("quota") ||
    message.includes("too many requests");

  if (isRateLimit) {
    return {
      canRetry: true,
      title: "Out of requests for now",
      description:
        "The free-tier quota is used up. Waiting a minute often clears it; if not, the daily limit has gone and it resets tomorrow.",
    };
  }

  return {
    canRetry: true,
    title: "Something went wrong",
    description: "That question could not be answered.",
  };
}
