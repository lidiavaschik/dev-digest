---
name: onion-architecture
description: "Enforces Onion Architecture (dependencies point inward: domain ← application ← infrastructure/HTTP) in DevDigest backend code — server/ (Fastify 5, Drizzle, Postgres, Zod, LLM/GitHub/git adapters, JobRunner) and reviewer-core/. Use whenever creating, moving or refactoring a backend module, route, service, repository, mapper, port, adapter or job handler; when adding an external dependency or a DB query; on questions like \"where does this backend code go\", \"can a route query the DB\", \"should the service take the container\", \"where do Drizzle row types live\", \"where do transactions start\"; when `depcruise` / the \"Architecture boundaries\" CI step fails; and when reviewing backend changes. Use it even if the user never says \"onion\" or \"architecture\" — any new backend feature is a placement decision. Does NOT cover Fastify API details (fastify-best-practices), query/schema syntax (drizzle-orm-patterns, postgresql-table-design), Zod API (zod) or frontend placement (frontend-architecture)."
---

# Onion Architecture — DevDigest backend

This skill answers **"which layer owns this code, and which way may it depend"**.
It is not a tutorial on Fastify or Drizzle — it decides boundaries, then defers to the tool skills.

Companion files, read on demand:
[layers.md](layers.md) — what lives in each layer + placement decision tree ·
[stack-devdigest.md](stack-devdigest.md) — per-tool rules (Fastify, Drizzle, Zod, adapters, jobs, reviewer-core) ·
[enforcement.md](enforcement.md) — dependency-cruiser rules, baseline, fixing a CI failure ·
[testing.md](testing.md) — one test strategy per layer ·
[migration.md](migration.md) — moving legacy modules in, shrinking the baseline ·
[checklists.md](checklists.md) — new module / review checklists ·
[examples.md](examples.md) — bad → good on real files ·
[README.md](README.md) — why, key decisions, sources, eval results

## The model

```
            ┌───────────────────────────────────────────────────────────┐
            │  presentation: routes.ts · job handlers · SSE              │
            │  ┌─────────────────────────────────────────────────────┐   │
            │  │ infrastructure: repository.ts · mappers.ts ·         │   │
            │  │   src/adapters/* · src/db/*                          │   │
            │  │  ┌───────────────────────────────────────────────┐   │   │
            │  │  │ application: service.ts (use cases) · ports.ts │   │   │
            │  │  │  ┌─────────────────────────────────────────┐   │   │   │
            │  │  │  │ domain: domain/*  +  @devdigest/shared   │   │   │   │
            │  │  │  │ (contracts, port interfaces)            │   │   │   │
            │  │  │  └─────────────────────────────────────────┘   │   │   │
            │  │  └───────────────────────────────────────────────┘   │   │
            │  └─────────────────────────────────────────────────────┘   │
            └───────────────────────────────────────────────────────────┘
   composition root: src/platform/container.ts (+ routes.ts wiring a service from container.*)
```

Palermo's four tenets, applied here:
1. The application is built around an independent object model — `domain/` + `@devdigest/shared`.
2. Inner layers define interfaces; outer layers implement them — ports in `ports.ts` /
   `vendor/shared/adapters.ts`, implementations in `repository.ts` / `src/adapters/`.
3. All coupling points toward the center.
4. The core compiles and runs without infrastructure — a service test needs no Postgres, no network.

## Module layout (agreed — keep the existing file names)

```
src/modules/<name>/
  domain/         entities / value objects / pure rules / domain errors   ← only when there are real invariants
  ports.ts        interfaces the service needs (XRepository, UnitOfWork, Clock…)
  service.ts      use cases (application layer)
  repository.ts   Drizzle implementation of the repository port (or repository/*.repo.ts)
  mappers.ts      Drizzle row ↔ contract/domain
  routes.ts       Fastify plugin: Zod schemas → service call → response
  helpers.ts · constants.ts   (pure; layer = whoever imports them)
  index.ts        public API for other modules
```

