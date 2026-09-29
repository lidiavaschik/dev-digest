---
name: frontend-architecture
description: "Decides where frontend code belongs — folder layout, component boundaries, and the layering of business logic in React projects. Use whenever creating a component, hook, page or feature; on questions like \"where does this file go\", \"utils vs helpers vs services\", \"how should I split this component\", \"where do constants live\"; when business logic leaks into JSX or a component outgrows its file; and when reviewing, refactoring or scaffolding project structure. Covers colocation vs promotion, the constant/config/env boundary, business-logic layering, naming, barrels and import direction. Does NOT cover React runtime rules (see react-best-practices), Next.js mechanics like RSC errors or async params (see next-best-practices), or how to write assertions (see react-testing-library)."
---

# Frontend Architecture

This skill answers **"where does this code belong"**, not "how do I write this code".
Placement, boundaries and layering — the decisions that are cheap now and expensive later.

Companion files, read on demand:
[placement.md](placement.md) · [structures.md](structures.md) · [nextjs-architecture.md](nextjs-architecture.md) ·
[stack-devdigest.md](stack-devdigest.md) · [checklists.md](checklists.md) · [boundaries.md](boundaries.md) ·
[examples.md](examples.md) · [teaching.md](teaching.md)

## Out of scope — bounce here first

| Question | Not this skill — read |
|---|---|
| Is this effect needed? Should this be `useMemo`? Where does state live? | `react-best-practices` |
| Is this component pure / prop-drilling / re-rendering too much? | `react-best-practices` (this skill only says *where the split lands*) |
| `'use client'` errors, async `params`, `loading.tsx`, metadata, images, bundling | `next-best-practices` |
| What to assert, how to mock, which RTL query | `react-testing-library` (this skill only says *where the test file sits*) |
| Schema shape, `safeParse`, type inference | `zod` |
| Generics, type-level design | `typescript-expert` |
| Recording what a structural decision taught you | `engineering-insights` |

Two deliberate overrides of the vendored `react-best-practices`, which is stack-generic:

- Its 6-line "Code Organization" section is superseded by this skill for anything under `client/`.
- Its "Tailwind CSS — no inline `style={}` objects" rule does **not** apply here. This project
  styles with typed `CSSProperties` in `styles.ts` over CSS variables; see [stack-devdigest.md](stack-devdigest.md).

## Severity Levels

Same vocabulary as `react-best-practices` and `security`, so findings merge into one list.

- **CRITICAL** — breaks a boundary the project depends on; block the change.
- **HIGH** — will cause duplication, drift or an untestable knot; fix in this change or log a follow-up.
- **MEDIUM** — consistency and readability; note it only if the file is already being touched.

## Modes

| You are… | Start at | Then |
|---|---|---|
| **Writing** new code | §Where does this file go | [examples.md](examples.md), and the scaffold checklists in [checklists.md](checklists.md) |
| **Reviewing / refactoring** | [checklists.md](checklists.md) | Apply the touch rule below |
| **Explaining** (course L01–L08) | [teaching.md](teaching.md) | [README.md](README.md) for sources |

**The touch rule.** In review mode, raise findings only for files the current change touches.
Pre-existing structure debt goes into a `Structure backlog:` list, not into findings. A review
that flags fifty files nobody asked about gets ignored wholesale, and the one real finding
is lost with it.

---

## Where does this file go?

Answer three questions in order. Stop as soon as the placement is determined.

```
Q1  SCOPE — how many places use it TODAY? (not "might one day")
      1 component ......................... colocate INSIDE that component folder
      2+ components, same route ........... the route segment folder
      2+ routes ........................... the cross-route layer (components/ or lib/)
      client AND server ................... the shared contract module

Q2  KIND — component · constant · helper · business logic · type · schema ·
           API call · hook · style · test · i18n string · design primitive

Q3  REACT? — does it render JSX or call a hook?
      yes .... a component or a hook
      no ..... a plain module: pure, unit-testable, importable from anywhere
```

### The promotion test (HIGH)

