// Which skill reviews which changed files. Source of truth for routing — routing.md explains it.
// A rule only fires if its skill is actually installed in .claude/skills/.
import { matchesAny } from "./lib.mjs";

const UI_CODE = ["client/src/**/*.{ts,tsx}"];
const BACKEND_CODE = ["server/src/**/*.ts", "reviewer-core/src/**/*.ts"];
const BACKEND_TESTS = ["server/test/**/*.ts", "reviewer-core/test/**/*.ts"];
const ALL_CODE = [...UI_CODE, ...BACKEND_CODE, "e2e/**/*.ts"];
const MIGRATIONS = ["server/src/db/migrations/**"];

/** Skills that are workflows, not review checklists. */
export const IGNORED_SKILLS = ["engineering-insights", "mermaid-diagram", "pr-self-review"];

export const RULES = [
  // --- UI ---------------------------------------------------------------------
  { skill: "frontend-architecture", group: "ui", include: UI_CODE, exclude: ["client/src/vendor/**"] },
  {
    skill: "react-best-practices",
    group: "ui",
    include: ["client/src/**/*.tsx", "client/src/**/use*.ts", "client/src/**/hooks/**/*.ts"],
  },
  {
    skill: "next-best-practices",
    group: "ui",
    include: ["client/src/app/**/*.{ts,tsx}", "client/src/middleware.ts", "client/next.config.*"],
  },
  { skill: "react-testing-library", group: "ui", include: ["client/**/*.test.{ts,tsx}", "client/src/test/**"] },

  // --- Backend ----------------------------------------------------------------
  {
    skill: "onion-architecture",
    group: "backend",
    // tests included: onion-architecture/testing.md owns "a test at the right layer"
    include: [...BACKEND_CODE, ...BACKEND_TESTS, "server/.dependency-cruiser*", "reviewer-core/.dependency-cruiser*"],
    exclude: MIGRATIONS,
  },
  {
    skill: "fastify-best-practices",
    group: "backend",
    include: ["server/src/**/routes.ts", "server/src/**/routes/**/*.ts", "server/src/platform/**/*.ts", "server/src/{app,server}.ts"],
  },
  {
    skill: "drizzle-orm-patterns",
    group: "backend",
    include: [
      "server/src/**/repository.ts",
      "server/src/**/repository/**/*.ts",
      "server/src/**/*.repo.ts",
      "server/src/**/mappers.ts",
      "server/src/db/**/*.ts",
    ],
  },
  {
    skill: "postgresql-table-design",
    group: "backend",
    include: ["server/src/db/schema/**/*.ts", "server/src/db/schema.ts", "server/src/db/migrations/*.sql"],
    onlyAdded: MIGRATIONS, // a new migration is design input; an edited one is a deterministic CRITICAL
  },

  // --- Full-stack -------------------------------------------------------------
  {
    skill: "security",
    group: "full-stack",
    include: [
      ...ALL_CODE,
      ".github/workflows/**",
      "scripts/**",
      ".githooks/**",
      ".claude/settings.json", // hooks run shell commands
      ".claude/**/*.{mjs,js,sh}",
      "**/Dockerfile",
      "docker-compose*.yml",
      "**/package.json", // new dependencies = supply chain
    ],
  },
  {
    skill: "zod",
    group: "full-stack",
    include: ALL_CODE,
    contentMatch: /from\s+["']zod["']|\bz\.(object|string|number|enum|array|infer|union|discriminatedUnion)\b/,
  },
  { skill: "typescript-expert", group: "full-stack", include: [...ALL_CODE, "**/tsconfig*.json"] },
];

const REVIEWABLE_SCOPES = ["frontend", "backend", "full-stack"];

/**
 * @param files      changed files (deleted ones are skipped — nothing to review)
 * @param installed  Map from installedSkills()
 * @param readText   (path) => string|null, for contentMatch
 * @returns {{ plan: {skill, group, files}[], unrouted: string[], warnings: string[] }}
 */
export function route(files, installed, readText) {
  const live = files.filter((f) => f.status !== "D");
  const plan = [];
  const routed = new Set();

  for (const rule of RULES) {
    if (!installed.has(rule.skill)) continue;
    const hits = live.filter((f) => {
      if (!matchesAny(f.path, rule.include) || matchesAny(f.path, rule.exclude)) return false;
      if (rule.onlyAdded && matchesAny(f.path, rule.onlyAdded) && f.status !== "A") return false;
      if (rule.contentMatch && !rule.contentMatch.test(readText(f.path) ?? "")) return false;
      return true;
    });
    if (!hits.length) continue;
    hits.forEach((f) => routed.add(f.path));
    plan.push({ skill: rule.skill, group: rule.group, files: hits });
  }

  const warnings = [];
  const ruled = new Set(RULES.map((r) => r.skill));
  for (const skill of installed.values()) {
    if (ruled.has(skill.name) || IGNORED_SKILLS.includes(skill.name)) continue;
    if (!skill.scope) {
      warnings.push(`skill "${skill.name}" has no Scope row in .claude/skills/README.md — not routed`);
    } else if (REVIEWABLE_SCOPES.includes(skill.scope.toLowerCase())) {
      warnings.push(`skill "${skill.name}" (Scope: ${skill.scope}) has no routing rule — add one to scripts/routing.mjs`);
    }
  }

  const unrouted = live.map((f) => f.path).filter((p) => !routed.has(p));
  return { plan, unrouted, warnings };
}
