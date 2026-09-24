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

export const DEFAULT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_SNIPPET_CHARS = 500;

export interface GroqConfig {
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

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : text;
}

async function callGroq(
  config: GroqConfig,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  const model = config.model ?? DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(`Groq request timed out after ${DEFAULT_TIMEOUT_MS}ms`, true, error);
    }
    throw new ProviderError("Groq request failed", true, error);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("Groq rejected the configured API key", false);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ProviderError(`Groq returned ${response.status}`, true);
  }
  if (!response.ok) {
    throw new ProviderError(`Groq returned ${response.status}`, false);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content;
  if (!text) {
    throw new ProviderError("Groq returned no text content", true);
  }
  return text;
}

// Mirrors gemini-provider.ts's callStructured contract exactly (same one
// repair re-prompt, same retryable-on-exhaustion behavior) so stages and
// the worker's retry/backoff behave identically regardless of provider.
async function callStructured<S extends z.ZodTypeAny>(
  config: GroqConfig,
  schema: S,
  systemPrompt: string,
  userPrompt: string,
): Promise<z.infer<S>> {
  const firstText = await callGroq(config, [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }]);
  const firstParsed = tryParseJson(stripCodeFence(firstText));
  const firstResult = firstParsed === undefined ? undefined : schema.safeParse(firstParsed);
  if (firstResult?.success) {
    return firstResult.data;
  }

  const errorDetail = firstResult
    ? JSON.stringify(firstResult.error.flatten())
    : "the response was not valid JSON";

  const repairText = await callGroq(config, [
    { role: "user", content: `${systemPrompt}\n\n${userPrompt}` },
    { role: "assistant", content: firstText },
    {
      role: "user",
      content: `Your previous response failed validation: ${errorDetail}\n\nRespond again with ONLY corrected JSON matching the required schema — no explanation, no markdown code fences.`,
    },
  ]);

  const repairParsed = tryParseJson(stripCodeFence(repairText));
  const repairResult = repairParsed === undefined ? undefined : schema.safeParse(repairParsed);
  if (repairResult?.success) {
    return repairResult.data;
  }

  console.error("Groq structured-output validation failed twice", {
    firstText,
    firstError: firstResult ? firstResult.error.flatten() : "not valid JSON",
    repairText,
    repairError: repairResult ? repairResult.error.flatten() : "not valid JSON",
  });

  throw new ProviderError("Groq response failed schema validation after one repair attempt", true);
}

function formatLead(lead: Lead): string {
  return [
    `company_name: ${lead.company_name}`,
    `website: ${lead.website ?? "unknown"}`,
    `industry (user-provided, may be absent): ${lead.industry ?? "unknown"}`,
    `country (user-provided, may be absent): ${lead.country ?? "unknown"}`,
  ].join("\n");
}

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
  "{ ai_score (integer 0-100), reasons (array of { factor, contribution (a number), detail }), " +
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

export function createGroqProvider(config: GroqConfig): AIProvider {
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
