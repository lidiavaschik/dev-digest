# Migrating legacy modules

The baseline in `server/.dependency-cruiser-known-violations.json` is the migration backlog.
Migrate **only when the user asks** for a refactor, or when a task already rewrites that code.
One module per change; each step keeps tests green.

## Suggested order (smallest blast radius first)
1. `workspace/routes.ts` (34 lines) and `polling/routes.ts` — move queries to a repository.
2. `settings/routes.ts` + `settings/feature-models.ts`.
3. `agents` — ports + constructor injection; a good template for the rest.
4. `repos` — also fixes the cross-module import of `repo-intel/constants.ts` (export it from
   `repo-intel/index.ts` or move it to `@devdigest/shared`).
5. `reviews` — `service.ts` imports `db/rows.ts`; `diff-loader.ts` imports an adapter helper.
6. `pulls/routes.ts` (411 lines of Drizzle in handlers) — biggest; split into `PullsService` +
   `PullsRepository` read models. Keep INSIGHTS rules intact (latest run of EACH agent, no
   `kind` filter on findings aggregates).
7. `repo-intel` — pipeline imports adapters directly; inject `CodeExtractor`/`AstGrep` ports via
   the container, as already done for `DepGraph`/`Tokenizer`. Breaks the container↔service cycle.

## Steps for one module
1. Write/extend `*.it.test.ts` covering the current HTTP behaviour (safety net) if missing.
2. Create `ports.ts` with the repository interface the service needs (methods named by use,
   returning contracts).
3. Move queries from `routes.ts`/`service.ts` into `repository.ts` (`implements` the port);
   move row→contract mapping into `mappers.ts`.
4. Change the service constructor to take ports (`{ repo, llm, clock }`), drop `Container`.
5. In `routes.ts`, build the service from `container.*`; handlers become parse → call → return.
6. If the use case writes several tables, introduce `UnitOfWork` (see stack-devdigest.md#drizzle).
7. Add a service unit test with fakes.
8. Run depcruise with `--no-ignore-known`, confirm the module's entries are gone, regenerate the
   baseline and check the diff only removes lines.
9. Run the full unit + integration suites; record non-obvious lessons in `server/INSIGHTS.md`.
