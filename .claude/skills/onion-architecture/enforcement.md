# Enforcement — dependency-cruiser

The rules in SKILL.md are checked mechanically. Review catches the rest (transactions, Zod
placement, entity design).

## Files
| File | Purpose |
|---|---|
| `server/.dependency-cruiser.cjs` | server rules |
| `server/.dependency-cruiser-known-violations.json` | baseline of pre-existing violations |
| `reviewer-core/.dependency-cruiser.cjs` | reviewer-core rules (no baseline — it is clean) |
| `.github/workflows/server-unit.yml` → step "Architecture boundaries" | CI, server |
| `.github/workflows/reviewer-core.yml` → `npm run arch:check` | CI, reviewer-core |

## Commands
```bash
# server (pnpm). No package.json script on purpose: server/package.json is skip-worktree locally.
cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
# see everything, including the baseline
cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --no-ignore-known --output-type err
# reviewer-core (npm)
cd reviewer-core && npm run arch:check
```

## Server rules
| Rule | Blocks |
|---|---|
| `domain-is-pure` | `domain/` → anything except `domain/`, `@devdigest/shared`, `platform/errors.ts` (runtime imports) |
| `domain-no-infra-types` | `domain/` → `db/`, `adapters/`, `platform/*` (except errors), `routes`/`service`/`repository` — even type-only |
| `routes-no-db` | `routes.ts` → `src/db/*`, `drizzle-orm`, `postgres` |
| `routes-no-repository` | `routes.ts` → `repository.ts` / `repository/*` (runtime) — wire it in `container.ts` |
| `service-no-orm` | `service.ts`/`ports.ts` → `src/db/*` (incl. `rows.ts`), `drizzle-orm`, `postgres` |
| `service-no-http` | `service.ts`/`ports.ts` → `fastify`, `@fastify/*`, `routes.ts` |
| `service-no-container` | `service.ts`/`ports.ts` → `platform/container.ts` |
| `service-no-concrete-repository` | `service.ts`/`ports.ts` → `repository.ts` / `repository/*` (runtime; type-only tolerated) |
| `adapters-only-via-composition-root` | anything outside `src/adapters/` and `platform/container.ts` → `src/adapters/*` |
| `no-cross-module-internals` | `modules/A/*` → `modules/B/*` except `B/index.ts`, `B/types.ts`, `modules/_shared/` |
| `shared-is-innermost` | `vendor/shared/*` → any other `src/` file |
| `core-no-infra-packages` | `domain/`, `vendor/shared/` → drizzle, postgres, fastify, SDKs, simple-git, ast-grep, ripgrep, `fs`, `child_process`, `net`, `http(s)` |
| `no-circular` (warn) | import cycles |

Layer detection is by **file name** (`routes.ts`, `service.ts`, `ports.ts`, `domain/`). A use case
that outgrows `service.ts` into `run-executor.ts` is not matched yet — review it by the same rules,
or add the file to the `SERVICE` pattern in the config.

## reviewer-core rules
| Rule | Blocks |
|---|---|
| `core-no-io` | `fs`, `child_process`, `net`, `http(s)`, `worker_threads`, drizzle, postgres, fastify, octokit, simple-git, anthropic SDK, ast-grep, ripgrep, dotenv |
| `sdk-only-in-llm-adapter` | `openai` imported outside `src/llm/` |
| `only-shared-from-server` | `../server/**` except `../server/src/vendor/shared/**` |

## The baseline
`--ignore-known` makes CI fail only on **new** violations. At creation (2026-09-29) it held 31
(`routes-no-repository` added later with 0 existing violations):
`routes-no-db` 8 (pulls, settings, workspace, polling), `adapters-only-via-composition-root` 8
(repo-intel service/pipeline, reviews/diff-loader), `no-circular` 5, `service-no-container` 4,
`service-no-concrete-repository` 4, `no-cross-module-internals` 1, `service-no-orm` 1.

Rules for the baseline:
- **Never regenerate it to absorb a new violation.** That defeats the check. Fix the code.
- **After fixing a known violation, regenerate so the file shrinks:**
  `cd server && pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs` — then check the
  diff only *removes* entries.
- Both configs set `options.preserveSymlinks: true`, so pnpm packages appear as
  `node_modules/<pkg>/…` instead of `node_modules/.pnpm/<pkg>@<version>/…`. Without it, a lockfile
  bump or a scratch copy with a symlinked `node_modules` made known violations resurface
  (hit by 3 of 8 eval runs). Don't remove it.

## Reading a failure
```
error routes-no-db: src/modules/foo/routes.ts → src/db/schema.ts
```
→ rule name → table above → fix pattern in [examples.md](examples.md). Don't silence a rule with
`pathNot` for one file; if a rule is genuinely wrong, change it in the config with a comment and
explain it in the PR.
