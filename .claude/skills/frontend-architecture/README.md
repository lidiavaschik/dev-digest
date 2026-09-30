# frontend-architecture

A skill that answers **"where does this code belong"** — folder layout, component boundaries,
and the layering of business logic in React projects.

## Why it exists

The repo already vendors `react-best-practices` (React runtime rules: hooks, state, rendering,
a11y) and `next-best-practices` (Next.js mechanics: RSC, async params, bundling). Between them
they cover *how to write the code*. Neither covers *where it goes*: `react-best-practices`
devotes six lines to "Code Organization", and `next-best-practices` documents framework file
conventions rather than architecture.

That is the gap. This skill is the architectural layer and delegates code-level questions back
to the other two rather than restating them.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Default structure | Route-colocated | The App Router already defines boundaries; a second structure would compete with it |
| Alternatives documented | bulletproof-react, FSD | With a decision tree — see `structures.md` |
| Severity vocabulary | CRITICAL / HIGH / MEDIUM | Matches `react-best-practices` and `security`, so findings merge into one list |
| Boundary enforcement | Review, plus an optional vitest architecture test | `client/` has no ESLint; adding one solely for structure is not worth it |
| Styling | Typed `CSSProperties` + CSS vars | Overrides the Tailwind section of the vendored `react-best-practices` inside `client/` |

## Files

| File | Read it when |
|---|---|
| `SKILL.md` | Always — the decision table, core rules, severity, modes |
| `placement.md` | The table didn't settle it; one artifact at a time |
| `structures.md` | Choosing or migrating a project structure |
| `nextjs-architecture.md` | App Router specifics: `app/` boundaries, server/client graph, DAL, Server Actions |
| `stack-devdigest.md` | Working in `client/` — the binding layout and rulings on what already diverges |
| `checklists.md` | Reviewing, or scaffolding a component/feature |
| `boundaries.md` | You want the rules machine-checked |
| `examples.md` | You want the ❌/✅ pair |
| `teaching.md` | Explaining a rule rather than applying it |

---

## Sources

Grouped by what they contributed. ✓ marks a source read in full while writing this skill.

### Project structure and folder layout

