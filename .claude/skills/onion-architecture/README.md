# onion-architecture

A skill that answers **"which layer owns this backend code, and which way may it depend"** for
`server/` (Fastify 5 · Drizzle · Postgres/pgvector · Zod · LLM/GitHub/git adapters · JobRunner)
and `reviewer-core/` (the pure review engine). Hand-authored for this repo — not vendored.

## Why it exists

The vendored backend skills — `fastify-best-practices`, `drizzle-orm-patterns`,
`postgresql-table-design`, `zod` — explain *how to use each tool*. None of them decides *where the
code goes* or *which way dependencies point*. The codebase showed the cost: four `routes.ts` files
query Postgres directly (`pulls/routes.ts` is 411 lines of Drizzle), services pull adapters out of
the whole `Container` and `new` their own repositories, Drizzle row types reach services, and no
use case owns a transaction. Every course lesson (L01–L08) adds a module, so whatever pattern the
first file uses gets copied.

This skill is the architectural layer: Onion Architecture (Palermo) applied to this stack, with
the boundaries checked mechanically by dependency-cruiser in CI.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Module layout | Keep `routes.ts → service.ts → repository.ts`, add `domain/`, `ports.ts`, `mappers.ts`, `index.ts` | Least invasive for the course; existing imports and lessons keep working |
| Domain model | Gradual: `@devdigest/shared` contracts are the default domain types; entities/value objects only where real invariants exist | Avoids a parallel type hierarchy that duplicates the Zod contracts; see `layers.md#when-to-create-a-domain-entity` |
| Enforcement | dependency-cruiser in CI with a known-violations baseline (`--ignore-known`) | Already a dependency; CI fails only on *new* violations while legacy modules migrate |
| reviewer-core | In scope, own depcruise config + CI step | It is the cleanest core in the repo; the rules keep it that way (no I/O, SDK only in `src/llm/`) |
| Severity vocabulary | CRITICAL / HIGH / MEDIUM | Matches `security` and `frontend-architecture`, so findings merge into one list |
| Composition root | `platform/container.ts` builds adapters **and** repositories; routes pass `container.xRepo` into services | Makes a service's dependencies visible in its constructor and lets tests swap fakes via `ContainerOverrides` |
| Transactions | Owned by the use case through a `UnitOfWork` port; repositories accept an opaque `tx` | Keeps Drizzle out of the application layer while letting one use case compose several writes |
| Baseline stability | `options.preserveSymlinks: true` in both configs | pnpm paths otherwise include versions (`.pnpm/drizzle-orm@0.38.4_…`) and break the baseline on bumps and in symlinked copies |
| `server/package.json` | No `arch:check` script; CI and docs call `pnpm exec depcruise` | The file is `skip-worktree` locally |

## Files

| File | Read it when |
|---|---|
| `SKILL.md` | Always — model, layout, the 11 rules, workflow, out-of-scope |
| `layers.md` | Placing a piece of code; deciding whether a domain entity is justified; allowed-imports matrix |
| `stack-devdigest.md` | Working with Fastify, Zod, Drizzle (repositories, `UnitOfWork`), adapters, jobs/SSE, errors, reviewer-core |
| `enforcement.md` | depcruise failed; changing rules; handling the baseline |
| `testing.md` | Deciding which test, which doubles, which file name |
| `migration.md` | Moving a legacy module into the layers; shrinking the baseline |
| `checklists.md` | Scaffolding a module or reviewing a backend change |
| `examples.md` | You want bad → good on real DevDigest files |

Outside the skill folder: `server/.dependency-cruiser.cjs`,
`server/.dependency-cruiser-known-violations.json`, `reviewer-core/.dependency-cruiser.cjs`, the
"Architecture boundaries" step in `.github/workflows/server-unit.yml`, and `npm run arch:check` in
`.github/workflows/reviewer-core.yml`.

---

## Sources

Grouped by what they contributed. Every link was checked (HTTP 200) on 2026-09-29.
✓ marks a source read in full while writing this skill.

### Onion Architecture and its relatives

