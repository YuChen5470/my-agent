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
 *
 * Order matters here. The provider's text often quotes a quota alongside a
 * number that looks like a status code ("1500 requests per day"), so the
 * cheapest-to-identify and most specific causes are tested first and the
 * status-code guesses last.
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

  // A key that is absent, malformed, or revoked. Distinct from a quota problem:
  // waiting does not fix it, and the person who can fix it is whoever deployed
  // the app — so the message says so rather than offering a pointless retry.
  const isBadKey =
    message.includes("api key not valid") ||
    message.includes("api_key_invalid") ||
    message.includes("api key expired") ||
    message.includes("invalid api key") ||
    message.includes("permission_denied");

  if (isBadKey) {
    return {
      canRetry: false,
      title: "The app is not set up correctly",
      description:
        "The Google API key is missing or not valid, so the tutor cannot reach the model. If this is your own copy, check GOOGLE_GENERATIVE_AI_API_KEY in .env.local — the README explains where to get a key. Otherwise this one is for whoever runs the site: retrying will not help.",
    };
  }

  // Checked before the status-code guesses below, because a quota message
  // routinely contains a number like "1500" that a naive status-code match
  // would read as a server error.
  const isRateLimit =
    message.includes("resource_exhausted") ||
    message.includes("rate limit") ||
    message.includes("rate_limit") ||
    message.includes("quota") ||
    message.includes("too many requests") ||
    /\b429\b/.test(message);

  if (isRateLimit) {
    return {
      canRetry: true,
      title: "Out of requests for now",
      description:
        "The free-tier quota is used up. Waiting a minute often clears it; if not, the daily limit has gone and it resets tomorrow.",
    };
  }

  // The turn no longer fits in the model's context. A retry of the same
  // question in the same chat fails identically, so the way out is a new chat
  // or a shorter question.
  const isTooLong =
    message.includes("context length") ||
    message.includes("too many tokens") ||
    message.includes("input token count") ||
    message.includes("exceeds the maximum") ||
    message.includes("request payload size") ||
    message.includes("request entity too large") ||
    /\b413\b/.test(message);

  if (isTooLong) {
    return {
      canRetry: false,
      title: "That was too much to read at once",
      description:
        "The question, or this conversation with it, is longer than the model can take in. Start a New chat, or ask a shorter question — a large attached image is the usual cause.",
    };
  }

  // The provider unreachable or falling over, rather than refusing us. Worth a
  // retry, but not immediately, so the copy says where the fault is instead of
  // implying the question was the problem.
  const isUpstreamDown =
    message.includes("unavailable") ||
    message.includes("overloaded") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("socket hang up") ||
    /\b(500|502|503|504)\b/.test(message);

  if (isUpstreamDown) {
    return {
      canRetry: true,
      title: "The model is not responding",
      description:
        "Google's service could not be reached just now. That is at their end rather than yours — waiting a minute and asking again usually works.",
    };
  }

  return {
    canRetry: true,
    title: "Something went wrong",
    description:
      "That question could not be answered, and the reason was not one this app recognises. Try again, or start a New chat if it keeps happening.",
  };
}
