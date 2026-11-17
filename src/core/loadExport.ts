import { unzipSync } from 'fflate';
import { computeStats } from './aggregate';
import type { DatasetBuilder } from './builder';
import { createContext } from './context';
import { decodeText } from './decode';
import { groupEatsLines } from './parsers/eats';
import { classify, FILE_SPECS, type FileSpec } from './registry';
import type { Dataset, LoadResult, ParseWarning, Stats } from './types';
import { baseName, buildLabelCanonicalizer, partIndex } from './values';

export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

export type ProgressFn = (message: string) => void;

/** Files bigger than this (uncompressed) are skipped to protect memory. */
export const MAX_FILE_BYTES = 300 * 1024 * 1024;

const isZip = (f: InputFile) =>
  /\.zip$/i.test(f.name) ||
  (f.bytes.length > 4 && f.bytes[0] === 0x50 && f.bytes[1] === 0x4b && f.bytes[2] === 0x03 && f.bytes[3] === 0x04);

const isJunk = (path: string) => /(^|\/)__MACOSX\//.test(path) || /(^|\/)\._/.test(path) || path.endsWith('/');

interface Pending {
  spec: FileSpec;
  name: string;
  bytes: Uint8Array;
}

/**
 * Main entry point of the pure parsing module. Accepts a mix of .zip and .csv
 * files and never throws: every failure becomes a ParseWarning.
 */
export function loadExport(inputs: readonly InputFile[], onProgress: ProgressFn = () => {}): LoadResult {
  const warnings: ParseWarning[] = [];
  const pending: Pending[] = [];
  const unknown = new Set<string>();
  const ignored = new Map<string, string>();

  const route = (path: string, getBytes: () => Uint8Array | null, size: number) => {
    const base = baseName(path);
    const c = classify(base);
    if (c.kind === 'ignored') {
      ignored.set(base, c.reason);
      return;
    }
    if (c.kind === 'unknown') {
      if (/\.csv$/i.test(base)) unknown.add(base);
      return;
    }
    if (size > MAX_FILE_BYTES) {
      warnings.push({ level: 'error', file: base, message: `Fichier trop volumineux (${Math.round(size / 1e6)} Mo) : ignoré.` });
      return;
    }
    const bytes = getBytes();
    if (bytes) pending.push({ spec: c.spec, name: base, bytes });
  };

  for (const input of inputs) {
    if (isZip(input)) {
      onProgress(`Décompression de ${input.name}…`);
      try {
        // Only recognised files are decompressed; everything else is skipped
        // without ever being inflated.
        const wanted: Record<string, true> = {};
        const out = unzipSync(input.bytes, {
          filter: (f) => {
            if (isJunk(f.name)) return false;
            const base = baseName(f.name);
            const c = classify(base);
            if (c.kind === 'spec' && f.originalSize <= MAX_FILE_BYTES) {
              wanted[f.name] = true;
              return true;
            }
            route(f.name, () => null, f.originalSize);
            return false;
          },
        });
        for (const path of Object.keys(wanted)) route(path, () => out[path] ?? null, out[path]?.length ?? 0);
      } catch (e) {
        warnings.push({ level: 'error', file: input.name, message: `Archive zip illisible (${errMsg(e)}).` });
      }
    } else {
      route(input.name, () => input.bytes, input.bytes.length);
    }
  }

  // Parse, grouped by spec, parts in numeric order (-0, -1, …).
  pending.sort((a, b) => FILE_SPECS.indexOf(a.spec) - FILE_SPECS.indexOf(b.spec) || partIndex(a.name) - partIndex(b.name));
  const builder: DatasetBuilder = {};
  const filesRead: string[] = [];
  const seenNames = new Set<string>();
  for (const p of pending) {
    if (seenNames.has(p.name)) {
      warnings.push({ level: 'warning', file: p.name, message: 'Fichier présent en double : seule la première copie est lue.' });
      continue;
    }
    seenNames.add(p.name);
    onProgress(`Lecture de ${p.name}…`);
    const ctx = createContext(p.name, warnings);
    try {
      const decoded = decodeText(p.bytes);
      if (decoded.encoding === 'windows-1252') ctx.warn('info', 'Fichier non UTF-8, lu en Windows-1252.');
      if (decoded.replacementChars > 0) {
        ctx.warn('warning', `Encodage imparfait : ${decoded.replacementChars} caractère(s) illisible(s) (�).`);
      }
      p.spec.parse(decoded.text, ctx, builder);
      filesRead.push(p.name);
    } catch (e) {
      ctx.warn('error', `Fichier illisible (${errMsg(e)}).`);
    }
  }

  for (const name of [...unknown].sort()) {
    warnings.push({ level: 'info', file: name, message: 'Fichier non reconnu : ignoré.' });
  }
  for (const [name, reason] of [...ignored].sort()) {
    warnings.push({ level: 'info', file: name, message: `Fichier ${reason}.` });
  }

  onProgress('Préparation du tableau de bord…');
  const dataset = finalizeDataset(builder, warnings);

  const expected: Array<[keyof Dataset, string]> = [
    ['trips', 'Aucun fichier de courses (rider_lifetime_trips-*.csv) : onglet « Courses » limité ou masqué.'],
    ['orders', 'Aucun fichier Uber Eats (eats_order_details-*.csv) : onglet « Uber Eats » masqué.'],
    ['profile', 'Aucun profil (rider_account_profile_information-*.csv).'],
  ];
  if (filesRead.length > 0) {
    for (const [key, msg] of expected) if (dataset[key] == null) warnings.push({ level: 'info', message: msg });
  } else {
    warnings.push({
      level: 'error',
      message: 'Aucun fichier exploitable trouvé. Déposez le .zip de l’export Uber ou ses fichiers .csv.',
    });
  }

  let stats: Stats | null = null;
  try {
    stats = computeStats(dataset);
  } catch (e) {
    warnings.push({ level: 'error', message: `Calcul des statistiques impossible (${errMsg(e)}).` });
  }
  return { dataset, stats, warnings, filesRead };
}

export function finalizeDataset(b: DatasetBuilder, warnings: ParseWarning[] = []): Dataset {
  let trips = b.trips ?? null;
  if (trips) {
    const canon = buildLabelCanonicalizer(trips.map((t) => t.product));
    const cityCanon = buildLabelCanonicalizer(trips.map((t) => t.city));
    trips = trips
      .map((t) => ({ ...t, product: canon(t.product), city: cityCanon(t.city) }))
      .sort((a, b2) => (a.t < b2.t ? 1 : a.t > b2.t ? -1 : 0));
  }
  let orders = null;
  if (b.eatsLines) {
    orders = groupEatsLines(b.eatsLines).sort((a, b2) => (a.t < b2.t ? 1 : a.t > b2.t ? -1 : 0));
    const noPrice = orders.filter((o) => o.price == null).length;
    if (noPrice) warnings.push({ level: 'warning', message: `${noPrice} commande(s) Eats sans montant (Order_Price vide).` });
  }
  return {
    trips,
    ratings: b.ratings ?? null,
    orders,
    profile: b.profile ?? null,
    payments: b.payments ?? null,
    locations: b.locations ?? null,
    support: b.support ?? null,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
