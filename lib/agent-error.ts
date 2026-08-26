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
} {
  const code = error.name.toUpperCase();
  const message = error.message.toLowerCase();

  // eve's own cap on how much one conversation may spend, hit by a long
  // session rather than by the provider refusing. Telling the student to
  // "try again later" here would be wrong — this one needs a fresh chat.
  if (code === "SESSION_TOKEN_LIMIT_REACHED") {
    return {
      title: "This conversation got too long",
      description:
        "This chat has used up its budget. Please start a new one — your working out above stays readable.",
    };
  }

  if (code === "TIMEOUT") {
    return {
      title: "That took too long",
      description:
        "The answer did not come back in time. Please try asking again.",
    };
  }

  // A daily free-tier quota is not worth retrying in the moment, so the copy
  // deliberately does not invite an immediate retry.
  const isRateLimit =
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("rate limit") ||
    message.includes("rate_limit") ||
    message.includes("quota") ||
    message.includes("too many requests");

  if (isRateLimit) {
    return {
      title: "Out of requests for now",
      description:
        "The model's free-tier quota has been used up. Please try again later.",
    };
  }

  return {
    title: "Something went wrong",
    description:
      "That question could not be answered. Please try again, or rephrase it.",
  };
}
