import { lookup as dnsLookup, promises as dnsPromises, type LookupAddress, type LookupOptions } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import type { FetchedSkillFile, SkillFetcher } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import {
  assertPublicHost,
  assertSafeUrl,
  fetchFailed,
  isBlockedIp,
  normalizeGitHubUrl,
  resolveSkillFilename,
  urlRejected,
  type ResolveHost,
} from './url-guard.js';

/**
 * SSRF-safe skill fetcher (Skills Lab: import from URL / community catalog).
 *
 * Every hop — the first request and each redirect — is checked twice:
 *  1. before the request: URL shape (https, no credentials, port 443) and a DNS
 *     resolution whose EVERY address must be public (clear 422 messages);
 *  2. at connect time: the socket's own DNS lookup goes through `guardedLookup`,
 *     which refuses a private address. This closes the DNS-rebinding gap between
 *     check 1 and the connection (the name could resolve differently the 2nd time).
 * Redirects are followed manually (≤ MAX_REDIRECTS). One 10 s deadline covers all
 * hops and the body; the body is streamed and aborted once it exceeds MAX_BYTES
 * (Content-Length is only an early reject, never trusted).
 */

export const SKILL_FETCH_TIMEOUT_MS = 10_000;
export const SKILL_FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const SKILL_FETCH_MAX_REDIRECTS = 3;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Minimal response surface the fetcher needs (lets tests stub the transport). */
export interface HttpResponse {
  status: number;
  /** Case-insensitive single header value, or null. */
  header(name: string): string | null;
  body: AsyncIterable<Uint8Array>;
  /** Drop the connection without reading the rest of the body. */
  discard(): void;
}

/** One GET, no redirect following, honouring `signal`. */
export type HttpGet = (url: URL, signal: AbortSignal) => Promise<HttpResponse>;

export interface HttpsSkillFetcherOptions {
  resolve?: ResolveHost;
  get?: HttpGet;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const BLOCKED_CODE = 'EDEVDIGEST_BLOCKED_ADDRESS';

/**
 * `net.connect`-compatible lookup that refuses private addresses. Handles both
 * call shapes: `{ all: true }` (Node's happy-eyeballs path) → array of
 * addresses, and the single-address form.
 */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedIp(a.address))) {
      const e: NodeJS.ErrnoException = new Error(`${hostname} resolves to a blocked address`);
      e.code = BLOCKED_CODE;
      return callback(e, '', 0);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

/** Default transport: node:https with the guarded lookup and no connection reuse. */
export const nodeHttpsGet: HttpGet = (url, signal) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'GET',
        signal,
        agent: false,
        lookup: guardedLookup as never,
        headers: {
          'user-agent': 'DevDigest-skill-import/1.0',
          accept: 'text/markdown, text/plain, application/zip, */*;q=0.5',
          'accept-encoding': 'identity',
        },
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          header: (name) => {
            const v = res.headers[name.toLowerCase()];
            return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
          },
          body: res,
          discard: () => res.destroy(),
        });
      },
    );
    req.on('error', reject);
    req.end();
  });

export const nodeResolveHost: ResolveHost = (hostname) =>
  dnsPromises.lookup(hostname, { all: true, verbatim: true });

function tooLarge(max: number): AppError {
  return fetchFailed(`the file is larger than ${max / 1024 / 1024} MB`);
}

function mapError(err: unknown, signal: AbortSignal, timeoutMs: number): AppError {
  if (err instanceof AppError) return err;
  const e = err as { name?: string; code?: string; message?: string };
  if (signal.aborted || e.name === 'TimeoutError' || e.name === 'AbortError') {
    return fetchFailed(`timed out after ${timeoutMs / 1000}s`);
  }
  if (e.code === BLOCKED_CODE) {
    return urlRejected('The host resolves to a private, loopback or reserved address');
  }
  return fetchFailed(`network error (${e.code ?? e.message ?? 'unknown'})`);
}

export class HttpsSkillFetcher implements SkillFetcher {
  private readonly resolve: ResolveHost;
  private readonly get: HttpGet;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;

  constructor(opts: HttpsSkillFetcherOptions = {}) {
    this.resolve = opts.resolve ?? nodeResolveHost;
    this.get = opts.get ?? nodeHttpsGet;
    this.timeoutMs = opts.timeoutMs ?? SKILL_FETCH_TIMEOUT_MS;
    this.maxBytes = opts.maxBytes ?? SKILL_FETCH_MAX_BYTES;
    this.maxRedirects = opts.maxRedirects ?? SKILL_FETCH_MAX_REDIRECTS;
  }

  async fetch(rawUrl: string): Promise<FetchedSkillFile> {
    let url = assertSafeUrl(normalizeGitHubUrl(assertSafeUrl(rawUrl)));
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      for (let hop = 0; ; hop++) {
        await assertPublicHost(url.hostname, this.resolve);
        const res = await this.get(url, signal);

        if (REDIRECT_STATUSES.has(res.status)) {
          res.discard();
          const location = res.header('location');
          if (!location) throw fetchFailed(`HTTP ${res.status} without a Location header`);
          if (hop >= this.maxRedirects) {
            throw fetchFailed(`too many redirects (max ${this.maxRedirects})`);
          }
          let next: URL;
          try {
            next = new URL(location, url);
          } catch {
            throw fetchFailed('invalid redirect location');
          }
          url = assertSafeUrl(next);
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          res.discard();
          throw fetchFailed(`HTTP ${res.status}`);
        }

        const declared = Number(res.header('content-length'));
        if (Number.isFinite(declared) && declared > this.maxBytes) {
          res.discard();
          throw tooLarge(this.maxBytes);
        }
        const bytes = await this.readCapped(res);
        if (bytes.length === 0) throw fetchFailed('the response body is empty');
        const filename = resolveSkillFilename(url, res.header('content-type'), bytes);
        return { bytes, filename, finalUrl: url.href };
      }
    } catch (err) {
      throw mapError(err, signal, this.timeoutMs);
    }
  }

  /** Stream the body, aborting as soon as it exceeds the cap. */
  private async readCapped(res: HttpResponse): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > this.maxBytes) {
        res.discard();
        throw tooLarge(this.maxBytes);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
