import { isIP } from 'node:net';
import { posix } from 'node:path';
import { AppError } from '../../platform/errors.js';

/**
 * PURE SSRF policy for fetching a skill from a user-supplied URL. No I/O here —
 * the fetcher (./fetcher.ts) injects the DNS lookup and the HTTP transport, so
 * every rule below is unit-testable without a network.
 *
 *  - URL shape: https only, no credentials, default port only (443).
 *  - GitHub page URLs are rewritten to raw.githubusercontent.com.
 *  - Addresses: loopback / private / link-local / unique-local / CGNAT / multicast /
 *    unspecified / documentation / reserved ranges are refused for IPv4 and IPv6,
 *    including IPv4 embedded in IPv6 (mapped, NAT64, 6to4).
 */

/** 422 for a URL the policy refuses (never fetched). */
export function urlRejected(message: string): AppError {
  return new AppError('skill_url_rejected', message, 422);
}

/** 422 for a URL that was allowed but could not be fetched / used. */
export function fetchFailed(message: string): AppError {
  return new AppError('skill_url_fetch_failed', `Could not fetch skill: ${message}`, 422);
}

// ---- URL shape ------------------------------------------------------------------

/** Hostnames refused regardless of what they resolve to. */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback']);

/** Strip the `[...]` WHATWG URL puts around an IPv6 literal host. */
export function bareHost(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * Parse and validate the SHAPE of a URL (every hop, including redirects):
 * https only, no user:password@, default port, no blocked hostname, and a
 * literal-IP host must be public. Throws 422; returns the parsed URL.
 */
export function assertSafeUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = typeof raw === 'string' ? new URL(raw.trim()) : new URL(raw.href);
  } catch {
    throw urlRejected('Not a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw urlRejected(`Only https:// URLs can be imported (got ${url.protocol.replace(/:$/, '')})`);
  }
  if (url.username || url.password) {
    throw urlRejected('URLs with embedded credentials are not allowed');
  }
  // WHATWG URL drops the default port, so any non-empty port is non-443.
  if (url.port !== '') throw urlRejected('Only the default https port (443) is allowed');

  const host = bareHost(url.hostname).toLowerCase().replace(/\.$/, '');
  if (!host) throw urlRejected('The URL has no host');
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    throw urlRejected('Local addresses are not allowed');
  }
  if (isIP(host) !== 0 && isBlockedIp(host)) {
    throw urlRejected('Private, loopback and reserved addresses are not allowed');
  }
  return url;
}

/**
 * Rewrite GitHub page URLs to their raw content:
 *   github.com/<o>/<r>/blob/<ref>/<path>  → raw.githubusercontent.com/<o>/<r>/<ref>/<path>
 *   github.com/<o>/<r>/tree/<ref>/<dir>   → raw.githubusercontent.com/<o>/<r>/<ref>/<dir>/SKILL.md
 * `<ref>` is taken as ONE path segment (a branch named `a/b` is ambiguous in a
 * GitHub URL; use the raw URL for those). Any other URL is returned unchanged.
 */
export function normalizeGitHubUrl(url: URL): URL {
  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return url;
  const segs = url.pathname.split('/').filter(Boolean);
  const [owner, repo, kind, ref, ...rest] = segs;
  if (!owner || !repo || !ref || (kind !== 'blob' && kind !== 'tree')) return url;
  const path = kind === 'tree' ? [...rest, 'SKILL.md'] : rest;
  if (path.length === 0) return url;
  return new URL(`https://raw.githubusercontent.com/${[owner, repo, ref, ...path].join('/')}`);
}

// ---- IP ranges -------------------------------------------------------------------

