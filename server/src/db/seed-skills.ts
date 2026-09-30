/**
 * L02 — built-in skills used by the seed. A skill is plain markdown
 * instructions (no tools, no code) appended to an agent's prompt under
 * `## Skills / rules`, one `### <name>` block per skill, in link order.
 *
 * The `description` is the skill's interface: a directive saying WHEN the agent
 * should apply it and WHAT to flag. The body carries the concrete checklist the
 * deliberately generic agent prompts (seed-prompts.ts) leave out — that gap is
 * what the with/without-skills control experiment measures.
 *
 * `response-shape-compat` is intentionally NOT here: it ships as an importable
 * file under docs/skills/ for the manual import demo.
 */

export type SeedSkillType = 'rubric' | 'convention' | 'security' | 'custom';

export interface SeedSkill {
  name: string;
  description: string;
  type: SeedSkillType;
  body: string;
}

export const UNTESTED_BRANCHES_SKILL: SeedSkill = {
  name: 'untested-branches',
  type: 'rubric',
  description:
    'Use when a PR adds or changes conditional logic (if/else, switch, ternary, early return, catch, ' +
    '?? / || fallbacks); flag every new branch that no test in the diff exercises.',
  body: `# Untested Branches

For every branch the diff ADDS or CHANGES in production code, find the test that
drives execution down that branch. If none exists in the diff (or clearly in the
existing suite), report it.

## What counts as a branch
- Each arm of \`if / else if / else\`, \`switch\` cases incl. \`default\`, ternaries.
- Early returns and guard clauses (\`if (!x) return …\`, \`throw\` on invalid input).
- \`catch\` blocks and \`.catch(...)\` handlers — the error path is a branch.
- Fallbacks: \`a ?? b\`, \`a || b\`, default parameters, optional chaining that
  short-circuits to \`undefined\`.
- Loops with a zero-iteration case that changes the result (empty input).

## What to flag
- A new branch with no test that reaches it — e.g. only the happy path is tested
  while the \`else\` / error / fallback arm is not.
- A test that claims to cover a branch but cannot reach it (the input it uses
  never satisfies the condition).
- Assertions that pass for both arms (the test would stay green if the branch
  were deleted).

## Severity
- **WARNING** — an untested branch that changes observable behaviour (return
  value, status code, persisted data, thrown error).
- **CRITICAL** — only when the untested branch guards security, money or data
  integrity (auth check, permission, refund, delete) AND the diff shows no test.
- **SUGGESTION** — an untested branch that only logs or formats a message.

## Example
\`\`\`ts
export function discount(user) {
  if (user.isVip) return 0.2;   // tested
  if (user.orders > 10) return 0.1; // NOT tested → WARNING: "orders > 10" branch uncovered
  return 0;                      // NOT tested
}
\`\`\`
Point the finding at the branch line in production code and name the missing
test case ("add a case with orders = 11 and isVip = false").`,
};

export const MISSING_CORNER_CASES_SKILL: SeedSkill = {
  name: 'missing-corner-cases',
  type: 'rubric',
  description:
    'Use when a PR adds tests for functions that take collections, numbers, strings, dates or optional ' +
    'input; flag missing boundary and edge-case tests (empty, zero, negative, max, null, duplicates).',
  body: `# Missing Corner Cases

Tests that only exercise a "typical" input miss the inputs where code usually
breaks. For each function under test, check the boundaries below against the
test inputs actually used in the diff.

## Checklist
- **Collections**: empty array / map, a single element, duplicates, very large.
- **Numbers**: 0, negative, boundary values of every \`<\` / \`<=\` / \`>\` in the
  code (off-by-one: test both N-1, N and N+1), NaN, non-integers.
- **Strings**: empty string, whitespace only, unicode, very long input.
- **Optional input**: \`null\`, \`undefined\`, missing object keys.
- **Dates/time**: timezone boundaries, end of month, leap day, DST.
- **Async**: rejection / timeout paths, concurrent calls.
- **Pagination / limits**: page 0, last page, limit 0, limit above max.

## What to flag
- A comparison in production code (\`>=\`, \`<\`, \`length > 0\`) with no test at the
  exact boundary value.
- A function that accepts a collection with no empty-collection test.
- A parser/validator with no invalid-input test.

## Severity
- **WARNING** — a missing boundary test where the code has an explicit
  comparison or guard on that boundary (the off-by-one risk is concrete).
- **SUGGESTION** — a generally useful edge case without a specific guard in the
  code.
- Never CRITICAL on its own.

## Example
\`\`\`ts
if (items.length >= MAX_BATCH) flush();
\`\`\`
Tests use 3 items only → WARNING: "no test at MAX_BATCH - 1 / MAX_BATCH; the >=
boundary is unverified".`,
};

