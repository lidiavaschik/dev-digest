# Enforcing boundaries without a linter

`client/` has no ESLint, no Prettier, no Biome. `pnpm typecheck` and `pnpm test` are the only
gates. That is a deliberate state of the repo, not an oversight to fix on the way past — so the
structural rules in this skill are enforced by review by default.

If you want a machine check, three options, cheapest first. **Introducing any of them into
`client/` is a user decision**: each adds a CI lane, and B and C add dependencies to that
package.

One thing already settled: `dependency-cruiser` is a **runtime** dependency of `server/`, where
the repo-intel indexer uses it as a library to build the import graph (`platform/container.ts`,
`modules/repo-intel/pipeline/full.ts`). It is not configured as an architecture linter anywhere
— there is no `.dependency-cruiser.js` in the repo. So the team already runs the tool and knows
it; wiring it up as a boundary check on the **server** costs a config file and a script, with no
new dependency at all. For `client/`, which has its own `package.json` and lockfile, it is still
a new dev dependency.

## The matrix

Everything below encodes the same table.

| Source | May import from |
|---|---|
| `app/<route>/page.tsx`, `layout.tsx` | `_components`, `components`, `lib`, `vendor` |
| `app/**/_components/**` | `components`, `lib`, `vendor` |
| `components/**` | `lib`, `vendor` |
| `lib/**` | `lib`, `vendor/shared` |
| `vendor/ui/**` | `vendor/ui` only |
| `vendor/shared/**` | nothing |

Plus three rules the matrix does not express: no import reaching past a folder's `index.ts`;
no import between two route segments; `fetch(` only in `lib/api.ts`.

---

## Option A — an architecture test (recommended)

Zero new dependencies. It rides the existing `pnpm test` gate, so it runs in CI already and
fails a PR the same way a broken component does.

`client/src/test/architecture.test.ts`, sketch:

```ts
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";   // Node 22 has fs.globSync
import { describe, expect, it } from "vitest";

const SRC = new URL("../", import.meta.url).pathname;
const files = globSync("**/*.{ts,tsx}", { cwd: SRC })
  .filter((f) => !f.startsWith("vendor/") && !f.includes(".test."));

const importsOf = (file: string) =>
  [...readFileSync(SRC + file, "utf8").matchAll(/from\s+"(@\/[^"]+)"/g)].map((m) => m[1]);

const layerOf = (p: string) =>
  p.startsWith("lib/") ? "lib"
  : p.startsWith("components/") ? "components"
  : p.includes("/_components/") ? "route-components"
  : p.startsWith("app/") ? "route"
  : "vendor";

const ALLOWED: Record<string, string[]> = {
  lib: ["lib", "vendor"],
  components: ["lib", "vendor", "components"],
  "route-components": ["lib", "vendor", "components"],
  route: ["lib", "vendor", "components", "route-components"],
  vendor: ["vendor"],
};

describe("architecture", () => {
  it("only lib/api.ts calls the network", () => {
    const offenders = files.filter(
      (f) => f !== "lib/api.ts" && /\bfetch\(/.test(readFileSync(SRC + f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("imports flow one way", () => {
    const violations = files.flatMap((f) =>
      importsOf(f)
        .map((spec) => spec.replace("@/", ""))
        .filter((target) => !ALLOWED[layerOf(f)].includes(layerOf(target)))
        .map((target) => `${f} → ${target}`),
    );
    expect(violations).toEqual([]);
  });

  it("no route imports another route's _components", () => { /* compare route prefixes */ });
  it("no import reaches past a folder barrel", () => { /* path depth beyond index.ts */ });
  it("no banned filenames", () => {
    expect(files.filter((f) => /(^|\/)(utils|common|misc|shared)\.tsx?$/.test(f))).toEqual([]);
  });
});
```

**Why a test rather than a lint rule.** The failure message can name the rule and the fix, it
runs where CI already runs, and adding a case is a few lines rather than a plugin
configuration. The cost is that it only sees static `@/` imports — good enough, since every
cross-layer import in this codebase is an alias import.

**Grandfathering.** Introducing this into a codebase with existing violations means starting
from a frozen allowlist and shrinking it, not from zero. A test that fails on `main` from day
one gets skipped within a week.

## Option B — dependency-cruiser

A dedicated tool: validates the dependency graph and draws it. Useful when you want the picture
as much as the check.

```js
// .dependency-cruiser.js
module.exports = {
  forbidden: [
    { name: "no-lib-to-ui", severity: "error",
      from: { path: "^src/lib" }, to: { path: "^src/(components|app)" } },
    { name: "no-cross-route", severity: "error",
      from: { path: "^src/app/([^/]+)/" }, to: { path: "^src/app/(?!\\1)[^/]+/_components" } },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    { name: "no-deep-import", severity: "warn",
      from: {}, to: { path: "^src/components/[^/]+/[^/]+/" } },
  ],
  options: { tsConfig: { fileName: "tsconfig.json" }, doNotFollow: { path: "node_modules" } },
};
```

Then `pnpm depcruise src --config` as a `lint:boundaries` script, plus a graph for
documentation.

Cost: **nothing in `server/`** — the package already depends on `dependency-cruiser` for the
indexer, so this is a config file and a script. In `client/` it is one new dev dependency plus a
CI step, which is why Option A is still the cheaper starting point there.

## Option C — ESLint + eslint-plugin-boundaries

The conventional answer, and the most expensive one here because it means introducing ESLint to
a repo that has none: a flat config, a TypeScript parser, a decision about which other rule sets
come along, and the churn of the first run across 100+ files.

`eslint-plugin-boundaries` describes element types and the allowed dependencies between them;
`import/no-restricted-paths` (the rule bulletproof-react uses) covers the same ground more
bluntly. Both are the right tool **if** ESLint is arriving anyway for other reasons. Do not add
ESLint solely to enforce folder structure — Option A buys the same enforcement for nothing.

---

## What `tsconfig` paths do and do not do

`@/*` aliases make imports readable and refactor-safe. They are **not** a boundary: an alias
resolves anywhere, so `@/lib/format` imported from a component and `@/components/Foo` imported
from `lib/` look identical to TypeScript. Aliases remove the `../../../` noise; they do not
constrain direction.

The one real constraint TypeScript can express is project references, which is heavier than
this codebase warrants.

## Barrel cost — when to delete one

A barrel is a boundary and a bill at the same time.

- **Dev server:** it does not tree-shake. Importing one hook through a wide barrel makes the
  dev server resolve and execute every module the barrel re-exports.
- **Production:** wide `export *` re-exports defeat the bundler's ability to prove an export is
  unused, so dead code survives into the bundle.
- **Cycles:** barrels are the usual source of `Cannot access 'X' before initialization`, because
  A → barrel → B → barrel → A is invisible in the import statements.

The rule that keeps the benefit and drops the bill: **narrow barrels only.** One `index.ts` per
component or module folder, naming its public surface. `export *` confined to layer barrels
(`lib/hooks`, `vendor/ui`, `vendor/shared`). Never a project-wide aggregator.

Delete a barrel when it re-exports more than a folder's worth of modules, or when it exists only
to shorten an import that was already short.

## Where a check would hook into CI

`.github/workflows` uses one path-filtered workflow per package. A boundary check belongs in the
client workflow beside `typecheck` — and with Option A it is already there, because it is a
vitest test.

Adding a new cross-package alias means updating the `paths:` filters, per the root `AGENTS.md`.
