// Shared plumbing for the pr-self-review scripts: git access, the diff identity
// (diffHash) the gate compares against, skill discovery and the state directory.
// No dependencies — plain Node ≥22, so it runs before any `pnpm install`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const WAIVERS_FILE = ".pr-self-review-waivers.json";
export const PR_BODY_ATTRIBUTION = "🤖 Generated with [Claude Code](https://claude.com/claude-code)";

export function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd).trim();
  } catch {
    return null;
  }
}

export function repoRoot(cwd = process.cwd()) {
  return tryGit(["rev-parse", "--show-toplevel"], cwd);
}

/** Repo that owns these scripts — the gate only guards its own repository. */
export function scriptsRepoRoot() {
  return repoRoot(dirname(fileURLToPath(import.meta.url)));
}

/** Per-worktree state lives inside .git, so it is never committed. */
export function stateDir(root) {
  const gitDir = resolve(root, git(["rev-parse", "--git-dir"], root).trim());
  return join(gitDir, "pr-self-review");
}

export function runDir(root) {
  return join(stateDir(root), "run");
}

/**
 * The PR base: merge-base of HEAD with main (or origin/main). Diffing the working
 * tree against it covers committed + staged + unstaged changes in one diff, so
 * committing already-reviewed changes does not change the diffHash.
 */
export function resolveBase(root) {
  const candidates = [process.env.PR_SELF_REVIEW_BASE, "main", "origin/main"].filter(Boolean);
  for (const ref of candidates) {
    const sha = tryGit(["merge-base", ref, "HEAD"], root);
    if (sha) return { ref, sha };
  }
  throw new Error(`no merge-base with ${candidates.join(" / ")} — is there a main branch?`);
}

/** [{ path, status: "A"|"M"|"D"|"T", untracked }] — renames are split into D + A. */
export function changedFiles(root, baseSha) {
  const files = [];
  const parts = git(["diff", "--name-status", "--no-renames", "-z", baseSha], root).split("\0");
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (parts[i]) files.push({ path: parts[i + 1], status: parts[i][0], untracked: false });
  }
  for (const path of untrackedFiles(root)) files.push({ path, status: "A", untracked: true });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function untrackedFiles(root) {
  return git(["ls-files", "--others", "--exclude-standard", "-z"], root)
    .split("\0")
    .filter(Boolean)
    .sort();
}

function trackedDiff(root, baseSha, extra = []) {
  return git(["diff", "--no-color", "--no-ext-diff", "--no-textconv", ...extra, baseSha], root);
}

/**
 * The gate's notion of "these changes": base + the current content of every changed file.
 * Deliberately NOT a hash of `git diff` text — that differs for a file before and after it is
 * committed (untracked files are not in the diff), and committing must not invalidate a review.
 */
export function diffHash(root, baseSha) {
  const h = createHash("sha256").update(`base\0${baseSha}\0`);
  for (const f of changedFiles(root, baseSha)) h.update(`${f.path}\0${fileHash(root, f.path)}\0`);
  return h.digest("hex");
}

export function fileHash(root, path) {
  const abs = join(root, path);
  if (!existsSync(abs)) return "deleted";
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

export function readText(root, path) {
  try {
    const buf = readFileSync(join(root, path));
    return buf.includes(0) ? null : buf.toString("utf8");
  } catch {
    return null;
  }
}

/** Added lines per file: Map<path, [{ line, text }]>. Untracked files count as fully added. */
export function addedLines(root, baseSha, files) {
  const out = new Map();
  let current = null;
  let lineNo = 0;
  for (const raw of trackedDiff(root, baseSha, ["-U0"]).split("\n")) {
    if (raw.startsWith("+++ ")) {
      const target = raw.slice(4);
      current = target === "/dev/null" ? null : target.replace(/^b\//, "");
      if (current && !out.has(current)) out.set(current, []);
    } else if (raw.startsWith("@@")) {
      lineNo = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0);
    } else if (current && raw.startsWith("+")) {
      out.get(current).push({ line: lineNo++, text: raw.slice(1) });
    }
  }
  for (const f of files.filter((f) => f.untracked)) {
    const text = readText(root, f.path);
    if (text != null) out.set(f.path, text.split("\n").map((t, i) => ({ line: i + 1, text: t })));
  }
  return out;
}

/** Diff text for a subset of files; untracked files appear as a synthetic "new file" hunk. */
export function diffFor(root, baseSha, files) {
  const tracked = files.filter((f) => !f.untracked).map((f) => f.path);
  let text = tracked.length ? git(["diff", "--no-color", "--no-ext-diff", baseSha, "--", ...tracked], root) : "";
  for (const f of files.filter((f) => f.untracked)) {
    const body = readText(root, f.path);
    if (body == null) continue;
    const lines = body.split("\n");
    text += `diff --git a/${f.path} b/${f.path}\nnew file (untracked)\n--- /dev/null\n+++ b/${f.path}\n`;
    text += `@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;
  }
  return text;
}

/** Installed skills: Map<name, { name, path, hash, scope, canBlock }>. */
export function installedSkills(root) {
  const dir = join(root, ".claude", "skills");
  const skills = new Map();
  if (!existsSync(dir)) return skills;
  const scopes = catalogScopes(readText(root, ".claude/skills/README.md") ?? "");
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = `.claude/skills/${entry.name}/SKILL.md`;
    const body = readText(root, rel);
    if (body == null) continue;
    const name = /^name:\s*(.+)$/m.exec(body)?.[1].trim().replace(/^["']|["']$/g, "") ?? entry.name;
    skills.set(name, {
      name,
      path: rel,
      hash: createHash("sha256").update(body).digest("hex"),
      scope: scopes.get(name) ?? scopes.get(entry.name) ?? null,
      // Only a skill that defines its own CRITICAL tier may block a PR.
      canBlock: /\bCRITICAL\b/.test(body),
    });
  }
  return skills;
}

/** Scope column of the catalog table in .claude/skills/README.md. */
function catalogScopes(readme) {
  const scopes = new Map();
  for (const m of readme.matchAll(/^\|\s*\[([^\]]+)\]\([^)]*\)\s*\|\s*([^|]+?)\s*\|/gm)) {
    scopes.set(m[1].trim(), m[2].trim());
  }
  return scopes;
}

/** Minimal glob: `**`, `*`, `?`, `{a,b}`. Paths are repo-relative with forward slashes. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "{") re += "(?:";
    else if (c === "}") re += ")";
    else if (c === ",") re += "|";
    else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs = []) {
  return globs.some((g) => globToRegExp(g).test(path));
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function cacheKey(skill, skillHash, path, fHash) {
  return `${skill}|${skillHash}|${path}|${fHash}`;
}
