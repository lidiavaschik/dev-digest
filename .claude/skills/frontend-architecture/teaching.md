# Why — the reasoning behind the rules

For explaining a decision rather than applying it: in review comments, in a lesson, or when
someone reasonably asks why a file cannot just go where it is convenient.

Every rule in [SKILL.md](SKILL.md) serves one of three forces. When rules appear to conflict,
naming the force usually resolves it.

| Force | The question it answers | Rules that serve it |
|---|---|---|
| **Locality of behaviour** | Can I change this feature without opening five folders? | Colocation, component folders, route colocation, tests beside subjects |
| **Deletion safety** | Can I delete this feature by deleting a folder? | One public entry point, no sideways imports, no junk-drawer folders |
| **Boundary clarity** | Can I reason about this module without reading the others? | Import direction, one API module, domain logic without React |

---

## Why not `components/`, `hooks/`, `utils/`

The type-folder layout looks tidy and fails at the only moment that matters. It optimises for
"show me every hook in the app" — a question nobody asks — at the cost of "show me everything
this feature does", which is every question.

Adding one field to a form means touching `components/UserForm.tsx`, `hooks/useUserForm.ts`,
`utils/validateUser.ts`, `types/user.ts` and `api/user.ts`: five folders, five files, and no
single place where a reviewer can see the feature whole. Delete the feature and you must visit
all five again, so in practice nobody does, and the leftovers accumulate.

Grouping by domain inverts both: the change is one folder, and deletion is `rm -rf`.

**The counter-argument is real but bounded.** Type folders are genuinely easier for a codebase
under about fifteen files, where there are no features yet to group by. That is why the growth
ladder in [structures.md](structures.md) starts flat and says to move on a signal rather than
on principle.

## Why one consumer means colocate

Two costs are in tension, and they are not symmetric.

**Duplication costs** are visible and linear: two copies drift, and you fix both. **Premature
abstraction costs** are invisible and compounding: the abstraction is shaped by its first use
case, and the second one needs a flag. The third needs another. Within a year the shared
component has six boolean props and a name nobody can explain.

The asymmetry decides the rule. Moving a file up later is a rename that git tracks. Un-sharing
a module that three others now import is a real refactor. So the cheap mistake is colocating
something that turns out to be shared — take the cheap mistake by default.

"Two consumers" is arbitrary as a number and deliberate as a *trigger*. What matters is that
the decision is made by an observable event rather than by prediction, so it doesn't depend on
how reusable something looks on a good day.

## Why a folder has one entry point

An `index.ts` is a promise: *these exports are supported; everything else may change*. Without
it every file is public, so any internal rename is potentially a breaking change, and you
cannot tell by looking.

This is the one idea worth taking from Feature-Sliced Design even if you never adopt its layers.
FSD makes the public API a hard rule per slice; bulletproof-react gets the same effect through
one-directional imports. Both are describing the same property: a module you can refactor
without grepping the whole codebase first.

The cost is real — barrels are not free ([boundaries.md](boundaries.md)) — which is why the rule
is *narrow* barrels, not *more* barrels.

## Why business logic leaves the component

Three reasons, in increasing order of how much they eventually hurt.

**Testing.** A rule inside a component needs a renderer, a DOM and probably a mocked fetch to
reach one branch. The same rule as a function is one assertion. When exhaustive testing is
cheap, it happens.

**Reuse across contexts.** A pure function runs in a test, on a server, in a worker, in a CLI.
A rule fused to a component runs in a browser.

**Comprehension.** "Cancelled runs are hidden, newest first, at most five" is a product
decision someone made. As `selectRecentRuns` it has a name a non-programmer could check. As a
chain inside a JSX return it is invisible — which is how product rules quietly diverge from
what anyone intended.

The related distinction — **event versus display** — removes most misused effects. Code that
runs because the user did something belongs in the handler. Code that runs because the
component is on screen belongs in the data layer. Almost every effect that felt awkward to
write is one of those two wearing the other's clothes.

## Why derived state is not state