Domain types default to the Zod contracts in `@devdigest/shared`. Introduce a class/value
object in `domain/` only when something has behaviour or an invariant that more than one use case
must respect (see the test in [layers.md](layers.md#when-to-create-a-domain-entity)).

## Rules

Severity vocabulary matches `security` / `frontend-architecture` so findings merge into one list.
**CRITICAL** — breaks the dependency rule; block the change. **HIGH** — will make a layer untestable
or leak infrastructure; fix now or log a follow-up. **MEDIUM** — consistency; fix if the file is touched.

| # | Rule | Sev | Enforced by |
|---|---|---|---|
| 1 | `domain/` and `@devdigest/shared` import no framework, ORM, SDK, `fs`, `db/`, `adapters/`, `platform/` (except `platform/errors.ts`). | CRITICAL | `domain-is-pure`, `domain-no-infra-types`, `core-no-infra-packages`, `shared-is-innermost` |
| 2 | `routes.ts` never imports `drizzle-orm`, `postgres` or `src/db/*`. Route = parse → one service call → return. | CRITICAL | `routes-no-db` |
| 3 | Concrete adapters and repositories are constructed only in `platform/container.ts`; modules depend on the port interface. `routes.ts` passes `container.xRepo` into the service — never `new XRepository(container.db)`. | CRITICAL | `adapters-only-via-composition-root`, `routes-no-repository` |
| 4 | reviewer-core does no I/O; the openai SDK lives only in `src/llm/`; from `../server` only `@devdigest/shared`. | CRITICAL | reviewer-core `core-no-io`, `sdk-only-in-llm-adapter`, `only-shared-from-server` |
| 5 | A service gets narrow ports via its constructor — not `Container`, not `new XRepository(db)`. | HIGH | `service-no-container`, `service-no-concrete-repository` |
| 6 | Drizzle schema and row types (`$inferSelect`, `db/rows.ts`) stay in `repository.ts` + `mappers.ts`; repositories return contracts/domain objects. | HIGH | `service-no-orm` |
| 7 | Services know nothing about Fastify / HTTP; they throw `AppError` subclasses, the global handler maps status codes. | HIGH | `service-no-http` |
| 8 | A use case that writes more than one row/table owns the transaction via a `UnitOfWork` port; repositories accept the `tx`. | HIGH | review |
| 9 | Zod parses at the edges only (HTTP DTOs, env, LLM/GitHub payloads). Inside, trust the parsed type. | HIGH | review |
| 10 | Other modules are reached via their `index.ts`/`types.ts` or via `container.*`, never their internals. | MEDIUM | `no-cross-module-internals` |
| 11 | Every new port gets a fake in `adapters/mocks.ts` (or a module test helper) and a test at the right layer. | MEDIUM | review, [testing.md](testing.md) |

Why these matter here specifically: the course adds a module per lesson (L01–L08). A route that
queries the DB, or a service that pulls adapters out of the container, gets copied by every later
lesson — the boundary is cheapest to hold at the first file.

## Workflow

**Before writing backend code**
1. Read `<pkg>/CLAUDE.md` and `<pkg>/INSIGHTS.md` (repo rule).
2. Place each new piece with the decision tree in [layers.md](layers.md). If the answer is "the
   route", it is almost always wrong unless the code is parsing or shaping HTTP.
3. Need something external (DB, LLM, GitHub, clock, fs)? Declare a port first (rule 3/5), then
   implement it in the outer layer, then wire it in `container.ts`.

**While writing**
- New repository → add a lazy getter (+ `ContainerOverrides` entry) in `platform/container.ts`, like `agentsRepo`.
- Build the service in `routes.ts` from container parts: `new XService({ repo: container.xRepo, llm: … })`.
- Map rows in `mappers.ts`; a service never sees a Drizzle row.
- Transaction boundary = the use case, via `UnitOfWork` ([stack-devdigest.md](stack-devdigest.md#drizzle)).

**Before finishing — run the checks, don't just list them**
Evals showed agents writing correct-looking layers and then skipping verification. Run these and
report the actual output; if the repo is read-only, run them on a scratch copy (a symlinked
`node_modules` is fine — the config uses `preserveSymlinks`):
- `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known`
- `cd server && pnpm typecheck` and the hermetic tests you added (`pnpm exec vitest run <files>`)
- `cd reviewer-core && npm run arch:check` (if touched)
- Never add entries to `.dependency-cruiser-known-violations.json` to get green. If you fixed a
  known violation, regenerate the baseline so it shrinks ([enforcement.md](enforcement.md)).
- Tests at the right layer ([testing.md](testing.md)); run the review checklist in [checklists.md](checklists.md).

**Touching a legacy file** (listed in the baseline): don't widen the violation. If the change is
small, leave it; if you're adding a new endpoint or query, add it the new way and follow
[migration.md](migration.md) for the surrounding code only when the user asks for the refactor.

## Out of scope — bounce to

| Question | Read |
|---|---|
| Hooks, plugins, decorators, schema-based validation syntax | `fastify-best-practices` |
| Query builder, relations, migrations syntax | `drizzle-orm-patterns` |
| Table design, indexes, pgvector columns | `postgresql-table-design` |
| Zod API, refinements, inference | `zod` |
| Generics / type-level modelling of ports | `typescript-expert` |
| Auth, secrets, injection | `security` |
| Recording a boundary lesson | `engineering-insights` |
