# INSIGHTS — server
Lessons learned while working in this package (by humans or agents).
Maintained via the engineering-insights skill (.claude/skills/engineering-insights) — read it
before work, add only verified non-obvious lessons after. Newest first within a section.
Keep each entry ≤5 lines. Agents only append; changing, moving to AGENTS.md or deleting existing entries needs the user's OK.

<!-- Entry format:
### YYYY-MM-DD — short title
- What: specific fact / symptom / error text
- Why: cause or rationale
- Rule: what to do next time
- Evidence: path/file.ts:42 · command · commit
- Also in: <other-pkg>/INSIGHTS.md   (cross-package only)
-->

## What Works
<!-- Approaches that proved themselves, ideally after an alternative failed -->

## What Doesn't Work
<!-- Failed approaches / anti-patterns, with the reason -->

### 2026-09-29 — `await getContext(container, req)` alone scopes NOTHING
- What: repo-intel's routes called `await getContext(...)` and discarded the result, with a comment claiming the request was "workspace-scoped"; the handler then passed `req.params.id` to a facade whose tables are keyed by repo_id only — any workspace's repo id was readable.
- Why: `getContext` resolves tenancy, it does not apply it. A discarded return value authenticates but authorizes nothing, and the reassuring comment stopped anyone re-reading it.
- Rule: a route taking an id from the URL must turn `workspaceId` into a WHERE clause or an explicit ownership assert; if a facade is tenant-agnostic, assert before calling it and answer 404 (not 403). Grep for `await getContext` with no destructuring.
- Evidence: src/modules/repo-intel/routes.ts:38 · src/modules/repo-intel/service.ts assertRepoInWorkspace · test/repo-intel-tenancy.it.test.ts (3 of 4 fail without the assert)

## Codebase Patterns
<!-- Non-obvious conventions or decisions with rationale, not already in AGENTS.md -->

### 2026-09-30 — never mix the DB clock and the app clock on one timestamp column
- What: `skills.updated_at` defaulted to Postgres `now()` on insert but was set to JS `new Date()` on update; `updated_at(v2) >= updated_at(v1)` flaked in the testcontainer (…239 → …234).
- Why: the app host and the DB container clocks differ by a few ms (more in prod); each write site used a different one.
- Rule: set update timestamps with sql`now()` when the column's default is `defaultNow()`, so every value comes from the DB clock.
- Evidence: src/modules/skills/repository.ts:145 · test/skills.it.test.ts:144

### 2026-09-30 — a "read current version → insert version+1" bump needs a row lock
- What: skills (and any `*_versions` table keyed on (id, version)) bump by reading `version` and inserting `version+1`; two concurrent edits both read vN and the second insert dies on the PK → 500.
- Why: a plain transaction at READ COMMITTED doesn't serialize the read; only a lock on the parent row does.
- Rule: inside the tx, load the parent with `.for('update', { of: table })` before computing the next version (not combinable with GROUP BY).
- Evidence: src/modules/skills/repository.ts:107 · test/skills.it.test.ts:184 (fails without the lock)

### 2026-09-22 — a PR's current findings = the latest run of EACH agent, summed
- What: neither "all runs" (double-counts a re-run) nor "the newest run" (drops the other agents) is right; a PR is reviewed by several agents, each of which can be re-run independently.
- Why: got this wrong twice — `reviews` rows are per (agent, run), so the grouping key is (pr_id, agent_id) and the newest run_id within each group wins.
- Rule: ALWAYS group by (pr_id, agent_id) first, take that agent's newest run_id, then sum — and mirror it client-side, or the list column and the PR page disagree.
- Evidence: src/modules/pulls/routes.ts:130 · test/pulls-findings.it.test.ts "sums the latest run of EACH agent" · client latestRunReviews()

### 2026-09-22 — PR-level finding aggregates must NOT filter `reviews.kind`
- What: `reviewsForPull` returns every review row, 'summary' included, so a rollup adding `eq(t.reviews.kind, 'review')` under-counts vs what the PR page shows.
- Why: the adjacent latest-SCORE query *does* filter kind (only 'review' rows carry a score), so copying it into a findings query is the natural, wrong move.
- Rule: NEVER filter `kind` when aggregating findings per PR; filter it only when reading a score.
- Evidence: src/modules/reviews/repository/review.repo.ts:58 · test/pulls-findings.it.test.ts "counts a 'summary' review's findings too"

## Tool & Library Notes
<!-- Quirks of dependencies and tools -->

### 2026-09-30 — SSRF-safe fetch needs `node:https` + a validating `lookup`, not global `fetch`
- What: Node 22 global `fetch` (undici) has no hook to check the IP it actually connects to, so "resolve → check → fetch" leaves a DNS-rebinding gap; `https://localtest.me/…` (public name → 127.0.0.1) is the quick probe.
- Why: the pre-check and the connect do separate DNS lookups; WHATWG `URL` also rewrites `0x7f.1`/`2130706433` → `127.0.0.1` and `[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`, so check the parsed host, hex mapped form included.
- Rule: fetch user URLs via `https.request` with a `lookup` that rejects blocked IPs (handle the `{all:true}` array call shape), `agent:false`, manual redirects re-validated per hop.
- Evidence: src/adapters/skill-fetch/fetcher.ts · src/adapters/skill-fetch/url-guard.ts · test/skills-url-fetch.test.ts

