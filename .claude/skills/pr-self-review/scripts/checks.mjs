#!/usr/bin/env node
// Step 2: tool checks for the packages the diff touches — typecheck, architecture (depcruise)
// and related unit tests. A red check is a CRITICAL finding. Result is reused while diffHash
// is unchanged. Runs each package with its own manager (pnpm: server/client, npm: reviewer-core/e2e).
//
//   node checks.mjs [--fresh]
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson, repoRoot, runDir, stateDir, writeJson } from "./lib.mjs";

const TIMEOUT_MS = 10 * 60 * 1000;
const TAIL_LINES = 40;

const root = repoRoot();
const plan = readJson(join(runDir(root), "plan.json"), null);
if (!plan) {
  console.error("pr-self-review: run collect.mjs first (no plan.json)");
  process.exit(2);
}

const cachePath = join(stateDir(root), "checks.json");
const previous = readJson(cachePath, null);
if (!process.argv.includes("--fresh") && previous?.diffHash === plan.diffHash) {
  print(previous, true);
  process.exit(0);
}

const live = plan.files.filter((f) => f.status !== "D").map((f) => f.path);
const touches = (prefix) => plan.files.some((f) => f.path.startsWith(prefix));
const testable = (pkg, exclude = /$^/) =>
  live
    .filter((p) => p.startsWith(`${pkg}/src/`) && /\.(ts|tsx)$/.test(p) && !exclude.test(p))
    .map((p) => p.slice(pkg.length + 1));

const tasks = [];
if (touches("client/")) {
  tasks.push(["client", "typecheck", "pnpm", ["typecheck"]]);
  const rel = testable("client");
  if (rel.length) tasks.push(["client", "test", "pnpm", ["exec", "vitest", "related", "--run", "--passWithNoTests", ...rel]]);
}
if (touches("server/")) {
  tasks.push(["server", "typecheck", "pnpm", ["typecheck"]]);
  tasks.push(["server", "depcruise", "pnpm", ["exec", "depcruise", "src", "--config", ".dependency-cruiser.cjs", "--ignore-known", "--output-type", "err"]]);
  const rel = testable("server", /\.it\.test\.ts$/);
  if (rel.length) {
    tasks.push(["server", "test", "pnpm", ["exec", "vitest", "related", "--run", "--passWithNoTests", "--exclude", "**/*.it.test.ts", ...rel]]);
  }
}
// reviewer-core type-checks against server/src/vendor/shared, so a contract change touches it too.
if (touches("reviewer-core/") || touches("server/src/vendor/shared/")) {
  tasks.push(["reviewer-core", "typecheck", "npm", ["run", "typecheck"]]);
}
if (touches("reviewer-core/")) {
  tasks.push(["reviewer-core", "depcruise", "npm", ["run", "arch:check"]]);
  const rel = testable("reviewer-core");
  if (rel.length) tasks.push(["reviewer-core", "test", "npm", ["exec", "--no", "--", "vitest", "related", "--run", "--passWithNoTests", ...rel]]);
}
if (touches("e2e/")) tasks.push(["e2e", "typecheck", "npm", ["run", "typecheck"]]);

const results = await Promise.all(tasks.map(([pkg, check, cmd, args]) => run(pkg, check, cmd, args)));
const skippedIntegration = touches("server/") ? ["server integration (*.it.test.ts): needs Postgres/Docker — runs in CI"] : [];
const findings = results
  .filter((r) => r.status === "failed")
  .map((r) => ({
    source: "tool",
    rule: `tool:${r.check}`,
    severity: "CRITICAL",
    file: `${r.pkg}/`,
    title: `${r.pkg} ${r.check} failed`,
    evidence: r.outputTail,
    fix: `Run \`cd ${r.pkg} && ${r.command}\` and fix the errors.`,
  }));

const out = { diffHash: plan.diffHash, createdAt: new Date().toISOString(), results, skipped: skippedIntegration, findings };
writeJson(cachePath, out);
print(out, false);

function run(pkg, check, cmd, args) {
  const command = `${cmd} ${args.join(" ")}`;
  if (!existsSync(join(root, pkg, "node_modules"))) {
    return Promise.resolve({ pkg, check, command, status: "skipped", reason: `${pkg}/node_modules missing — install deps` });
  }
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: join(root, pkg), env: { ...process.env, CI: "1", FORCE_COLOR: "0" } });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    const done = (status) => {
      clearTimeout(timer);
      const outputTail = output.trimEnd().split("\n").slice(-TAIL_LINES).join("\n");
      resolve({ pkg, check, command, status, durationMs: Date.now() - started, outputTail });
    };
    child.on("error", () => done("failed"));
    child.on("close", (code) => done(code === 0 ? "passed" : "failed"));
  });
}

function print(res, cached) {
  console.log(`pr-self-review checks${cached ? " (cached for this diff)" : ""}:`);
  if (!res.results.length) console.log("  no package touched — nothing to run");
  for (const r of res.results) {
    const time = r.durationMs != null ? ` ${(r.durationMs / 1000).toFixed(1)}s` : "";
    console.log(`  ${r.status.padEnd(7)} ${r.pkg} ${r.check}${time}${r.reason ? ` — ${r.reason}` : ""}`);
  }
  for (const s of res.skipped) console.log(`  skipped ${s}`);
  for (const f of res.findings) console.log(`\n--- ${f.title} (${f.fix})\n${f.evidence}`);
}
