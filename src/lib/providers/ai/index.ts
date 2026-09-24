import "server-only";

import { ProviderError } from "@/lib/providers/errors";
import { DEFAULT_MODEL, createGeminiProvider } from "./gemini-provider";
import type { AIProvider } from "./types";

export { DEFAULT_MODEL };
export type {
  AIProvider,
  BriefInput,
  ClassificationInput,
  EvidenceForPrompt,
  QualificationInput,
} from "./types";

let cached: AIProvider | undefined;

// Single AI provider, per Phase 4 scope — reuses the GEMINI_API_KEY
// convention from this user's sibling portfolio project. Stages always
// import from here, never from ./gemini-provider directly.
export function getAIProvider(): AIProvider {
  if (!cached) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ProviderError("GEMINI_API_KEY is not configured", false);
    }
    cached = createGeminiProvider({ apiKey, model: process.env.GEMINI_MODEL });
  }
  return cached;
}

export function getConfiguredModelName(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
}
