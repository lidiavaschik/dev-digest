#!/usr/bin/env node
// Step 4: merge deterministic + tool + cached + new skill findings, apply waivers, decide the
// verdict and write it where the gate reads it. The verdict is computed here, in code — never
// by the model — so the gate cannot be talked past.
//
//   node finalize.mjs [--findings <path>]    default: .git/pr-self-review/run/findings.json
//   exit 0 = PASS · 1 = BLOCK · 2 = usage/input error · 3 = changes happened during the review
import { join } from "node:path";
import { UNWAIVABLE } from "./deterministic.mjs";
import {
  PR_BODY_ATTRIBUTION,
  SEVERITIES,
  WAIVERS_FILE,
  cacheKey,
  diffHash,
  fileHash,
  git,
  globToRegExp,
  readJson,
  repoRoot,
  runDir,
  stateDir,
  writeJson,
  writeText,
} from "./lib.mjs";

const root = repoRoot();
const dir = runDir(root);
const state = stateDir(root);
const argIdx = process.argv.indexOf("--findings");
const findingsPath = argIdx > 0 ? process.argv[argIdx + 1] : join(dir, "findings.json");

const plan = readJson(join(dir, "plan.json"), null);
const checks = readJson(join(state, "checks.json"), null);
if (!plan) fail(2, "no plan.json — run collect.mjs first");
if (checks?.diffHash !== plan.diffHash) fail(2, "checks.json is missing or for another diff — run checks.mjs first");

const pendingEntries = plan.plan.filter((e) => e.pending.length);
const submitted = readJson(findingsPath, pendingEntries.length ? null : { findings: [] });
if (!submitted || !Array.isArray(submitted.findings)) {
  fail(2, `no findings file at ${findingsPath} — expected { "findings": [...] } (empty array if none)`);
}

if (diffHash(root, plan.base.sha) !== plan.diffHash) {
  fail(3, "the working tree changed during the review — re-run the review from collect.mjs");
}

// --- validate + normalize the model's findings -----------------------------------------
const entryBySkill = new Map(plan.plan.map((e) => [e.skill, e]));
const errors = [];
const fresh = submitted.findings.map((f, i) => {
  const at = `findings[${i}] (${f.skill ?? "?"} ${f.file ?? "?"})`;
  const entry = entryBySkill.get(f.skill);
  if (!entry) errors.push(`${at}: skill is not in this run's plan`);
  else if (!entry.pending.includes(f.file)) errors.push(`${at}: file was not pending for this skill`);
  if (!SEVERITIES.includes(f.severity)) errors.push(`${at}: severity must be one of ${SEVERITIES.join("/")}`);
  if (!f.title) errors.push(`${at}: title is required`);
  if (f.severity === "CRITICAL" && typeof f.verified !== "boolean") errors.push(`${at}: CRITICAL needs "verified" from the verify pass`);
  const out = { source: "skill", ...f, rule: f.rule?.includes(":") ? f.rule : `${f.skill}:${f.rule ?? "unnamed"}` };
  if (out.severity === "CRITICAL" && out.verified === false) {
    out.severity = "HIGH";
    out.note = "CRITICAL rejected by the verify pass";
  }
  if (out.severity === "CRITICAL" && entry && !entry.canBlock) {
    out.severity = "HIGH";
    out.note = `${f.skill} defines no CRITICAL tier, so it cannot block`;
  }
  return out;
});
if (errors.length) fail(2, `invalid findings:\n  ${errors.join("\n  ")}`);

// --- cache: one entry per (skill, file) of this plan, so stale entries drop out --------------
const oldCache = readJson(join(state, "cache.json"), { entries: {} });
const cache = { entries: {} };
for (const e of plan.plan) {
  for (const path of e.files) {
    const key = cacheKey(e.skill, e.skillHash, path, fileHash(root, path));
    cache.entries[key] = e.pending.includes(path)
      ? fresh.filter((f) => f.skill === e.skill && f.file === path)
      : oldCache.entries[key] ?? [];
  }
}
writeJson(join(state, "cache.json"), cache);

