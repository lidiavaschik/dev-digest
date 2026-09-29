# Layers — what lives where

## Contents
- [Domain](#domain) · [Application](#application) · [Infrastructure](#infrastructure) ·
  [Presentation](#presentation) · [Composition root](#composition-root)
- [Placement decision tree](#placement-decision-tree)
- [When to create a domain entity](#when-to-create-a-domain-entity)
- [Allowed imports matrix](#allowed-imports-matrix)

## Domain
`src/modules/<name>/domain/*` + `src/vendor/shared/**` (`@devdigest/shared`).

- **Contracts** (Zod schemas + inferred types) in `@devdigest/shared` are the default domain types.
  They are shared with the client, so they are the ubiquitous language of the app.
- **Port interfaces for external systems** (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`,
  `Embedder`, `SecretsProvider`, `AuthProvider`) live in `vendor/shared/adapters.ts`.
- `domain/` holds pure functions and, where justified, entities/value objects and domain errors
  (`class AgentConfigError extends ValidationError` — `platform/errors.ts` is the one allowed import).
- No `async` I/O, no `Date.now()` / `crypto.randomUUID()` hidden inside — take a `Clock`/`IdGen`
  port or a parameter, so the rule is deterministic in tests.

## Application
`service.ts`, `ports.ts` (and use-case files a service grows into, e.g. `run-executor.ts`).

- One public method per use case (`createAgent`, `importPulls`, `startReviewRun`); it orchestrates:
  load via ports → apply domain rules → persist via ports → publish progress via ports.
- Declares module-local ports in `ports.ts`: `AgentsRepository` interface, `UnitOfWork`,
  `ProgressReporter`, `Clock`. External-system ports stay in `vendor/shared/adapters.ts`.
- Owns transaction boundaries (via `UnitOfWork`) and authorization/workspace scoping decisions
  (`workspaceId` is a parameter of every use case).
- Throws `AppError` subclasses; never knows HTTP status codes exist beyond that taxonomy.
- Does not import: `drizzle-orm`, `src/db/*`, `fastify`, `routes.ts`, `platform/container.ts`,
  concrete `repository.ts` (type-only import is tolerated during migration), `src/adapters/*`.

## Infrastructure
`repository.ts` / `repository/*.repo.ts`, `mappers.ts`, `src/adapters/*`, `src/db/*`,
`platform/jobs.ts`, `platform/sse.ts`, `reviewer-core/src/llm/openrouter.ts`.

- Implements ports. A repository class `implements AgentsRepository` from `ports.ts`.
- Drizzle, SQL, `$inferSelect`, `db/rows.ts`, pgvector operators live here and only here.
- Maps rows → contracts/domain in `mappers.ts` before returning.
- SDK types (`OpenAI.ChatCompletion`, Octokit responses, simple-git results) never cross the
  adapter's return type — map to the port's types.
- Resilience (retry, timeout, rate-limit, degrade-to-empty) belongs in the adapter or in
  `platform/resilience.ts`, not in the use case.

## Presentation
`routes.ts`, job handlers registered with `container.jobs`, SSE endpoints.

- Declares Zod schemas for params/query/body/response (`schema: { params, body }`).
- Resolves request context (`getContext(container, req)` → `workspaceId`).
- Calls exactly one use case, returns its result (or a small presenter mapping to a contract).
- A job handler is a route without HTTP: parse the payload with Zod, call a use case.

## Composition root
`src/platform/container.ts` is the only place that `new`s adapters and repositories (lazy getter +
`ContainerOverrides` entry per repository, like `agentsRepo`).
`routes.ts` may assemble its module service from `container.*` parts at plugin registration —
that is wiring, not logic. Tests replace parts via `ContainerOverrides`.

## Placement decision tree

```
Is it parsing/shaping an HTTP request/response or a job payload?        → routes.ts / job handler
Does it talk to Postgres (Drizzle, SQL, row types)?                     → repository.ts (+ mappers.ts)
Does it call an external system (LLM, GitHub, git, fs, ripgrep, ast-grep)?
    ├─ the interface                                                    → vendor/shared/adapters.ts (port)
    └─ the implementation                                               → src/adapters/<system>/
Is it "what happens, in what order" for one user action?               → service.ts (use case)
Is it a rule that is true regardless of storage/transport
    (validation invariant, scoring, state transition, diffing)?         → domain/ (or helpers.ts if trivial)
Is it wiring (which impl, which key, lazy construction, `new XRepository(db)`)? → platform/container.ts
Is it a type shared with the client?                                    → @devdigest/shared contract
```

Tie-breaker: when a piece of code fits two layers, split it — the part with I/O goes out, the
decision goes in.

## When to create a domain entity

Stay with the contract type + pure functions unless **at least two** of these hold:
- Two or more use cases must enforce the same invariant (e.g. "an agent version bumps only on a
  config change" — `isConfigChange`).
- There are state transitions with illegal moves (run: `queued → running → done|failed`).
- The rule needs data from several contracts at once and is easy to call wrongly.
- Bugs have already come from the rule being re-implemented (check INSIGHTS.md — e.g. "latest run
  of EACH agent, summed" is a domain rule that got re-implemented twice).

Then: `domain/<concept>.ts` with a factory returning a typed result or throwing a domain error;
the repository maps rows into it, the service calls its methods.

## Allowed imports matrix

| from ↓ / to → | domain | shared | platform/errors | ports | service | repository/mappers | db | adapters | container | fastify | drizzle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| domain | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – |
| service / ports | ✓ | ✓ | ✓ | ✓ | ✓ | type-only | – | – | – | – | – |
| repository / mappers | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | – | – | – | ✓ |
| routes | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | ✓ (wiring) | ✓ | – |
| adapters | – | ✓ | ✓ | – | – | – | – | ✓ | – | – | – |
| container | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – |
