#!/usr/bin/env node
// Step 1: what changed vs main, which skill reviews which files, what the cache already covers,
// and the deterministic findings. Writes .git/pr-self-review/run/plan.json + one .diff per skill.
//
//   node collect.mjs [--fresh]     --fresh ignores the findings cache
import { rmSync } from "node:fs";
import { join } from "node:path";
import { deterministicFindings } from "./deterministic.mjs";
import {
  addedLines,
  cacheKey,
  changedFiles,
  diffFor,
  diffHash,
  fileHash,
  git,
  installedSkills,
  readJson,
  readText,
  repoRoot,
  resolveBase,
  runDir,
  stateDir,
  writeJson,
  writeText,
} from "./lib.mjs";
import { route } from "./routing.mjs";

const fresh = process.argv.includes("--fresh");
const root = repoRoot();
if (!root) {
  console.error("pr-self-review: not inside a git repository");
  process.exit(2);
}

const base = resolveBase(root);
const head = git(["rev-parse", "HEAD"], root).trim();
const files = changedFiles(root, base.sha);
const hash = diffHash(root, base.sha);
const installed = installedSkills(root);
const { plan, unrouted, warnings } = route(files, installed, (p) => readText(root, p));
const cache = fresh ? { entries: {} } : readJson(join(stateDir(root), "cache.json"), { entries: {} });

const dir = runDir(root);
rmSync(dir, { recursive: true, force: true });

const cachedFindings = [];
const entries = plan.map(({ skill, group, files: skillFiles }) => {
  const meta = installed.get(skill);
  const pending = [];
  const cachedFiles = [];
  for (const f of skillFiles) {
    const key = cacheKey(skill, meta.hash, f.path, fileHash(root, f.path));
    if (key in cache.entries) {
      cachedFiles.push(f.path);
      cachedFindings.push(...cache.entries[key]);
    } else pending.push(f);
  }
  const diffPath = join(dir, "diffs", `${skill}.diff`);
  if (pending.length) writeText(diffPath, diffFor(root, base.sha, pending));
  return {
    skill,
    group,
    canBlock: meta.canBlock,
    skillPath: meta.path,
    skillHash: meta.hash,
    files: skillFiles.map((f) => f.path),
    pending: pending.map((f) => f.path),
    cachedFiles,
    diffPath: pending.length ? diffPath : null,
  };
});

const deterministic = deterministicFindings(root, files, addedLines(root, base.sha, files));

const result = {
  createdAt: new Date().toISOString(),
  base,
  head,
  diffHash: hash,
  files,
  plan: entries,
  unrouted,
  warnings,
  deterministic,
  cachedFindings,
};
writeJson(join(dir, "plan.json"), result);

// Human summary — the JSON above is what the next steps read.
const pendingEntries = entries.filter((e) => e.pending.length);
console.log(`pr-self-review plan — base ${base.ref} (${base.sha.slice(0, 7)}) · diff ${hash.slice(0, 12)}`);
console.log(`changed files: ${files.length}${files.length ? "" : " — nothing to review"}`);
for (const e of entries) {
  const state = e.pending.length ? `${e.pending.length} to review` : "all cached";
  console.log(`  ${e.skill.padEnd(24)} [${e.group}] ${e.files.length} file(s), ${state}${e.canBlock ? "" : " (cannot block)"}`);
}
console.log(`subagents to run: ${pendingEntries.length}`);
console.log(`deterministic findings: ${deterministic.length} (${deterministic.filter((f) => f.severity === "CRITICAL").length} CRITICAL)`);
if (unrouted.length) console.log(`unrouted (no skill applies): ${unrouted.join(", ")}`);
for (const w of warnings) console.log(`warning: ${w}`);
console.log(`plan: ${join(dir, "plan.json")}`);
