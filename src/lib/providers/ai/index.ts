import "server-only";

import { ProviderError } from "@/lib/providers/errors";
import { DEFAULT_MODEL as GEMINI_DEFAULT_MODEL, createGeminiProvider } from "./gemini-provider";
import { DEFAULT_MODEL as GROQ_DEFAULT_MODEL, createGroqProvider } from "./groq-provider";
import type { AIProvider } from "./types";

export type {
  AIProvider,
  BriefInput,
  ClassificationInput,
  EvidenceForPrompt,
  QualificationInput,
} from "./types";

let cached: AIProvider | undefined;

// AI_PROVIDER selects the active provider ("gemini" | "groq"). Defaults to
// "groq" — the deliberate choice after Gemini showed real instability
// (repeated 503s/timeouts/malformed responses) during the production
// smoke test. Gemini support stays in place as a manual fallback.
export function getAIProvider(): AIProvider {
  if (!cached) {
    const provider = process.env.AI_PROVIDER ?? "groq";
    if (provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new ProviderError("GEMINI_API_KEY is not configured", false);
      }
      cached = createGeminiProvider({ apiKey, model: process.env.GEMINI_MODEL });
    } else if (provider === "groq") {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new ProviderError("GROQ_API_KEY is not configured", false);
      }
      cached = createGroqProvider({ apiKey, model: process.env.GROQ_MODEL });
    } else {
      throw new ProviderError(`Unknown AI_PROVIDER: ${provider}`, false);
    }
  }
  return cached;
}

export function getConfiguredModelName(): string {
  const provider = process.env.AI_PROVIDER ?? "groq";
  if (provider === "gemini") {
    return process.env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL;
  }
  return process.env.GROQ_MODEL ?? GROQ_DEFAULT_MODEL;
}
