# Examples — bad → good on DevDigest code

## 1. Route querying the DB (`routes-no-db`, CRITICAL)
Today, `server/src/modules/pulls/routes.ts`:
```ts
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db.select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await container.github();
  for (const pr of await gh.listPullRequests(repo)) {
    await container.db.insert(t.pullRequests).values({ /* … */ }).onConflictDoUpdate({ /* … */ });
  }
  // …more queries…
});
```
Target:
```ts
// pulls/ports.ts
export interface PullsRepository {
  findRepo(workspaceId: string, repoId: string): Promise<RepoRef | null>;
  upsertMany(workspaceId: string, repoId: string, pulls: PrMeta[], tx?: Tx): Promise<void>;
  listWithLatestFindings(workspaceId: string, repoId: string): Promise<PrMeta[]>;
}

// pulls/service.ts
export class PullsService {
  constructor(private deps: {
    repo: PullsRepository;
    github: () => Promise<GitHubClient | null>;   // null = offline, local-first
    log: Pick<Console, 'warn'>;
  }) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.deps.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const gh = await this.deps.github();
    if (gh) {
      try { await this.deps.repo.upsertMany(workspaceId, repo.id, await gh.listPullRequests(repo)); }
      catch (err) { this.deps.log.warn({ err }, 'GitHub sync failed; serving persisted PRs'); }
    }
    return this.deps.repo.listWithLatestFindings(workspaceId, repo.id);
  }
}

// pulls/routes.ts
const service = new PullsService({
  repo: new DrizzlePullsRepository(container.db),   // or container.pullsRepo
  github: () => container.github().catch(() => null),
  log: app.log,
});
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  return service.listForRepo(workspaceId, req.params.id);
});
```
Why: the local-first rule ("never fail the read") is now a use case you can unit-test with a fake
GitHub that throws — no Postgres, no Fastify.

## 2. Service as service locator (`service-no-container`, `service-no-concrete-repository`, HIGH)
Today, `agents/service.ts`:
```ts
export class AgentsService {
  private repo: AgentsRepository;
  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }
  async models(provider: Provider) { const llm = await this.container.llm(provider); /* … */ }
}
```
Target:
```ts
// agents/ports.ts
export interface AgentsRepo { list(ws: string): Promise<Agent[]>; /* … */ }
export type LlmResolver = (p: Provider) => Promise<LLMProvider>;

// agents/service.ts
export class AgentsService {
  constructor(private deps: { repo: AgentsRepo; llm: LlmResolver }) {}
}

// agents/routes.ts
const service = new AgentsService({ repo: container.agentsRepo, llm: (p) => container.llm(p) });
```
Why: the service's real dependencies are now visible in its signature, and a test passes two fakes
instead of building a container.

## 3. Row type leaking into the application (`service-no-orm`, HIGH)
Today, `reviews/service.ts` imports `AgentRow` from `db/rows.ts`. Target: the repository returns
the `Agent` contract (mapped in `mappers.ts`); if the service needs a field the contract lacks,
add it to a module-local domain type in `domain/`, not the row.

## 4. Module importing an adapter helper (`adapters-only-via-composition-root`, CRITICAL)
Today, `reviews/diff-loader.ts` imports `parseUnifiedDiff` from `adapters/git/diff-parser.ts`.
It is a pure function, not I/O — so it doesn't belong in `adapters/`. Move it to
`@devdigest/shared` (or `reviews/domain/diff.ts`) and have the git adapter import it from there.
For real I/O (ast-grep in repo-intel), declare a port (`SymbolExtractor`) and inject the
implementation from `container.ts`, as is already done for `DepGraph` and `Tokenizer`.

## 5. Multi-write use case without a transaction (rule 8, HIGH)
```ts
// bad — in service: two writes, a crash between them leaves a version without an agent update
await this.repo.update(ws, id, patch);
await this.repo.insertVersion(ws, id, snapshot);

// good
await this.deps.uow.run(async (tx) => {
  await this.deps.repo.update(ws, id, patch, tx);
  await this.deps.repo.insertVersion(ws, id, snapshot, tx);
});
```
```ts
// platform/unit-of-work.ts (infrastructure)
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private db: Db) {}
  run<T>(fn: (tx: Tx) => Promise<T>) { return this.db.transaction((tx) => fn(tx)); }
}
```

## 6. reviewer-core reaching for I/O (`core-no-io`, CRITICAL)
```ts
// bad — src/review/run.ts
import { readFile } from 'node:fs/promises';
const conventions = await readFile(`${repoPath}/CONVENTIONS.md`, 'utf8');

// good — the server's use case reads it and passes it in
reviewPullRequest({ diff, agent, llm, conventions /* optional slot; empty → omitted */ });
```