export const OVER_MOCKING_SKILL: SeedSkill = {
  name: 'over-mocking',
  type: 'convention',
  description:
    'Use when tests in the PR use mocks, stubs or spies (vi.mock, jest.mock, sinon, fake repos); flag ' +
    'tests that mock the unit under test or assert on mocks instead of behaviour.',
  body: `# Over-Mocking

Mocks isolate a unit from slow or external collaborators. A test that mocks too
much verifies the mocks, not the code — it stays green when the code is broken.

## Team conventions
- Mock only the boundary: network, LLM, clock, filesystem, external services.
- Do NOT mock the module under test, its pure helpers, or value objects.
- Prefer a real in-memory fake / test DB over mocking query builders chain by
  chain (\`db.select().from().where()\` mocks break on every refactor).
- Assert on OUTPUTS and observable effects, not on which internal functions were
  called. \`toHaveBeenCalledWith\` is fine for boundary calls (an email was sent),
  not for internal wiring.

## What to flag
- The function under test is itself mocked or partially mocked (\`vi.spyOn\` on
  the same module's export, then asserting it was called).
- A mock returns exactly what the assertion checks — the test is a tautology.
- Every collaborator is mocked and the only assertions are call counts.
- Mocks that no longer match the real interface (wrong shape / missing fields).

## Severity
- **WARNING** — the test cannot fail for a real bug in the unit (tautology,
  unit under test mocked).
- **SUGGESTION** — brittle but meaningful: internal-call assertions, deep
  query-builder mocks.

## Example
\`\`\`ts
vi.spyOn(pricing, 'applyDiscount').mockReturnValue(80);
expect(pricing.applyDiscount(100)).toBe(80); // WARNING: asserts the mock
\`\`\``,
};

export const FLAKY_TESTS_SKILL: SeedSkill = {
  name: 'flaky-tests',
  type: 'convention',
  description:
    'Use when tests in the PR involve time, randomness, timers, network, ordering or shared state; flag ' +
    'patterns that make tests pass or fail nondeterministically.',
  body: `# Flaky Tests

A flaky test fails without a code change. It erodes trust in CI and hides real
failures. Flag the patterns below in added or changed tests.

## Patterns to flag
- **Real time**: \`Date.now()\`, \`new Date()\` compared to hardcoded values;
  \`setTimeout\` / \`sleep\` to "wait for" async work. Use fake timers or await the
  actual promise / condition.
- **Randomness**: \`Math.random()\`, random UUIDs or faker data without a seed,
  asserted against exact values.
- **Ordering**: asserting array order from an unordered source (DB query
  without ORDER BY, \`Promise.all\` side effects, object key order from a Set/Map
  built concurrently).
- **Shared state**: tests that depend on a previous test's data, module-level
  mutable state not reset in \`beforeEach\`, a shared DB without cleanup,
  \`.only\` / order-dependent suites.
- **Real network / external services** in unit tests.
- **Tight timeouts** or performance assertions on wall-clock time.
- **Env / locale / timezone** dependence (\`toLocaleString\`, TZ-sensitive dates).

## Severity
- **WARNING** — the pattern can plausibly fail in CI (real sleep for async
  completion, unordered query asserted in order, shared mutable state).
- **SUGGESTION** — low-probability flakiness (generous timeouts, seeded
  randomness that is merely unusual).

## Example
\`\`\`ts
startJob();
await new Promise((r) => setTimeout(r, 100)); // WARNING: races the job
expect(getStatus()).toBe('done');
\`\`\`
Suggest awaiting the job's promise or polling with a condition + timeout.`,
};

export const ROUTE_SIGNATURE_BREAKING_CHANGE_SKILL: SeedSkill = {
  name: 'route-signature-breaking-change',
  type: 'rubric',
  description:
    'Use when a PR touches HTTP route definitions (path, method, params, query, body schema, status codes); ' +
    'flag any change that breaks an existing client and is not versioned or backward compatible.',
  body: `# Route Signature Breaking Change

An existing client was written against the OLD route. Compare old vs new for
every route the diff touches; anything that makes an old, valid call fail or
behave differently is a breaking change.

## Breaking — flag these
- **Path changed or removed**: \`/users/:id\` → \`/accounts/:id\`, a route deleted,
  a path param renamed (\`:id\` → \`:userId\`) when clients build the URL.
- **Method changed**: \`POST\` → \`PUT\`, \`GET\` → \`POST\`.
- **New REQUIRED input**: a new required body field, query param or header;
  an optional field made required.
- **Input narrowed**: stricter validation (min/max, enum values removed, a
  format added) that rejects inputs the old version accepted.
- **Type changed** on a request field (string → number, single → array).
- **Status codes changed** for the same outcome (201 → 200, 404 → 400, 200 →
  204 with no body).
- **Auth added** to a previously public route (legitimate, but still breaking —
  must be called out).

## Not breaking
- A new route; a new OPTIONAL input with a default; a relaxed validation.

## Severity
- **CRITICAL** — a breaking change to an existing route with no versioning
  (\`/v2\`), no deprecation path, and no evidence all clients are updated in the
  same PR.
- **WARNING** — breaking but mitigated (old route kept as an alias, versioned
  path added, clients updated in the diff) or only affects an internal route.
- **SUGGESTION** — non-breaking but risky (e.g. new optional field whose
  default changes behaviour).

## Example
\`\`\`diff
- app.get('/orders/:id', …)
+ app.get('/orders/:orderId/details', …)
\`\`\`
→ CRITICAL: "GET /orders/:id removed; existing clients will get 404. Keep the old
path as an alias or version the API."`,
};

/** Seeded skills in the order they are linked to the Test Quality Reviewer. */
export const TEST_QUALITY_SKILLS: SeedSkill[] = [
  UNTESTED_BRANCHES_SKILL,
  MISSING_CORNER_CASES_SKILL,
  OVER_MOCKING_SKILL,
  FLAKY_TESTS_SKILL,
];

/** Seeded skills linked to the API Contract Reviewer. */
export const API_CONTRACT_SKILLS: SeedSkill[] = [ROUTE_SIGNATURE_BREAKING_CHANGE_SKILL];
