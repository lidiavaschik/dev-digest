import { inflateRawSync } from 'node:zlib';
import { posix } from 'node:path';
import { SkillType, type SkillImportPreview } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import {
  EXECUTABLE_EXTENSIONS,
  MAX_SKILL_BODY_CHARS,
  MAX_SKILL_FILE_BYTES,
  MAX_SKILL_NAME_CHARS,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_ZIP_ENTRIES,
  SCRIPT_DIRS,
} from './constants.js';

/**
 * Skill import parser — PURE: bytes in, preview out. Nothing is written to disk
 * or the DB, nothing is executed or eval'd. Supports:
 *  - `.md` / `.markdown`: optional `---` frontmatter (flat `key: value` lines;
 *    name / description / type are read, every other key ignored) + body.
 *  - `.zip`: read in memory from the central directory (stored + deflate only);
 *    only the chosen SKILL.md is ever decompressed, every other entry is listed
 *    in `ignored_files`. Size/entry limits are checked BEFORE inflating.
 */

function invalid(message: string): AppError {
  return new AppError('skill_import_invalid', message, 422);
}

const MD_EXTENSIONS = new Set(['.md', '.markdown']);

export function parseSkillUpload(filename: string, bytes: Buffer): SkillImportPreview {
  const base = posix.basename(filename.replace(/\\/g, '/'));
  if (bytes.length === 0) throw invalid('The uploaded file is empty');
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw invalid(`File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);
  }
  const ext = posix.extname(base).toLowerCase();
  if (MD_EXTENSIONS.has(ext)) {
    if (bytes.length > MAX_SKILL_FILE_BYTES) {
      throw invalid(`Skill file is too large (max ${MAX_SKILL_FILE_BYTES / 1024} KB)`);
    }
    const md = parseSkillMarkdown(bytes.toString('utf8'), base, null);
    return { filename: base, ...md, ignored_files: [], warnings: md.warnings };
  }
  if (ext === '.zip') return parseZip(base, bytes);
  throw invalid('Unsupported file type — upload a .md or .zip file');
}

// ---- markdown -----------------------------------------------------------------

interface ParsedMarkdown {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  warnings: string[];
}

function stripQuotes(v: string): string {
  const s = v.trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1);
  }
  return s;
}

/** Minimal, non-evaluating frontmatter reader: top-level `key: value` + `|`/`>` blocks. */
function parseFrontmatter(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const raw = m[2]!.trim();
    if (/^[|>][+-]?$/.test(raw)) {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]!) || lines[i + 1] === '')) {
        block.push(lines[++i]!.trim());
      }
      out[key] = (raw.startsWith('|') ? block.join('\n') : block.join(' ')).trim();
    } else {
      out[key] = stripQuotes(raw);
    }
  }
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, MAX_SKILL_NAME_CHARS).trim();
}

/**
 * @param fallbackDir directory holding SKILL.md inside a zip (name fallback), or null.
 */
export function parseSkillMarkdown(
  raw: string,
  filename: string,
  fallbackDir: string | null,
): ParsedMarkdown {
  const warnings: string[] = [];
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let fm: Record<string, string> = {};
  let body = text;

  const lines = text.split('\n');
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && (l.trim() === '---' || l.trim() === '...'));
    if (end === -1) {
      warnings.push('Frontmatter starts with "---" but is never closed — treated as body text');
    } else {
      fm = parseFrontmatter(lines.slice(1, end));
      body = lines.slice(end + 1).join('\n');
    }
  }
  body = body.trim();
  if (!body) throw invalid('The skill body is empty');
  if (body.length > MAX_SKILL_BODY_CHARS) {
    throw invalid(`The skill body is too long (max ${MAX_SKILL_BODY_CHARS} characters)`);
  }

  let name = normalizeName(fm.name ?? '');
  if (!name) {
    const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(body);
    name = normalizeName(heading?.[1] ?? '');
  }
  if (!name && fallbackDir) name = normalizeName(slugify(fallbackDir));
  if (!name) name = normalizeName(slugify(filename.replace(/\.[^.]*$/, '')));
  if (!name) name = 'imported-skill';

  const description = (fm.description ?? '').trim();
  if (!description) {
    warnings.push(
      'No description found — add one saying when the agent should apply this skill',
    );
  }

  let type: SkillType = 'custom';
  if (fm.type !== undefined && fm.type !== '') {
    const parsed = SkillType.safeParse(fm.type.trim().toLowerCase());
    if (parsed.success) type = parsed.data;
    else warnings.push(`Unknown skill type "${fm.type}" — using "custom"`);
  }

  return { name, description, type, body, warnings };
}

// ---- zip ----------------------------------------------------------------------

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

interface ZipEntry {
  path: string;
  method: number;
  encrypted: boolean;
  compressedSize: number;
  size: number;
  localOffset: number;
  executableMode: boolean;
}

function isUnsafePath(p: string): boolean {
  return (
    p.startsWith('/') ||
    /^[A-Za-z]:/.test(p) ||
    p.includes('\0') ||
    p.split('/').some((seg) => seg === '..')
  );
}

function looksExecutable(e: ZipEntry): boolean {
  const segs = e.path.split('/');
  if (segs.slice(0, -1).some((s) => SCRIPT_DIRS.has(s.toLowerCase()))) return true;
  if (EXECUTABLE_EXTENSIONS.has(posix.extname(e.path).toLowerCase())) return true;
  return e.executableMode;
}

function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

function readCentralDirectory(buf: Buffer): ZipEntry[] {
  if (buf.length < 22) throw invalid('Not a valid zip archive');
  const eocd = findEocd(buf);
  if (eocd < 0) throw invalid('Not a valid zip archive');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw invalid('ZIP64 archives are not supported');
  }
  if (count > MAX_ZIP_ENTRIES) throw invalid(`Archive has too many entries (max ${MAX_ZIP_ENTRIES})`);
  if (cdOffset + cdSize > eocd) throw invalid('Corrupt zip archive (central directory out of range)');

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cdOffset + cdSize || buf.readUInt32LE(p) !== CEN_SIG) {
      throw invalid('Corrupt zip archive (bad central directory record)');
    }
    const madeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const extAttr = buf.readUInt32LE(p + 38);
    const localOffset = buf.readUInt32LE(p + 42);
    if (p + 46 + nameLen > cdOffset + cdSize) throw invalid('Corrupt zip archive (entry name out of range)');
    const path = buf.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/');
    const unixMode = madeBy >> 8 === 3 ? extAttr >>> 16 : 0;
    entries.push({
      path,
      method,
      encrypted: (flags & 1) === 1,
      compressedSize,
      size,
      localOffset,
      executableMode: (unixMode & 0o111) !== 0 && (unixMode & 0o170000) !== 0o040000,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, e: ZipEntry): Buffer {
  if (e.encrypted) throw invalid(`${e.path} is encrypted — encrypted archives are not supported`);
  if (e.method !== 0 && e.method !== 8) {
    throw invalid(`${e.path} uses an unsupported compression method (${e.method})`);
  }
  if (e.size > MAX_SKILL_FILE_BYTES) {
    throw invalid(`${e.path} is too large (max ${MAX_SKILL_FILE_BYTES / 1024} KB)`);
  }
  const off = e.localOffset;
  if (off + 30 > buf.length || buf.readUInt32LE(off) !== LOC_SIG) {
    throw invalid('Corrupt zip archive (bad local header)');
  }
  const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
  const end = start + e.compressedSize;
  if (end > buf.length) throw invalid('Corrupt zip archive (entry data out of range)');
  const data = buf.subarray(start, end);
  let out: Buffer;
  if (e.method === 0) {
    out = data;
  } else {
    try {
      out = inflateRawSync(data, { maxOutputLength: MAX_SKILL_FILE_BYTES + 1 });
    } catch {
      throw invalid(`${e.path} could not be decompressed (corrupt or too large)`);
    }
  }
  if (out.length > MAX_SKILL_FILE_BYTES) {
    throw invalid(`${e.path} is too large (max ${MAX_SKILL_FILE_BYTES / 1024} KB)`);
  }
  if (out.length !== e.size) throw invalid(`${e.path} is corrupt (size mismatch)`);
  return out;
}

function depth(p: string): number {
  return p.split('/').length - 1;
}

function parseZip(filename: string, buf: Buffer): SkillImportPreview {
  const warnings: string[] = [];
  const all = readCentralDirectory(buf);
  const files = all.filter((e) => !e.path.endsWith('/'));

  const safe: ZipEntry[] = [];
  for (const e of files) {
    if (isUnsafePath(e.path)) warnings.push(`Unsafe path skipped (never read): ${e.path}`);
    else safe.push(e);
  }
  const total = files.reduce((n, e) => n + e.size, 0);
  if (total > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw invalid(
      `Archive expands to more than ${MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024} MB`,
    );
  }

  const byPath = (a: ZipEntry, b: ZipEntry) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path);
  const skillMds = safe
    .filter((e) => posix.basename(e.path).toLowerCase() === 'skill.md' && depth(e.path) <= 1)
    .sort(byPath);
  let chosen: ZipEntry | undefined = skillMds[0];
  if (skillMds.length > 1) {
    warnings.push(
      `Multiple SKILL.md files found (${skillMds.map((e) => e.path).join(', ')}); using ${chosen!.path}`,
    );
  }
  if (!chosen) {
    const mds = safe.filter((e) => MD_EXTENSIONS.has(posix.extname(e.path).toLowerCase()));
    if (mds.length === 1) {
      chosen = mds[0]!;
      warnings.push(`No SKILL.md found; using ${chosen.path}`);
    } else {
      throw invalid(
        mds.length === 0
          ? 'No SKILL.md found in the archive'
          : 'No SKILL.md found and the archive has several .md files — add a SKILL.md',
      );
    }
  }

  const text = readEntry(buf, chosen).toString('utf8');
  const dir = posix.dirname(chosen.path);
  const md = parseSkillMarkdown(
    text,
    filename,
    dir === '.' ? null : posix.basename(dir),
  );

  const ignored = safe.filter((e) => e !== chosen).sort((a, b) => a.path.localeCompare(b.path));
  const executables = ignored.filter(looksExecutable).map((e) => e.path);
  if (executables.length > 0) {
    warnings.push(`Executable/script files were ignored and never run: ${executables.join(', ')}`);
  }
  const encrypted = ignored.filter((e) => e.encrypted).map((e) => e.path);
  if (encrypted.length > 0) warnings.push(`Encrypted entries were ignored: ${encrypted.join(', ')}`);

  return {
    filename,
    name: md.name,
    description: md.description,
    type: md.type,
    body: md.body,
    ignored_files: ignored.map((e) => e.path),
    warnings: [...md.warnings, ...warnings],
  };
}
