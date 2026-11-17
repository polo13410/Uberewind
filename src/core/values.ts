import type { LocalTime } from './types';

/**
 * Column names that must never be read, whatever the alias tables say.
 * Second line of defence behind the per-file whitelists. (Trip pick-up /
 * drop-off coordinates are whitelisted for the on-device map; saved-location
 * coordinates are simply never listed.)
 */
export const SENSITIVE_HEADER_RE =
  /(e_?mail|phone|mobile|ip_?address|(^|_)ip($|_)|imei|device|advertis|idfa|card_?number|card_?bin|(^|_)bin($|_)|message|content|lastname|last_name|password|token|instruction|session|picture|signup_lat|signup_lng)/i;

export function isSensitiveHeader(normalizedHeader: string): boolean {
  return SENSITIVE_HEADER_RE.test(normalizedHeader);
}

/** `" Distance (miles) "` → `distance_miles`, `﻿Order_UUID` → `order_uuid`. */
export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const NULLISH = new Set(['', 'nan', 'null', 'none', 'n/a', 'na', '\\n', '-', 'undefined']);

/** Trimmed string, or null for empty / placeholder values. */
export function cleanString(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = v.trim();
  if (NULLISH.has(s.toLowerCase())) return null;
  return s;
}

export interface NumberResult {
  value: number | null;
  /** True when the cell was non-empty but could not be parsed. */
  invalid: boolean;
}

/**
 * Lenient number parser: `6.47`, `6,47`, `1 234,50`, `1,234.50`, `CHF 12.5`.
 * Empty / placeholder → null (not invalid). Garbage → null (invalid).
 */
export function parseNumber(v: string | null | undefined): NumberResult {
  const s0 = cleanString(v);
  if (s0 == null) return { value: null, invalid: false };
  // Drop currency symbols / codes and grouping spaces.
  let s = s0.replace(/[\s  ']/g, '').replace(/^[A-Za-z$€£¥₺]+|[A-Za-z$€£¥₺]+$/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever comes last is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return { value: null, invalid: true };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

const TS_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Parses a timestamp as *naive local wall-clock time* (no timezone maths:
 * `request_timestamp_local` is already local). Accepts `2020-03-15 02:23:20`,
 * `2018-07-22T18:45:43.000Z`, `2019-05-12 18:33:01 +0000 UTC`, `2021-01-02`.
 * Returns `YYYY-MM-DD HH:MM:SS` or null.
 */
export function parseLocalTimestamp(v: string | null | undefined): LocalTime | null {
  const s = cleanString(v);
  if (s == null) return null;
  const m = TS_RE.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number);
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(se)}`;
}

export interface TimeParts {
  year: number;
  /** 1-12 */
  month: number;
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
  hour: number;
}

export function timeParts(t: LocalTime): TimeParts {
  const year = Number(t.slice(0, 4));
  const month = Number(t.slice(5, 7));
  const day = Number(t.slice(8, 10));
  const hour = Number(t.slice(11, 13));
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return { year, month, weekday, hour };
}

/** Seconds between two naive local timestamps, or null. */
export function secondsBetween(a: LocalTime | null, b: LocalTime | null): number | null {
  if (!a || !b) return null;
  const toMs = (t: LocalTime) =>
    Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10), +t.slice(11, 13), +t.slice(14, 16), +t.slice(17, 19));
  const diff = (toMs(b) - toMs(a)) / 1000;
  return diff >= 0 && diff < 86400 ? diff : null;
}

/** Lower-case, underscore-separated status (`Rider Canceled` → `rider_canceled`). */
export function normalizeStatus(v: string | null): string {
  const s = cleanString(v);
  if (!s) return 'unknown';
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

/** ISO-4217-ish currency code, upper-cased. */
export function normalizeCurrency(v: string | null): string | null {
  const s = cleanString(v);
  if (!s) return null;
  const up = s.toUpperCase();
  return /^[A-Z]{3}$/.test(up) ? up : null;
}

const labelKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Groups case/spacing variants of a label (`Green`, `GREEN`, ` green `) and
 * returns a function mapping each raw value to one canonical display label:
 * the most frequent variant, preferring ones that are not ALL CAPS.
 */
export function buildLabelCanonicalizer(values: Iterable<string | null>): (v: string | null) => string | null {
  const variants = new Map<string, Map<string, number>>();
  for (const raw of values) {
    if (raw == null) continue;
    const display = raw.trim().replace(/\s+/g, ' ');
    if (!display) continue;
    const key = labelKey(display);
    const m = variants.get(key) ?? new Map<string, number>();
    m.set(display, (m.get(display) ?? 0) + 1);
    variants.set(key, m);
  }
  const canonical = new Map<string, string>();
  for (const [key, m] of variants) {
    // 0 = mixed case (Green, uberX), 1 = all lower-case, 2 = ALL CAPS.
    const rank = (s: string) => {
      const hasUpper = s !== s.toLowerCase();
      const hasLower = s !== s.toUpperCase();
      return hasUpper && hasLower ? 0 : hasUpper ? 2 : 1;
    };
    const best = [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    canonical.set(key, best);
  }
  return (v) => {
    if (v == null) return null;
    const k = labelKey(v);
    return k ? (canonical.get(k) ?? v.trim()) : null;
  };
}

/** Matches `name.csv`, `name-0.csv`, `name_12.csv` (split exports). */
export function partIndex(baseName: string): number {
  const m = /[-_](\d+)\.csv$/i.exec(baseName);
  return m ? Number(m[1]) : 0;
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}
