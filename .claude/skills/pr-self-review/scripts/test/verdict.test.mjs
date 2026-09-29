import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { hookInput, makeRepo, review } from "./helpers.mjs";

const repos = [];
function repo() {
  const r = makeRepo();
  repos.push(r);
  return r;
}
after(() => repos.forEach((r) => r.cleanup()));

const ROUTE = "server/src/modules/pulls/routes.ts";
const routeWithDb = 'import { eq } from "drizzle-orm";\nexport const r = eq;\n';
const critical = (extra = {}) => ({
  skill: "onion-architecture",
  rule: "routes-no-db",
  severity: "CRITICAL",
  file: ROUTE,
  line: 1,
  title: "route imports drizzle-orm",
  evidence: 'import { eq } from "drizzle-orm";',
  fix: "move the query into the repository",
  verified: true,
  ...extra,
});
const waiver = (extra = {}) => ({
  rule: "onion-architecture:routes-no-db",
  file: ROUTE,
  reason: "false positive: type-only import",
  expires: "2999-01-01",
  author: "test",
  ...extra,
});
const gateOpen = (r) => r.run("gate.mjs", ["--hook"], { input: hookInput("git push -u origin feature") }).code === 0;

describe("finalize → verdict", () => {
  test("a verified CRITICAL blocks; the report and verdict say why", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    const res = review(r, [critical()]);
    assert.equal(res.code, 1);
    assert.match(res.stdout, /PR self-review — BLOCK/);
    const v = r.state("verdict.json");
    assert.equal(v.verdict, "BLOCK");
    assert.deepEqual(v.criticals.map((c) => c.rule), ["onion-architecture:routes-no-db"]);
  });

  test("a CRITICAL rejected by the verify pass becomes HIGH and does not block", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    const res = review(r, [critical({ verified: false })]);
    assert.equal(res.code, 0);
    assert.equal(r.state("verdict.json").counts.HIGH, 1);
  });

  test("a CRITICAL from a skill without a CRITICAL tier is downgraded", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    assert.equal(review(r, [critical({ skill: "fastify-best-practices", rule: "x" })]).code, 0);
  });

  test("a CRITICAL without the verify pass is rejected as bad input", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    const res = review(r, [critical({ verified: undefined })]);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /needs "verified"/);
  });

  test("a finding for a file the skill was not given is rejected", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    assert.equal(review(r, [critical({ file: "client/src/x.tsx" })]).code, 2);
  });

  test("changes made during the review abort finalize", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    r.run("collect.mjs");
    r.run("checks.mjs");
    r.write(ROUTE, "export const r = 1;\n");
    r.writeFindings([]);
    assert.equal(r.run("finalize.mjs").code, 3);
  });

  test("PASS writes a PR body with checks, follow-ups and the attribution line", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    r.commitAll("feat: pulls route");
    const res = review(r, [critical({ severity: "HIGH", verified: undefined, title: "missing schema" })]);
    assert.equal(res.code, 0);
    const body = r.read(".git/pr-self-review/pr-body.md");
    assert.match(body, /## Summary/);
    assert.match(body, /feat: pulls route/);
    assert.match(body, /## Follow-ups\n\n- \[ \] server\/src\/modules\/pulls\/routes\.ts:1 — missing schema/);
    assert.match(body, /Generated with \[Claude Code\]/);
  });
});

