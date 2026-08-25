import { defineEvalConfig } from "eve/evals";

/**
 * No judge configured and no reporters: every assertion in this suite is
 * deterministic. An LLM judge would need a second model and more quota to grade
 * things these evals can check outright — whether a tool was called, and what
 * it returned.
 */
export default defineEvalConfig({});
