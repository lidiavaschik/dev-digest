# Project structures — choosing one, and living with it

Three structures are worth knowing. They disagree less than their advocates do: all three group
by *what code is about* rather than *what code is*, and all three forbid sideways imports. They
differ in how much ceremony they charge for that.

## Decision tree

```
Fewer than ~15 files in src/?
   → FLAT. No features, no layers. Refactor when it hurts, not before.

Using a file-system router (Next.js App Router, Remix, TanStack Router)?
   → ROUTE-COLOCATED.  ← this project's default

A SPA (Vite / CRA), one team, features that span several routes?
   → BULLETPROOF-REACT (src/features/)

Several teams, 100+ components, cross-cutting features, a linter to enforce boundaries?
   → FEATURE-SLICED DESIGN
```

Two things to notice. First, the tree is ordered by cost: each step down buys stricter
boundaries and charges more ceremony. Second, nothing here says "pick the strictest one you can
manage". A structure whose rules the team does not actually follow is worse than a simpler one
they do, because the rules stop describing the code and start lying about it.

---

## 1. Flat

```
src/
  App.tsx
  ProductList.tsx
  ProductRow.tsx
  api.ts
```

For a prototype, a lesson exercise, or anything under roughly fifteen files. The reason to name
it at all is that reaching for `features/` on day one is the most common structural mistake:
the folders get created before anyone knows what the features are, and the first real feature
crosses three of them.

**Signal to leave:** you scroll to find a file, or two files want the same name.

---

## 2. Route-colocated — the default here

The router already defines the boundaries, so the folder structure follows it instead of
inventing a second, competing one.

```
src/
  app/
    layout.tsx
    repos/[repoId]/pulls/
      page.tsx               thin: read params, call a hook, render a feature component
      styles.ts  constants.ts  helpers.ts        segment files, beside page.tsx
      _components/
        FilterBar/           Name.tsx index.ts styles.ts constants.ts helpers.ts Name.test.tsx
        FindingsCell/
      [number]/
        page.tsx
        _components/RunHistory/ …
  components/                cross-route components (kebab-case folders)
    diff-viewer/  app-shell/  page-shell/
  lib/
    api.ts                   the only module that calls the network
    hooks/<domain>.ts        every query and mutation
    format.ts  github-urls.ts
  vendor/
    ui/                      the design-system kit
    shared/                  contracts, mirrored from the server
  messages/en/<ns>.json
```

**Import direction:** `vendor/ui → lib → components → app/<route>/_components → app/<route>`.

**Why it fits App Router.** Only `page` / `layout` / `route` and their siblings become URLs, so
any other file in a segment is colocated for free. The `_` prefix makes that explicit and
future-proofs against new framework file conventions. There is no reason to keep a component in
a distant folder when the route that uses it is right here.

**Strengths.** Locality of behaviour — everything a route does is under the route. Deletion
safety — removing a feature is removing a folder. Zero configuration, no linter needed to
explain it, and a new contributor navigates by URL.

**Weakness, and its fix.** A component needed by a second route has nowhere natural to go.
Resolve it mechanically with the promotion test — move it to `src/components/`, one level, on
the day the second consumer appears. Never route-to-route imports.

---

## 3. bulletproof-react — feature folders

```
src/
  app/          routes, providers, router config
  components/   shared components
  config/       env and global config
  features/
    awesome-feature/
      api/  components/  hooks/  stores/  types/  utils/
      index.ts            the feature's public API
  hooks/  lib/  stores/  testing/  types/  utils/
```

**The rule that carries it:** code flows one way, `shared → features → app`. Features do not
import each other; anything two features need moves down to the shared layer. Enforced with
ESLint's `import/no-restricted-paths`.

**When it wins over route-colocated.** A feature that owns several routes (a checkout flow, an
admin section) has a home that the router cannot express. Also when the app is a SPA and the
router is a config file rather than a folder tree, so there is no route structure to colocate
into.

**Migrating to it from route-colocated:** move the route's `_components/` into
`features/<name>/components/`, its hooks into `features/<name>/hooks/`, add the feature's
`index.ts`, and leave `page.tsx` importing only that barrel. Do it one feature at a time; a
big-bang rename loses all the git history at once.

---

## 4. Feature-Sliced Design

The most formal of the three: layers × slices × segments.

```
src/
  app/        runtime setup, providers, global styles
  pages/      whole pages
  widgets/    self-contained blocks delivering a complete use case
  features/   reusable product capabilities
  entities/   business domain objects (user, pull-request, review)
  shared/     project-agnostic code
```

- **Layers** are fixed and ordered. A module may import only from layers **strictly below** it.
- **Slices** divide a layer by domain (`post`, `comments`). Slices on the same layer may not
  import each other — that is what forces shared code downward instead of sideways.
- **Segments** divide a slice by technical purpose: `ui`, `api`, `model` (schemas, stores,
  business logic), `lib`, `config`.
- Every slice exposes a public API through `index.ts`; nothing reaches into its internals.

**The idea worth stealing even if you never adopt FSD:** name a folder for its *purpose*, not
its *essence*. `model` says "this is where the rules are"; `types`, `hooks` and `components` say
only what language feature is inside, which is why those folder names grow junk.

**When it wins.** Several teams, a long-lived product, genuinely cross-cutting features, and a
linter in CI. Without enforcement the layer rules are decoration — and the ceremony is real, so
an unenforced FSD is the worst of the three.

**Why not here.** The `pages` layer duplicates what App Router already owns, and two competing
route structures is precisely the failure mode this document warns about.

---

## The growth ladder

Structures are stages, not religions. The honest progression, and the signal that ends each
stage:

| Stage | Shape | Move on when |
|---|---|---|
| 1 | One file | It scrolls |
| 2 | One file per component | Two files share a name or a helper |
| 3 | A folder per component (`Name.tsx`, test, styles) | Components clearly cluster by topic |
| 4 | Technical folders (`components/`, `hooks/`, `lib/`) | Changing one feature means opening five folders |
| 5 | Feature or route folders | A feature spans several routes with shared internals |
| 6 | Domain folders grouping features | Two products share a domain |
| 7 | Monorepo packages | Separate deploy or release cadence |

Most applications are happiest at stage 4–5 and never need 6 or 7. **Stage 4 is where the
type-folder trap lives:** `components/`, `hooks/`, `utils/` look tidy and scale badly, because
they optimise for "show me all the hooks" — a question nobody asks — over "show me everything
this feature does", which is every question.

## Comparison

| | Route-colocated | bulletproof-react | FSD |
|---|---|---|---|
| Locality of behaviour | highest | high | medium (split across layers) |
| Cross-route reuse | needs promotion | natural | natural |
| Enforcement cost | none (review only) | one ESLint rule | linter required |
| Onboarding | navigate by URL | learn `features/` | learn layers, slices, segments |
| Deletion safety | delete a folder | delete a folder | delete a slice |
| Fits App Router | yes | acceptable | conflicts with `pages` |

## Rules that hold in all three

Whatever the structure, these do not change — they are the actual content, and the folder names
are the packaging:

1. Group by domain, not by file type.
2. Code flows one direction; no sideways imports between peers.
3. A folder has one public entry point.
4. One consumer means colocate; the second consumer triggers promotion.
5. Consistency beats correctness. A structure applied unevenly stops being information.
