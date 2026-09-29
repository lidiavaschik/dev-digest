# dev-digest — the binding layout

The universal rules in [SKILL.md](SKILL.md) applied to this codebase. Where the two disagree,
this file wins inside `client/`.

Stack: Next.js 15 App Router · React 19 · TanStack Query 5 · zod contracts · next-intl ·
vitest + jsdom + RTL · TypeScript strict. **No ESLint** — `pnpm typecheck` and `pnpm test` are
the only automated gates, so structure is enforced by review ([boundaries.md](boundaries.md)
covers the optional machine check).

## The tree

```
client/src/
  app/                          routing only
    <route>/page.tsx            thin
    <route>/styles.ts|constants.ts|helpers.ts       segment files, beside page.tsx
    <route>/_components/<Name>/ route-scoped component folders (PascalCase)
  components/<kebab-name>/      cross-route components and module folders
  lib/
    api.ts                      apiFetch + ApiError — the ONLY module that calls fetch
    hooks/<domain>.ts           every TanStack Query hook (agents, core, reviews, trace, repo-intel)
    hooks/index.ts              layer barrel
    types.ts                    re-exports @devdigest/shared
    format.ts github-urls.ts model-label.ts feature-models.ts    domain-named pure modules
    providers.tsx repo-context.tsx theme.tsx toast.tsx           app-wide React context
  i18n/request.ts
  test/setup.ts
  vendor/ui/                    @devdigest/ui — the design kit (extend, never fork)
  vendor/shared/                COPY of server/src/vendor/shared (sync, never diverge)
client/messages/en/<ns>.json    next-intl, one namespace per feature
```

## Layer contract

| Layer | May contain | May import from | Editable |
|---|---|---|---|
| `app/<route>` | `page.tsx`, `layout.tsx`, segment files | everything below | yes |
| `app/**/_components/` | route-scoped components | `components`, `lib`, `vendor` | yes |
| `components/` | cross-route components | `lib`, `vendor` | yes |
| `lib/` | pure modules, hooks, context, the API client | `vendor/shared` | yes |
| `vendor/ui` | design primitives, kit, charts, shell | nothing project-specific | extend only |
| `vendor/shared` | zod contracts | — | **sync from server only** |
| `messages/en/` | copy | — | yes |

`lib/` must never import a component. `components/` must never import from `app/`.
No route imports another route's `_components/`.

## The component folder

```
<Name>/
  Name.tsx
  index.ts          export { Name, Name as default } from "./Name";
  styles.ts         optional
  constants.ts      optional
  helpers.ts        optional
  Name.test.tsx
  _components/      optional children
```

### `styles.ts` — the house form (target state, not current state)

**Read this before applying the rule.** `client/CLAUDE.md` documents `styles.ts` as the
convention, but the tree does not match it yet: 24 `styles.ts` files against 294 inline
`style={{ … }}` literals across `client/src`. So this section describes where the codebase is
going, not where it is.

What that means in practice: write new components this way, and convert a file when you are
already changing it. **Do not open a sweep.** A mass conversion touches most of the client at
once, and there are only 13 test files to catch a regression — the risk is far larger than the
tidiness is worth. When the ratio has moved, drop this notice.


```ts
import type { CSSProperties } from "react";

/** Co-located styles for PageShell. */
export const s = {
  container: { padding: "24px 32px 44px", maxWidth: 1200 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
```

Each entry carries `satisfies CSSProperties`; the object is `as const`. Colors, spacing and
radii come from CSS variables (`var(--bg-elevated)`, `var(--border-strong)`), never literal hex.
`className` only for the global helpers in `globals.css` (`mono`, `tnum`).

**This overrides the `react-best-practices` Tailwind section.** Tailwind v4 is installed but is
not the component styling convention here. Do not "fix" `styles.ts` into utility classes, and do
not introduce Tailwind classes into a component that uses `s`.

### `index.ts` — the house form

```ts
export { AgentCard, AgentCard as default } from "./AgentCard";
```

Named plus default, so callers may use either and the component keeps its display name.
`export *` is allowed **only** in layer barrels: `lib/hooks/index.ts`, `vendor/ui/index.ts`,
`vendor/shared/index.ts`.

## Data layer

```
component  →  lib/hooks/<domain>.ts  →  lib/api.ts  →  Fastify :3001
```

- Components never call `fetch`. Ever. `lib/api.ts` owns the base URL, headers and `ApiError`.
- Every query and mutation is declared in `lib/hooks/<domain>.ts` and exported from the barrel.
- The query key lives beside the hook that owns it; the invalidation lives beside the mutation
  that requires it. Follow the shape of the existing hooks rather than inventing a second one.
- Live run logs arrive by SSE through `useRunEvents` in `lib/hooks/reviews.ts`. Never poll for
  them — the polling version looks like it works and quietly doubles server load.

This is the **HTTP APIs** data model in Next.js terms, not the Data Access Layer model: the
backend is a separate Fastify service. The DAL guidance in [nextjs-architecture.md](nextjs-architecture.md)
§3 applies to new projects with a database in the same codebase, not to this client.

## Types and contracts

`@devdigest/shared` (`src/vendor/shared`) is the source of truth, and it is a **copy** of
`server/src/vendor/shared`. A contract change must be mirrored into both in the same change —
that rule comes from the root `CLAUDE.md` and outranks anything here.

- `lib/types.ts` re-exports the contracts. It is also the only legal home for a UI-only view
  model shared across routes.
- Never re-declare a contract type locally, and never create `src/types/`.
- Zod schemas live in `vendor/shared` only.

## i18n

