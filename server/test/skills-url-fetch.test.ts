import { describe, it, expect } from 'vitest';
import {
  assertPublicHost,
  assertSafeUrl,
  expandIpv6,
  isBlockedIp,
  normalizeGitHubUrl,
  resolveSkillFilename,
  type ResolveHost,
} from '../src/adapters/skill-fetch/url-guard.js';
import {
  guardedLookup,
  HttpsSkillFetcher,
  type HttpGet,
  type HttpResponse,
} from '../src/adapters/skill-fetch/fetcher.js';
import { COMMUNITY_SKILLS } from '../src/modules/skills/community-catalog.js';
import { searchCommunitySkills } from '../src/modules/skills/helpers.js';

/**
 * Hermetic tests for the SSRF-safe skill fetcher: the pure URL/IP policy and the
 * fetcher driven by a stubbed DNS resolver + transport. No network is touched.
 */

const SKILL_MD = '---\nname: demo\ndescription: When X, do Y.\n---\n# Demo\nBody.';

async function* chunks(parts: Array<string | Uint8Array>): AsyncIterable<Uint8Array> {
  for (const p of parts) yield typeof p === 'string' ? Buffer.from(p) : p;
}

function response(
  status: number,
  opts: { headers?: Record<string, string>; body?: Array<string | Uint8Array> } = {},
): HttpResponse & { discarded: boolean } {
  const headers = Object.fromEntries(
    Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const res = {
    status,
    discarded: false,
    header: (n: string) => headers[n.toLowerCase()] ?? null,
    body: chunks(opts.body ?? []),
    discard: () => {
      res.discarded = true;
    },
  };
  return res;
}

/** DNS stub: host → addresses (unknown host → ENOTFOUND). */
function dns(table: Record<string, string[]>): ResolveHost & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (host: string) => {
    calls.push(host);
    const addrs = table[host];
    if (!addrs) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    return addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  }) as ResolveHost & { calls: string[] };
  fn.calls = calls;
  return fn;
}

/** Transport stub: href → response factory; records requested URLs. */
function transport(routes: Record<string, () => HttpResponse>): HttpGet & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: URL) => {
    calls.push(url.href);
    const r = routes[url.href];
    if (!r) return response(404);
    return r();
  }) as HttpGet & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const PUBLIC = { 'example.com': ['93.184.216.34'], 'raw.githubusercontent.com': ['185.199.108.133'] };

async function rejects(p: Promise<unknown>, status: number, re: RegExp) {
  const err = (await p.then(
    () => {
      throw new Error('expected rejection');
    },
    (e: unknown) => e,
  )) as { statusCode?: number; message: string };
  expect(err.message).toMatch(re);
  expect(err.statusCode).toBe(status);
}

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '100.127.255.255',
    '0.0.0.0',
    '224.0.0.1',
    '239.255.255.250',
    '255.255.255.255',
    '198.18.0.1',
    '192.0.2.5',
    '::',
    '::1',
    'fe80::1',
    'fe80::1%lo0',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::a00:1',
    '2002:7f00:1::',
    '2001:db8::1',
    '::127.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '172.32.0.1',
    '100.128.0.1',
    '185.199.108.133',
    '2606:4700:4700::1111',
    '2a00:1450:4001::200e',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
  ])('allows public %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it('refuses non-IP strings and malformed v6', () => {
    expect(isBlockedIp('example.com')).toBe(true);
    expect(expandIpv6('1::2::3')).toBeNull();
    expect(expandIpv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
  });
});

