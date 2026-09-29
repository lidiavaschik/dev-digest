import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { makeRepo, skillBody } from "./helpers.mjs";

const repos = [];
function repo(opts) {
  const r = makeRepo(opts);
  repos.push(r);
  return r;
}
after(() => repos.forEach((r) => r.cleanup()));

function plan(r) {
  const res = r.run("collect.mjs");
  assert.equal(res.code, 0, res.stderr);
  return r.state("run/plan.json");
}
const skillsFor = (p, path) => p.plan.filter((e) => e.files.includes(path)).map((e) => e.skill).sort();

describe("routing", () => {
  test("a Next.js page goes to the UI skills + security, never to backend skills", () => {
    const r = repo();
    r.write("client/src/app/repos/page.tsx", "export default function Page() { return null; }\n");
    assert.deepEqual(skillsFor(plan(r), "client/src/app/repos/page.tsx"), [
      "frontend-architecture",
      "next-best-practices",
      "react-best-practices",
      "security",
    ]);
  });

  test("a backend route goes to onion + fastify + security, never to UI skills", () => {
    const r = repo();
    r.write("server/src/modules/pulls/routes.ts", "export const routes = 1;\n");
    assert.deepEqual(skillsFor(plan(r), "server/src/modules/pulls/routes.ts"), [
      "fastify-best-practices",
      "onion-architecture",
      "security",
    ]);
  });

  test("zod is routed only to files that use zod", () => {
    const r = repo();
    r.write("server/src/modules/pulls/dto.ts", 'import { z } from "zod";\nexport const A = z.object({});\n');
    r.write("server/src/modules/pulls/plain.ts", "export const B = 2;\n");
    const p = plan(r);
    assert.ok(skillsFor(p, "server/src/modules/pulls/dto.ts").includes("zod"));
    assert.ok(!skillsFor(p, "server/src/modules/pulls/plain.ts").includes("zod"));
  });

  test("docs are unrouted, deleted files are not reviewed, workflow skills are never routed", () => {
    const r = repo();
    r.write("docs/notes.md", "# notes\n");
    r.rm("server/src/modules/pulls/service.ts");
    const p = plan(r);
    assert.deepEqual(p.plan, []);
    assert.deepEqual(p.unrouted, ["docs/notes.md"]);
  });

  test("a skill whose Scope has no routing rule produces a warning, not a silent skip", () => {
    const r = repo({ extraSkills: { "graphql-patterns": "Backend" } });
    r.write("server/src/a.ts", "export {};\n");
    assert.match(plan(r).warnings.join("\n"), /graphql-patterns.*no routing rule/);
  });

  test("only skills with a CRITICAL tier can block", () => {
    const r = repo();
    r.write("server/src/modules/pulls/routes.ts", "export {};\n");
    const byName = Object.fromEntries(plan(r).plan.map((e) => [e.skill, e.canBlock]));
    assert.equal(byName["onion-architecture"], true);
    assert.equal(byName["fastify-best-practices"], false);
  });
});

describe("deterministic checks", () => {
  const rules = (p) => p.deterministic.map((f) => f.rule).sort();

  test("editing an existing migration is CRITICAL", () => {
    const r = repo();
    r.write("server/src/db/migrations/0000_init.sql", "create table a (id bigint);\n");
    assert.deepEqual(rules(plan(r)), ["deterministic:migration-edited"]);
  });

  test("appending a migration (+ its journal update) is fine and reaches postgresql-table-design", () => {
    const r = repo();
    r.write("server/src/db/migrations/0001_next.sql", "alter table a add column b int;\n");
    r.write("server/src/db/migrations/meta/_journal.json", '{"entries":[0,1]}\n');
    const p = plan(r);
    assert.deepEqual(rules(p), []);
    assert.deepEqual(skillsFor(p, "server/src/db/migrations/0001_next.sql"), ["postgresql-table-design"]);
  });

  test("a journal edit without a new migration is CRITICAL", () => {
    const r = repo();
    r.write("server/src/db/migrations/meta/_journal.json", '{"entries":[]}\n');
    assert.deepEqual(rules(plan(r)), ["deterministic:migration-edited"]);
  });

  test("a shared contract change must be mirrored in the client copy", () => {
    const r = repo();
    r.write("server/src/vendor/shared/contracts/x.ts", "export const X = 2;\n");
    assert.deepEqual(rules(plan(r)), ["deterministic:shared-contract-not-mirrored"]);
    r.write("client/src/vendor/shared/contracts/x.ts", "export const X = 2;\n");
    assert.deepEqual(rules(plan(r)), []);
  });

  test("hard-coded secrets and .env files are CRITICAL; the evidence is redacted", () => {
    const r = repo();
    const token = ["ghp", "_", "a".repeat(36)].join(""); // built at runtime so this file holds no token
    r.write("server/src/adapters/gh.ts", `export const token = "${token}";\n`);
    r.write("server/.env", "OPENAI_API_KEY=x\n");
    r.write("server/.env.example", "OPENAI_API_KEY=\n");
    const p = plan(r);
    assert.deepEqual(rules(p), ["deterministic:env-file", "deterministic:secret"]);
    const secret = p.deterministic.find((f) => f.rule === "deterministic:secret");
    assert.equal(secret.line, 1);
    assert.ok(!secret.evidence.includes(token));
  });
});

describe("diffHash + cache", () => {
  test("committing reviewed changes keeps the hash; any new edit or untracked file changes it", () => {
    const r = repo();
    r.write("server/src/a.ts", "export const a = 1;\n");
    const h1 = plan(r).diffHash;
    r.commitAll();
    assert.equal(plan(r).diffHash, h1);
    r.write("server/src/a.ts", "export const a = 2;\n");
    const h2 = plan(r).diffHash;
    assert.notEqual(h2, h1);
    r.write("server/src/b.ts", "export {};\n");
    assert.notEqual(plan(r).diffHash, h2);
  });

  test("unchanged files come from the cache; an edited file or an edited SKILL.md is reviewed again", () => {
    const r = repo();
    r.write("server/src/modules/pulls/routes.ts", "export const r = 1;\n");
    r.write("server/src/modules/pulls/repo.ts", "export const q = 1;\n");
    r.run("collect.mjs");
    r.run("checks.mjs");
    r.writeFindings([]);
    assert.equal(r.run("finalize.mjs").code, 0);

    let onion = plan(r).plan.find((e) => e.skill === "onion-architecture");
    assert.deepEqual(onion.pending, []);
    assert.equal(onion.cachedFiles.length, 2);

    r.write("server/src/modules/pulls/repo.ts", "export const q = 2;\n");
    onion = plan(r).plan.find((e) => e.skill === "onion-architecture");
    assert.deepEqual(onion.pending, ["server/src/modules/pulls/repo.ts"]);

    r.write(".claude/skills/onion-architecture/SKILL.md", skillBody("onion-architecture", "new rule\n"));
    onion = plan(r).plan.find((e) => e.skill === "onion-architecture");
    assert.equal(onion.pending.length, 2);
  });
});
