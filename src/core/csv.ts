import Papa from 'papaparse';
import type { ParseContext } from './context';
import { cleanString, isSensitiveHeader, normalizeHeader } from './values';

export interface FieldSpec<K extends string = string> {
  key: K;
  /** Candidate column names, in priority order (compared after normalizeHeader). */
  aliases: readonly string[];
  /** Alternative source for a value another field usually provides: never reported as missing. */
  fallback?: boolean;
}

export type CsvRow<K extends string> = Record<K, string | null>;

export interface ReadCsvOptions<K extends string> {
  fields: readonly FieldSpec<K>[];
  /**
   * Called once the header is known, with the set of resolved fields.
   * Return false to abort the file (e.g. a mandatory column is missing).
   */
  onHeader?: (resolved: ReadonlySet<K>) => boolean;
  onRow: (row: CsvRow<K>) => void;
}

export interface ReadCsvResult<K extends string> {
  /** Data rows seen (header excluded). */
  rows: number;
  resolved: ReadonlySet<K>;
  aborted: boolean;
}

/**
 * Streams a CSV text row by row and projects each row onto the whitelisted
 * fields only: no other column value is ever copied out of PapaParse's
 * transient row array.
 */
export function readCsv<K extends string>(text: string, ctx: ParseContext, opts: ReadCsvOptions<K>): ReadCsvResult<K> {
  const { fields, onHeader, onRow } = opts;
  let index: Array<[K, number]> | null = null;
  const resolved = new Set<K>();
  let rows = 0;
  let aborted = false;
  let malformed = 0;

  Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    step: (res, parser) => {
      // A single-column file triggers "UndetectableDelimiter": harmless. Only quote errors matter.
      if (res.errors.some((e) => e.type === 'Quotes')) malformed++;
      const cells = res.data;
      if (!Array.isArray(cells)) return;
      if (index == null) {
        const headers = cells.map((h) => normalizeHeader(String(h ?? '')));
        index = [];
        for (const f of fields) {
          for (const alias of f.aliases) {
            const a = normalizeHeader(alias);
            if (isSensitiveHeader(a)) continue;
            const i = headers.indexOf(a);
            if (i !== -1) {
              index.push([f.key, i]);
              resolved.add(f.key);
              break;
            }
          }
        }
        if (resolved.size === 0) {
          ctx.warn('error', 'En-têtes non reconnus : fichier ignoré.');
          aborted = true;
          parser.abort();
          return;
        }
        const missing = fields.filter((f) => !f.fallback && !resolved.has(f.key)).map((f) => f.aliases[0]);
        if (onHeader && !onHeader(resolved)) {
          aborted = true;
          parser.abort();
          return;
        }
        if (missing.length) {
          ctx.warn('info', `Colonnes absentes, laissées vides : ${missing.join(', ')}.`);
        }
        return;
      }
      rows++;
      const row = {} as CsvRow<K>;
      for (const f of fields) row[f.key] = null;
      for (const [key, i] of index) row[key] = cleanString(cells[i] as string | undefined);
      onRow(row);
    },
  });

  if (malformed > 0) ctx.warn('warning', `${malformed} ligne(s) mal formée(s) (guillemets) lue(s) au mieux.`);
  if (index == null && !aborted) ctx.warn('warning', 'Fichier vide.');
  return { rows, resolved, aborted };
}