describe('assertSafeUrl', () => {
  it('accepts a plain https URL', () => {
    expect(assertSafeUrl('https://example.com/skill/SKILL.md').href).toBe(
      'https://example.com/skill/SKILL.md',
    );
    expect(assertSafeUrl('https://example.com:443/a.md').port).toBe('');
  });

  it.each([
    ['http://example.com/a.md', /Only https/],
    ['file:///etc/passwd', /Only https/],
    ['ftp://example.com/a.md', /Only https/],
    ['https://user:pw@example.com/a.md', /credentials/],
    ['https://token@example.com/a.md', /credentials/],
    ['https://example.com:8443/a.md', /port/],
    ['https://localhost/a.md', /Local/],
    ['https://foo.localhost/a.md', /Local/],
    ['https://127.0.0.1/a.md', /Private/],
    ['https://0x7f.1/a.md', /Private/],
    ['https://2130706433/a.md', /Private/],
    ['https://[::1]/a.md', /Private/],
    ['https://[::ffff:127.0.0.1]/a.md', /Private/],
    ['https://169.254.169.254/latest/meta-data', /Private/],
    ['not a url', /valid URL/],
  ])('rejects %s', (url, re) => {
    try {
      assertSafeUrl(url);
      throw new Error('expected rejection');
    } catch (e) {
      const err = e as { statusCode?: number; message: string };
      expect(err.message).toMatch(re);
      expect(err.statusCode).toBe(422);
    }
  });
});

describe('normalizeGitHubUrl', () => {
  const n = (u: string) => normalizeGitHubUrl(new URL(u)).href;

  it('rewrites blob URLs to raw.githubusercontent.com', () => {
    expect(n('https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md')).toBe(
      'https://raw.githubusercontent.com/obra/superpowers/main/skills/systematic-debugging/SKILL.md',
    );
  });

  it('rewrites tree URLs to <dir>/SKILL.md', () => {
    expect(n('https://github.com/anthropics/skills/tree/main/skills/mcp-builder')).toBe(
      'https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/SKILL.md',
    );
  });

  it('leaves other URLs alone', () => {
    expect(n('https://github.com/obra/superpowers')).toBe('https://github.com/obra/superpowers');
    expect(n('https://example.com/a/b/blob/c/d.md')).toBe('https://example.com/a/b/blob/c/d.md');
  });
});

describe('resolveSkillFilename', () => {
  const u = (s: string) => new URL(s);
  const md = Buffer.from(SKILL_MD);
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);

  it('keeps an accepted extension from the last path segment', () => {
    expect(resolveSkillFilename(u('https://x.io/a/SKILL.md'), 'text/plain', md)).toBe('SKILL.md');
    expect(resolveSkillFilename(u('https://x.io/a/rules.markdown'), null, md)).toBe('rules.markdown');
    expect(resolveSkillFilename(u('https://x.io/a/pack.zip'), 'application/octet-stream', zip)).toBe('pack.zip');
    expect(resolveSkillFilename(u('https://x.io/a/My%20Skill.md'), null, md)).toBe('My Skill.md');
  });

  it('falls back to the content type', () => {
    expect(resolveSkillFilename(u('https://x.io/a/rules.txt'), 'text/plain; charset=utf-8', md)).toBe('rules.md');
    expect(resolveSkillFilename(u('https://x.io/a/rules'), 'text/markdown', md)).toBe('rules.md');
    expect(resolveSkillFilename(u('https://x.io/dl'), 'application/zip', zip)).toBe('dl.zip');
  });

  it('sniffs extension-less content', () => {
    expect(resolveSkillFilename(u('https://x.io/'), null, md)).toBe('SKILL.md');
    expect(resolveSkillFilename(u('https://x.io/download'), 'application/octet-stream', zip)).toBe('download.zip');
  });

  it('refuses other types', () => {
    expect(() => resolveSkillFilename(u('https://x.io/page.html'), 'text/html', md)).toThrow(/\.md or \.zip/);
    // An extension-less HTML page is NOT sniffed into a skill.
    expect(() => resolveSkillFilename(u('https://x.io/'), 'text/html; charset=utf-8', md)).toThrow(/\.md or \.zip/);
    expect(() =>
      resolveSkillFilename(u('https://x.io/blob'), 'application/octet-stream', Buffer.from([0, 1, 2, 0])),
    ).toThrow(/\.md or \.zip/);
  });
});

