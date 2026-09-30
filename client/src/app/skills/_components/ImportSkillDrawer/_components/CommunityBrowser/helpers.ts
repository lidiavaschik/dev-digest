import type { CommunitySkill, Skill } from "@devdigest/shared";
import { ALL_LANGS } from "./constants";

/** GitHub-style compact star count: 950 → "950", 1500 → "1.5k", 293000 → "293k", 1.2M → "1.2M". */
export function formatStars(n: number): string {
  const compact = (v: number, unit: string) => `${Number(v.toFixed(v < 10 ? 1 : 0))}${unit}`;
  if (n >= 1_000_000) return compact(n / 1_000_000, "M");
  if (n >= 1_000) return compact(n / 1_000, "k");
  return String(n);
}

/** Distinct languages of the current results, sorted; keeps the selected one even if absent. */
export function languageOptions(entries: CommunitySkill[], selected: string): string[] {
  const langs = new Set(entries.map((e) => e.lang).filter(Boolean));
  if (selected !== ALL_LANGS) langs.add(selected);
  return [...langs].sort((a, b) => a.localeCompare(b));
}

/** Entries in `lang` (all of them for ALL_LANGS). */
export function filterByLang(entries: CommunitySkill[], lang: string): CommunitySkill[] {
  return lang === ALL_LANGS ? entries : entries.filter((e) => e.lang === lang);
}

/** Lower-cased names of the workspace's skills — a community entry with one of them is "Installed". */
export function installedNames(skills: Pick<Skill, "name">[] | undefined): Set<string> {
  return new Set((skills ?? []).map((sk) => sk.name.toLowerCase()));
}