// --- merge, dedupe, waive -------------------------------------------------------------------
const all = dedupe([...plan.deterministic, ...checks.findings, ...plan.cachedFindings, ...fresh]);
const { waivers, waiverWarnings } = loadWaivers();
const today = new Date().toISOString().slice(0, 10);
for (const f of all) {
  if (UNWAIVABLE.includes(f.rule)) continue;
  const w = waivers.find((w) => waiverMatches(w, f));
  if (!w) continue;
  if (w.expires < today) {
    waiverWarnings.push(`waiver for ${w.rule} on ${w.file} expired ${w.expires} — the finding blocks again`);
    continue;
  }
  f.waived = { reason: w.reason, expires: w.expires, author: w.author };
}

const blocking = all.filter((f) => f.severity === "CRITICAL" && !f.waived);
const verdict = blocking.length ? "BLOCK" : "PASS";
const counts = Object.fromEntries(SEVERITIES.map((s) => [s, all.filter((f) => f.severity === s && !f.waived).length]));

writeJson(join(state, "verdict.json"), {
  verdict,
  diffHash: plan.diffHash,
  base: plan.base,
  head: plan.head,
  createdAt: new Date().toISOString(),
  counts,
  criticals: blocking.map(({ rule, file, line, title }) => ({ rule, file, line, title })),
  waived: all.filter((f) => f.waived).map(({ rule, file, line, title, waived }) => ({ rule, file, line, title, ...waived })),
});

const report = renderReport();
writeText(join(state, "report.md"), report);
if (verdict === "PASS") writeText(join(state, "pr-body.md"), renderPrBody());
console.log(report);
if (verdict === "PASS") console.log(`PR body draft: ${join(state, "pr-body.md")} (fill in the Summary)`);
process.exit(verdict === "PASS" ? 0 : 1);

// ------------------------------------------------------------------------------------------------

function fail(code, msg) {
  console.error(`pr-self-review: ${msg}`);
  process.exit(code);
}

