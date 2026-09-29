# Placement — one artifact at a time

The table in [SKILL.md](SKILL.md) decides the common cases in one lookup. This file is for the
awkward ones: *why* the row says what it says, and what to do when the answer is genuinely
unclear.

## Contents

1. [Components](#1-components) · 2. [Constants](#2-constants) · 3. [Helpers and pure logic](#3-helpers-and-pure-logic)
4. [Business logic](#4-business-logic) · 5. [Hooks](#5-hooks) · 6. [API calls](#6-api-calls)
7. [Types and schemas](#7-types-and-schemas) · 8. [Styles](#8-styles) · 9. [Tests](#9-tests)
10. [Translations](#10-translations) · 11. [Assets](#11-assets) · 12. [When you cannot decide](#12-when-you-cannot-decide)

---

## 1. Components

**Default: as deep as the set of its consumers allows.**

| Consumers | Home |
|---|---|
| One parent component | `<Parent>/_components/<Child>/` |
| Several components in one route | `app/<route>/_components/<Name>/` |
| Two or more routes | `src/components/<kebab-name>/` |
| Generic, carries no domain knowledge | `src/vendor/ui` — extend the kit |

The last row is the one people get wrong. "Generic" does not mean "looks reusable"; it means
the component could be lifted into another product without carrying a single word of this
domain. `<Button>` and `<Modal>` qualify. `<PullRequestCard>` never will, however pretty it is.

**Anonymous components.** A component used once, inside one file, with no test of its own, can
stay in that file above the main component. Giving it a folder is only worth it when someone
will look for it by name.

**Nesting depth.** Three levels of `_components/` below a route segment is the practical
ceiling. Beyond that the path stops being readable and the structure is telling you the parent
is a feature, not a component — give it a module folder instead.

## 2. Constants

Scope a constant to the narrowest place that uses it, then let the promotion test move it.

```
const ROW_HEIGHT = 44            // used once, in this file → leave it here
<Name>/constants.ts              // two children of this component need it
<route>/constants.ts             // two components in this route need it
src/lib/<domain>.ts              // two routes need it — and it gets a domain name
```

**What is not a constant:**

- Text the user reads → `messages/en/<ns>.json`. A constant holding English is a translation
  that will never be found.
- A value that differs between local, staging and production → an env var, read in one module.
- A value used once, next to its use, that a name would not explain → leave it inline.
  `style={{ width: 240 }}` does not become clearer as `WIDTH_240`.

**Naming.** `SCREAMING_SNAKE_CASE` for module-level literals. The name states the concept
(`MAX_VISIBLE_FINDINGS`), never the value (`FIVE`). If you cannot name it without restating
the number, it probably wants to stay inline.

**Enum-like sets** — statuses, tabs, severities — belong with the type that describes them, so
the values and the union cannot drift apart.

## 3. Helpers and pure logic

A helper is a pure function: same input, same output, no React, no network, no clock.

| Reach | Home | Naming |
|---|---|---|
| One folder | `helpers.ts` in that folder | descriptive verb: `formatDiffSize` |
| One route | `<route>/helpers.ts` | same |
| Cross-route | `src/lib/<domain>.ts` | **the file is named for the domain** |

That last rule is the whole reason `utils.ts` is banned. `src/lib/format.ts`,
`src/lib/github-urls.ts`, `src/lib/model-label.ts` each tell you whether your function belongs
there before you open them. `src/lib/utils.ts` tells you nothing, so everything qualifies, and
within a year it is 600 lines that no one dares split.

**If a helper needs React, it is not a helper.** It is a hook (§5) or it belongs in the
component. Reaching for `useState` inside something called a helper is the signal that a
business rule and some UI state have been conflated.

## 4. Business logic

Split it in two before choosing a folder, because the halves live in different places.

**Domain logic** — rules that would still be true with no UI at all. "A review is stale when
its head SHA differs from the PR's." Pure functions over plain data. They live in `helpers.ts`
or `src/lib/<domain>.ts` and are tested with a plain unit test, no renderer.

**Use-case logic** — orchestration that needs React: which query runs, what happens after a
mutation, which filters are active. Lives in a hook.

```
❌  one function that fetches, filters, sorts, formats and sets state
✅  api.ts fetches → lib/<domain>.ts decides → useX() orchestrates → Name.tsx renders
```

The practical payoff is the test pyramid: domain rules get cheap exhaustive unit tests, and the
component test only has to cover the wiring. When both live in the component, every branch of
every rule needs a full render to reach.

**The event/display distinction.** Logic that runs *because the user did something* belongs in
the event handler. Logic that runs *because the component is on screen* belongs in the data
layer. Almost every misplaced effect is one of those two wearing the other's clothes.

## 5. Hooks

| Reach | Home |
|---|---|
| One component | `<Name>/hooks/useX.ts`, or in `Name.tsx` if it is small and private |
| One route | `<route>/_components/<Name>/hooks/` or the route's own `hooks/` |
| Cross-route, or any server data | `src/lib/hooks/<domain>.ts`, exported from the barrel |

**Every data hook is cross-route by definition.** A query hook owns a cache key, and a cache key
is global state; two copies in two routes will invalidate each other's data or fail to. Put it
in the domain file from the start — this is the one row in the placement table where the
promotion test does not apply.

**`use` prefix only when the function calls another hook.** A function that just transforms its
arguments is `getSortedFindings`, not `useSortedFindings` — and as a plain function it can be
called conditionally, inside a loop, or on the server.

**Do not write lifecycle hooks.** `useMount`, `useEffectOnce`, `useUpdateEffect` hide the fact
that an effect is reactive and blind the dependency linter. Name the actual purpose instead.

## 6. API calls

**One module calls the network. Everything else calls that module.**

Four things want a single home, and they are the reason this rule is CRITICAL rather than
stylistic: base URL and auth headers; error normalization into one error type; retry and
timeout policy; a single seam to mock in tests. A second `fetch` anywhere opts out of all four
silently — the code works, right up to the first 401.

The layering is always:

```
lib/api.ts           transport: one fetch, one error type
lib/hooks/<domain>   access: query keys, invalidation, the hooks components call
component            render
```

Keep the query key next to the hook that owns it, and the invalidation next to the mutation
that requires it. A key defined in one file and invalidated in another is a bug waiting for the
next refactor.

## 7. Types and schemas

Three kinds of type, three different homes.

| Kind | Home | Why |
|---|---|---|
| Props | in the component file, above the component | Nobody else can use them |
| UI view model | beside the code that builds it; `src/lib/types.ts` if shared | Exists only for rendering |
| Contract (crosses the wire) | the shared contract module; re-exported, never re-declared | Two sources of truth drift silently |

**Schema first, type second.** Where a validator exists, the schema is the source of truth and
the type is inferred from it. Declaring both by hand creates a pair that compiles happily while
disagreeing at runtime.

**Never create `src/types/`.** A folder named after a language feature collects everything and
distinguishes nothing. Types live with their meaning.

## 8. Styles

This project keeps styles in a typed object beside the component:

```ts
// styles.ts
import type { CSSProperties } from "react";

/** Co-located styles for PageShell. */
export const s = {
  container: { padding: "24px 32px 44px", maxWidth: 1200 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
```

- Colors, spacing and radii come from CSS variables — never a literal hex in a component.
- A new token is a change to the kit (`src/vendor/ui`) plus `globals.css`, not a local constant.
- `className` only for the global helpers defined in `globals.css`.
- No `styles.ts` when a component has no styling. An empty file is not consistency.

Note this deliberately contradicts the vendored `react-best-practices`, which assumes Tailwind.
Inside `client/`, this file wins.

## 9. Tests

**Beside the subject, always.** `<Name>/Name.test.tsx`. The distance between a test and its
subject is exactly how likely the test is to be updated when the subject changes.

Required for a component with branching, derived values, or user interaction. A presentational
leaf that takes props and returns markup is exempt — a test that only re-states the JSX costs
maintenance and catches nothing.

Domain functions in `helpers.ts` / `src/lib/` get plain unit tests, and they are the cheapest
tests in the codebase. If a branch is hard to reach in a component test, that is usually a sign
the rule wants to move to a helper.

E2E tests are the one thing that correctly lives far from its subject: they span systems and
must not depend on `src/` layout.

## 10. Translations

Every user-visible string goes to `messages/en/<namespace>.json`, one namespace per feature.
No exceptions, including strings that "will never change" and single words on buttons.

`common.json` is for shell and generic vocabulary — Cancel, Save, Loading. It is not a place to
put a string you could not find a namespace for; that string wants its feature's namespace.

Keys are structural, not literal: `prReview.emptyState.title`, not `prReview.noFindingsYet`.
The key describes the slot so the copy can change without a rename.

## 11. Assets

An icon or image used by one component sits in that component's folder. One used across routes
goes to the shared kit or `public/`. Anything referenced by a stable URL — favicons, OG images —
follows the framework's own naming convention and has no say in the matter.

## 12. When you cannot decide

Work down this list and stop at the first rule that answers.

1. A repo-level rule already owns it (vendored directories, migrations, shared contracts).
2. Exactly one consumer → colocate, regardless of apparent reusability.
3. This placement would create an upward import → move it down until it doesn't.
4. The feature name describes it better than the file type → feature folder wins.
5. Still genuinely ambiguous → colocate at the lowest common ancestor, and record the call as
   a short note via `engineering-insights`.

Rule 5 is not a cop-out. Colocation is the cheap mistake: moving a file up later is a rename,
while un-sharing a file that three modules now import is a refactor.
