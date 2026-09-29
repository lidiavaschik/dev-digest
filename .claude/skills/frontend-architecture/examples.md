# Examples

Paired ❌ / ✅ for each rule. Examples marked **real** are drawn from the current `client/`
tree, with paths, so the pattern is recognisable rather than hypothetical.

---

## 1. Component folder shape (CRITICAL)

```
❌  app/onboarding/_components/
      AddRepoView.tsx          ← a loose file; no entry point, nowhere for its helpers
      AddRepoView.test.tsx

✅  app/onboarding/_components/AddRepoView/
      AddRepoView.tsx
      index.ts
      styles.ts                ← only if it styles something
      constants.ts             ← only if it has values worth naming
      helpers.ts               ← only if it derives something
      AddRepoView.test.tsx
```

The folder is the unit. A loose file has nowhere to grow, so its constants end up inline and its
helpers end up in the component body.

## 2. Barrels (MEDIUM)

```ts
// ❌ components/page-shell/index.ts — real
export * from "./PageShell";

// ✅ name the public surface
export { PageShell, PageShell as default } from "./PageShell";
```

`export *` is legitimate in a **layer** barrel — `lib/hooks/index.ts`, `vendor/ui/index.ts`,
`vendor/shared/index.ts` — where aggregating is the entire point. In a component or module
folder it hides what the folder actually offers and drags the whole subtree into the dev
server's module graph.

## 3. Import style (HIGH) — **real**

```ts
// ❌ app/repos/[repoId]/pulls/[number]/page.tsx — both styles, same file
import { AppShell } from "../../../../../components/app-shell";
import { usePullDetail, usePulls } from "../../../../../lib/hooks";
import { RepoNotFound } from "@/components/repo-not-found";

// ✅ one style, and it is the alias
import { AppShell } from "@/components/app-shell";
import { usePullDetail, usePulls } from "@/lib/hooks";
import { RepoNotFound } from "@/components/repo-not-found";
```

Five levels of `../` encodes the file's current depth into every import, so moving the folder
rewrites every line. Mixing both styles in one file also makes a grep for consumers miss half
of them — which is exactly what makes a later refactor unsafe.

## 4. Deep imports (CRITICAL)

```ts
// ❌ reaches past the barrel into an internal layout
import { FileCard } from "@/components/diff-viewer/FileCard/FileCard";

// ✅ the folder's public surface
import { FileCard } from "@/components/diff-viewer";
```

If `FileCard` is not exported from `diff-viewer/index.ts`, that is the answer: it is internal.
Either export it deliberately or don't use it from outside.

## 5. Query keys and invalidation (HIGH) — **real**

```ts
// ❌ app/repos/[repoId]/pulls/[number]/page.tsx
const qc = useQueryClient();
const invalidateRunHistory = () => {
  if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
  qc.invalidateQueries({ queryKey: ["pulls", repoId] });
};
```

The keys `["pr-runs", prId]` and `["pulls", repoId]` are defined in `lib/hooks/`, then re-typed
as string literals in a page. Rename a key at its source and this silently stops invalidating —
the UI just shows stale data, no error anywhere.

```ts
// ✅ lib/hooks/reviews.ts — the key and everything that touches it live together
export const prRunsKey = (prId: string) => ["pr-runs", prId] as const;

export function useDeleteRun(prId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => apiFetch(`/runs/${runId}`, { method: "DELETE" }),
    onSuccess: () => {
      if (prId) qc.invalidateQueries({ queryKey: prRunsKey(prId) });
    },
  });
}

// the page just calls it
const deleteRun = useDeleteRun(prId);
```

A mutation knows what it invalidates. The component should not have to.

## 6. Business logic in JSX (HIGH)

```tsx
// ❌ the rule lives in the return statement
return (
  <ul>
    {runs
      .filter((r) => r.status !== "cancelled")
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, 5)
      .map((r) => <RunRow key={r.id} run={r} />)}
  </ul>
);

// ✅ helpers.ts — a named rule, unit-testable without a renderer
export const MAX_VISIBLE_RUNS = 5;

export function selectRecentRuns(runs: Run[]): Run[] {
  return runs
    .filter((r) => r.status !== "cancelled")
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, MAX_VISIBLE_RUNS);
}

// Name.tsx
const visibleRuns = selectRecentRuns(runs);
return <ul>{visibleRuns.map((r) => <RunRow key={r.id} run={r} />)}</ul>;
```

"Cancelled runs are hidden, newest first, at most five" is a product rule. In the first version
you can only test it by rendering; in the second it is five assertions and no DOM.

## 7. Where `fetch` lives (CRITICAL)

```ts
// ❌ in a component — skips the base URL, auth headers, ApiError, and the test seam
const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/repos/${id}/pulls`);
const pulls = await res.json();

// ✅ lib/api.ts owns transport; lib/hooks/<domain>.ts owns access
export function usePulls(repoId: string) {
  return useQuery({
    queryKey: ["pulls", repoId],
    queryFn: () => apiFetch<Pull[]>(`/repos/${repoId}/pulls`),
  });
}
```

The first version works until the first 401, at which point it renders `undefined` instead of
the shared error state — and there is no single place to fix it.

## 8. utils vs a domain module (HIGH)

```
❌  lib/utils.ts            formatBytes, prUrl, modelLabel, clamp, slugify, …
✅  lib/format.ts           formatBytes, formatDuration
    lib/github-urls.ts      prUrl, commitUrl
    lib/model-label.ts      modelLabel
