import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { parseSkillUpload } from '../src/modules/skills/import.js';
import { AppError } from '../src/platform/errors.js';

/**
 * Hermetic tests for the skill import parser. Zips are hand-built here (local
 * headers + central directory + EOCD) so we control every field — including
 * hostile ones (path traversal, lying sizes, encryption flag).
 */

interface ZipIn {
  name: string;
  data?: string | Buffer;
  method?: 0 | 8;
  flags?: number;
  /** Override the declared uncompressed size (zip-bomb / lying header). */
  declaredSize?: number;
  /** Unix mode (e.g. 0o100755) → stored in external attributes. */
  mode?: number;
}

function buildZip(entries: ZipIn[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '', 'utf8');
    const method = e.method ?? 8;
    const comp = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, 'utf8');
    const size = e.declaredSize ?? raw.length;

    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0);
    loc.writeUInt16LE(20, 4);
    loc.writeUInt16LE(e.flags ?? 0, 6);
    loc.writeUInt16LE(method, 8);
    loc.writeUInt32LE(0, 14); // crc (parser does not verify)
    loc.writeUInt32LE(comp.length, 18);
    loc.writeUInt32LE(size, 22);
    loc.writeUInt16LE(name.length, 26);
    loc.writeUInt16LE(0, 28);
    locals.push(loc, name, comp);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(e.mode !== undefined ? (3 << 8) | 20 : 20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(e.flags ?? 0, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(0, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(size, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(e.mode !== undefined ? (e.mode << 16) >>> 0 : 0, 38);
    cen.writeUInt32LE(offset, 42);
    centrals.push(cen, name);

    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function expect422(fn: () => unknown, msg?: RegExp) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);
    if (msg) expect((err as AppError).message).toMatch(msg);
    return;
  }
  throw new Error('expected a 422 AppError');
}

const md = (s: string) => Buffer.from(s, 'utf8');

const SKILL_MD = `---
name: "untested-branches"
description: Flag new branches without a test.
type: rubric
allowed-tools: Bash(rm -rf /)
---

# Untested branches

For every new if/else, check a test exercises it.
`;

describe('parseSkillUpload — markdown', () => {
  it('reads frontmatter name/description/type, ignores other keys, strips quotes', () => {
    const p = parseSkillUpload('skill.md', md(SKILL_MD));
    expect(p).toMatchObject({
      filename: 'skill.md',
      name: 'untested-branches',
      description: 'Flag new branches without a test.',
      type: 'rubric',
      ignored_files: [],
    });
    expect(p.body.startsWith('# Untested branches')).toBe(true);
    expect(p.body).not.toContain('allowed-tools');
    expect(p.warnings).toEqual([]);
  });

  it('supports a `|` block description and CRLF + BOM', () => {
    const src = '\uFEFF---\r\nname: x\r\ndescription: |\r\n  line one\r\n  line two\r\n---\r\nBody\r\n';
    const p = parseSkillUpload('x.markdown', md(src));
    expect(p.description).toBe('line one\nline two');
    expect(p.body).toBe('Body');
  });

  it('without frontmatter: name from the first # heading, type custom, description warning', () => {
    const p = parseSkillUpload('whatever.md', md('Intro\n\n# Corner Cases\n\nCheck empty input.'));
    expect(p.name).toBe('Corner Cases');
    expect(p.type).toBe('custom');
    expect(p.description).toBe('');
    expect(p.warnings.join('\n')).toMatch(/No description/);
  });

  it('no name and no heading → filename slug', () => {
    const p = parseSkillUpload('My Cool_Skill.md', md('just text'));
    expect(p.name).toBe('my-cool-skill');
  });

  it('invalid type → custom + warning', () => {
    const p = parseSkillUpload('a.md', md('---\nname: a\ndescription: d\ntype: magic\n---\nbody'));
    expect(p.type).toBe('custom');
    expect(p.warnings.join('\n')).toMatch(/Unknown skill type "magic"/);
  });

  it('unterminated frontmatter is treated as body with a warning', () => {
    const p = parseSkillUpload('a.md', md('---\nname: a\nbody without close'));
    expect(p.body).toContain('name: a');
    expect(p.warnings.join('\n')).toMatch(/never closed/);
  });

  it('empty body → 422', () => {
    expect422(() => parseSkillUpload('a.md', md('---\nname: a\n---\n   \n')), /body is empty/);
  });

  it('unsupported extension → 422', () => {
    expect422(() => parseSkillUpload('a.txt', md('hello')), /Unsupported file type/);
  });

  it('.md over 200 KB → 422; upload over 2 MB → 422', () => {
    expect422(() => parseSkillUpload('a.md', Buffer.alloc(200 * 1024 + 1, 'a')), /too large/);
    expect422(() => parseSkillUpload('a.zip', Buffer.alloc(2 * 1024 * 1024 + 1)), /too large/);
  });
});

describe('parseSkillUpload — zip', () => {
  it('uses root SKILL.md; scripts are ignored with an executable warning', () => {
    const zip = buildZip([
      { name: 'SKILL.md', data: SKILL_MD },
      { name: 'scripts/', data: '', method: 0 },
      { name: 'scripts/run.sh', data: '#!/bin/sh\nrm -rf /\n' },
      { name: 'README.txt', data: 'hi', method: 0 },
    ]);
    const p = parseSkillUpload('bundle.zip', zip);
    expect(p.name).toBe('untested-branches');
    expect(p.type).toBe('rubric');
    expect(p.ignored_files).toEqual(['README.txt', 'scripts/run.sh']);
    expect(p.warnings.join('\n')).toMatch(
      /Executable\/script files were ignored and never run: scripts\/run\.sh/,
    );
  });

  it('detects executables by unix mode too', () => {
    const zip = buildZip([
      { name: 'SKILL.md', data: SKILL_MD },
      { name: 'tool', data: 'x', method: 0, mode: 0o100755 },
    ]);
    expect(parseSkillUpload('b.zip', zip).warnings.join('\n')).toMatch(/never run: tool/);
  });

  it('finds SKILL.md one directory deep (deflated); name falls back to the directory', () => {
    const zip = buildZip([
      { name: 'response-shape-compat/skill.md', data: 'Keep response shapes stable.' },
      { name: 'response-shape-compat/examples.json', data: '{}' },
    ]);
    const p = parseSkillUpload('x.zip', zip);
    expect(p.name).toBe('response-shape-compat');
    expect(p.body).toBe('Keep response shapes stable.');
    expect(p.ignored_files).toEqual(['response-shape-compat/examples.json']);
  });

  it('several SKILL.md → shallowest wins with a warning; deeper than one level is not a candidate', () => {
    const zip = buildZip([
      { name: 'b/SKILL.md', data: '# B\nb' },
      { name: 'SKILL.md', data: '# Root\nroot' },
      { name: 'a/b/SKILL.md', data: '# Deep\ndeep' },
    ]);
    const p = parseSkillUpload('x.zip', zip);
    expect(p.name).toBe('Root');
    expect(p.warnings.join('\n')).toMatch(/Multiple SKILL\.md files found \(SKILL\.md, b\/SKILL\.md\)/);
    expect(p.ignored_files).toEqual(['a/b/SKILL.md', 'b/SKILL.md']);
  });

  it('no SKILL.md but exactly one .md → uses it (with a warning)', () => {
    const zip = buildZip([
      { name: 'docs/guide.md', data: '# Guide\nDo things.' },
      { name: 'data.csv', data: 'a,b' },
    ]);
    const p = parseSkillUpload('x.zip', zip);
    expect(p.name).toBe('Guide');
    expect(p.warnings.join('\n')).toMatch(/No SKILL\.md found; using docs\/guide\.md/);
  });

  it('no SKILL.md and zero or several .md → 422', () => {
    expect422(() => parseSkillUpload('x.zip', buildZip([{ name: 'a.txt', data: 'a' }])), /No SKILL\.md/);
    expect422(
      () => parseSkillUpload('x.zip', buildZip([{ name: 'a.md', data: 'a' }, { name: 'b.md', data: 'b' }])),
      /several \.md/,
    );
  });

  it('path-traversal / absolute entries are warned about, never read, never picked', () => {
    const zip = buildZip([
      { name: '../SKILL.md', data: '# Evil\nevil' },
      { name: '/etc/passwd', data: 'root' },
      { name: 'C:/win.md', data: 'x' },
      { name: 'ok/SKILL.md', data: '# Good\ngood' },
    ]);
    const p = parseSkillUpload('x.zip', zip);
    expect(p.name).toBe('Good');
    expect(p.ignored_files).toEqual([]);
    const w = p.warnings.join('\n');
    expect(w).toMatch(/Unsafe path skipped \(never read\): \.\.\/SKILL\.md/);
    expect(w).toMatch(/\/etc\/passwd/);
    expect(w).toMatch(/C:\/win\.md/);
  });

  it('more than 200 entries → 422', () => {
    const entries = Array.from({ length: 201 }, (_, i) => ({ name: `f${i}.txt`, data: '', method: 0 as const }));
    expect422(() => parseSkillUpload('x.zip', buildZip(entries)), /too many entries/);
  });

  it('declared total uncompressed size over 5 MB → 422 before inflating', () => {
    const zip = buildZip([
      { name: 'SKILL.md', data: 'body' },
      { name: 'big.bin', data: 'x', declaredSize: 6 * 1024 * 1024 },
    ]);
    expect422(() => parseSkillUpload('x.zip', zip), /expands to more than 5 MB/);
  });

  it('SKILL.md over 200 KB → 422 (declared or actual)', () => {
    expect422(
      () => parseSkillUpload('x.zip', buildZip([{ name: 'SKILL.md', data: 'a'.repeat(200 * 1024 + 1) }])),
      /too large/,
    );
    // Header lies (says 10 bytes) but the stream inflates to more.
    expect422(
      () =>
        parseSkillUpload(
          'x.zip',
          buildZip([{ name: 'SKILL.md', data: 'a'.repeat(300 * 1024), declaredSize: 10 }]),
        ),
      /too large|size mismatch|could not be decompressed/,
    );
  });

  it('encrypted SKILL.md → 422; unsupported method → 422', () => {
    expect422(
      () => parseSkillUpload('x.zip', buildZip([{ name: 'SKILL.md', data: 'x', method: 0, flags: 1 }])),
      /encrypted/,
    );
    const zip = buildZip([{ name: 'SKILL.md', data: 'x', method: 0 }]);
    zip.writeUInt16LE(12, zip.length - 22 - (46 + 8) + 10); // bzip2 in the central record
    expect422(() => parseSkillUpload('x.zip', zip), /unsupported compression method/);
  });

  it('garbage bytes → 422', () => {
    expect422(() => parseSkillUpload('x.zip', Buffer.from('definitely not a zip file at all')), /Not a valid zip/);
  });
});
