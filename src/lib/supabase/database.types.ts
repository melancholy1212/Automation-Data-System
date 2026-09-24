// Types for the Supabase schema in supabase/migrations.
//
// Hand-maintained for now, in the shape `supabase gen types typescript`
// produces, so it can be replaced by the generated file without touching
// call sites. Keep in sync with the migrations.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type LeadStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "duplicate"
  | "needs_review"
  | "invalid";

export type RunStatus =
  | "pending"
  | "validating"
  | "invalid"
  | "normalizing"
  | "normalized"
  | "deduplicating"
  | "duplicate"
  | "unique"
  | "enriching"
  | "enrichment_failed"
  | "enriched"
  | "classifying"
  | "classification_failed"
  | "classified"
  | "qualifying"
  | "qualified"
  | "disqualified"
  | "generating_brief"
  | "brief_failed"
  | "completed"
  | "failed"
  | "needs_review";

export type PipelineStage =
  | "validating"
  | "normalizing"
  | "deduplicating"
  | "enriching"
  | "classifying"
  | "qualifying"
  | "generating_brief";

export type EvidenceSourceType =
  | "website"
  | "search_result"
  | "linkedin"
  | "social"
  | "directory"
  | "enrichment"
  | "manual"
  | "other";

export type EvidenceRelevance = "primary" | "supporting" | "contextual";

export type ClassificationCategory =
  | "startup"
  | "established_company"
  | "agency"
  | "consultancy"
  | "investor"
  | "nonprofit"
  | "research_institution"
  | "other";

export type QualificationLevel = "unqualified" | "low" | "medium" | "high";

export type LeadSource = "manual" | "csv_import" | "api";

export type Database = {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string;
          raw_company_name: string;
          company_name: string;
          website: string | null;
          website_domain: string | null;
          contact_name: string | null;
          email: string | null;
          email_domain: string | null;
          linkedin_url: string | null;
          industry: string | null;
          country: string | null;
          status: LeadStatus;
          qualification_level: QualificationLevel | null;
          qualification_score: number | null;
          duplicate_of_lead_id: string | null;
          source: LeadSource;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          raw_company_name: string;
          company_name: string;
          website?: string | null;
          website_domain?: string | null;
          contact_name?: string | null;
          email?: string | null;
          email_domain?: string | null;
          linkedin_url?: string | null;
          industry?: string | null;
          country?: string | null;
          status?: LeadStatus;
          qualification_level?: QualificationLevel | null;
          qualification_score?: number | null;
          duplicate_of_lead_id?: string | null;
          source?: LeadSource;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      lead_processing_runs: {
        Row: {
          id: string;
          lead_id: string;
          status: RunStatus;
          current_stage: PipelineStage;
          attempt_count: number;
          max_attempts: number;
          locked_at: string | null;
          locked_by: string | null;
          next_attempt_at: string;
          failure_reason: string | null;
          failed_stage: PipelineStage | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          status?: RunStatus;
          current_stage?: PipelineStage;
          attempt_count?: number;
          max_attempts?: number;
          locked_at?: string | null;
          locked_by?: string | null;
          next_attempt_at?: string;
          failure_reason?: string | null;
          failed_stage?: PipelineStage | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_processing_runs"]["Insert"]>;
        Relationships: [];
      };
      lead_evidence: {
        Row: {
          id: string;
          lead_id: string;
          run_id: string | null;
          source_url: string | null;
          source_type: EvidenceSourceType;
          provider: string | null;
          idempotency_key: string | null;
          title: string | null;
          snippet: string | null;
          extracted_data: Json | null;
          relevance: EvidenceRelevance;
          collected_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          run_id?: string | null;
          source_url?: string | null;
          source_type: EvidenceSourceType;
          provider?: string | null;
          idempotency_key?: string | null;
          title?: string | null;
          snippet?: string | null;
          extracted_data?: Json | null;
          relevance?: EvidenceRelevance;
          collected_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_evidence"]["Insert"]>;
        Relationships: [];
      };
      lead_classifications: {
        Row: {
          id: string;
          lead_id: string;
          run_id: string;
          category: ClassificationCategory;
          confidence: number;
          reasoning: string;
          signals_used: Json;
          model: string;
          model_version: string | null;
          raw_output: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          run_id: string;
          category: ClassificationCategory;
          confidence: number;
          reasoning: string;
          signals_used?: Json;
          model: string;
          model_version?: string | null;
          raw_output: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_classifications"]["Insert"]>;
        Relationships: [];
      };
      lead_qualifications: {
        Row: {
          id: string;
          lead_id: string;
          run_id: string;
          score: number;
          level: QualificationLevel;
          deterministic_score: number;
          ai_score: number;
          evidence_confidence: number;
          reasons: Json;
          opportunity_signals: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          run_id: string;
          score: number;
          level: QualificationLevel;
          deterministic_score: number;
          ai_score: number;
          evidence_confidence: number;
          reasons: Json;
          opportunity_signals?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_qualifications"]["Insert"]>;
        Relationships: [];
      };
      lead_intelligence_briefs: {
        Row: {
          id: string;
          lead_id: string;
          run_id: string;
          company_summary: string;
          signals: Json;
          pain_points: Json;
          automation_opportunities: Json;
          outreach_angle: string;
          confidence: number;
          model: string;
          raw_output: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          run_id: string;
          company_summary: string;
          signals?: Json;
          pain_points?: Json;
          automation_opportunities?: Json;
          outreach_angle: string;
          confidence: number;
          model: string;
          raw_output: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_intelligence_briefs"]["Insert"]>;
        Relationships: [];
      };
      processing_events: {
        Row: {
          id: string;
          lead_id: string;
          run_id: string | null;
          event_type: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          run_id?: string | null;
          event_type: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["processing_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      lead_status: LeadStatus;
      run_status: RunStatus;
      pipeline_stage: PipelineStage;
      evidence_source_type: EvidenceSourceType;
      evidence_relevance: EvidenceRelevance;
      classification_category: ClassificationCategory;
      qualification_level: QualificationLevel;
      lead_source: LeadSource;
    };
    CompositeTypes: Record<string, never>;
  };
};
