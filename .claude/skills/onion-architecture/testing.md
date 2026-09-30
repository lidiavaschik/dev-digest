# Testing per layer

Where a test goes and what it may stub follows from the layer. The file naming rule from
`server/AGENTS.md` still applies: anything importing `test/helpers/pg.ts` is `*.it.test.ts`.

| Layer | Test type | Doubles | File | Needs Docker |
|---|---|---|---|---|
| domain (`domain/`, pure helpers, reviewer-core logic) | plain unit | none — pass values in | `test/<module>-<concept>.test.ts` | no |
| application (`service.ts`) | unit with fakes | in-memory fakes of ports (`FakeAgentsRepository`, `MockLLMProvider`) | `test/<module>-service.test.ts` | no |
| infrastructure (`repository.ts`, mappers, Drizzle UoW) | integration | real Postgres via testcontainers (`pgvector/pgvector:pg16`) | `test/<module>-repo.it.test.ts` | yes |
| adapters (`src/adapters/*`) | unit on mapping + contract test | recorded SDK responses; no network | `test/<adapter>.test.ts` | no |
| presentation (`routes.ts`) | HTTP via `app.inject()` | `ContainerOverrides` / fake service | `test/<module>-routes.test.ts` or `.it.test.ts` for full-stack | depends |

## Principles
- **Fakes over `vi.mock`.** A fake implements the port (`implements AgentsRepository`) with a
  `Map`; it survives refactors because it follows the interface, not the file path. `vi.mock` of a
  module path couples the test to layout — the thing this skill keeps changing.
- **State over interaction.** Assert what the use case returned/stored, not which repo methods
  were called in what order (Fowler, *Mocks Aren't Stubs*).
- **Contract tests keep fakes honest.** When a port has a fake and a real implementation, write
  one shared `describe` factory (`runAgentsRepositoryContract(makeRepo)`) and run it against both:
  the fake in a unit file, the Drizzle impl in an `.it.test.ts`.
- **Domain tests need no setup.** If a domain test needs a container, a DB or a mock, the code
  is in the wrong layer.
- **Transactions**: test rollback behaviour at the infrastructure level (it.test), and at the
  application level with a fake `UnitOfWork` that records commit/rollback.
- **reviewer-core**: stub `LLMProvider`; no keys, no network (existing rule).

## Where fakes live
- External-system ports → `src/adapters/mocks.ts` (existing pattern, used by dev too).
- Module-local ports (`AgentsRepository`, `UnitOfWork`) → `test/helpers/fakes/<module>.ts`.