/** IPv4 dotted quad → uint32, or null when not a valid quad. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** [network, prefix] — IPv4 ranges that must never be fetched. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network" / unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT (shared address space)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast 255.255.255.255
];

export function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → refuse
  return BLOCKED_V4.some(([net, prefix]) => {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return ((n & mask) >>> 0) === ((ipv4ToInt(net)! & mask) >>> 0);
  });
}

/** Expand an IPv6 literal (incl. `::` and a trailing dotted quad) to 8 hextets. */
export function expandIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  // Trailing embedded IPv4 (e.g. ::ffff:127.0.0.1) → two hextets.
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    s = `${s.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const h of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
      out.push(parseInt(h, 16));
    }
    return out;
  };
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - rest.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...rest];
}

function v4FromHextets(hi: number, lo: number): string {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
}

export function isBlockedIpv6(ip: string): boolean {
  const h = expandIpv6(ip);
  if (!h) return true; // unparseable → refuse
  const [a, b] = [h[0]!, h[1]!];
  const zeros = (from: number, to: number) => h.slice(from, to).every((x) => x === 0);

  // ::/96 — unspecified (::), loopback (::1) and deprecated IPv4-compatible.
  if (zeros(0, 6)) return true;
  // ::ffff:0:0/96 IPv4-mapped → judge the embedded IPv4.
  if (zeros(0, 5) && h[5] === 0xffff) return isBlockedIpv4(v4FromHextets(h[6]!, h[7]!));
  // 64:ff9b::/96 NAT64 → embedded IPv4.
  if (a === 0x64 && b === 0xff9b && zeros(2, 6)) return isBlockedIpv4(v4FromHextets(h[6]!, h[7]!));
  // 2002::/16 6to4 → embedded IPv4 in hextets 1-2.
  if (a === 0x2002) return isBlockedIpv4(v4FromHextets(h[1]!, h[2]!));
  if (a === 0x0100 && zeros(1, 4)) return true; // 100::/64 discard
  if (a === 0x2001 && b === 0x0db8) return true; // 2001:db8::/32 documentation
  if (a === 0x2001 && b === 0x0000) return true; // 2001::/32 Teredo (tunnels to IPv4)
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((a & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** True when `ip` (v4 or v6 literal) must not be connected to. Non-IPs are refused. */
export function isBlockedIp(ip: string): boolean {
  const bare = bareHost(ip);
  const v = isIP(bare);
  if (v === 4) return isBlockedIpv4(bare);
  if (v === 6) return isBlockedIpv6(bare);
  return true;
}

// ---- DNS ------------------------------------------------------------------------

export interface ResolvedAddress {
  address: string;
  family: number;
}

/** `dns.promises.lookup(host, { all: true })`-shaped resolver (injected for tests). */
export type ResolveHost = (hostname: string) => Promise<ResolvedAddress[]>;

/**
 * Resolve `hostname` and refuse it when it has no address or ANY address is in a
 * blocked range (a name with one public and one private record is refused).
 */
export async function assertPublicHost(hostname: string, resolve: ResolveHost): Promise<void> {
  const host = bareHost(hostname);
  if (isIP(host) !== 0) {
    if (isBlockedIp(host)) throw urlRejected('Private, loopback and reserved addresses are not allowed');
    return;
  }
  let addrs: ResolvedAddress[];
  try {
    addrs = await resolve(host);
  } catch {
    throw fetchFailed(`could not resolve host ${host}`);
  }
  if (addrs.length === 0) throw fetchFailed(`could not resolve host ${host}`);
  if (addrs.some((a) => isBlockedIp(a.address))) {
    throw urlRejected(`${host} resolves to a private, loopback or reserved address`);
  }
}

// ---- filename / type -------------------------------------------------------------

const MD_EXTS = new Set(['.md', '.markdown']);
const ZIP_EXTS = new Set(['.zip']);
const MD_MIME = new Set(['text/markdown', 'text/x-markdown', 'text/plain']);
const ZIP_MIME = new Set(['application/zip', 'application/x-zip-compressed', 'application/x-zip']);
const GENERIC_MIME = new Set(['application/octet-stream', 'binary/octet-stream']);

function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 4096);
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, Math.max(0, head.length - 3)));
    return true;
  } catch {
    return false;
  }
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Pick the filename handed to the import parser (which dispatches on extension):
 *  1. last path segment with a .md / .markdown / .zip extension → as is;
 *  2. else by Content-Type: text/markdown|text/plain → `<stem>.md`, application/zip → `<stem>.zip`;
 *  3. else, only when the segment has NO extension AND there is no / a generic Content-Type,
 *     sniff: zip magic → .zip, UTF-8 text → SKILL.md.
 * Anything else is refused (422).
 */
export function resolveSkillFilename(
  finalUrl: URL,
  contentType: string | null,
  bytes: Uint8Array,
): string {
  let seg = finalUrl.pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    seg = decodeURIComponent(seg);
  } catch {
    /* keep the raw segment */
  }
  seg = seg.replace(/[\\/\0]/g, '_').slice(0, 200);
  const ext = posix.extname(seg).toLowerCase();
  const stem = (ext ? seg.slice(0, -ext.length) : seg) || 'SKILL';
  if (MD_EXTS.has(ext) || ZIP_EXTS.has(ext)) return seg;

  const mime = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (MD_MIME.has(mime)) return `${stem}.md`;
  if (ZIP_MIME.has(mime)) return `${stem}.zip`;

  // Sniff only when the server gave no usable type (an explicit text/html etc. is refused).
  if (!ext && (mime === '' || GENERIC_MIME.has(mime))) {
    if (looksLikeZip(bytes)) return `${stem}.zip`;
    if (looksLikeText(bytes)) return 'SKILL.md';
  }
  throw fetchFailed('the URL must point to a .md or .zip file');
}