describe('assertPublicHost', () => {
  it('refuses a name with ANY private address', async () => {
    await rejects(
      assertPublicHost('mixed.test', dns({ 'mixed.test': ['93.184.216.34', '10.0.0.1'] })),
      422,
      /resolves to a private/,
    );
  });

  it('refuses a name resolving to IPv4-mapped loopback', async () => {
    await rejects(
      assertPublicHost('evil.test', dns({ 'evil.test': ['::ffff:127.0.0.1'] })),
      422,
      /resolves to a private/,
    );
  });

  it('maps a resolution failure to 422', async () => {
    await rejects(assertPublicHost('nope.test', dns({})), 422, /could not resolve/);
  });

  it('allows a public name', async () => {
    await expect(assertPublicHost('example.com', dns(PUBLIC))).resolves.toBeUndefined();
  });
});

describe('HttpsSkillFetcher (stubbed DNS + transport)', () => {
  it('fetches a GitHub blob URL via raw.githubusercontent.com', async () => {
    const raw = 'https://raw.githubusercontent.com/o/r/main/skills/demo/SKILL.md';
    const get = transport({ [raw]: () => response(200, { headers: { 'content-type': 'text/plain' }, body: [SKILL_MD] }) });
    const fetcher = new HttpsSkillFetcher({ resolve: dns(PUBLIC), get });
    const out = await fetcher.fetch('https://github.com/o/r/blob/main/skills/demo/SKILL.md');
    expect(get.calls).toEqual([raw]);
    expect(out.finalUrl).toBe(raw);
    expect(out.filename).toBe('SKILL.md');
    expect(Buffer.from(out.bytes).toString()).toBe(SKILL_MD);
  });

  it('rejects http:// before any DNS or request', async () => {
    const resolve = dns(PUBLIC);
    const get = transport({});
    await rejects(new HttpsSkillFetcher({ resolve, get }).fetch('http://example.com/a.md'), 422, /Only https/);
    expect(resolve.calls).toEqual([]);
    expect(get.calls).toEqual([]);
  });

  it('rejects a host that resolves to a private address without requesting it', async () => {
    const get = transport({});
    const fetcher = new HttpsSkillFetcher({ resolve: dns({ 'internal.test': ['10.0.0.5'] }), get });
    await rejects(fetcher.fetch('https://internal.test/SKILL.md'), 422, /private/);
    expect(get.calls).toEqual([]);
  });

  it('follows a redirect to a public host', async () => {
    const get = transport({
      'https://example.com/go': () => response(302, { headers: { location: '/real/SKILL.md' } }),
      'https://example.com/real/SKILL.md': () => response(200, { body: [SKILL_MD] }),
    });
    const out = await new HttpsSkillFetcher({ resolve: dns(PUBLIC), get }).fetch('https://example.com/go');
    expect(out.finalUrl).toBe('https://example.com/real/SKILL.md');
    expect(get.calls).toHaveLength(2);
  });

  it('rejects a redirect to a private host (DNS) and never requests it', async () => {
    const get = transport({
      'https://example.com/go': () => response(301, { headers: { location: 'https://metadata.test/latest' } }),
    });
    const resolve = dns({ ...PUBLIC, 'metadata.test': ['169.254.169.254'] });
    await rejects(new HttpsSkillFetcher({ resolve, get }).fetch('https://example.com/go'), 422, /private/);
    expect(get.calls).toEqual(['https://example.com/go']);
  });

  it('rejects a redirect to a literal loopback IP or to http://', async () => {
    for (const location of ['https://127.0.0.1/x', 'http://example.com/x', 'https://[::1]/x']) {
      const get = transport({ 'https://example.com/go': () => response(307, { headers: { location } }) });
      await rejects(
        new HttpsSkillFetcher({ resolve: dns(PUBLIC), get }).fetch('https://example.com/go'),
        422,
        /Only https|Private/,
      );
      expect(get.calls).toHaveLength(1);
    }
  });

  it('stops after 3 redirects', async () => {
    const loop = () => response(302, { headers: { location: 'https://example.com/loop' } });
    const get = transport({ 'https://example.com/loop': loop });
    await rejects(
      new HttpsSkillFetcher({ resolve: dns(PUBLIC), get }).fetch('https://example.com/loop'),
      422,
      /too many redirects/,
    );
    expect(get.calls).toHaveLength(4);
  });

  it('maps non-2xx to "Could not fetch skill: HTTP <status>"', async () => {
    const get = transport({ 'https://example.com/a.md': () => response(500) });
    await rejects(
      new HttpsSkillFetcher({ resolve: dns(PUBLIC), get }).fetch('https://example.com/a.md'),
      422,
      /^Could not fetch skill: HTTP 500$/,
    );
  });

  it('aborts a streamed body once it exceeds the cap (no Content-Length)', async () => {
    let yielded = 0;
    const res = response(200);
    res.body = (async function* () {
      for (let i = 0; i < 100; i++) {
        yielded++;
        yield Buffer.alloc(1024, 97);
      }
    })();
    const get = transport({ 'https://example.com/big.md': () => res });
    const fetcher = new HttpsSkillFetcher({ resolve: dns(PUBLIC), get, maxBytes: 4096 });
    await rejects(fetcher.fetch('https://example.com/big.md'), 422, /larger than/);
    expect(yielded).toBe(5); // stopped right after crossing 4 KB, not after 100 KB
    expect(res.discarded).toBe(true);
  });

  it('rejects early on a declared Content-Length above the cap', async () => {
    const res = response(200, { headers: { 'content-length': String(3 * 1024 * 1024) }, body: ['x'] });
    const get = transport({ 'https://example.com/big.md': () => res });
    await rejects(
      new HttpsSkillFetcher({ resolve: dns(PUBLIC), get }).fetch('https://example.com/big.md'),
      422,
      /larger than 2 MB/,
    );
    expect(res.discarded).toBe(true);
  });

  it('maps a transport timeout to a 422', async () => {
    const get: HttpGet = (_url, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    const fetcher = new HttpsSkillFetcher({ resolve: dns(PUBLIC), get, timeoutMs: 20 });
    await rejects(fetcher.fetch('https://example.com/slow.md'), 422, /timed out/);
  });
});

describe('guardedLookup (connect-time DNS-rebinding guard)', () => {
  it('fails the socket lookup for a name that resolves to loopback (hosts file, no network)', async () => {
    for (const all of [true, false]) {
      const err = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
        guardedLookup('localhost', { all }, (e) => resolve(e)),
      );
      expect(err?.code).toBe('EDEVDIGEST_BLOCKED_ADDRESS');
    }
  });
});