Storing a value you can compute creates two sources of truth that must be kept in sync, and the
synchronisation is where the bug lives. `fullName` stored beside `firstName` is wrong the moment
one updates and the other does not.

The rule generalises: **make the invalid state unrepresentable.** Two booleans `isSending` and
`isSent` allow four combinations, of which one is nonsense — so use one `status` field with
three legal values. Structuring state so that contradictions cannot be expressed removes a class
of bug rather than a bug.

## Why server data is not UI state

Server cache and UI state look alike (both are "data in a variable") and behave nothing alike.

Server cache is a *copy* of something authoritative elsewhere. It can be stale, needs
invalidation, is shared across components, and can be refetched. UI state — which tab is open,
whether a drawer is expanded — is authoritative in the browser, belongs to one subtree, and is
meaningless to anyone else.

Managing them with the same tool means either putting cache concerns on UI state (a store that
needs invalidation logic it has no use for) or UI concerns on cache. Hence the split: a query
library owns server cache; `useState` close to the consumer owns UI state.

This also explains why global state is a performance issue: frequently-changing state held high
in the tree re-renders everything beneath it. Pushing state down is not just tidiness.

## Why exactly one module calls the network

Four things each want a single home: the base URL and auth headers; normalising every failure
into one error type; retry and timeout policy; and one seam to mock in tests.

A second `fetch` opts out of all four — and it does so *silently*. The code works. It keeps
working until the first 401, which renders as `undefined` instead of the shared error state,
somewhere nobody was looking.

## Why the compiler changed the memoization rules but not these

React Compiler memoizes automatically, so `useMemo`, `useCallback` and `memo` are mostly
unnecessary in new code. It is worth knowing what that does *not* change: the compiler optimises
code that follows the Rules of React, and those rules are about purity and data flow — exactly
what good placement makes easy to keep.

None of the rules here are performance rules. Splitting a component for responsibility is
unrelated to splitting it to dodge a re-render. If a rule in this skill seems to be about
performance, it is being misread.

## Teaching this

The order that works, because each step motivates the next rather than asserting it:

1. **Colocation first.** Show the five-folder edit, then the one-folder edit. Nobody argues.
2. **Then the promotion test.** Now that everything is local, ask what happens when a second
   route needs a component. Introduce the trigger, not the prediction.
3. **Then layering.** Take a component with a filter chain in its JSX and write the test for one
   branch. Extract the rule; write the same test again. The difference is the argument.
4. **Then boundaries.** Only once there are layers does "which way may imports point" mean
   anything.
5. **Barrels and naming last.** These are conventions, and conventions taught before the
   reasoning become cargo cult.

### Exercises

Each has one defensible answer and one rule that produces it.

1. A `formatDuration` used by one component. → Local `helpers.ts`. *Promotion test: one consumer.*
2. The same function, now also used by a second route. → `src/lib/format.ts`. *Second consumer
   triggers promotion; the file is named for its domain, not `utils.ts`.*
3. `MAX_RETRIES = 3`, used in one hook. → `const` at the top of that hook's file. *A constant is
   scoped like any other value.*
4. The API base URL. → An env var, read in `lib/api.ts` only. *Differs per environment; one
   module reads `process.env`.*
5. `"No findings yet"`. → `messages/en/prReview.json`. *Copy, not a constant.*
6. A `<Modal>` with no domain knowledge. → `vendor/ui`. *Generic means liftable into another
   product, not "looks reusable".*
7. A component needed by two routes that currently lives in one route's `_components/`. →
   `src/components/`, one level up. *Never a route-to-route import.*

### Lesson mapping

The course lessons (L01–L08) add features back to this starter incrementally. This file is
written to be read section-by-section rather than as a fixed syllabus, because there is no
lesson manifest in the repo to map against. When the syllabus lands, the natural pairing is:
lessons that add a screen → *Why not type folders* + *Why one consumer means colocate*; lessons
that add data flow → *Why business logic leaves the component* + *Why server data is not UI
state*; lessons that refactor → *Why a folder has one entry point* + the review checklist.

Further reading, with what each source contributed: [README.md](README.md).
