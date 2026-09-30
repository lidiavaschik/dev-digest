import type { CommunitySkill, Skill, SkillVersion } from '@devdigest/shared';
import type { SkillContent, SkillRecord, SkillVersionRecord } from './ports.js';

/** Pure helpers for the skills module — record ⇄ DTO mapping and the version rule. */

const CONTENT_FIELDS = ['name', 'description', 'type', 'body'] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

/** Map a skill record to the public `Skill` DTO. */
export function toSkillDto(rec: SkillRecord, tokens: number | null): Skill {
  return {
    id: rec.id,
    name: rec.name,
    description: rec.description,
    type: rec.type,
    source: rec.source,
    body: rec.body,
    enabled: rec.enabled,
    version: rec.version,
    evidence_files: rec.evidenceFiles,
    tokens,
    agent_count: rec.agentCount,
    updated_at: rec.updatedAt.toISOString(),
  };
}

/** Map a version snapshot record to the public `SkillVersion` DTO. */
export function toSkillVersionDto(rec: SkillVersionRecord): SkillVersion {
  return {
    skill_id: rec.skillId,
    version: rec.version,
    name: rec.name,
    description: rec.description,
    type: rec.type,
    body: rec.body,
    message: rec.message,
    created_at: rec.createdAt.toISOString(),
  };
}

/** Content fields present in `patch` AND different from `current` (these bump the version). */
export function changedContentFields(
  current: SkillContent,
  patch: Partial<SkillContent>,
): ContentField[] {
  return CONTENT_FIELDS.filter((f) => patch[f] !== undefined && patch[f] !== current[f]);
}

/** Auto "what changed" note: `Edited body` for one field, `Edited` for several. */
export function autoVersionMessage(changed: readonly ContentField[]): string {
  return changed.length === 1 ? `Edited ${changed[0]}` : 'Edited';
}

/** True when two contents are identical in every versioned field. */
export function sameContent(a: SkillContent, b: SkillContent): boolean {
  return CONTENT_FIELDS.every((f) => a[f] === b[f]);
}

/** Pick only the versioned content fields. */
export function contentOf(c: SkillContent): SkillContent {
  return { name: c.name, description: c.description, type: c.type, body: c.body };
}

/**
 * Filter the community catalog: `q` matches name / desc / repo case-insensitively
 * (substring), `lang` must equal the entry's language (case-insensitive). Blank
 * filters are ignored. Sorted by stars desc, then name.
 */
export function searchCommunitySkills(
  catalog: readonly CommunitySkill[],
  filter: { q?: string | null; lang?: string | null },
): CommunitySkill[] {
  const q = filter.q?.trim().toLowerCase() ?? '';
  const lang = filter.lang?.trim().toLowerCase() ?? '';
  return catalog
    .filter((s) => !lang || s.lang.toLowerCase() === lang)
    .filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.desc.toLowerCase().includes(q) ||
        s.repo.toLowerCase().includes(q),
    )
    .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
}
