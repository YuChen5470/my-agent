import { google } from "@ai-sdk/google";
import { defineAgent } from "eve";

// Pass the provider object, not a bare model-id string. A string would route
// through the Vercel AI Gateway and need AI_GATEWAY_API_KEY; this path uses
// GOOGLE_GENERATIVE_AI_API_KEY from .env.local.
// gemini-3.6-flash was the first choice, but the free tier's daily quota is
// per-model and it was exhausted by a day of testing — this agent is unusually
// chatty because the system prompt forces a tool call for every number, so one
// student question costs several model calls. flash-lite has its own quota.
export default defineAgent({
  model: google("gemini-3.5-flash-lite"),
});
