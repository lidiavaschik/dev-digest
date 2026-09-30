import type { CommunitySkill, SkillImportPreview } from "@devdigest/shared";

/** Where a preview came from — decides the saved `source` and the v1 version note. */
export type ImportOrigin =
  | { kind: "file" }
  /** `url` is what the user typed; the server's `source_url` (post-rewrite) wins when present. */
  | { kind: "url"; url: string }
  | { kind: "community"; entry: CommunitySkill };

/** Every picker (file / URL / community) ends by handing the parent a parsed preview. */
export type OnPreview = (preview: SkillImportPreview, origin: ImportOrigin) => void;
