import type { CommunitySkill } from '@devdigest/shared';

/**
 * Community skill catalog — a CURATED, hard-coded allowlist, vetted by hand.
 *
 * - `stars` / `lang` are a snapshot of the source repo taken 2026-09-30, not live
 *   GitHub data (no GitHub call is made to list the catalog).
 * - Every `url` is a raw https SKILL.md that returned 200 when the entry was added.
 * - Importing an entry is NOT a trust decision: the client sends the entry's `url`
 *   through POST /skills/import/preview-url (same SSRF-safe fetcher and parser as
 *   any URL), the user must tick the trust confirmation, and the skill is saved
 *   DISABLED with source 'community' until someone vets and enables it.
 * - To add an entry: read the SKILL.md end to end first — it becomes instructions
 *   in an agent's prompt.
 */

const ANTHROPIC = { repo: 'anthropics/skills', stars: 179104, lang: 'Python' } as const;
const SUPERPOWERS = { repo: 'obra/superpowers', stars: 293277, lang: 'Shell' } as const;

const raw = (repo: string, name: string) =>
  `https://raw.githubusercontent.com/${repo}/main/skills/${name}/SKILL.md`;

function entry(
  src: { repo: string; stars: number; lang: string },
  name: string,
  type: CommunitySkill['type'],
  desc: string,
): CommunitySkill {
  return {
    id: `${src.repo}:${name}`,
    name,
    repo: src.repo,
    stars: src.stars,
    lang: src.lang,
    desc,
    url: raw(src.repo, name),
    type,
  };
}

export const COMMUNITY_SKILLS: readonly CommunitySkill[] = Object.freeze([
  entry(
    ANTHROPIC,
    'webapp-testing',
    'custom',
    'Test local web apps with Playwright: verify frontend behaviour, debug UI, capture screenshots and browser logs.',
  ),
  entry(
    ANTHROPIC,
    'mcp-builder',
    'convention',
    'Guide for building high-quality MCP servers (Python FastMCP or Node/TypeScript SDK) with well-designed tools.',
  ),
  entry(
    ANTHROPIC,
    'skill-creator',
    'custom',
    'Create, edit and evaluate skills: draft from scratch, run evals, benchmark and tune the description for triggering.',
  ),
  entry(
    SUPERPOWERS,
    'test-driven-development',
    'convention',
    'Use when implementing any feature or bugfix: write the failing test first, then the implementation.',
  ),
  entry(
    SUPERPOWERS,
    'systematic-debugging',
    'rubric',
    'Use on any bug, test failure or unexpected behaviour: find the root cause before proposing a fix.',
  ),
  entry(
    SUPERPOWERS,
    'requesting-code-review',
    'rubric',
    'Use when finishing a task or major feature, or before merging, to check the work meets its requirements.',
  ),
  entry(
    SUPERPOWERS,
    'receiving-code-review',
    'rubric',
    'Use when receiving review feedback: verify each suggestion technically instead of agreeing or applying it blindly.',
  ),
  entry(
    SUPERPOWERS,
    'verification-before-completion',
    'rubric',
    'Use before claiming work is done, fixed or passing: run the verification commands and show the evidence first.',
  ),
]);
