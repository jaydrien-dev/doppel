/**
 * TypeScript types — exact mirror of Python Pydantic models in doppel/brain/models/types.py
 */

// ---------------------------------------------------------------------------
// Brain I/O
// ---------------------------------------------------------------------------

export type ContextType =
  | "chat"
  | "email_reply"
  | "email_compose"
  | "meeting"
  | "decision"
  | "document";

export interface BrainInput {
  clone_id: string;       // UUID
  session_id: string;     // UUID
  message: string;
  context_type: ContextType;
  sender_id?: string;
  metadata?: Record<string, unknown>;
}

export interface MemorySource {
  content: string;
  source: string;
  similarity: number;
  created_at?: string;
}

export interface BrainOutput {
  response: string;
  confidence: number;
  needs_escalation: boolean;
  sources: MemorySource[];
  reasoning_trace_id: string;   // UUID
  path_taken: "fast" | "slow";
  latency_ms: number;
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export type FeedbackSignalType = "approved" | "edited" | "rejected";

export interface FeedbackSignal {
  trace_id: string;         // UUID
  clone_id: string;         // UUID
  signal_type: FeedbackSignalType;
  corrected_response?: string;
  correction_reason?: string;
}

// ---------------------------------------------------------------------------
// Style + Values
// ---------------------------------------------------------------------------

export interface StyleFingerprint {
  avg_sentence_length: number;
  preferred_formality: number;
  directness: number;
  warmth: number;
  humor_frequency: number;
  uses_bullet_points: boolean;
  uses_emojis: boolean;
  signature_phrases: string[];
  opening_patterns: string[];
  closing_patterns: string[];
  preferred_greeting: string;
  subject_line_style: string;
  response_length_preference: string;
  punctuation_style: string;
  capitalization_style: string;
  uses_contractions: boolean;
  vocabulary_richness: number;
}

export interface ValueSystem {
  core_values: string[];
  professional_priorities: string[];
  risk_tolerance: string;
  conflict_style: string;
  persona_boundaries: string[];
}

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

export interface ClonePublicInfo {
  clone_id: string;
  display_name: string;
  handle: string;
  access_mode: "private" | "allowlist" | "public" | "org_scoped";
}

export interface CloneOwnerInfo extends ClonePublicInfo {
  style_fingerprint: StyleFingerprint | Record<string, never>;
  value_system: ValueSystem | Record<string, never>;
  created_at: string;
  updated_at: string;
  subscription_tier: "free" | "personal" | "enterprise_pro" | "enterprise_max";
  stripe_customer_id?: string;
  allowed_emails: string[];
  rate_limit_per_day: number;
}

export interface EmailDraft {
  id: string;
  sender: string;
  sender_email: string;
  subject: string;
  body: string;
  draft: string;
  reasoning: string | null;
  status: "pending" | "approved" | "edited" | "rejected";
  edited_version: string | null;
  received_at: string | null;
  reviewed_at: string | null;
}

export interface MemoryChunk {
  id: string;
  content: string;
  source: string;
  is_pinned: boolean;
  is_excluded: boolean;
  topics: string[];
  created_at: string | null;
}

export interface BrainStats {
  total: number;
  episodic: number;
  semantic: number;
  procedural: number;
  relational: number;
  sources: string[];
}

// ---------------------------------------------------------------------------
// Meeting Bot
// ---------------------------------------------------------------------------

export interface TranscriptEntry {
  speaker: string;
  text: string;
  ts: string;
}

export interface MeetingResponse {
  question: string;
  answer: string;
  ts: string;
}

export interface MeetingSession {
  bot_id: string;
  meeting_url: string;
  platform: "zoom" | "meet" | "teams";
  status: "joining" | "in_call" | "ended" | "error";
  transcript: TranscriptEntry[];
  responses: MeetingResponse[];
  started_at: string | null;
  ended_at: string | null;
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export interface JobStatus {
  job_id: string;
  clone_id: string;
  source: string;
  status: "pending" | "running" | "done" | "failed";
  total_items: number;
  processed_items: number;
  failed_items: number;
  error_message?: string;
  progress_pct: number;
}

// ---------------------------------------------------------------------------
// Chat message (client-side only)
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "clone";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  // Present only on clone messages
  path_taken?: "fast" | "slow";
  confidence?: number;
  sources?: MemorySource[];
  trace_id?: string;
  needs_escalation?: boolean;
  // True while tokens are still arriving (streaming)
  isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// Company Brain — Role Brains + Skills
// ---------------------------------------------------------------------------

export interface RoleBrain {
  id: string;
  org_id: string;
  role_name: string;
  description: string;
  member_clone_ids: string[];
  member_names: string[];
  knowledge_summary: Record<string, unknown>;
  freshness_score: number;
  last_extracted_at: string | null;
  skill_count: number;
  has_knowledge: boolean;
  created_at: string;
  updated_at: string;
}

export interface DecisionRule {
  condition: string;
  action: string;
}

export interface SkillProcedure {
  steps: string[];
  decision_rules: DecisionRule[];
  exceptions: string[];
  escalation: string;
}

export interface OrgSkill {
  id: string;
  org_id: string;
  role_brain_id: string | null;
  skill_name: string;
  display_name?: string;
  trigger_context: string[];
  inputs_required: string[];
  procedure: SkillProcedure;
  confidence: number;
  source_count: number;
  last_verified_at: string | null;
  created_at: string;
  // Joined field
  role_name?: string;
}

export interface AgentQueryResult {
  skill_applied: string | null;
  skill_id: string | null;
  recommendation: string;
  reasoning: string;
  confidence: number;
  escalate: boolean;
  escalation_reason: string | null;
  caveats: string[];
  latency_ms: number;
}

export interface ValidateActionResult {
  safe_to_proceed: boolean;
  confidence: number;
  notes: string[];
  blocking_reason: string | null;
  suggested_alternative: string | null;
  latency_ms: number;
}

export interface AgentQuery {
  id: string;
  org_id: string;
  skill_id: string | null;
  situation: string;
  context: Record<string, unknown>;
  response: AgentQueryResult;
  confidence: number | null;
  escalated: boolean;
  latency_ms: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Activity log (reasoning traces)
// ---------------------------------------------------------------------------

export interface ActivityTrace {
  id: string;
  session_id: string;
  path: "fast" | "slow";
  confidence: number | null;
  feedback_signal: "approved" | "edited" | "rejected" | null;
  input_message: string;
  response: string;
  latency_ms: number | null;
  needs_escalation: boolean;
  created_at: string;
}