**One consumer: keep it local, however reusable it looks. The *second* consumer triggers
promotion, and promotion moves the file up exactly one layer — never straight from a
component folder to `src/lib/`.** A third consumer is not a new event.

This is the whole discipline in one line. Promoting in anticipation of a second consumer is
premature abstraction; the abstraction gets shaped by one use case and then fights the second.

### The demotion test

A file in a shared layer with only one consumer belongs one layer down. Unused shared code is
a structure bug, not an asset — it makes the shared layer look expensive to change.

### Placement table

| Kind | 1 component | 1 route, several components | Several routes | Shared with server |
|---|---|---|---|---|
| **Component** | inline in `Name.tsx`, not exported | `<route>/_components/<Child>/` | `src/components/<kebab>/` | — |
| **Sub-component** | `<Name>/_components/<Child>/` | ↑ promote to route `_components` | ↑ promote to `src/components` | — |
| **Constant** | `const` above the component | `<Name>/constants.ts` | `<route>/constants.ts` | `src/lib/<domain>.ts` |
| **Helper (pure)** | function above the component | `<Name>/helpers.ts` | `<route>/helpers.ts` | `src/lib/<topic>.ts`, domain-named |
| **Domain logic (no React)** | `helpers.ts`, unit-tested | same | `src/lib/<domain>.ts` | mirror into the shared contract |
| **Use-case logic (stateful)** | `<Name>/hooks/useX.ts` | route-level `hooks/` | `src/lib/hooks/<domain>.ts` | — |
| **Type — UI view model** | beside the props interface | same | `src/lib/types.ts` | — |
| **Type — contract** | never local | never | `src/lib/types.ts` re-export only | `src/vendor/shared/contracts` |
| **Zod schema** | never local | never | never | `src/vendor/shared` only |
| **API call** | never | never | **`src/lib/api.ts` only** | — |
| **Data hook** | never | never | `src/lib/hooks/<domain>.ts` + barrel | — |
| **Style** | `<Name>/styles.ts` | `<route>/styles.ts` | component's own `styles.ts` | tokens → `src/vendor/ui` |
| **Test** | `<Name>/Name.test.tsx`, always beside its subject | same | same | — |
| **i18n string** | `messages/en/<feature>.json` — always | ↑ | `common.json` for shell words only | — |
| **Design primitive** | never local — extend `src/vendor/ui` | ↑ | ↑ | — |

Full reasoning per row, including the awkward cases: [placement.md](placement.md).

### Tie-breakers — apply in order, stop at the first that decides

1. Does a repo rule already own it (`vendor/**`, migrations, shared contracts)? Follow that rule.
2. Is it reachable by exactly one consumer? Colocate, regardless of how reusable it looks.
3. Would placing it here create an upward import (`lib/` importing `components/`)? Move it down.
4. Does the feature name describe it better than the file type? The feature folder wins.
5. Still ambiguous? Colocate at the lowest common ancestor and record the call (`engineering-insights`).

---

## The component folder (CRITICAL)

The unit of frontend code is a folder, not a file.

```
<Name>/
  Name.tsx          the component; the only file that renders
  index.ts          the public entry point — the ONLY thing outsiders import
  styles.ts         export const s = { … } — each entry `satisfies CSSProperties`
  constants.ts      values with a name instead of a literal
  helpers.ts        pure functions, no React
  Name.test.tsx     beside its subject, always
  _components/      children that only this component uses
```

- Folder name == main file name == exported component name. Breaking this makes the file
  unfindable by the name people actually say out loud.
- `index.ts` is the only public entry point. Importing `…/FileCard/FileCard` reaches past it
  and welds the caller to an internal layout that is then unsafe to change.
- `styles.ts`, `constants.ts`, `helpers.ts` are **optional** — create them when there is
  something to put in them. An empty `constants.ts` is noise, not consistency.
- A test is required for a component with branching, derivation or user interaction.
  A pure presentational leaf is exempt.

### Component folder vs module folder

When a folder grows children that share state or helpers, it becomes a **module folder**:
segment files at its root, component folders beneath.

