import type { SkillImportPreview, SkillSource, SkillType } from "@devdigest/shared";
import type { ImportOrigin } from "./types";

/** Saved `source` for each import origin. */
export function importSource(origin: ImportOrigin): SkillSource {
  switch (origin.kind) {
    case "file":
      return "imported_file";
    case "url":
      return "imported_url";
    case "community":
      return "community";
  }
}

/**
 * Initial type for the editable preview: what the server parsed, unless it fell back to
 * "custom" and the community catalog suggests something more specific.
 */
export function initialImportType(preview: Pick<SkillImportPreview, "type">, origin: ImportOrigin): SkillType {
  if (origin.kind === "community" && preview.type === "custom" && origin.entry.type) return origin.entry.type;
  return preview.type;
}

/** The URL a preview was fetched from (server's post-rewrite URL first), or null for uploads. */
export function previewSourceUrl(preview: Pick<SkillImportPreview, "source_url">, origin: ImportOrigin): string | null {
  if (preview.source_url) return preview.source_url;
  if (origin.kind === "url") return origin.url;
  if (origin.kind === "community") return origin.entry.url;
  return null;
}

/** Only http(s) URLs are rendered as clickable links (never javascript:, data:, …). */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