| Source | Contribution |
|---|---|
| [Jeffrey Palermo — The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | The original: the application is built around an independent object model; infrastructure sits at the outer edge |
| [Palermo — part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) | Layer walkthrough and dependency direction |
| [Palermo — part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) | Worked example with repositories behind interfaces |
| ✓ [Palermo — part 4: After Four Years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) | The four tenets quoted in `SKILL.md`: independent object model; inner layers define interfaces, outer implement; coupling toward the center; core runs without infrastructure |
| [Alistair Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) | Ports belong to the application; adapters (UI, tests, DB) plug in — the `ports.ts` / `vendor/shared/adapters.ts` split |
| [Robert C. Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | The Dependency Rule: source dependencies point only inward |
| [Herberto Graça — Explicit Architecture](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) | DDD + Hexagonal + Onion + CQRS combined; components by feature with layers inside each |
| ✓ [Microsoft — Common web application architectures](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures) | Interfaces in the Application Core, implementations in Infrastructure; only the composition root references infrastructure; test the core in isolation, infrastructure with integration tests |
| [Martin Fowler — DIP in the Wild](https://martinfowler.com/articles/dipInTheWild.html) | Owning the abstraction is what inverts the dependency — why ports live in the inner layer |
| [Martin Fowler — Repository](https://martinfowler.com/eaaCatalog/repository.html) | Collection-like interface between domain and data mapping |
| [Martin Fowler — PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) | Layers live inside feature modules, not the reverse — our `modules/<name>/` layout |
| [Khalil Stemmler — Organizing App Logic](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/) | Where use cases vs domain logic vs infrastructure go in TypeScript |
| [Khalil Stemmler — Repository, DTO, Mapper](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) | Explicit mappers between persistence rows, domain and DTOs — `mappers.ts` |
| [Khalil Stemmler — Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) | Clean architecture in an Express/Node codebase |

### TypeScript / Node reference implementations

| Source | Contribution |
|---|---|
| [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) | Closest to our setup: modules by feature, ports, mappers, value objects, dependency-cruiser enforcement |
| [goldbergyoni/nodebestpractices](https://github.com/goldbergyoni/nodebestpractices) | General Node production practices |
| [nodebestpractices — structure by business components](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/projectstructre/breakintcomponents.md) | Structure by component first, then by layer |
| [practicajs/practica](https://github.com/practicajs/practica) | Fastify-capable starter with entry-points / domain / data-access layers |
| [jbuget/nodejs-clean-architecture-app](https://github.com/jbuget/nodejs-clean-architecture-app) | Use cases receive injected ports; frameworks at the edge |
| [testjavascript/nodejs-integration-tests-best-practices](https://github.com/testjavascript/nodejs-integration-tests-best-practices) | Component/integration testing of Node APIs |

### Fastify

| Source | Contribution |
|---|---|
| [Fastify — Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) | Each module is an encapsulated plugin — the presentation adapter |
| [Fastify — Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) | Plugin registration and options |
| [Fastify — Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) | Why we keep only `app.container` decorated and build services inside the plugin |
| [Fastify — Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) | Zod schemas at the route boundary |
| [Fastify — Testing](https://fastify.dev/docs/latest/Guides/Testing/) | `app.inject()` for HTTP-layer tests without a port |
| [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod) | The type provider used by `server/` |
| ✓ [borjatur — Money Master: a Clean Architecture API example](https://borjatur.com/2023/03/13/money-master-a-clean-architecture-api-example/) | Controllers / services / repositories with Fastify |
| [borjatur/clean-architecture-fastify-mongodb](https://github.com/borjatur/clean-architecture-fastify-mongodb) | Source repo for the article above (linked from it; not fetched separately) |

### Drizzle

| Source | Contribution |
|---|---|
| [Drizzle — Transactions](https://orm.drizzle.team/docs/transactions) | `db.transaction(async (tx) => …)`; `tx` has the `db` API; nested → savepoints — the `DrizzleUnitOfWork` |
| [Drizzle — Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration) | Schema stays in infrastructure (`src/db/schema/*`) |
| [Drizzle — Goodies](https://orm.drizzle.team/docs/goodies) | `$inferSelect` / `$inferInsert` — allowed only in repositories and mappers |
| ✓ [Sentry — Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript) | TransactionManager port + repositories taking an optional `tx`, with Drizzle — the model for rule 8 |

### Zod and boundaries

| Source | Contribution |
|---|---|
| [Alexis King — Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) | Parse once at the edge into precise types; inner code trusts them — rule 9 |
| [Zod documentation](https://zod.dev/) | Schemas for HTTP DTOs, env, LLM/GitHub payloads |

### Enforcing boundaries

| Source | Contribution |
|---|---|
| [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | `forbidden` rules, `path`/`pathNot`, `dependencyTypesNot`, `$1` group matching — the syntax of both configs |
| [dependency-cruiser — rules tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md) | Writing layer rules step by step; `depcruise-baseline` / `--ignore-known` |
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Alternative considered — needs ESLint, which `server/` doesn't use |
| [eslint-plugin-import — no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | Lighter alternative considered — same ESLint dependency |
| [ts-arch](https://github.com/ts-arch/ts-arch) | Alternative considered — architecture rules as tests |
| [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) | Alternative considered — ArchUnit-style rules in Vitest |

### Testing

| Source | Contribution |
|---|---|
| [Testcontainers for Node](https://node.testcontainers.org/) | Real Postgres for infrastructure tests (`*.it.test.ts`) |
| [Testcontainers — PostgreSQL module](https://node.testcontainers.org/modules/postgresql/) | `pgvector/pgvector:pg16` image setup |
| [Martin Fowler — TestDouble](https://martinfowler.com/bliki/TestDouble.html) | Vocabulary: fake vs stub vs mock |
| [Martin Fowler — Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) | State-based testing with fakes over interaction mocks |
| [Google Testing Blog — Know Your Test Doubles](https://testing.googleblog.com/2013/07/testing-on-toilet-know-your-test-doubles.html) | When to use which double |
| [J.B. Rainsberger — Integrated Tests Are a Scam](https://www.jbrains.ca/permalink/integrated-tests-are-a-scam) | Contract tests keep fakes and real adapters in sync |
| [Vitest guide](https://vitest.dev/guide/) | Test runner used by all packages |

---

## Evaluation

Iteration 1 (2026-09-29). 4 realistic tasks, each run with and without the skill. Outputs were
overlaid on a copy of the repo and graded by script: depcruise, `tsc`, the new hermetic tests,
plus convention checks.

| Task | With skill | Without skill |
|---|---|---|
| New `notes` module (CRUD on PR notes) | 13/13 | 10/13 |
| Refactor `workspace/routes.ts` (DB in route) | 9/9 | 8/9 |
| `POST /agents/:id/clone` (multi-table write) | 11/11 | 8/10 |
| `CONVENTIONS.md` into reviewer-core prompt | 8/8 | 8/8 |
| **Pass rate** | **100%** | **86%** |
| Mean time / tokens | 289 s / 104k | 200 s / 81k |

What the numbers mean:
- **The baseline already holds the hard boundaries.** It sees the rules in `server/AGENTS.md`
  and runs depcruise, so routes without DB, reviewer-core without I/O and a clean depcruise run
  passed in both configurations.
- **What only the skill produced:**
  - repositories wired in `container.ts`, where the baseline did `new XRepository(container.db)` in `routes.ts`;
  - a use-case-owned `UnitOfWork`, where the baseline hid `db.transaction` inside a repository;
  - `mappers.ts`, port fakes in `test/helpers/fakes/`, hermetic service tests and a fake/real repository contract test;
  - a shared snapshot rule in `domain/`.

Changes made from the findings:
- Added the `routes-no-repository` depcruise rule, so the composition-root convention no longer depends on the text alone.
- Made the "Before finishing" step require *running* the checks. One with-skill run listed them without running any.
- Added `preserveSymlinks: true` to both configs. 3 of 8 runs saw known violations resurface in scratch copies.

Workspace and grader live outside the repo (session scratchpad): `grade.py`, `evals/evals.json`,
`iteration-1/benchmark.md`.
