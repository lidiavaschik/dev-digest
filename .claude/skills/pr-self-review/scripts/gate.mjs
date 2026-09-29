#!/usr/bin/env node
// The gate: lets a push / PR through only if the last pr-self-review PASSED on exactly the
// current changes (same diffHash).
//
//   node gate.mjs          print the gate status (exit 0 open, 1 closed)
//   node gate.mjs --hook   Claude Code PreToolUse hook (stdin: hook JSON; exit 2 blocks the tool call)
//   node gate.mjs --git    git pre-push hook (stdin: ref lines; exit 1 aborts the push)
//
// Human-only bypass for --git: PR_SELF_REVIEW_SKIP=1 git push   (or git push --no-verify).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diffHash, readJson, repoRoot, resolveBase, scriptsRepoRoot, stateDir } from "./lib.mjs";

// In command position only (start, or after ; && || | ( ), optionally behind VAR=value prefixes —
// so `cd x && git push` is gated but `echo "git push"` or `grep "gh pr create"` is not.
const GATED_COMMAND =
  /(?:^|[;&|(]|\bthen|\bdo)\s*(?:\w+=\S*\s+)*(?:git\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*push|gh\s+pr\s+(?:create|merge))\b/m;
const ZERO_SHA = /^0+$/;
const UNGATED_REMOTE_REF = /^refs\/(?:heads\/(?:main|master)|tags\/)/;

const mode = process.argv[2] ?? "--status";

if (mode === "--hook") hookMode();
else if (mode === "--git") gitMode();
else statusMode();

function evaluate(root) {
  const verdict = readJson(join(stateDir(root), "verdict.json"), null);
  if (!verdict) return { open: false, reason: "no pr-self-review has been run for these changes" };
  let current;
  try {
    current = diffHash(root, resolveBase(root).sha);
  } catch (e) {
    return { open: false, reason: `cannot compute the diff: ${e.message}` };
  }
  if (current !== verdict.diffHash) {
    return { open: false, reason: `stale: the changes differ from the reviewed ones (reviewed ${verdict.createdAt})` };
  }
  if (verdict.verdict !== "PASS") {
    const list = verdict.criticals.map((c) => `  - ${c.file}${c.line != null ? `:${c.line}` : ""} — ${c.title} (${c.rule})`);
    return { open: false, reason: `BLOCK: ${verdict.criticals.length} CRITICAL finding(s)\n${list.join("\n")}` };
  }
  return { open: true, reason: `PASS (reviewed ${verdict.createdAt})` };
}

/** Only guard the repository these scripts belong to. */
function guardedRoot(cwd) {
  const root = repoRoot(cwd);
  return root && root === scriptsRepoRoot() ? root : null;
}

function hookMode() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0); // not a hook payload we understand — don't wedge every Bash call
  }
  const command = input.tool_input?.command ?? "";
  if (input.tool_name !== "Bash" || !GATED_COMMAND.test(command)) process.exit(0);
  const root = guardedRoot(input.cwd ?? process.cwd());
  if (!root) process.exit(0);

  const { open, reason } = evaluate(root);
  if (open) process.exit(0);
  process.stderr.write(
    `pr-self-review gate: \`${command.trim()}\` is blocked — ${reason}\n` +
      "Run the pr-self-review skill (/pr-self-review) on the current changes first; fix every CRITICAL it reports.\n" +
      "Do not bypass this gate (no --no-verify, no PR_SELF_REVIEW_SKIP) — only the user may do that.\n",
  );
  process.exit(2);
}

function gitMode() {
  if (process.env.PR_SELF_REVIEW_SKIP === "1") {
    console.error("pr-self-review gate: skipped by PR_SELF_REVIEW_SKIP=1");
    process.exit(0);
  }
  const refs = readFileSync(0, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(" "))
    .filter(([, localSha, remoteRef]) => !ZERO_SHA.test(localSha) && !UNGATED_REMOTE_REF.test(remoteRef));
  if (!refs.length) process.exit(0); // branch deletion, tags, or main itself

  const root = guardedRoot(process.cwd());
  if (!root) process.exit(0);
  const { open, reason } = evaluate(root);
  if (open) process.exit(0);
  console.error(`pr-self-review gate: push blocked — ${reason}`);
  console.error("Run /pr-self-review in Claude Code, fix the CRITICAL findings, then push again.");
  console.error("Emergency bypass (you, not the agent): PR_SELF_REVIEW_SKIP=1 git push");
  process.exit(1);
}

function statusMode() {
  const root = repoRoot();
  if (!root) {
    console.error("not inside a git repository");
    process.exit(2);
  }
  const { open, reason } = evaluate(root);
  console.log(`pr-self-review gate: ${open ? "OPEN" : "CLOSED"} — ${reason}`);
  process.exit(open ? 0 : 1);
}
