# Per-tool rules — how each backend tool fits the onion

## Contents
[Fastify](#fastify) · [Zod](#zod) · [Drizzle](#drizzle) · [Adapters](#adapters-llm-github-git-code-index) ·
[Jobs & SSE](#jobs--sse) · [Errors](#errors) · [reviewer-core](#reviewer-core)

## Fastify
Fastify is the **presentation adapter**. Each module is an encapsulated plugin (`routes.ts`),
registered statically in `src/modules/index.ts`.

- Wire the service once per plugin, from container parts:
  ```ts
  export default async function agentsRoutes(appBase: FastifyInstance) {
    const app = appBase.withTypeProvider<ZodTypeProvider>();
    const { container } = app;
    // container.agentsRepo — built in platform/container.ts, never `new AgentsRepository(container.db)` here
    const service = new AgentsService({ repo: container.agentsRepo, llm: (p) => container.llm(p) });
    app.post('/agents', { schema: { body: CreateAgentBody } }, async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.create(workspaceId, req.body);
    });
  }
  ```
- Handlers stay 1–5 lines. No `for` loops over DB rows, no `try/catch` around business decisions,
  no `container.db` — those are use-case or repository code.
- Hooks (`onRequest`, `preHandler`) are for cross-cutting transport concerns (auth context,
  rate-limit, request logging), never business rules.
- Decorators: only `app.container` (already present). Don't decorate services onto the instance —
  construct them in the plugin so encapsulation keeps them module-local.
- Test routes with `app.inject()` and a container built with `ContainerOverrides`.

## Zod
"Parse, don't validate": parse once at the boundary into a precise type, then trust it.

- **HTTP**: schemas in `routes.ts` (or `schemas.ts` beside it), used via the type provider —
  never `Schema.parse(req.body)` inside a handler.
- **External payloads**: LLM structured output (reviewer-core `llm/structured.ts`), GitHub,
  job payloads, env (`platform/config.ts`) — parse in the adapter/handler, return the typed value.
- **Contracts** in `@devdigest/shared` are both domain types and wire types. Changing one → mirror
  in `client/src/vendor/shared` (repo rule).
- Services/domain do not import `zod` directly to re-validate what was already parsed. If a domain
  invariant needs checking (e.g. strategy vs model), write it as a domain function that returns a
  typed result or throws a domain error — not a Zod schema.

## Drizzle
Drizzle + postgres-js are **infrastructure**. The schema (`src/db/schema/*`) and row types
(`$inferSelect`, `src/db/rows.ts`) never leave repository/mapper files.

- **Repository port** in `ports.ts`, implementation in `repository.ts`:
  ```ts
  // ports.ts
  export interface AgentsRepository {
    list(workspaceId: string): Promise<Agent[]>;
    get(workspaceId: string, id: string): Promise<Agent | null>;
    insert(input: NewAgent, tx?: Tx): Promise<Agent>;
  }
  export type Tx = unknown; // opaque to the application layer
  export interface UnitOfWork { run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>; }
  ```
  ```ts
  // repository.ts
  export class DrizzleAgentsRepository implements AgentsRepository {
    constructor(private db: Db) {}
    private q(tx?: Tx) { return (tx as DbTx | undefined) ?? this.db; }
    async list(workspaceId: string) {
      const rows = await this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
      return rows.map(toAgent); // mappers.ts
    }
  }
  ```
- **Transactions** (evals: without this skill agents hide `db.transaction` inside one repository
  method — then the use case can't compose steps or be tested with fakes): a Drizzle `UnitOfWork` in `platform/` or `db/` wraps
  `db.transaction(async (tx) => fn(tx))`; the use case calls `uow.run(tx => …)` and passes `tx`
  to every repository call. The `tx` type stays opaque (`Tx`) to the service. Nested
  `uow.run` becomes a savepoint in Drizzle — prefer one boundary per use case.
- **Scoping**: every repository method takes `workspaceId` and filters by it (repo rule).
- **Aggregates/read models**: a query that feeds one screen (e.g. PR list with latest findings
  + cost) is a repository method returning a contract — not SQL assembled in `routes.ts`.
- **Migrations**: schema edits under `src/db/schema/*` + `pnpm db:generate`; never touch existing
  migrations. Schema changes do not ripple past `mappers.ts` unless the contract changes.

## Adapters (LLM, GitHub, git, code index)
Ports in `vendor/shared/adapters.ts`, implementations in `src/adapters/<system>/`, mocks in
`src/adapters/mocks.ts`, construction in `platform/container.ts` only.

- Adding an external system = interface → implementation → mock → container getter/override →
  consumer receives the port. Never `new OctokitGitHubClient()` in a module.
- Adapters return port types only — map SDK responses (`OpenAI.ChatCompletion`, Octokit) inside.
- Pure helpers that happen to live under `adapters/` (e.g. `git/diff-parser.ts`,
  `codeindex/extract.ts`) are not I/O. When a module needs one, move it to the module's
  `domain/` / `helpers.ts` or to `@devdigest/shared`, or expose it through the port.
- Secrets: resolved by the container via `SecretsProvider`; services never read env or secrets.
- `repoIntel` is a **facade port** (`modules/repo-intel/types.ts`): consumers depend on the
  `RepoIntel` interface via `container.repoIntel`; only the indexer pipeline touches
  ast-grep/dependency-cruiser/tokenizer — and it gets them injected as `DepGraph`/`Tokenizer`.

## Jobs & SSE
`container.jobs` (JobRunner) and `container.runBus` are infrastructure.

- A job handler is presentation: parse payload (Zod), call a use case, done.
  ```ts
  container.jobs.register(CLONE_JOB_KIND, async (payload) => service.clone(ClonePayload.parse(payload)));
  ```
- Use cases publish progress through a `ProgressReporter` port (`{ log(runId, line); done(runId) }`),
  implemented over `runBus` — so the use case is testable without SSE.
- Enqueueing is a port too (`JobQueue.enqueue(kind, payload)`) when a use case schedules work.

## Errors
- Use `platform/errors.ts` (`AppError`, `NotFoundError`, `ValidationError`, `ExternalServiceError`,
  `ConfigError`). Domain-specific errors extend them in `domain/errors.ts`.
- Adapters translate SDK/network failures into `ExternalServiceError`; the use case decides
  whether to fail or degrade (repo-intel enrichment: catch, log, degrade — never fail a run).
- Only the global error handler turns them into the HTTP envelope. Routes don't `reply.code()`.

## reviewer-core
reviewer-core **is** an application core: diff → prompt → LLM → grounded findings, no I/O.

- The only side effect is the injected `LLMProvider` port. `src/llm/` is its single adapter area
  (openai SDK + Zod→JSON-Schema helper).
- From `../server` it imports only `@devdigest/shared`. Never `db`, `adapters`, `platform`, `modules`.
- New need (files, repo map, callers, memory) → add an optional input or a port parameter to
  `reviewPullRequest`; the server's use case fetches data and passes it in.
- Enforced by `reviewer-core/.dependency-cruiser.cjs` (`npm run arch:check`) in its CI.
