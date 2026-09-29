# Next.js App Router — Architecture

Where code lives and which module may import which. Scope: **structure only**.
Performance topics (`next/image`, fonts, bundling, caching, streaming) belong to the
vendored `next-best-practices` skill — link there, don't restate.

Severity tags match the house convention: **CRITICAL** / **HIGH** / **MEDIUM**.

---

## 1. `app/` is routing, nothing else (CRITICAL)

A route segment folder answers one question: *what URL is this?* Everything else is
colocated but not routable.

- `page.tsx` stays thin: read `params`/`searchParams`, call one data function, render
  one feature component. No business logic, no data transforms, no inline JSX trees.
- A route becomes public **only** when `page.tsx` or `route.ts` exists. Any other file
  in the segment is safe to colocate and never becomes a URL.
- `layout.tsx` owns shared chrome for its subtree. It is not a place to fetch feature
  data "because it's convenient".

### Private folders `_folder`

Prefix with `_` to opt a folder and all its children out of routing:
`app/blog/_components/Post.tsx`, `app/blog/_lib/data.ts`.

Colocation already works without them, but private folders buy three things:
separating UI from routing, a consistent shape across the codebase, and immunity from
future Next file-convention name collisions. **This is the project's default** — see §6.

### Route groups `(folder)`

`app/(marketing)/page.tsx` → `/`. The parenthesised segment is dropped from the URL.

Use for: grouping by site section / intent / team; giving a subset of routes its own
`layout.tsx`; scoping a `loading.tsx` to one page without affecting siblings; multiple
root layouts (remove the top-level `layout.tsx`, put one in each group — each needs its
own `<html>`/`<body>`).

### Pick one organization strategy and hold it (HIGH)

The docs offer three, and are explicit that consistency matters more than the choice:

1. **Files outside `app/`** — `app/` is pure routing, everything else in `src/components`,
   `src/lib`, `src/features`.
2. **Top-level folders inside `app/`** — shared code in `app/components`, `app/lib`.
3. **Split by feature/route** — globally shared code at the `app/` root, feature-specific
   code inside the route segment that uses it.

dev-digest uses (3). Mixing strategies is the failure mode: the same kind of file ends up
in two places and nobody can predict which.

---

## 2. The server/client boundary is an architectural boundary (CRITICAL)

`"use client"` is not a performance switch. It declares a **module-graph boundary**, and
that boundary decides what logic is even *allowed* to exist in a file.

- Once a file carries `"use client"`, every module it imports and every component it
  renders directly joins the client bundle. You do not repeat the directive downstream.
- Server Components passed as `children` or props are **not** in that graph. They render
  on the server and arrive as rendered output.
- Props crossing the boundary must be React-serializable. Functions and class instances
  are rejected at runtime — which is a useful accident (see §3).

### Push the boundary down, not up (HIGH)

Never mark a layout or page as client because one control needs state. Extract the
control.

```tsx
// app/layout.tsx — stays a Server Component
import Logo from './logo'      // server
import Search from './search'  // 'use client'

export default function Layout({ children }) {
  return <><nav><Logo /><Search /></nav><main>{children}</main></>
}
```

### Interleaving: the `children` slot

To nest server-rendered UI inside a client shell (modal, drawer, tabs), give the client
component a `children` slot rather than importing the server component into it.

```tsx
// app/ui/modal.tsx
'use client'
export default function Modal({ children }) { return <div>{children}</div> }

// app/page.tsx — Server Component
<Modal><Cart /></Modal>   // <Cart/> renders on the server
```

### Context providers

React context does not exist in Server Components. Create a client provider that takes
`children`, then render it from a server `layout.tsx`. Render providers **as deep as
possible** — wrap `{children}`, not `<html>` — so the static server subtree above stays
static.

### Third-party components

A package that uses `useState` without shipping `"use client"` cannot be rendered from a
Server Component. Wrap it once in your own client module and re-export; don't scatter
`'use client'` at every call site.

```tsx
// app/carousel.tsx
'use client'
export { Carousel as default } from 'acme-carousel'
```

### Where hooks may live (HIGH)

Custom hooks are a client-only construct. A `useX` file belongs under a `"use client"`
module graph. If a "hook" only transforms data and calls no other hook, it is a plain
function — name it `getX`/`formatX` and it becomes usable on both sides.

---

## 3. Business logic: the Data Access Layer (CRITICAL)

The docs name three data-handling models and say to pick one and not mix:

| Model | When |
|---|---|
| **HTTP APIs** — Server Components `fetch()` your own REST/GraphQL like a client would | existing large projects / separate backend team. **This is dev-digest**: client → `lib/api.ts` → Fastify :3001 |
| **Data Access Layer** — an internal module owning all DB access | new projects with DB in the same codebase |
| **Component-level data access** — queries inline in Server Components | prototyping and teaching only |

### DAL rules

- One module owns data access. Every exported function takes the current user and
  authorizes **before** returning. "A Server Component function body should only see data
  the current user is authorized to have."
- Database packages and `process.env` are imported **only** inside the DAL. That single
  invariant is what makes an architecture audit tractable.
- Return **DTOs** — objects already safe to hand to the client — not raw rows. Shape the
  output per query; don't return everything and filter in the UI.
- Re-read auth and `cookies()` at each data read. Don't thread the user through props or
  params. `cache()` makes repeated reads cheap and discourages passing it around.
