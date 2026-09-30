import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum([
  'manual',
  'imported_url',
  'imported_file',
  'extracted',
  'community',
]);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /** Token count of `body` (server tokenizer); null when not computed. */
  tokens: z.number().int().nullish(),
  /** How many agents link this skill (any per-agent enabled state). */
  agent_count: z.number().int().nullish(),
  updated_at: z.string().nullish(),
});
export type Skill = z.infer<typeof Skill>;

// The `description` is the skill's interface: a directive that tells the agent
// WHEN to apply it and WHAT to do — the UI hints this under the field.
export const SkillName = z.string().trim().min(1).max(120);

export const CreateSkillInput = z.object({
  name: SkillName,
  description: z.string().max(2000).default(''),
  type: SkillType.default('custom'),
  body: z.string().min(1).max(100_000),
  source: SkillSource.default('manual'),
  enabled: z.boolean().default(true),
  /** Version note stored on v1 (e.g. "Imported from foo.zip"). */
  message: z.string().max(500).nullish(),
});
export type CreateSkillInput = z.infer<typeof CreateSkillInput>;

// A change to name/description/type/body creates a new version; `enabled` alone does not.
export const UpdateSkillInput = z.object({
  name: SkillName.optional(),
  description: z.string().max(2000).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).max(100_000).optional(),
  enabled: z.boolean().optional(),
  /** Optional "what changed" note for the new version. */
  message: z.string().max(500).nullish(),
});
export type UpdateSkillInput = z.infer<typeof UpdateSkillInput>;

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  message: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** Result of parsing an uploaded .md / .zip — NOT persisted until the user confirms. */
export const SkillImportPreview = z.object({
  filename: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  /** Archive entries that were NOT stored and never executed. */
  ignored_files: z.array(z.string()),
  warnings: z.array(z.string()),
  /** Where the content was fetched from (URL / community import); null for uploads. */
  source_url: z.string().nullish(),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const SkillUsage = z.object({
  skill_id: z.string(),
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** Per-agent switch for this skill. */
      link_enabled: z.boolean(),
      order: z.number().int(),
    }),
  ),
});
export type SkillUsage = z.infer<typeof SkillUsage>;

export const CommunitySkill = z.object({
  /** Stable catalog id, e.g. "obra/superpowers:systematic-debugging". */
  id: z.string(),
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
  /** https URL of the SKILL.md / .md / .zip — imported through the URL preview flow. */
  url: z.string(),
  /** Suggested skill type for the import preview. */
  type: SkillType.nullish(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

export const ImportSkillFromUrlInput = z.object({
  url: z.string().url().max(2048),
});
export type ImportSkillFromUrlInput = z.infer<typeof ImportSkillFromUrlInput>;

// ---- Conventions ----
export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  accepted: z.boolean(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  /** Number of linked skills (for the agent card badge). */
  skill_count: z.number().int().nullish(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  /** Per-agent switch; the skill's own `enabled` still gates it globally. */
  enabled: z.boolean().default(true),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

/** A skill as linked to one agent — full skill + its slot on that agent. */
export const AgentSkill = Skill.extend({
  order: z.number().int(),
  link_enabled: z.boolean(),
});
export type AgentSkill = z.infer<typeof AgentSkill>;

/** Replace an agent's skill set; array order = prompt order. */
export const SetAgentSkillsInput = z.object({
  items: z
    .array(z.object({ skill_id: z.string().uuid(), enabled: z.boolean().default(true) }))
    // every workspace skill is sent (unchecked ones keep their slot)
    .max(500),
});
export type SetAgentSkillsInput = z.infer<typeof SetAgentSkillsInput>;

/** A skill as captured in an agent version snapshot. */
export const AgentVersionSkill = z.object({
  skill_id: z.string(),
  skill_version: z.number().int(),
  order: z.number().int(),
  enabled: z.boolean(),
});
export type AgentVersionSkill = z.infer<typeof AgentVersionSkill>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  // Older snapshots stored bare skill ids; newer ones pin the skill version too.
  skills: z.array(z.union([z.string(), AgentVersionSkill])).default([]),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