One namespace per feature under `messages/en/`. `useTranslations("<ns>")` in the component.
No user-facing string literal reaches JSX — including single words on buttons.
`common.json` is for shell vocabulary, not for strings you could not place.

## Tests

React Testing Library with `fetch` mocked; no real API. Config: `client/vitest.config.ts`,
setup `src/test/setup.ts`. The test sits beside its component and moves when the folder moves.

Required for branching, derived values or interaction. Exempt: presentational leaves.

---

## Rulings on what already diverges

Measured on the current tree: 58 components outside `vendor/`, 13 test files, 24 `styles.ts`
against 294 inline `style={{ … }}` literals, 18 `constants.ts`, 9 `helpers.ts`, 46 barrels
outside `vendor/` — 18 in the named+default form, 6 using `export *`. Also: 54 of the 58
components carry `"use client"`, including 5 of the 7 `page.tsx`.

| Observed | Ruling | Severity | Action |
|---|---|---|---|
| `components/diff-viewer/` keeps `constants.ts`, `helpers.ts`, `comments.ts`, `styles.ts` at its root while children are folders | **Correct — this is a module folder**, not a malformed component folder. Those root files are exactly what the promotion test lifts out of two or more children. | none | Document the shape. Do not "fix". |
| `app/repos/[repoId]/pulls/` has `styles.ts` / `constants.ts` / `helpers.ts` on the route segment | **Correct.** `page.tsx` is a component and its segment files belong beside it. Next.js routes only `page`/`layout`/`route`, so colocation is free. | MEDIUM only if `_components/**` children import them — then push them down to the child that uses them | Check consumers; otherwise leave. |
| Mixed casing: `components/page-shell/` vs `_components/AgentCard/` | **Both correct, by layer.** kebab-case under `src/components/`, PascalCase under `app/**/_components/`. PascalCase children inside a kebab module folder is legal. | none | Codify; flag only cross-layer violations. |
| `export *` in `components/app-shell`, `components/page-shell`, `components/showcase` | Drift. These are module folders, not layer barrels — they should name their public surface. | MEDIUM | Convert on next touch. `lib/hooks`, `vendor/ui`, `vendor/shared` keep `export *` legitimately. |
| 13 tests for 58 components | Below the bar, but a sweep is the wrong remedy. A test is required for branching / derivation / interaction; presentational leaves are exempt. | HIGH for new components · MEDIUM for existing | Backlog, ranked by branching. Never a mass generation of shallow tests. |
| Components with no `styles.ts` (`AddRepoView`, `FilterBar`, `RepoNotFound`, `DiffTab`) | Fine **if** they genuinely have no styling. Not fine if they carry inline style objects instead. | LOW / MEDIUM if inline styles present | Check before flagging. Never create an empty file. |
| `app/repos/[repoId]/pulls/[number]/page.tsx` at 190 lines | A page is a shell. This one holds seven hooks, PR-id resolution, tab routing and full JSX. | HIGH | Extract `resolvePrId` to `helpers.ts`, composition to `_components/`. Worked example 13 in [examples.md](examples.md). |
| The same page re-types query keys as literals (`["pr-runs", prId]`, `["pulls", repoId]`) and invalidates them itself | The key is defined in `lib/hooks/`; a copy in a page breaks silently when the source key is renamed — stale UI, no error. | HIGH | Move invalidation into the mutation that requires it; export a key factory. Example 5. |
| The same page mixes `../../../../../components/app-shell` with `@/components/repo-not-found` | One import style per codebase, and it is the alias. Deep relative paths encode the file's depth, so moving the folder rewrites every line; mixing both makes a consumer grep miss half the call sites. | HIGH | Convert relative imports to `@/`. Example 3. |
| `components/showcase/Showcase.tsx` at 259 lines, `RunHistory.tsx` at 230 | Over the size line. The **structural** remedy is extraction into `_components/`, not memoization. | MEDIUM | Split by responsibility; `react-best-practices` owns the size rule itself. |
| 294 inline `style={{ … }}` against 24 `styles.ts` | The documented convention holds in a minority of files. A fresh object per render also defeats `React.memo` on children. | MEDIUM | Convert on touch only — see the notice above the `styles.ts` section. Never sweep. |
| 54 of 58 components are `"use client"`, including 5 of 7 `page.tsx` | **Not a finding — an open architectural question.** With a separate Fastify API and TanStack Query as the data layer, a client-heavy tree is defensible; it just means RSC is unused. | none | Do not "fix" unilaterally. The cheap, reversible step is dropping the directive from `page.tsx` so pages stay server shells. Raise it, let the user decide. |

## Adding a feature — the recipe

1. Route segment under `src/app/`; `page.tsx` stays thin.
2. Feature component in `<route>/_components/<Name>/` with `index.ts`.
3. Derivation → `helpers.ts`. Magic values → `constants.ts`. Styling → `styles.ts`.
4. Server data → a hook in `lib/hooks/<domain>.ts`, exported from the barrel; never `fetch`.
5. Mutation → invalidate the matching query key beside it.
6. Contract change → edit `server/src/vendor/shared` **and** mirror into `client/src/vendor/shared`.
7. Copy → `messages/en/<ns>.json` + `useTranslations`.
8. Test → `Name.test.tsx` beside the component, `fetch` mocked.
9. `pnpm typecheck && pnpm test` in `client/`.
10. Run the `engineering-insights` wrap-up if anything non-obvious cost you time.

## Do not touch

- `src/vendor/shared/**` — sync from the server, never diverge by hand.
- `src/vendor/ui/**` — extend the kit; never fork a component per page.
- Course placeholders from lessons L01–L08: unused tables, prompt slots and contracts are
  deliberate. A thin folder is not a finding.