| Source | Contribution |
|---|---|
| ✓ [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | The canonical feature-based tree (`src/features/<feature>/{api,assets,components,hooks,stores,types,utils}`); the unidirectional rule `shared → features → app`; enforcement via ESLint `import/no-restricted-paths` |
| ✓ [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) | Layers app/pages/widgets/features/entities/shared; "a layer may import only from layers strictly below" |
| ✓ [FSD — Slices and Segments](https://feature-sliced.design/docs/reference/slices-segments) | Segments `ui / api / model / lib / config`; the public-API-per-slice rule; zero coupling between peer slices; **name a segment for its purpose, not its essence** — the argument against `components/`, `hooks/`, `types/` as folder names |
| ✓ [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) | The seven-stage growth ladder; kebab-case files, singular folder names; the **promotion test** (one consumer keep local, two promote) that this skill is built around |
| ✓ [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | Colocation inside `app/`; private folders `_folder`; route groups `(folder)`; the three organization strategies and the instruction not to mix them |
| ✓ [React Handbook — Project Standards](https://reacthandbook.dev/project-standards) | The eight-step component file order; absolute imports via `@/`; "start flat, refactor after ~10 files" |
| ✓ [Alex Kondov — Tao of React](https://alexkondov.com/tao-of-react/) | Group by route/module; a common module for shared UI; absolute paths; wrap third-party components; the ≤5-props signal; helpers outside the component body |

### Component boundaries

| Source | Contribution |
|---|---|
| ✓ [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | The single-responsibility principle as the criterion for a component boundary; component hierarchy mirrors the data model; the algorithm for finding the common owner of state |
| ✓ [react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | Group related state; avoid contradictions (a status enum instead of several booleans); avoid redundant and duplicated state; flatten deep nesting — the basis of "make invalid states unrepresentable" |

### Business logic and its layers

| Source | Contribution |
|---|---|
| ✓ [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | When to extract a hook and when not to; the `use` prefix only when the function calls a hook; hooks share stateful logic, not state; the ban on abstract lifecycle hooks (`useMount`, `useEffectOnce`); name hooks for concrete use cases |
| ✓ [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | Eleven anti-patterns with their replacements; the event-versus-display distinction that this skill uses to place logic |
| ✓ [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | `queryOptions` instead of a wrapper hook per query; query factories; keeping key, fetcher and types colocated |
| [Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | Server cache and UI state are different problems and need different tools |
| [Kent C. Dodds — State Colocation Will Make Your React App Faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Frequently-changing global state as a leading cause of slow React apps; push state down |
| ✓ [Next.js — How to think about data security](https://nextjs.org/docs/app/guides/data-security) | The three data-handling models; the Data Access Layer as a `server-only` module that authorizes and returns DTOs; only the DAL reads `process.env`; Server Actions are public endpoints; the audit checklist |
| [Next.js — Security in Server Components and Actions](https://nextjs.org/blog/security-nextjs-server-components-actions) | The reasoning behind the DAL, taint APIs and action IDs |
| [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | `"use client"` as a module-graph boundary; interleaving through `children`; context providers as deep as possible; wrapping third-party packages; `server-only` / `client-only` |
| [profy.dev — Clean(er) React Architecture, Part 6: Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) | Extracting application logic into plain functions with dependency injection through a hook; the resulting shift from integration tests to unit tests |
| [profy.dev — Part 7: Domain Logic](https://profy.dev/article/react-architecture-domain-logic) | Domain logic as functions over domain models, with React kept out |

### Colocation, constants and configuration

| Source | Contribution |
|---|---|
| ✓ [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | "Place code as close to where it's relevant as possible"; the maintainability and applicability arguments; the legitimate exceptions (cross-system docs, E2E tests) |
| ✓ [Semaphore — How to Organize Constants in a Dedicated Layer](https://semaphore.io/blog/constants-layer-javascript) | Constants organised by domain rather than in one file; `Object.freeze`; SCREAMING_SNAKE_CASE; the constant / config / env-var boundary |
| [Next.js — Environment Variables](https://nextjs.org/docs/app/guides/environment-variables) | What may reach the client (`NEXT_PUBLIC_`) and what may not — the line between a constant and a secret |

### Naming, boundaries, enforcement

| Source | Contribution |
|---|---|
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Declaring element types and the permitted dependencies between them as a lint rule |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Validating and visualising the dependency graph — "tests for structure rather than behaviour" |
| [eslint-plugin-check-file](https://github.com/dukeluo/eslint-plugin-check-file) | Enforcing file and folder naming conventions per glob pattern |
| [Barrel files: why `index.ts` re-exports hurt tree shaking, dev memory and `tsc`](https://reactuse.com/blog/barrel-files-tree-shaking/) | The measured cost of wide barrels: no dev-server tree-shaking, slower `tsc`, circular-import bugs — and why narrow barrels are fine |

### Boundaries of this skill (delegated topics)

| Source | Contribution |
|---|---|
| ✓ [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles/) | "The more your tests resemble the way your software is used, the more confidence they can give you" — why a test lives beside its subject |
| ✓ [react.dev — React Compiler](https://react.dev/learn/react-compiler/introduction) | Automatic memoization makes manual `useMemo`/`useCallback` mostly unnecessary; write idiomatic React and let the compiler optimise — which is why none of the rules here are performance rules |

### In-repo sources

`AGENTS.md` (package boundaries, the vendored-contract mirror rule, the do-not-touch list) ·
`client/AGENTS.md` (the component folder shape, the data-access rule, styling and i18n
conventions) · `client/INSIGHTS.md` (real pitfalls already hit) · `TESTING.md` ·
the sibling skills `react-best-practices`, `next-best-practices`, `react-testing-library`,
`engineering-insights`.

---

Unmarked links were gathered from search results and the Next.js reference draft rather than
opened end-to-end; the claims attributed to them are consistent with the marked primary sources,
but verify before quoting one directly.