```
diff-viewer/                 module folder
  index.ts  constants.ts  helpers.ts  comments.ts  styles.ts
  DiffViewer/  FileCard/  CodeLine/  CommentCard/
```

This is correct and intentional, not a malformed component folder: the root files are exactly
the ones promoted by the promotion test from two or more children. Do not "fix" it.

### File-internal order (MEDIUM)

imports → types → constants → helpers → component → export. Readers scan downward from
cheapest to most contextual; a helper wedged between two JSX blocks breaks that.

## Splitting components (CRITICAL)

Split on **responsibility**, not on line count. The trigger is *two reasons to change*.
A component that "renders a PR row" is one responsibility; one that "renders a PR row, fetches
its findings, handles the filter and navigates" is four.

Signals that a split is overdue — none is decisive alone, two together are:

- Over ~200 lines, or its JSX no longer fits on a screen.
- More than 5–7 props (`react-best-practices` owns this rule; this skill says the extracted
  part becomes a `_components/` child).
- A `render*()` function that returns JSX — that is a component in disguise, and it loses its
  identity on every render.
- Nested ternaries in JSX.
- A section you want to test on its own.
- A distinct data shape: if a block only reads `run`, it wants to be `<RunSummary run={run} />`.

Splitting **down** (into `_components/`) is always safe. Splitting **out** (to `src/components/`)
needs a second consumer — that is the promotion test again.

## Business logic layering (CRITICAL)

Four layers, each with a different home and a different way of being tested.

| Layer | What it is | Where it lives | How it's tested |
|---|---|---|---|
| **Presentation** | JSX, event wiring | `Name.tsx` | RTL |
| **Use case** | orchestration that needs React (state, queries, effects) | a hook | RTL / hook test |
| **Domain** | rules that would be true without a UI | `helpers.ts` / `src/lib/<domain>.ts` | plain unit test |
| **Data** | transport, error taxonomy, auth | one API module | mocked at the boundary |

Rules that follow from this:

- **JSX contains no computation.** A `.filter().sort().reduce()` chain in the return statement
  is domain logic sitting in the presentation layer. Name it and move it to `helpers.ts`.
- **Caused by an event → event handler. Caused by being displayed → the data layer.**
  This is the single distinction that removes most misused effects.
- **Domain logic never imports React.** That is the test: if the function needs `useState` to
  express a business rule, the rule and the state have been conflated.
- **A hook is a use case, not a lifecycle wrapper.** `useMount`, `useEffectOnce` and
  `useUpdateEffect` hide reactivity and defeat the dependency linter. Name the purpose:
  `usePullFilters`, `useRunEvents`.
- **`use` prefix only if the function calls another hook.** Otherwise it is `getX` / `formatX`
  — and gains the ability to be called conditionally, in a loop, or on the server.
- **One module calls the network.** Retry, auth, error normalization and mockability each
  want a single place. A second `fetch` elsewhere silently opts out of all four.

## Constants, config, env and copy (HIGH)

Four different things that all look like "a value in a file".

| It is… | Goes to | Test |
|---|---|---|
| A magic number or repeated literal | `constants.ts` at the right scope | Same value, same meaning, ≥2 places |
| A value that differs per environment | env var, read in **one** module | Would staging need a different value? |
| A value the user reads | `messages/en/<ns>.json` | Would a translator need to change it? |
| A one-off literal used once, near its use | leave it inline | Would a name add meaning? |

- Name the concept, not the value: `MAX_VISIBLE_FINDINGS = 5`, never `FIVE = 5`.
- User-facing text is **never** a constant. It is copy, and copy belongs to i18n.
- Only one module reads `process.env`. Scattered env reads are how a secret reaches a bundle.
- A constants file is named for its domain (`constants.ts` inside a scope, or `lib/<domain>.ts`),
  never a global `src/constants/` grab-bag — that is a folder whose name means "assorted".

## utils vs helpers vs lib vs services (HIGH)

