// Throwaway git repos for the pr-self-review tests: a `main` with fake skills + the real
// scripts copied in (so the gate treats the temp repo as "its" repo), then a feature branch.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS_REL = ".claude/skills/pr-self-review/scripts";

const SKILLS = {
  "frontend-architecture": "Frontend",
  "react-best-practices": "Frontend",
  "next-best-practices": "Frontend",
  "onion-architecture": "Backend",
  "fastify-best-practices": "Backend",
  "postgresql-table-design": "Backend",
  security: "Full-stack",
  zod: "Full-stack",
  "engineering-insights": "Shared",
};
const BLOCKING = new Set(["frontend-architecture", "react-best-practices", "onion-architecture", "security", "zod"]);

export function skillBody(name, extra = "") {
  const tier = BLOCKING.has(name) ? "- **CRITICAL** — block the change." : "- **HIGH** — fix soon.";
  return `---\nname: ${name}\ndescription: test skill\n---\n\n# ${name}\n\n${tier}\n${extra}`;
}

export function makeRepo({ extraSkills = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "pr-self-review-"));
  const g = (...args) => git(root, ...args);
  g("init", "-q", "-b", "main");
  const skills = { ...SKILLS, ...extraSkills };
  const rows = Object.entries(skills).map(([n, scope]) => `| [${n}](${n}/SKILL.md) | ${scope} | test |`);
  write(root, ".claude/skills/README.md", `# Skills\n\n| Skill | Scope | Description |\n|---|---|---|\n${rows.join("\n")}\n`);
  for (const name of Object.keys(skills)) write(root, `.claude/skills/${name}/SKILL.md`, skillBody(name));
  cpSync(SCRIPTS_SRC, join(root, SCRIPTS_REL), { recursive: true, filter: (src) => !src.includes(`${join("scripts", "test")}`) });
  write(root, "server/src/db/migrations/0000_init.sql", "create table a (id int);\n");
  write(root, "server/src/db/migrations/meta/_journal.json", '{"entries":[0]}\n');
  write(root, "server/src/vendor/shared/contracts/x.ts", "export const X = 1;\n");
  write(root, "client/src/vendor/shared/contracts/x.ts", "export const X = 1;\n");
  write(root, "server/src/modules/pulls/service.ts", "export const svc = 1;\n");
  g("add", "-A");
  g("commit", "-q", "-m", "init");
  g("checkout", "-q", "-b", "feature");
  return {
    root,
    git: g,
    write: (path, text) => write(root, path, text),
    read: (path) => readFileSync(join(root, path), "utf8"),
    rm: (path) => rmSync(join(root, path)),
    commitAll: (msg = "wip") => {
      g("add", "-A");
      g("commit", "-q", "-m", msg);
    },
    run: (script, args = [], opts = {}) => runScript(root, script, args, opts),
    state: (file) => JSON.parse(readFileSync(join(root, ".git/pr-self-review", file), "utf8")),
    writeFindings: (findings) => write(root, ".git/pr-self-review/run/findings.json", JSON.stringify({ findings })),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function git(root, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function runScript(root, script, args, { input, env } = {}) {
  const r = spawnSync("node", [join(root, SCRIPTS_REL, script), ...args], {
    cwd: root,
    input,
    encoding: "utf8",
    env: { ...process.env, PR_SELF_REVIEW_SKIP: "", PR_SELF_REVIEW_BASE: "", ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** collect → checks → (findings) → finalize, the way the skill runs it. */
export function review(repo, findings = []) {
  const c = repo.run("collect.mjs");
  if (c.code !== 0) throw new Error(c.stderr);
  repo.run("checks.mjs");
  repo.writeFindings(findings);
  return repo.run("finalize.mjs");
}

export function hookInput(command) {
  return JSON.stringify({ tool_name: "Bash", tool_input: { command } });
}