```

`utils.ts` is a folder name that means "assorted", so every new function qualifies and nothing
is ever removed. A domain-named module answers "does my function belong here?" before you open
it — which is the only property that keeps a shared layer from rotting.

## 9. Constant or not (HIGH)

```tsx
// ❌ a name that restates the value
const FIVE = 5;
// ❌ copy pretending to be a constant
const EMPTY_MESSAGE = "No findings yet";
// ❌ an environment value hard-coded
const API_BASE = "http://localhost:3001";

// ✅ the concept named
const MAX_VISIBLE_FINDINGS = 5;
// ✅ copy goes to i18n
t("prReview.findings.empty")
// ✅ environment values come from env, read in one module
process.env.NEXT_PUBLIC_API_BASE   // in lib/api.ts, nowhere else
```

And the case for leaving it alone:

```tsx
// ✅ fine — a name would add nothing
<Skeleton height={16} />
```

## 10. Types (HIGH)

```ts
// ❌ a contract re-declared locally — two sources of truth, drifts at the next API change
type Finding = { id: string; severity: string; message: string };

// ✅ imported from the contract
import type { FindingRecord } from "@devdigest/shared";

// ✅ a UI-only view model is legitimate, and lives with the code that builds it
type FindingRow = { finding: FindingRecord; isExpanded: boolean };
```

The local copy compiles for months and fails the day the server adds a field the UI needed.

## 11. Styles (MEDIUM)

```tsx
// ❌ inline objects, literal colors, invisible to a theme switch
<div style={{ padding: 24, background: "#1a1a1a", border: "1px solid #333" }}>

// ✅ styles.ts, CSS variables
export const s = {
  card: {
    padding: 24,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
  } satisfies CSSProperties,
} as const;

<div style={s.card}>
```

Literal hex is the part that matters: it survives a theme change unchanged, and the bug shows
up as one wrong panel in dark mode that nobody notices for a release.

## 12. Copy (HIGH)

```tsx
// ❌ unreachable by translation, however unlikely translation seems
<button>Run review</button>
<EmptyState title="No pull requests yet" />

// ✅
const t = useTranslations("prReview");
<button>{t("actions.run")}</button>
<EmptyState title={t("empty.title")} />
```

Keys are structural — `prReview.empty.title` describes the slot, so rewriting the copy is not a
rename.

## 13. Splitting a page (HIGH) — **real shape**

`app/repos/[repoId]/pulls/[number]/page.tsx` is 190 lines: seven hooks, query-key literals,
invalidation callbacks, tab state and JSX.

```
❌  page.tsx (190 lines)
      7 hooks · raw query keys · 3 invalidation callbacks · tab routing · full JSX

✅  page.tsx (~40)             params → prId, render the shell and the active tab
    helpers.ts                 resolvePrId(pulls, number), visible-tab rules
    _components/PrDetailView/  the composition
    lib/hooks/reviews.ts       the hooks own their own keys and invalidation
```

The page keeps one job: turn a URL into a feature. Note the resolution
`pulls?.find(p => p.number === Number(number))?.id` is itself a named rule —
`resolvePrId(pulls, number)` — and it is the kind of thing that wants a unit test.

## 14. Promotion (HIGH)

```
Day 1 — one consumer. Correct as-is:
  app/repos/[repoId]/pulls/_components/FindingsCell/

Day 40 — the agents route needs it too. Promote one level:
  components/findings-cell/
      FindingsCell.tsx  index.ts  styles.ts  FindingsCell.test.tsx

❌  the agents route imports ../../repos/[repoId]/pulls/_components/FindingsCell
❌  it was put in components/ on day 1 "because it looks reusable"
```

Both failures are the same mistake from opposite directions. The sideways import creates a
dependency between two routes that neither owns; the early promotion shapes the component
around a single use case, and the second consumer then needs props that do not fit.

## 15. Module folder — correct as it stands (**real**)

```
components/diff-viewer/
  index.ts  constants.ts  helpers.ts  comments.ts  styles.ts
  DiffViewer/  FileCard/  CodeLine/  CommentCard/  CommentThreadView/
  InlineComposer/  OutdatedComments/
```

This is **not** a malformed component folder. It is a module folder: the root files are shared
by two or more children, which is exactly what the promotion test lifts out of them. The shape
to recognise — segment files at the root, component folders beneath, one `index.ts` as the
public surface.

Do not flatten it, and do not add a `DiffViewer/` wrapper folder just to make it look like the
others.

## 16. Hook or function (MEDIUM)

```ts
// ❌ calls no hooks — the `use` prefix costs it conditional and server-side use
function useSortedFindings(findings: FindingRecord[]) {
  return [...findings].sort(bySeverity);
}

// ✅ a plain function
function getSortedFindings(findings: FindingRecord[]) {
  return [...findings].sort(bySeverity);
}

// ✅ a real hook — it orchestrates, and its name says the use case
function usePullFilters(repoId: string) { /* useState + useSearchParams */ }
```

```ts
// ❌ a lifecycle wrapper — hides reactivity, blinds the dependency linter
useMount(() => { track("opened"); });

// ✅ name the purpose
useImpressionLog("pr_detail_opened", { repoId });
```
