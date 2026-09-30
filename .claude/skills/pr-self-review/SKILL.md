---
name: pr-self-review
description: Reviews ALL local changes on the branch (commits vs main + staged + unstaged + untracked) against the repo's own skills before a pull request exists — UI skills on client/ files, backend architecture skills on server/ and reviewer-core/ files — plus typecheck, depcruise and related unit tests, and blocks push / PR creation / merge while any CRITICAL finding remains. Use before `git push`, before `gh pr create` or `gh pr merge`, when the user says "self review", "review my changes", "ready for PR", "open a PR", /pr-self-review, and ALWAYS when a command was blocked by the "pr-self-review gate" hook. Does NOT review a remote GitHub PR by number (use code-review) and does not fix code on its own.
argument-hint: "[--fresh]"
disable-model-invocation: true
---

# PR Self Review

Runs every applicable skill in `.claude/skills/` over the local diff, verifies the blocking
findings, and writes a verdict the gate enforces. **Any CRITICAL → BLOCK**: the PreToolUse hook
refuses `git push` / `gh pr create` / `gh pr merge`, and `.githooks/pre-push` refuses a terminal
push, until a new run on the *current* changes passes.

Scripts are in `scripts/`. Run them from the repo root. They write to `.git/pr-self-review/`, which is never committed.
Routing (which skill reviews which files) is explained in [routing.md](routing.md). The finding format, subagent
briefs and report are described in [report-format.md](report-format.md).

## Hard rules

- The verdict comes from `finalize.mjs`, never from your own judgement. Do not write `verdict.json` by hand.
- Never bypass the gate: no `--no-verify`, no `PR_SELF_REVIEW_SKIP`, no editing the hook.
  Those are for the user only, and only if they ask for them explicitly.
- Never create or edit `.pr-self-review-waivers.json` on your own. Offer the JSON entry, and the user decides.
- Report findings; do not fix code during the review. Fix it only after the user asks, then re-run.
- Review only the **changed lines** and what they break, not legacy code around them.

## Workflow

Copy this checklist and tick it off:

```
PR self-review:
- [ ] 0. Insights: read <pkg>/INSIGHTS.md for every package in the diff (engineering-insights Phase 1)
- [ ] 1. node .claude/skills/pr-self-review/scripts/collect.mjs [--fresh]
- [ ] 2. node .claude/skills/pr-self-review/scripts/checks.mjs      (run in background while 3 runs)
- [ ] 3. One subagent per plan entry with pending files — all in ONE message
- [ ] 4. Verify pass: one skeptical subagent per CRITICAL
- [ ] 5. Write .git/pr-self-review/run/findings.json
- [ ] 6. node .claude/skills/pr-self-review/scripts/finalize.mjs
- [ ] 7. BLOCK → list CRITICALs with fixes · PASS → fill the PR body Summary
- [ ] 8. engineering-insights Phase 3 only if this run hit a problem worth recording
```

**1 — Plan.** `collect.mjs` prints a summary and writes `run/plan.json` with:
- `plan[]` — `{skill, canBlock, skillPath, files, pending, diffPath}`;
- `deterministic[]` — rule checks that need no LLM, for example an edited migration, an unmirrored shared contract or a secret;
- `cachedFindings[]` — findings for (skill, file) pairs unchanged since the last run.

If the diff is empty, go straight to 2 and 6. `--fresh` drops the cache. Use it after editing a routing rule.

**2 — Tool checks.** `checks.mjs` runs, for the touched packages only:
- typecheck;
- depcruise (server / reviewer-core);
- `vitest related` unit tests.

A red check is a CRITICAL. Integration tests (`*.it.test.ts`, which need Docker) and e2e are
skipped and listed as skipped. The result is reused while the diff is unchanged.

**3 — Skill review (fan-out).** For every `plan[]` entry with a non-empty `pending`, spawn a
subagent using the *Skill reviewer brief* in [report-format.md](report-format.md). Send all of them in
one message so they run in parallel. Each one gets only its skill's `skillPath`, `diffPath` and
`pending` list. Entries whose files are all cached need no agent.

**4 — Verify.** For each CRITICAL returned, spawn a *Verifier* (brief in report-format.md) with the
finding, the skill rule it cites and the file. Set `verified: true` if it holds. If it doesn't, set `verified: false`
(finalize then downgrades it to HIGH). A false BLOCK costs more than a missed MEDIUM.

**5 — Findings file.** Write every finding from step 3, after verification, to
`.git/pr-self-review/run/findings.json` as `{ "findings": [...] }`. Use `{ "findings": [] }` if there are none.
Don't include deterministic, tool or cached findings; finalize merges those itself.

**6 — Verdict.** `finalize.mjs` validates the findings, dedupes them by file:line, applies waivers, updates the cache and writes
`verdict.json`, `report.md` and, on PASS, `pr-body.md`. Exit codes:
- `0` PASS;
- `1` BLOCK;
- `2` bad input (fix the findings file and re-run);
- `3` the tree changed mid-review (start again at 1, where the cache makes it cheap).

**7 — Tell the user.** Print the report's CRITICAL and HIGH sections and the verdict.
- BLOCK: for each CRITICAL, give the fix. If the user says a finding is wrong, offer a waiver entry (below).
- PASS: replace the Summary comment in `.git/pr-self-review/pr-body.md` with 2–4 bullets written from the diff.
  Show the body and offer `gh pr create --body-file .git/pr-self-review/pr-body.md`. `gh` may not be
  installed; then just show the text. Don't open the PR unless the user asks.

Check the gate at any time: `node .claude/skills/pr-self-review/scripts/gate.mjs`.

## Severity: who may block

Only skills that define a CRITICAL tier can block. `finalize.mjs` detects this from the skill's
text (`canBlock`) and downgrades CRITICAL from any other skill to HIGH. Today that means
frontend-architecture, react-best-practices, onion-architecture, security and zod. Deterministic
and tool findings always can. A CRITICAL must quote a changed line and name a rule the skill itself marks
CRITICAL.

## Waivers (user decision only)

`.pr-self-review-waivers.json` (committed, so the waiver is visible in the PR diff):

```json
{ "waivers": [
  { "rule": "onion-architecture:routes-no-db", "file": "server/src/modules/x/routes.ts",
    "line": 12, "reason": "why this is a false positive", "expires": "2026-12-31", "author": "name" }
] }
```

- `rule` is exact or `skill:*`. `file` is exact or a glob. `line` is optional. `reason` and `expires` are required.
- A waived finding still shows under WAIVED. An expired waiver stops applying.
- `deterministic:migration-edited | secret | env-file | runtime-clones` cannot be waived.
- A waiver changes the diff, so re-run the review. The cache keeps it fast.

## When the gate blocked a command

The hook message says why. It is one of: no review yet, **stale** (the files changed after the last
review), or **BLOCK** (with the CRITICALs listed). In every case, run this workflow on the current tree,
report the result, and retry the blocked command only after `finalize.mjs` exits 0.
