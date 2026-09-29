# Finding format, subagent briefs, outputs

## Finding (what a skill reviewer returns, and what goes into `run/findings.json`)

```json
{
  "skill": "onion-architecture",
  "rule": "routes-no-db",
  "severity": "CRITICAL",
  "file": "server/src/modules/pulls/routes.ts",
  "line": 14,
  "title": "route imports drizzle-orm and queries the DB",
  "evidence": "import { eq } from \"drizzle-orm\";",
  "fix": "move the query into PullsRepository and call it through the service",
  "verified": true
}
```

| Field | Rules |
|---|---|
| `skill` | the plan entry's skill, exactly as written |
| `rule` | short kebab-case id. Use the skill's own id where it has one (onion's "Enforced by" column, zod's prefixes). finalize prefixes it with `skill:` |
| `severity` | `CRITICAL` · `HIGH` · `MEDIUM` · `LOW`, taken from the **skill's own** severity table |
| `file` | repo-relative, must be in the entry's `pending` list |
| `line` | line in the **new** file (the `+` side of the hunk). Omit it for whole-file findings |
| `evidence` | the changed line(s), quoted verbatim. Required for CRITICAL |
| `verified` | CRITICAL only: `true` / `false`, from the verify pass. finalize rejects a CRITICAL without it |

Deterministic findings use `rule: deterministic:<id>`, and tool checks use `tool:typecheck`, `tool:depcruise` and `tool:test`.
Scripts produce both, so they never go into `findings.json`.

## Skill reviewer brief (one subagent per plan entry; fill in the `<>` placeholders)

```
You review local changes against ONE project skill, before a PR exists.
Skill: <skill> — read <skillPath> first, then only the companion files it links that
are relevant to these files.
Diff to review: <diffPath> (the `+` lines are the change; untracked files appear as whole new files).
Files: <pending list>. You may read these files in full for context.

Rules:
- Report only problems INTRODUCED or made worse by the changed lines. Pre-existing code is out of scope.
- Severity comes from the skill's own table. Use CRITICAL only when the skill marks that rule
  CRITICAL AND you can quote the changed line that breaks it. If you're unsure, use HIGH.
- Nothing that typecheck, depcruise or tests already catch (they run separately), and no style nits the skill doesn't state.
- security: HIGH confidence only; name the concrete exploit path.
- Every finding needs file, line on the new side, the rule, verbatim evidence and a one-line fix.
Return ONLY a JSON array of findings in the format of report-format.md (`[]` if clean). No prose.
```

## Verifier brief (one subagent per CRITICAL)

```
A reviewer claims this CRITICAL finding. Try to REFUTE it. Default to "not verified" unless it holds.
Finding: <finding JSON>
Rule source: <skillPath> (find the rule it cites and check it is marked CRITICAL there).
Check:
1. The quoted evidence exists on a changed line of <file> at or near line <line>.
2. The skill actually defines this rule as CRITICAL and it applies to this file or layer.
3. Nothing nearby already handles it (an upstream guard, a composition root, a framework default, a known-violations baseline).
Answer ONLY: {"verified": true|false, "reason": "<one sentence>"}
```

## Outputs (all under `.git/pr-self-review/`)

| File | Written by | Purpose |
|---|---|---|
| `run/plan.json`, `run/diffs/*.diff` | collect | this run's plan, overwritten each run |
| `run/findings.json` | you (step 5) | the model's findings after verification |
| `checks.json` | checks | tool results, reused while diffHash is unchanged |
| `cache.json` | finalize | `(skill, skillHash, file, fileHash) → findings` |
| `verdict.json` | finalize | what the gate reads: `{verdict, diffHash, base, criticals, waived, …}` |
| `report.md` | finalize | the report printed to the terminal |
| `pr-body.md` | finalize (PASS) | PR description draft: Summary for you to fill, then Checks, Follow-ups (HIGH) and Waived |

Report order: CRITICAL, then HIGH, MEDIUM, LOW, then WAIVED, Checks and Warnings (unrouted files,
skills without a routing rule, invalid or expired waivers). The PR body ends with the Claude Code attribution line.