- Use `class` for data records: the RSC serializer refuses class instances, so an
  accidental "pass the whole object to the client" fails loudly instead of leaking.

```ts
// data/user-dto.ts
import 'server-only'

export async function getProfileDTO(slug: string) {
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${slug}`
  const currentUser = await getCurrentUser()
  return {
    username: canSeeUsername(currentUser) ? rows[0].username : null,
    phonenumber: canSeePhoneNumber(currentUser, rows[0].team) ? rows[0].phonenumber : null,
  }
}
```

### `server-only` / `client-only` (HIGH)

`import 'server-only'` at the top of a module makes the build fail if a Client Component
imports it. Use it on the DAL, on anything touching secrets, and on proprietary logic.
`client-only` is the mirror for modules touching `window`/`localStorage`.

Note the env-var asymmetry: only `NEXT_PUBLIC_`-prefixed variables reach the client;
others are replaced with an empty string — so a leaked server function fails silently
rather than loudly. `server-only` converts that into a build error.

---

## 4. Mutations: Server Actions are public endpoints (CRITICAL)

`"use server"` publishes **every exported function in the file** as an invokable
endpoint. The action id is a hash of the source location; anyone holding it can call the
function with arbitrary arguments.

Therefore an action's first two statements are always, in order:

1. **Authorize** the current user for this operation.
2. **Validate** every argument. TypeScript annotations are erased at runtime — a `zod`
   schema, not a type, is the guard.

```ts
'use server'
export async function deletePost(id: number) {
  const user = await getCurrentUser()
  if (!canDeletePost(user, id)) throw new Error()
  // …then delegate to the DAL
}
```

Keep the action **thin**: authorize → validate → call a DAL function. Business rules live
in the DAL, not in the action body, so the same rule is enforced whatever the caller.

### Where the zod schema lives (HIGH)

One schema is the single source of truth for a form: it validates optimistically on the
client and authoritatively in the action. Put it in the feature's own module
(`features/<x>/schemas.ts`, or `_lib/schema.ts` beside the route) — **not** inside the
form component, or the server can't import it without dragging JSX along.

In dev-digest, contracts already live in `src/vendor/shared` (a copy of
`server/src/vendor/shared`); a contract change must be mirrored in the same commit.

### Read vs write (MEDIUM)

Rendering a Server Component must never mutate. `searchParams` and `[param]` are user
input — re-validate on every read; never encode authority in them (`?isAdmin=true`).
Because Next never uses GET for side effects, a whole class of CSRF disappears —
`route.ts` handlers are the escape hatch that gives it back, so treat them as such.

---

## 5. Audit checklist (for review mode)

- Is there one established data-handling model, or a mix?
- Are DB packages and `process.env` imported anywhere outside the DAL?
- `"use client"` files: do prop types accept broad objects (`User`) or private fields
  (`token`, `phoneNumber`)?
- `"use server"` files: is every exported function authorizing and validating its args?
- `[param]` folders: are params validated where read?
- `middleware.ts` / `route.ts`: these bypass framework protections — audit by hand.
- Any `page.tsx` over ~40 lines or containing data transforms?
- Any `"use client"` on a layout or page rather than on a leaf control?

---

## 6. dev-digest defaults (project appendix)

Route-colocated is the house structure, and it fits App Router cleanly:

```
src/app/<route>/
  page.tsx                  thin
  _components/<Name>/
    Name.tsx  index.ts  styles.ts  constants.ts  helpers.ts  Name.test.tsx
src/components/<name>/      cross-route components
src/lib/api.ts              the only module that calls fetch
src/lib/hooks/<domain>.ts   all TanStack Query hooks
```

### The promotion rule (HIGH)

Route colocation has one known failure mode: a component needed by a **second** route.
Resolve it mechanically, never case-by-case:

| Consumers | Location |
|---|---|
| one route | `app/<route>/_components/<Name>/` |
| two or more routes | `src/components/<name>/` |
| generic, no domain knowledge | `src/vendor/ui` (extend the kit, don't fork it) |

Move on the second consumer — not in anticipation of one. The same rule governs
`constants.ts`, `helpers.ts` and hooks: colocated until a second consumer appears, then
promoted one level and no further.

Corollary: a component in `src/components/` must not import from any
`app/<route>/_components/` — dependencies point one way, `vendor/ui → components → _components`.

---

## Sources

- [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) — file conventions, private folders, route groups, the three organization strategies
- [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — the `"use client"` module-graph boundary, interleaving via `children`, context providers, third-party wrappers, `server-only`/`client-only`
- [Next.js — How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) (Sebastian Markbåge) — the three data-handling models, the Data Access Layer, DTOs, taint APIs, Server Actions as public endpoints, the audit checklist
- [Next.js — Data Security guide](https://nextjs.org/docs/app/guides/data-security) — current docs version of the DAL guidance
- [Next.js — Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [Next.js — `src` folder](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder)
- [React — `use client`](https://react.dev/reference/rsc/use-client) · [Server Components](https://react.dev/reference/rsc/server-components) · [`taintObjectReference`](https://react.dev/reference/react/experimental_taintObjectReference)
- [`server-only` package](https://www.npmjs.com/package/server-only) · [`client-only`](https://www.npmjs.com/package/client-only)
