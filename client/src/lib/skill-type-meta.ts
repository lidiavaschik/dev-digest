/* Skill type → accent colour + tile icon. Shared by the Skills Lab (/skills)
   and the agent editor's Skills tab (/agents/:id?tab=skills). */
import type { IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

export const TYPE_META: Record<SkillType, { color: string; bg: string; icon: IconName }> = {
  rubric: { color: "var(--sugg)", bg: "var(--sugg-bg)", icon: "ListChecks" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)", icon: "Code" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "Shield" },
  custom: { color: "var(--text-secondary)", bg: "var(--info-bg)", icon: "Sparkles" },
};
