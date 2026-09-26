import type { z } from "zod";

import { ProviderError } from "@/lib/providers/errors";
import { companyClassificationSchema } from "@/lib/schemas/classification.schema";
import { intelligenceBriefSchema } from "@/lib/schemas/brief.schema";
import { aiQualificationSignalSchema } from "@/lib/schemas/qualification.schema";
import type { Lead } from "@/lib/types/domain";
import type {
  AIProvider,
  BriefInput,
  ClassificationInput,
  EvidenceForPrompt,
  QualificationInput,
} from "./types";

export const DEFAULT_MODEL = "gemini-3.5-flash";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_SNIPPET_CHARS = 500;
// See groq-provider.ts's identical constant for why this exists: was unset
// entirely, letting a rich, evidence-heavy lead produce an uncapped
// completion. Sized above the intelligence brief schema's realistic worst
// case (the largest of the three schemas), not tightly, so a real rich
// brief is never truncated into a schema validation failure.
const MAX_COMPLETION_TOKENS = 3000;

export interface GeminiConfig {
  apiKey: string;
  model?: string;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

async function callGemini(
  config: GeminiConfig,
  contents: Array<{ role: "user" | "model"; text: string }>,
): Promise<string> {
  const model = config.model ?? DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: MAX_COMPLETION_TOKENS,
          },
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(`Gemini request timed out after ${DEFAULT_TIMEOUT_MS}ms`, true, error);
    }
    throw new ProviderError("Gemini request failed", true, error);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("Gemini rejected the configured API key", false);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ProviderError(`Gemini returned ${response.status}`, true);
  }
  if (!response.ok) {
    throw new ProviderError(`Gemini returned ${response.status}`, false);
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new ProviderError("Gemini returned no text content", true);
  }
  return text;
}

// The shared structured-output contract: call once, validate; on failure,
// one repair re-prompt carrying the validation error back to the model;
// validate again; if still invalid, throw a *retryable* ProviderError — an
// LLM is non-deterministic, so the existing worker retry/backoff genuinely
// has a chance of succeeding on a later attempt, rather than this needing
// its own unbounded retry loop here.
// Generic over the schema type itself (S), returning z.infer<S> — binding a
// free type parameter T to z.ZodType<T> instead infers a structurally
// similar but not identical type for fields with `.default()` (optional
// there, required in z.infer's resolved output), which then fails to
// satisfy the AIProvider methods' declared z.infer-based return types.
async function callStructured<S extends z.ZodTypeAny>(
  config: GeminiConfig,
  schema: S,
  systemPrompt: string,
  userPrompt: string,
): Promise<z.infer<S>> {
  const prompt = `${systemPrompt}\n\n${userPrompt}`;

  const firstText = await callGemini(config, [{ role: "user", text: prompt }]);
  const firstParsed = tryParseJson(firstText);
  const firstResult = firstParsed === undefined ? undefined : schema.safeParse(firstParsed);
  if (firstResult?.success) {
    return firstResult.data;
  }

  // Logged here, not only if the repair call also fails, so this is
  // diagnosable even when the repair call itself errors out (e.g. a 429)
  // before ever reaching a second validation check.
  console.error("Gemini structured-output validation failed on first attempt — repairing", {
    firstText,
    firstError: firstResult ? firstResult.error.flatten() : "not valid JSON",
  });

  const errorDetail = firstResult
    ? JSON.stringify(firstResult.error.flatten())
    : "the response was not valid JSON";

  const repairText = await callGemini(config, [
    { role: "user", text: prompt },
    { role: "model", text: firstText },
    {
      role: "user",
      text: `Your previous response failed validation: ${errorDetail}\n\nRespond again with ONLY corrected JSON matching the required schema — no explanation, no markdown code fences.`,
    },
  ]);

  const repairParsed = tryParseJson(repairText);
  const repairResult = repairParsed === undefined ? undefined : schema.safeParse(repairParsed);
  if (repairResult?.success) {
    return repairResult.data;
  }

  // Neither response is recoverable at this point — log both raw bodies so a
  // real failure (as opposed to this ProviderError's message alone) is
  // actually diagnosable from Vercel's function logs.
  console.error("Gemini structured-output validation failed twice", {
    firstText,
    firstError: firstResult ? firstResult.error.flatten() : "not valid JSON",
    repairText,
    repairError: repairResult ? repairResult.error.flatten() : "not valid JSON",
  });

  throw new ProviderError("Gemini response failed schema validation after one repair attempt", true);
}

