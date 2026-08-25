import { google } from "@ai-sdk/google";
import { defineAgent } from "eve";

// Pass the provider object, not a bare model-id string. A string would route
// through the Vercel AI Gateway and need AI_GATEWAY_API_KEY; this path uses
// GOOGLE_GENERATIVE_AI_API_KEY from .env.local.
export default defineAgent({
  model: google("gemini-3.6-flash"),
});
