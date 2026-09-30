import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { renderSkillBlocks, skillsLogLine } from '../src/modules/reviews/helpers.js';

/**
 * L02 — how active skills reach the review prompt. The runner loads
 * `linkedSkills(agentId, { onlyActive: true })` (already filtered + ordered by
 * the DB; see agent-skills.it.test.ts) and renders one block per skill.
 */
const rows = [
  { name: 'untested-branches', body: '# Untested Branches\nflag uncovered else arms', enabled: true },
  { name: 'over-mocking', body: '# Over-Mocking\nflag mocked unit under test', enabled: false },
  { name: 'flaky-tests', body: '# Flaky Tests\nflag real sleeps', enabled: true },
];
const active = rows.filter((r) => r.enabled);

describe('renderSkillBlocks', () => {
  it('renders `### name` + body per skill, preserving order', () => {
    expect(renderSkillBlocks(active)).toEqual([
      '### untested-branches\n# Untested Branches\nflag uncovered else arms',
      '### flaky-tests\n# Flaky Tests\nflag real sleeps',
    ]);
  });

  it('returns [] for no skills', () => {
    expect(renderSkillBlocks([])).toEqual([]);
  });
});

describe('skillsLogLine', () => {
  it('names active skills in order', () => {
    expect(skillsLogLine(active)).toBe('skills: 2 active (untested-branches, flaky-tests)');
  });
  it('says none when empty', () => {
    expect(skillsLogLine([])).toBe('skills: none');
  });
});

describe('skills in the assembled prompt', () => {
  it('includes a Skills section with each active skill in order, not the disabled one', () => {
    const { assembly, messages } = assemblePrompt({
      system: 'Review the tests in this PR for quality issues.',
      skills: renderSkillBlocks(active),
      diff: 'diff --git a/x.ts b/x.ts',
    });
    const user = messages[1]!.content as string;
    expect(user).toContain('## Skills / rules');
    const a = user.indexOf('### untested-branches');
    const b = user.indexOf('### flaky-tests');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(user).not.toContain('over-mocking');
    // Skills are instructions — never wrapped as untrusted data.
    expect(assembly.skills).not.toContain('<untrusted');
    expect(assembly.skills).toContain('### untested-branches');
  });

  it('omits the section when no skill is active', () => {
    const { messages, assembly } = assemblePrompt({
      system: 's',
      skills: renderSkillBlocks([]),
      diff: 'd',
    });
    expect(messages[1]!.content).not.toContain('## Skills / rules');
    expect(assembly.skills).toBeNull();
  });
});