function formatLead(lead: Lead): string {
  return [
    `company_name: ${lead.company_name}`,
    `website: ${lead.website ?? "unknown"}`,
    `industry (user-provided, may be absent): ${lead.industry ?? "unknown"}`,
    `country (user-provided, may be absent): ${lead.country ?? "unknown"}`,
  ].join("\n");
}

// Bounded and evidence-only by construction: this is the entire universe of
// facts the model is given. It is never asked to research the company
// itself (docs/architecture.md §7) — only to interpret what the pipeline
// already collected.
function formatEvidence(evidence: EvidenceForPrompt[]): string {
  if (evidence.length === 0) {
    return "No evidence was collected for this lead.";
  }
  return evidence
    .map(
      (e) =>
        `- id: ${e.id}\n  type: ${e.source_type} (${e.relevance})\n  url: ${e.source_url ?? "n/a"}\n  title: ${e.title ?? "n/a"}\n  snippet: ${(e.snippet ?? "").slice(0, MAX_SNIPPET_CHARS)}`,
    )
    .join("\n");
}

const CLASSIFICATION_SYSTEM_PROMPT =
  "You classify a business lead using ONLY the evidence provided below. Never invent facts beyond it. " +
  "If a field cannot be established from the evidence, use null (or company_type \"unknown\" if the company " +
  "type itself is unclear). Respond with ONLY a JSON object: " +
  "{ company_type, industry, business_model, geography, target_market, confidence (0-1), " +
  "reasoning (<=800 chars), signals_used (array of evidence ids you relied on) }.";

const QUALIFICATION_SYSTEM_PROMPT =
  "You assess a business lead's commercial fit using ONLY the evidence and classification below. " +
  "ai_score (0-100) must reflect ICP relevance, likely business fit, and the strength of opportunity " +
  "signals actually present in the evidence — never an assumption. Respond with ONLY a JSON object: " +
  "{ ai_score (integer 0-100), reasons (array of { factor, contribution, detail }), " +
  "opportunity_signals (array of strings) }.";

const BRIEF_SYSTEM_PROMPT =
  "You write a concise business-intelligence brief for a salesperson, using ONLY the evidence, " +
  "classification and qualification below. Clearly separate known facts (evidence-backed) from inferred " +
  "conclusions (a reasonable interpretation) and unknowns — never present a guess as a fact. Respond with " +
  "ONLY a JSON object: { company_summary, what_they_do, products_services (array), geography, " +
  "target_market, signals (array), recent_developments (array), pain_points (array), " +
  "automation_opportunities (array of { opportunity, rationale, evidence_refs }), qualification_summary, " +
  "key_evidence (array of { evidence_id, summary }), risks_and_uncertainty (array), outreach_angle, " +
  "confidence (0-1), facts: { known: [], inferred: [], unknown: [] } }.";

export function createGeminiProvider(config: GeminiConfig): AIProvider {
  return {
    async classify({ lead, evidence }: ClassificationInput) {
      const user = `LEAD:\n${formatLead(lead)}\n\nEVIDENCE:\n${formatEvidence(evidence)}`;
      return callStructured(config, companyClassificationSchema, CLASSIFICATION_SYSTEM_PROMPT, user);
    },

    async qualify({ lead, evidence, classification }: QualificationInput) {
      const user =
        `LEAD:\n${formatLead(lead)}\n\n` +
        `CLASSIFICATION:\n${JSON.stringify({
          category: classification.category,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
        })}\n\n` +
        `EVIDENCE:\n${formatEvidence(evidence)}`;
      return callStructured(config, aiQualificationSignalSchema, QUALIFICATION_SYSTEM_PROMPT, user);
    },

    async generateBrief({ lead, evidence, classification, qualification }: BriefInput) {
      const user =
        `LEAD:\n${formatLead(lead)}\n\n` +
        `CLASSIFICATION:\n${JSON.stringify({
          category: classification.category,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
        })}\n\n` +
        `QUALIFICATION:\n${JSON.stringify({
          score: qualification.score,
          level: qualification.level,
          reasons: qualification.reasons,
        })}\n\n` +
        `EVIDENCE:\n${formatEvidence(evidence)}`;
      return callStructured(config, intelligenceBriefSchema, BRIEF_SYSTEM_PROMPT, user);
    },
  };
}
