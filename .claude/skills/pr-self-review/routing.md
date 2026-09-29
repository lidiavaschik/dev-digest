# Routing: which skill reviews which files

Source of truth: [scripts/routing.mjs](scripts/routing.mjs) (`RULES`). This page explains it.
A rule fires only if its skill is installed in `.claude/skills/`, so removing a skill silently
removes its rule. Deleted files are never routed, because there is nothing left to review.

| Group | Skill | Files |
|---|---|---|
| UI | frontend-architecture | `client/src/**/*.{ts,tsx}` except `client/src/vendor/**` |
| UI | react-best-practices | `client/src/**/*.tsx`, hooks (`use*.ts`, `hooks/**`) |
| UI | next-best-practices | `client/src/app/**`, `client/src/middleware.ts`, `client/next.config.*` |
| UI | react-testing-library | `client/**/*.test.{ts,tsx}`, `client/src/test/**` |
| Backend | onion-architecture | `server/src/**/*.ts`, `reviewer-core/src/**/*.ts`, their `test/**`, depcruise configs; not migrations |
| Backend | fastify-best-practices | `**/routes.ts`, `routes/**`, `server/src/platform/**`, `server/src/{app,server}.ts` |
| Backend | drizzle-orm-patterns | `repository.ts`, `repository/**`, `*.repo.ts`, `mappers.ts`, `server/src/db/**/*.ts` |
| Backend | postgresql-table-design | `server/src/db/schema/**`, `db/schema.ts`, **newly added** `migrations/*.sql` |
| Full-stack | security | all source (client, server, reviewer-core, e2e), workflows, `scripts/`, `.githooks/`, `package.json`, `.claude/settings.json` + `.claude/**` scripts (hooks run commands) |
| Full-stack | zod | any source file that imports `zod` or uses `z.object` / `z.infer` / … |
| Full-stack | typescript-expert | all source + `tsconfig*.json` |
| — | engineering-insights, mermaid-diagram, pr-self-review | never; they are workflows, not checklists |

Files no rule matches (docs, lockfiles, INSIGHTS.md, migration snapshots) are listed as
**unrouted** in the report. Nothing is dropped silently.

## Deterministic checks (scripts/deterministic.mjs, no LLM)

| Rule | Severity | Waivable |
|---|---|---|
| `migration-edited`: existing file in `server/src/db/migrations/**` modified or deleted (the journal is allowed when a new `.sql` is added) | CRITICAL | no |
| `shared-contract-not-mirrored`: `server/src/vendor/shared/X` changed but `client/src/vendor/shared/X` did not | CRITICAL | yes |
| `secret`: an added line matches a token or key pattern | CRITICAL | no |
| `env-file`: a `.env*` file (not `.example`) is in the change | CRITICAL | no |
| `runtime-clones`: anything under `server/clones/**` | CRITICAL | no |

## Adding a skill

1. Install or author it in `.claude/skills/<name>/` and add a catalog row with a **Scope** to
   `.claude/skills/README.md`.
2. Add a rule to `RULES` in `scripts/routing.mjs` (`skill`, `group`, `include`, optional
   `exclude`, `contentMatch`, `onlyAdded`) and a row to the table above.
3. For it to be able to block, the skill must define its own CRITICAL tier.
4. Add a routing case to `scripts/test/collect.test.mjs` and run the tests:
   `node --test '.claude/skills/pr-self-review/scripts/test/*.test.mjs'` (Node 24 needs the glob, not the directory).

Until step 2 is done, every run warns "skill X (Scope: …) has no routing rule".
