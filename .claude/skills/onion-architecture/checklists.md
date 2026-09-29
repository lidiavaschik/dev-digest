# Checklists

## New backend module / endpoint
- [ ] Contract(s) in `@devdigest/shared` (mirrored to `client/src/vendor/shared` if changed)
- [ ] `ports.ts` declares what the service needs; external systems reuse `vendor/shared/adapters.ts` ports
- [ ] `service.ts`: one method per use case, `workspaceId` parameter, constructor takes ports only
- [ ] `repository.ts` implements the port, scopes by `workspaceId`, returns contracts via `mappers.ts`
- [ ] Multi-write use case → `UnitOfWork`; repos accept `tx`
- [ ] Repository getter (+ override) in `platform/container.ts`
- [ ] `routes.ts`: Zod schemas via type provider, service built from `container.*`, handlers ≤ 5 lines
- [ ] Registered in `src/modules/index.ts` (1 import + 1 entry)
- [ ] New external system → port + adapter + mock + container getter/override
- [ ] Tests: domain unit / service with fakes / repository `.it.test.ts` / route `inject`
- [ ] `pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known` is green
- [ ] Baseline file unchanged or smaller

## Reviewing a backend change
- [ ] **CRITICAL** New `drizzle-orm` / `db/*` import in `routes.ts` or `service.ts`?
- [ ] **CRITICAL** `new <Adapter>` / `new <X>Repository` or `src/adapters/*` import outside `platform/container.ts`?
- [ ] **CRITICAL** Framework/ORM/SDK/`fs` import in `domain/`, `vendor/shared`, or reviewer-core outside `src/llm/`?
- [ ] **HIGH** Service takes `Container` or constructs its repository?
- [ ] **HIGH** Drizzle row / `$inferSelect` type in a service signature or a contract?
- [ ] **HIGH** Several writes without a transaction boundary in the use case?
- [ ] **HIGH** `Schema.parse` inside a handler, or re-validation of already-parsed data in a service?
- [ ] **HIGH** HTTP status / `reply` handling in a service?
- [ ] **MEDIUM** Import of another module's internals instead of its `index.ts`/container?
- [ ] **MEDIUM** Business rule duplicated in two services instead of a `domain/` function?
- [ ] **MEDIUM** Test in the wrong layer (e.g. service tested through Postgres only)?
- [ ] Baseline JSON grew? → reject.

Report findings as `SEVERITY rule — file:line — fix`, e.g.
`CRITICAL routes-no-db — src/modules/foo/routes.ts:28 — move query to FooRepository.listByRepo`.
