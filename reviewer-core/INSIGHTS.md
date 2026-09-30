# INSIGHTS — reviewer-core
Lessons learned while working in this package (by humans or agents).
Maintained via the engineering-insights skill (.claude/skills/engineering-insights) — read it
before work, add only verified non-obvious lessons after. Newest first within a section.
Keep each entry ≤5 lines. Agents only append; changing, moving to AGENTS.md or deleting existing entries needs the user's OK.

<!-- Entry format:
### YYYY-MM-DD — short title
- What: specific fact / symptom / error text
- Why: cause or rationale
- Rule: what to do next time
- Evidence: path/file.ts:42 · command · commit
- Also in: <other-pkg>/INSIGHTS.md   (cross-package only)
-->

## What Works
<!-- Approaches that proved themselves, ideally after an alternative failed -->

## What Doesn't Work
<!-- Failed approaches / anti-patterns, with the reason -->

### 2026-09-29 — wrapping `skills` / `memory` in `<untrusted>` disarms them
- What: the obvious "fix" for community skill bodies reaching the prompt unwrapped is to send them through `wrapUntrusted` like the diff. It silently breaks reviews: INJECTION_GUARD tells the model everything inside those delimiters is DATA and to ignore instructions in it — and a skill IS instructions ("flag secrets", "check for N+1").
- Why: the guard's blast radius is the delimiter, so wrapping is only correct for content the model must not obey. Skills and memory are content it must obey.
- Rule: never wrap skills/memory as untrusted. Neutralize delimiters inside them (`neutralizeDelimiters`, so a body can't forge or close a block) and vet what a community skill *says* at install time, not in prompt assembly.
- Evidence: src/prompt.ts (skillsBlock/memoryBlock comment) · test/prompt.test.ts "neutralizes delimiters in a skill body without wrapping skills as data"

## Codebase Patterns
<!-- Non-obvious conventions or decisions with rationale, not already in AGENTS.md -->

## Tool & Library Notes
<!-- Quirks of dependencies and tools -->

## Recurring Errors & Fixes
<!-- Exact error text → cause → fix -->

## Open Questions
<!-- Unresolved; What + Evidence only; delete once answered -->
