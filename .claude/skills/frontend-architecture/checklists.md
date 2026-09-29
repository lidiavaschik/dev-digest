# Checklists

Three of them: one for reviewing, two for scaffolding. Copy the fenced block, work through it,
report the outcome in one line.

## Scope rules — read before reviewing

1. **The touch rule.** Raise findings only for files the current change touches. Everything
   else goes under `Structure backlog:` as a plain list. A review that flags fifty untouched
   files gets dismissed wholesale, taking the one real finding with it.
2. **Never flag:**
   - Course placeholders from lessons L01–L08 — unused tables, prompt slots, contracts and
     thin folders are deliberate.
   - `src/vendor/**` — vendored, synced, not hand-edited.
   - Generated output, `.next/`, lockfiles.
3. **Severity decides the verb.** CRITICAL: block. HIGH: fix now or log a follow-up.
   MEDIUM: mention only because the file is already open.
4. **One finding per cause.** Five components missing a barrel is one finding with five paths,
   not five findings.

---

## Structure review

```
Structure review:

CRITICAL
- [ ] No `fetch(` outside src/lib/api.ts
- [ ] No import reaching past a folder barrel (…/diff-viewer/FileCard/FileCard)
- [ ] Import direction holds: vendor/ui → lib → components → _components → route
- [ ] No upward import (lib/ importing a component) and no cycle
- [ ] No route importing another route's _components/
- [ ] No hand-edit inside src/vendor/shared or src/vendor/ui
- [ ] Folder name == main file name == exported component name

HIGH
- [ ] Every component folder has index.ts, and it is the only entry point used
- [ ] New component has a test if it branches, derives, or handles interaction
- [ ] Contract types come from @devdigest/shared — not re-declared locally
- [ ] Every query/mutation lives in lib/hooks/<domain>.ts and is exported from the barrel
- [ ] Query key defined beside its hook; invalidation beside its mutation
- [ ] No user-facing string literal in JSX — messages/en/<ns>.json + useTranslations
- [ ] No src/utils/, src/constants/, src/types/, src/api/, services/, or a lib/utils.ts
- [ ] Nothing promoted to src/components or src/lib with a single consumer
- [ ] Imports use the @/ alias, not deep relative paths, and one style per file
- [ ] page.tsx is a shell: no fetch, no query definition, no derivation chain
- [ ] No .filter().sort().map() chain inside a JSX return

MEDIUM
- [ ] Styling in styles.ts (CSSProperties + CSS vars), not inline objects or literal hex
- [ ] Barrel form is `export { X, X as default } from "./X"`; export * only in layer barrels
- [ ] Casing: PascalCase under app/**/_components, kebab-case under src/components
- [ ] File order: imports → types → constants → helpers → component → export
- [ ] ≤3 levels of _components below a route segment
- [ ] _components used only inside src/app (it is a Next.js private-folder convention)
- [ ] i18n namespace matches the feature; common.json not used as a dumping ground
- [ ] No empty constants.ts / styles.ts created "for consistency"
```

### Reporting format

```
Structure: 2 findings (1 CRITICAL, 1 HIGH) · backlog 4

CRITICAL  client/src/app/agents/_components/AgentCard/AgentCard.tsx:31
          Calls fetch directly. Move to lib/hooks/agents.ts; components never call the network.

HIGH      client/src/app/repos/[repoId]/pulls/[number]/page.tsx:44-88
          Filter + sort chain in the page body. Extract to ./helpers.ts as selectVisibleRuns().

Structure backlog (untouched by this change):
- components/{app-shell,page-shell,showcase}/index.ts use `export *` (MEDIUM)
- 6 branching components without tests (MEDIUM)
```

---

## New component

```
New component:
- [ ] Placement decided by the table in SKILL.md, not by habit
- [ ] Only one consumer? Colocated, not promoted
- [ ] Folder <Name>/ with Name.tsx and index.ts
- [ ] index.ts: export { Name, Name as default } from "./Name"
- [ ] Props typed above the component; contract types imported, not re-declared
- [ ] Magic values named in constants.ts (or inline if a name adds nothing)
- [ ] Derivation in helpers.ts, not in the JSX return
- [ ] Styles in styles.ts with CSS vars — created only if there are styles
- [ ] User-facing text via useTranslations, namespace in messages/en/
- [ ] Name.test.tsx beside it if the component branches, derives or interacts
- [ ] File order: imports → types → constants → helpers → component → export
- [ ] pnpm typecheck && pnpm test
```

## New feature

```
New feature:
- [ ] Route segment created; page.tsx is a shell
- [ ] Feature component in <route>/_components/<Name>/
- [ ] Server data through a hook in lib/hooks/<domain>.ts — no fetch in a component
- [ ] Hook exported from lib/hooks/index.ts
- [ ] Query key beside the hook; mutation invalidates the matching key
- [ ] SSE through useRunEvents where applicable — no polling
- [ ] Contract change mirrored server/src/vendor/shared → client/src/vendor/shared, same change
- [ ] New messages namespace, all copy in it
- [ ] Shared UI taken from vendor/ui, not re-implemented
- [ ] Tests for the branching parts, fetch mocked
- [ ] Nothing new under src/components unless a second route consumes it
- [ ] pnpm typecheck && pnpm test
- [ ] engineering-insights wrap-up if anything non-obvious cost time
```

## Refactor safety

Moving or renaming a folder is where structure work actually breaks things.

```
Refactor:
- [ ] The test moved with its component (a stranded test still passes and guards nothing)
- [ ] The barrel updated; grep for deep imports before deleting one
- [ ] Nothing now imports upward or sideways as a result of the move
- [ ] The i18n namespace still matches the feature after the rename
- [ ] Promotion was triggered by a real second consumer, not by anticipation
- [ ] pnpm typecheck && pnpm test
```

Useful greps before a move:

```bash
cd client
grep -rn "from \"@/components/<name>/" src | grep -v "/<name>\"$"   # deep imports
grep -rn "fetch(" src --include=*.ts --include=*.tsx | grep -v lib/api.ts
grep -rn "export \*" src --include=index.ts
```

## Recording a placement call

When a placement was genuinely ambiguous and you decided, write it down — the next person will
hit the same fork. Three lines, routed through `engineering-insights` into `client/INSIGHTS.md`:

```
What:  <the file and the two plausible homes>
Rule:  <the rule that decided it>
Why:   <what made this case ambiguous>
```

Only when it was non-obvious. A placement the table already answers is not an insight.
