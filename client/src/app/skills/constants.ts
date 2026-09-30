/** Route-level constants shared by the Skills Lab components (card, header, forms). */
import type { IconName } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";

/** Selectable skill types, in display order. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Type → accent colour + tile icon (shared with the agent editor's Skills tab). */
export { TYPE_META } from "@/lib/skill-type-meta";

/** Source → label icon (labels are i18n'd under skills.source.*). */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_file: "Upload",
  imported_url: "Upload",
  extracted: "Lightbulb",
  community: "Globe",
};

/** Sources whose body is third-party text and must be read before enabling. */
export const UNTRUSTED_SOURCES: readonly SkillSource[] = ["imported_file", "imported_url", "community"];

/** Editor tabs addressable via ?tab=. */
export const SKILL_TABS = ["config", "context", "preview", "evals", "stats", "versions"] as const;
export type SkillTab = (typeof SKILL_TABS)[number];
export const DEFAULT_TAB: SkillTab = "config";

/** Ways into the Import drawer, in menu order (rail "Add Skill ▾", empty state, drawer tabs). */
export const IMPORT_MODES = ["file", "url", "community"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

/** Import mode → icon, shared by the rail menu, the empty-state CTAs and the drawer tabs. */
export const IMPORT_MODE_ICON: Record<ImportMode, IconName> = {
  file: "Upload",
  url: "Link",
  community: "Globe",
};
