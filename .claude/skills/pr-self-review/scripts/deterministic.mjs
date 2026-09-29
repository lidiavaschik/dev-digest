// Checks that need no LLM: repo rules from CLAUDE.md that are pure path/text facts.
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Rule ids a waiver can never silence. */
export const UNWAIVABLE = [
  "deterministic:migration-edited",
  "deterministic:secret",
  "deterministic:env-file",
  "deterministic:runtime-clones",
];

const SECRET_PATTERNS = [
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI / OpenRouter key", /\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{32,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
];

const MIGRATIONS_DIR = "server/src/db/migrations/";
const SHARED_SERVER = "server/src/vendor/shared/";
const SHARED_CLIENT = "client/src/vendor/shared/";

function finding(rule, severity, file, title, extra = {}) {
  return { source: "deterministic", rule: `deterministic:${rule}`, severity, file, title, ...extra };
}

/**
 * @param root   repo root
 * @param files  changedFiles() output
 * @param added  addedLines() output
 */
export function deterministicFindings(root, files, added) {
  const out = [];
  const byPath = new Map(files.map((f) => [f.path, f]));

  // Migrations are append-only (CLAUDE.md "Do not touch"). drizzle-kit legitimately rewrites
  // _journal.json when it appends a migration, so the journal is only suspicious on its own.
  const newSql = files.some((f) => f.path.startsWith(MIGRATIONS_DIR) && f.path.endsWith(".sql") && f.status === "A");
  for (const f of files.filter((f) => f.path.startsWith(MIGRATIONS_DIR) && f.status !== "A")) {
    if (f.path.endsWith("meta/_journal.json") && newSql && f.status === "M") continue;
    out.push(
      finding("migration-edited", "CRITICAL", f.path, `existing migration ${f.status === "D" ? "deleted" : "modified"}`, {
        fix: "Revert this file; change server/src/db/schema/* and run `cd server && pnpm db:generate` to append a new migration.",
      }),
    );
  }

  // A contract change must be mirrored in the client copy in the same change.
  for (const f of files.filter((f) => f.path.startsWith(SHARED_SERVER))) {
    const mirror = SHARED_CLIENT + f.path.slice(SHARED_SERVER.length);
    const mirrorChanged = byPath.has(mirror);
    const mirrorExists = existsSync(join(root, mirror));
    if (mirrorChanged || (!mirrorExists && f.status !== "A")) continue;
    out.push(
      finding("shared-contract-not-mirrored", "CRITICAL", f.path, `contract changed but ${mirror} was not updated`, {
        fix: `Apply the same change to ${mirror} (CLAUDE.md: mirror server/src/vendor/shared in client/src/vendor/shared).`,
      }),
    );
  }

  for (const f of files.filter((f) => f.status !== "D")) {
    const base = f.path.split("/").pop();
    if (/^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base)) {
      out.push(finding("env-file", "CRITICAL", f.path, "env file with secrets is part of the change", {
        fix: "Remove it from the change (git rm --cached) and keep secrets in .env / ~/.devdigest/secrets.json only.",
      }));
    }
    if (f.path.startsWith("server/clones/")) {
      out.push(finding("runtime-clones", "CRITICAL", f.path, "server/clones/** is runtime data (git remotes hold the GitHub token)", {
        fix: "Remove it from the change; server/clones must stay git-ignored.",
      }));
    }
  }

  for (const [path, lines] of added) {
    for (const { line, text } of lines) {
      for (const [label, re] of SECRET_PATTERNS) {
        if (!re.test(text)) continue;
        out.push(finding("secret", "CRITICAL", path, `looks like a hard-coded ${label}`, {
          line,
          evidence: text.trim().replace(re, (m) => `${m.slice(0, 6)}…[redacted]`).slice(0, 160),
          fix: "Remove the value, rotate it if it was ever pushed, read it from env / ~/.devdigest/secrets.json.",
        }));
        break;
      }
    }
  }
  return out;
}