### 2026-09-30 — do lockfile work with the pnpm major that CI pins, not the one on your PATH
- What: CI pins `pnpm/action-setup@v4` with `version: 10`, but a local pnpm 12 behaves differently in two ways that matter. It turns ignored build scripts into a HARD failure (`ERR_PNPM_IGNORED_BUILDS`, exit 1, on esbuild/ssh2/cpu-features/protobufjs) where pnpm 10 only warns and exits 0 — so `pnpm install --frozen-lockfile` looks broken locally while CI is fine. And it rewrites unrelated entries with `(supports-color@7.2.0)` peer suffixes, turning a 3-package update into a 48/46-line diff.
- Why: peer-resolution recording and the build-script policy changed between majors; `lockfileVersion` stays '9.0', so nothing warns you that the file was produced by a different pnpm.
- Rule: for anything that writes pnpm-lock.yaml run `CI=true npx pnpm@10 …` (CI=true also skips the "no TTY" modules-purge prompt). Check the diff touches only the packages you named. Switching majors relinks node_modules from a different store, which is expected and harmless.
- Evidence: `pnpm --version` 12.4.2 vs .github/workflows/server-unit.yml · `CI=true npx pnpm@10 install --frozen-lockfile` → exit 0 · `pnpm update fast-uri find-my-way form-data --depth 100`

### 2026-09-30 — Drizzle `text(col, { enum: [...] })` is TYPE-only, not a DB constraint
- What: adding `enum` to `findings.severity` changed nothing in the database — `pnpm db:generate` answered "No schema changes, nothing to migrate".
- Why: the enum narrows the inferred TS type for inserts/selects; it does not emit a CHECK or a Postgres enum type. Only `pgEnum()` creates a real type.
- Rule: use it for compile-time safety at the write sites, but never claim the column is constrained — a value written by raw SQL, a seed, or another service still lands. If the invariant must hold in the DB, add a CHECK in a hand-written migration.
- Evidence: src/db/schema/reviews.ts findings.severity · `pnpm db:generate` after the change

### 2026-09-29 — vitest cannot time out a SYNCHRONOUS hot loop
- What: a regression test for an O(range) loop in groundFindings does not fail at `testTimeout` when the bug returns — the loop blocks the event loop, so vitest never gets to fire the timer. Measured >120s before the process was killed by hand.
- Why: `testTimeout` is a timer on the loop vitest is itself running; only async code yields back to it.
- Rule: a test guarding a synchronous hot path must assert the CHEAP observable outcome (kept/dropped counts), not wall-clock alone; expect the failure mode to be a stalled job, not a red assertion, and say so in the test comment so nobody "fixes" the hang.
- Evidence: test/grounding.test.ts "handles an absurd line range without scanning it" · reviewer-core/src/grounding.ts rangeIntersects
- Also in: reviewer-core/INSIGHTS.md

### 2026-09-29 — dependency-cruiser: pnpm packages resolve under `node_modules/.pnpm/…`
- What: without options, a rule `to: { path: '^node_modules/drizzle-orm/' }` never fires; the resolved path is `node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.d.ts`, and baseline entries break on a version bump or a symlinked node_modules.
- Why: pnpm's content-addressed store; depcruise follows symlinks to the real path by default.
- Rule: keep `options.preserveSymlinks: true` in .dependency-cruiser.cjs → paths become `node_modules/<pkg>/…`, stable across bumps and scratch copies.
- Evidence: server/.dependency-cruiser.cjs · `pnpm exec depcruise src --config .dependency-cruiser.cjs --no-ignore-known`

### 2026-09-21 — Drizzle aggregates keep SQL NULL as `null`, even with `.mapWith(Number)`
- What: `sum(col).mapWith(Number)` returns `null` (not `0`) for a group whose values are all NULL.
- Why: drizzle's row mapper short-circuits on null before calling the decoder (node_modules/drizzle-orm/utils.js:28).
- Rule: ALWAYS rely on that for "no data" vs "genuinely zero" aggregates instead of adding COALESCE.
- Evidence: src/modules/pulls/routes.ts:139 · test/run-cost.it.test.ts "PR list COST is null (not 0)"

## Recurring Errors & Fixes
<!-- Exact error text → cause → fix -->

### 2026-09-30 — `insert or update on table "reviews" violates foreign key constraint`
- What: integration fixtures that build reviews with `agentId: crypto.randomUUID()` / `runId: crypto.randomUUID()` now fail — `reviews.agent_id` and `reviews.run_id` became real FKs (0012).
- Why: the columns were unconstrained uuids for a long time, so fixtures used throwaway ids to express "a different agent" without creating one; the constraint makes that state unreachable, which is the point.
- Rule: materialize the row first — `insert(t.agents).values({ id, workspaceId, name, provider, model, systemPrompt }).onConflictDoNothing()` (same for `t.agentRuns`), then insert the review. See test/pulls-findings.it.test.ts `ensureAgent` / `ensureRun`.
- Evidence: src/db/migrations/0012_panoramic_thunderbolts.sql · test/pulls-findings.it.test.ts:79

### 2026-09-21 — `(HTTP code 409) … container is running` when the whole *.it.test suite runs
- What: one suite fails at teardown with "cannot remove container ... container is running", while all its tests pass.
- Why: testcontainers races on removing parallel Postgres containers; it is a teardown flake, not a test failure.
- Rule: Re-run that one file (`pnpm exec vitest run test/<file>.it.test.ts`) before investigating; treat a green single-file run as proof.
- Evidence: test/settings-models.it.test.ts · `pnpm exec vitest run .it.test` (33/33 tests passed, 1 suite errored)

## Open Questions
<!-- Unresolved; What + Evidence only; delete once answered -->
