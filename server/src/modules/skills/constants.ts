/** Constants for the skills module (versioning defaults + import limits). */

/** Version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default version note on v1 when the client sends none. */
export const CREATED_VERSION_MESSAGE = 'Created';

/** Default version note when a snapshot is restored. */
export const restoredMessage = (version: number): string => `Restored from v${version}`;

// ---- import (.md / .zip) limits --------------------------------------------

/** Max size of the uploaded file itself (the .md or the compressed .zip). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** Max number of central-directory entries in an uploaded zip. */
export const MAX_ZIP_ENTRIES = 200;
/** Max sum of declared uncompressed sizes in a zip (zip-bomb guard). */
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;
/** Max size of the skill markdown file (SKILL.md or a standalone .md). */
export const MAX_SKILL_FILE_BYTES = 200 * 1024;
/** Max body length — mirrors CreateSkillInput.body.max. */
export const MAX_SKILL_BODY_CHARS = 100_000;
/** Max skill name length — mirrors SkillName.max. */
export const MAX_SKILL_NAME_CHARS = 120;
/** Route bodyLimit for POST /skills/import/preview (base64 of MAX_UPLOAD_BYTES + JSON). */
export const IMPORT_BODY_LIMIT = 3 * 1024 * 1024;

/** File extensions treated as executable/script content in an archive. */
export const EXECUTABLE_EXTENSIONS = new Set([
  '.sh', '.bash', '.zsh', '.fish', '.py', '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts',
  '.rb', '.pl', '.php', '.lua', '.exe', '.bat', '.cmd', '.ps1', '.jar', '.bin', '.so',
  '.dll', '.dylib', '.app', '.command',
]);

/** Directory names whose contents are treated as scripts. */
export const SCRIPT_DIRS = new Set(['scripts', 'bin']);