/** Same file:line reported by several skills → one finding, highest severity wins. */
function dedupe(findings) {
  const rank = (s) => SEVERITIES.indexOf(s);
  const byKey = new Map();
  for (const f of findings) {
    const key = f.line != null ? `${f.file}:${f.line}` : `${f.file}:${f.rule}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...f, skills: f.skill ? [f.skill] : [] });
      continue;
    }
    const [keep, other] = rank(f.severity) < rank(prev.severity) ? [{ ...f, skills: prev.skills }, prev] : [prev, f];
    if (other.skill && !keep.skills.includes(other.skill)) keep.skills.push(other.skill);
    keep.related = [...(keep.related ?? []), `${other.rule}: ${other.title}`];
    byKey.set(key, keep);
  }
  return [...byKey.values()].sort((a, b) => rank(a.severity) - rank(b.severity) || a.file.localeCompare(b.file));
}

function loadWaivers() {
  const raw = readJson(join(root, WAIVERS_FILE), { waivers: [] });
  const waivers = [];
  const waiverWarnings = [];
  for (const w of raw.waivers ?? []) {
    const missing = ["rule", "file", "reason", "expires"].filter((k) => !w[k]);
    if (missing.length) waiverWarnings.push(`invalid waiver ${JSON.stringify(w)} — missing ${missing.join(", ")}; ignored`);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(w.expires)) waiverWarnings.push(`invalid waiver expiry "${w.expires}" (YYYY-MM-DD); ignored`);
    else waivers.push(w);
  }
  return { waivers, waiverWarnings };
}

function waiverMatches(w, f) {
  const ruleOk = w.rule === f.rule || (w.rule.endsWith(":*") && f.rule.startsWith(w.rule.slice(0, -1)));
  const fileOk = w.file === f.file || globToRegExp(w.file).test(f.file);
  return ruleOk && fileOk && (w.line == null || w.line === f.line);
}

function loc(f) {
  return f.line != null ? `${f.file}:${f.line}` : f.file;
}

function renderFinding(f) {
  const who = f.skills?.length ? f.skills.join(", ") : f.rule;
  let s = `- **${loc(f)}** — ${f.title} _(${who}; \`${f.rule}\`)_`;
  if (f.evidence) s += `\n  - evidence:\n\n    \`\`\`\n${indent(f.evidence)}\n    \`\`\``;
  if (f.fix) s += `\n  - fix: ${f.fix}`;
  if (f.note) s += `\n  - note: ${f.note}`;
  if (f.related?.length) s += `\n  - also: ${f.related.join("; ")}`;
  return s;
}

function indent(text) {
  return String(text).split("\n").map((l) => `    ${l}`).join("\n");
}

function renderReport() {
  const reviewed = plan.plan.map((e) => `${e.skill} (${e.files.length}${e.cachedFiles.length ? `, ${e.cachedFiles.length} cached` : ""})`);
  const lines = [
    `# PR self-review — ${verdict}`,
    "",
    `base \`${plan.base.ref}\` (${plan.base.sha.slice(0, 7)}) · diff \`${plan.diffHash.slice(0, 12)}\` · ${plan.files.length} file(s)`,
    `skills: ${reviewed.join(", ") || "none"}`,
    `counts: ${SEVERITIES.map((s) => `${s} ${counts[s]}`).join(" · ")}`,
    "",
  ];
  for (const sev of SEVERITIES) {
    const list = all.filter((f) => f.severity === sev && !f.waived);
    if (!list.length) continue;
    lines.push(`## ${sev} (${list.length})`, "", ...list.map(renderFinding), "");
  }
  const waived = all.filter((f) => f.waived);
  if (waived.length) {
    lines.push(`## WAIVED (${waived.length})`, "");
    for (const f of waived) lines.push(`- ${loc(f)} — ${f.title} (\`${f.rule}\`) — ${f.waived.reason} (until ${f.waived.expires})`);
    lines.push("");
  }
  lines.push("## Checks", "");
  for (const r of checks.results) lines.push(`- ${r.status} — ${r.pkg} ${r.check}${r.reason ? ` (${r.reason})` : ""}`);
  for (const s of checks.skipped) lines.push(`- skipped — ${s}`);
  if (!checks.results.length) lines.push("- no package touched");
  const notes = [...plan.warnings, ...waiverWarnings];
  if (plan.unrouted.length) notes.push(`unrouted (no skill applies): ${plan.unrouted.join(", ")}`);
  if (notes.length) lines.push("", "## Warnings", "", ...notes.map((n) => `- ${n}`));
  if (verdict === "BLOCK") {
    lines.push("", `**BLOCKED** — ${blocking.length} CRITICAL. Fix them and run /pr-self-review again; push and PR stay blocked until then.`);
  }
  return `${lines.join("\n")}\n`;
}

function renderPrBody() {
  const commits = git(["log", "--format=- %s", `${plan.base.sha}..HEAD`], root).trim();
  const followUps = all.filter((f) => f.severity === "HIGH" && !f.waived);
  const waived = all.filter((f) => f.waived);
  const checkLines = checks.results.map((r) => `- ${r.status === "passed" ? "✅" : "⏭️"} ${r.pkg} ${r.check}${r.reason ? ` — ${r.reason}` : ""}`);
  return [
    "## Summary",
    "",
    "<!-- pr-self-review: replace with 2–4 bullets on what changed and why. Commits on this branch: -->",
    commits ? `<!--\n${commits}\n-->` : "<!-- (no commits yet — changes are uncommitted) -->",
    "",
    "## Checks",
    "",
    `- ✅ pr-self-review: no CRITICAL (diff \`${plan.diffHash.slice(0, 12)}\`)`,
    `- skills: ${plan.plan.map((e) => `${e.skill} (${e.files.length})`).join(", ") || "none applied"}`,
    ...checkLines,
    ...checks.skipped.map((s) => `- ⏭️ ${s}`),
    "",
    ...(followUps.length
      ? ["## Follow-ups", "", ...followUps.map((f) => `- [ ] ${loc(f)} — ${f.title} (\`${f.rule}\`)`), ""]
      : []),
    ...(waived.length
      ? ["## Waived findings", "", ...waived.map((f) => `- ${loc(f)} — ${f.title} (\`${f.rule}\`): ${f.waived.reason}`), ""]
      : []),
    PR_BODY_ATTRIBUTION,
    "",
  ].join("\n");
}
