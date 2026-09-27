import "server-only";

import { ProviderError } from "@/lib/providers/errors";
import { DEFAULT_MODEL as EARTHRUNTIME_DEFAULT_MODEL, createEarthruntimeProvider } from "./earthruntime-provider";
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

// AI_PROVIDER selects the active provider ("gemini" | "groq" |
// "earthruntime"). Defaults to "groq" — the deliberate choice after Gemini
// showed real instability (repeated 503s/timeouts/malformed responses)
// during the production smoke test. Gemini support stays in place as a
// manual fallback. "earthruntime" was added to try against Groq's free-tier
// rate limits, which caused most of one session's real incidents — same
// OpenAI-compatible shape, dedicated inference hardware instead of
// marketplace GPU reselling.
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
    } else if (provider === "earthruntime") {
      const apiKey = process.env.EARTHRUNTIME_API_KEY;
      if (!apiKey) {
        throw new ProviderError("EARTHRUNTIME_API_KEY is not configured", false);
      }
      cached = createEarthruntimeProvider({ apiKey, model: process.env.EARTHRUNTIME_MODEL });
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
  if (provider === "earthruntime") {
    return process.env.EARTHRUNTIME_MODEL ?? EARTHRUNTIME_DEFAULT_MODEL;
  }
  return process.env.GROQ_MODEL ?? GROQ_DEFAULT_MODEL;
}
