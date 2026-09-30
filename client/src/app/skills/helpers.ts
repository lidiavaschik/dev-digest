/** Pure helpers shared across the Skills Lab route. */
import type { Skill } from "@devdigest/shared";
import { DEFAULT_TAB, SKILL_TABS, UNTRUSTED_SOURCES, type SkillTab } from "./constants";

/** Third-party skill that is still disabled → show the "needs vetting" warning. */
export function needsVetting(skill: Pick<Skill, "source" | "enabled">): boolean {
  return UNTRUSTED_SOURCES.includes(skill.source) && !skill.enabled;
}

/** Rough client-side token estimate (≈4 chars/token) used while the body is unsaved. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Normalise a raw ?tab= value to a known tab. */
export function toSkillTab(raw: string | null | undefined): SkillTab {
  return (SKILL_TABS as readonly string[]).includes(raw ?? "") ? (raw as SkillTab) : DEFAULT_TAB;
}

/** Detail URL for a skill on a given tab. */
export function skillHref(id: string, tab: string = DEFAULT_TAB): string {
  return `/skills/${id}?tab=${tab}`;
}

/** Exactly how the review runner injects a skill into the prompt. */
export function renderSkillPrompt(skill: Pick<Skill, "name" | "body">): string {
  return `### ${skill.name}\n${skill.body}`;
}