| Word | Status | Meaning |
|---|---|---|
| `helpers.ts` | **Standard** | Pure functions bound to one folder. Not imported from outside it. |
| `src/lib/<domain>.ts` | **Standard** | Pure, cross-route, **domain-named**: `format.ts`, `github-urls.ts`. |
| `utils` | **Banned** as folder or filename | `utils.ts` is an unnamed domain. Name the domain. Same for `common.ts`, `misc.ts`, `shared.ts`, `types.ts` as a god file. |
| `services` | **Banned** as a folder | The service layer is already `lib/api.ts` (transport) + `lib/hooks/` (access). A third name for the same idea means three places to look. |

The rule behind the bans: **a module name states a domain, not a part of speech.** Anything
named after what the code *is* rather than what it is *about* becomes a junk drawer, because
every new file technically qualifies.

## Import direction (CRITICAL)

```
vendor/ui  →  lib  →  components  →  app/<route>/_components  →  app/<route>
                                     ────────── one way only ──────────
```

- Never upward. `lib/` importing a component means a pure module now needs a DOM to test.
- Never sideways between routes. Route A importing route B's `_components` is the promotion
  test being ignored; promote the component to `src/components/` instead.
- Never cyclic. A cycle shows up as `Cannot access 'X' before initialization` at runtime,
  far from its cause.
- Never past a barrel. `@/components/diff-viewer` — not `@/components/diff-viewer/FileCard/FileCard`.
- **One import style, and it is the alias.** `@/components/app-shell`, never
  `../../../../../components/app-shell`. A relative path encodes the importing file's depth, so
  moving the folder rewrites every line; mixing both styles in one codebase makes a grep for
  consumers miss half of them, which is what makes the next refactor unsafe.

No ESLint in this repo, so this is enforced by review and optionally by a test:
[boundaries.md](boundaries.md).

## Barrels (MEDIUM)

- One `index.ts` per component or module folder, re-exporting its public surface. Good.
- `export *` only in a **layer** barrel (`lib/hooks/index.ts`, `vendor/ui/index.ts`).
- Never a project-wide mega-barrel. A wide aggregator makes the dev server resolve and execute
  every module behind it to find one export, defeats tree-shaking in the production build, and
  is the usual source of circular imports.

## Anti-patterns

| Pattern | Severity | Why |
|---|---|---|
| `fetch` outside the one API module | CRITICAL | Opts out of auth, retry, error taxonomy and test mocking at once |
| Deep import past a barrel | CRITICAL | Welds the caller to an internal layout |
| Upward or cyclic import | CRITICAL | Makes pure modules impure; produces init-order bugs |
| Contract type re-declared locally | HIGH | Two sources of truth; drifts silently at the next API change |
| `src/utils/`, `src/constants/`, `src/api/`, `services/` | HIGH | Folders named after a part of speech become junk drawers |
| Promoted to a shared layer with one consumer | HIGH | Premature abstraction, shaped by a single use case |
| Business logic in JSX | HIGH | Untestable without rendering; re-derived on every render |
| User-facing string literal in JSX | HIGH | Unreachable by translation |
| Hook defined inline in a page | MEDIUM | Not reusable, not separately testable |
| Empty `constants.ts` / `styles.ts` for consistency | MEDIUM | Consistency of shape, not of noise |

## Gotchas

- **Course placeholders are not findings.** Lessons L01–L08 deliberately leave tables, prompt
  slots and contracts unused. Never flag a folder for being thin.
- **Vendored directories are read-only.** `src/vendor/shared` is a copy of the server's
  contracts; `src/vendor/ui` is the shared kit. Extend, never fork, never hand-edit.
- **Next.js only routes `page` / `layout` / `route` and friends.** Everything else in a segment
  is safe to colocate — colocation costs nothing, so there is no excuse for a distant folder.
- **Renaming a folder moves its test.** A test left behind still passes and now guards nothing.
- **Structure has no linter here.** `pnpm typecheck` and `pnpm test` are the only gates, so a
  boundary violation will not stop a commit. Review is the enforcement.