describe("waivers", () => {
  test("a valid waiver turns BLOCK into PASS and is listed as waived", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    r.write(".pr-self-review-waivers.json", JSON.stringify({ waivers: [waiver()] }));
    const res = review(r, [critical()]);
    assert.equal(res.code, 0);
    assert.match(res.stdout, /## WAIVED \(1\)/);
    assert.equal(r.state("verdict.json").waived.length, 1);
    assert.match(r.read(".git/pr-self-review/pr-body.md"), /## Waived findings/);
  });

  test("skill:* waivers match any rule of that skill", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    r.write(".pr-self-review-waivers.json", JSON.stringify({ waivers: [waiver({ rule: "onion-architecture:*" })] }));
    assert.equal(review(r, [critical()]).code, 0);
  });

  test("expired or incomplete waivers do not apply", () => {
    for (const w of [waiver({ expires: "2000-01-01" }), waiver({ reason: "" })]) {
      const r = repo();
      r.write(ROUTE, routeWithDb);
      r.write(".pr-self-review-waivers.json", JSON.stringify({ waivers: [w] }));
      const res = review(r, [critical()]);
      assert.equal(res.code, 1);
      assert.match(res.stdout, /## Warnings/);
    }
  });

  test("an edited migration cannot be waived", () => {
    const r = repo();
    r.write("server/src/db/migrations/0000_init.sql", "drop table a;\n");
    r.write(
      ".pr-self-review-waivers.json",
      JSON.stringify({ waivers: [waiver({ rule: "deterministic:migration-edited", file: "server/src/db/migrations/**" })] }),
    );
    assert.equal(review(r).code, 1);
  });
});

describe("gate", () => {
  test("closed without a review, open after PASS, closed again once the files change", () => {
    const r = repo();
    r.write(ROUTE, "export const r = 1;\n");
    assert.equal(gateOpen(r), false);
    assert.equal(review(r).code, 0);
    assert.equal(gateOpen(r), true);
    r.commitAll(); // committing the reviewed changes keeps the gate open
    assert.equal(gateOpen(r), true);
    r.write(ROUTE, "export const r = 2;\n");
    const res = r.run("gate.mjs", ["--hook"], { input: hookInput("git push") });
    assert.equal(res.code, 2);
    assert.match(res.stderr, /stale/);
  });

  test("stays closed on BLOCK and lists the CRITICALs", () => {
    const r = repo();
    r.write(ROUTE, routeWithDb);
    review(r, [critical()]);
    const res = r.run("gate.mjs", ["--hook"], { input: hookInput("gh pr create --fill") });
    assert.equal(res.code, 2);
    assert.match(res.stderr, /BLOCK: 1 CRITICAL[\s\S]*routes-no-db/);
  });

  test("--hook only reacts to push / PR commands in command position", () => {
    const r = repo();
    const gated = ["git push", "cd x && git push -u origin b", "A=1 git push", "git -C . push", "gh pr create", "gh pr merge 3"];
    const free = ["git status", 'echo "git push"', 'grep "gh pr create" f', "git pushx", "gh pr view"];
    for (const c of gated) assert.equal(r.run("gate.mjs", ["--hook"], { input: hookInput(c) }).code, 2, c);
    for (const c of free) assert.equal(r.run("gate.mjs", ["--hook"], { input: hookInput(c) }).code, 0, c);
    const nonBash = JSON.stringify({ tool_name: "Read", tool_input: { command: "git push" } });
    assert.equal(r.run("gate.mjs", ["--hook"], { input: nonBash }).code, 0);
  });

  test("--git (pre-push): gates feature branches; main, tags, deletions and the human bypass pass", () => {
    const r = repo();
    r.write(ROUTE, "export const r = 1;\n");
    const sha = "a".repeat(40);
    const zero = "0".repeat(40);
    const push = (remoteRef, localSha = sha, env) =>
      r.run("gate.mjs", ["--git"], { input: `refs/heads/x ${localSha} ${remoteRef} ${zero}\n`, env }).code;
    assert.equal(push("refs/heads/feature"), 1);
    assert.equal(push("refs/heads/main"), 0);
    assert.equal(push("refs/tags/v1"), 0);
    assert.equal(push("refs/heads/feature", zero), 0);
    assert.equal(push("refs/heads/feature", sha, { PR_SELF_REVIEW_SKIP: "1" }), 0);
  });

  test("--hook ignores the human bypass variable", () => {
    const r = repo();
    const res = r.run("gate.mjs", ["--hook"], { input: hookInput("git push"), env: { PR_SELF_REVIEW_SKIP: "1" } });
    assert.equal(res.code, 2);
  });
});