describe('community catalog search', () => {
  it('lists everything sorted by stars desc then name', () => {
    const all = searchCommunitySkills(COMMUNITY_SKILLS, {});
    expect(all).toHaveLength(COMMUNITY_SKILLS.length);
    for (let i = 1; i < all.length; i++) {
      const [a, b] = [all[i - 1]!, all[i]!];
      expect(a.stars > b.stars || (a.stars === b.stars && a.name.localeCompare(b.name) <= 0)).toBe(true);
    }
  });

  it('filters by q (name/desc/repo, case-insensitive) and exact lang', () => {
    expect(searchCommunitySkills(COMMUNITY_SKILLS, { q: 'DEBUG' }).map((s) => s.name)).toEqual([
      'systematic-debugging',
      'webapp-testing',
    ]);
    expect(searchCommunitySkills(COMMUNITY_SKILLS, { q: 'anthropics/' }).every((s) => s.repo === 'anthropics/skills')).toBe(true);
    expect(searchCommunitySkills(COMMUNITY_SKILLS, { lang: 'python' }).map((s) => s.repo)).toEqual([
      'anthropics/skills',
      'anthropics/skills',
      'anthropics/skills',
    ]);
    expect(searchCommunitySkills(COMMUNITY_SKILLS, { lang: 'Pyth' })).toEqual([]);
    expect(searchCommunitySkills(COMMUNITY_SKILLS, { q: '  ', lang: '' })).toHaveLength(COMMUNITY_SKILLS.length);
  });

  it('every entry is an https raw URL with a repo-scoped id', () => {
    for (const s of COMMUNITY_SKILLS) {
      expect(s.id).toBe(`${s.repo}:${s.name}`);
      expect(() => assertSafeUrl(s.url)).not.toThrow();
      expect(s.url.startsWith('https://raw.githubusercontent.com/')).toBe(true);
    }
  });
});
