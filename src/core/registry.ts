import type { DatasetBuilder } from './builder';
import type { ParseContext } from './context';
import { parseLocations, parsePayments, parseProfile, parseSupport } from './parsers/account';
import { parseEatsOrders } from './parsers/eats';
import { parseRatings } from './parsers/ratings';
import { parseTrips } from './parsers/trips';

/**
 * File registry: the single place that maps file names to parsers.
 * Files are recognised by their *base name* (lower-cased), never by their
 * position or folder inside the archive. Split exports (`-0.csv`, `-1.csv`)
 * all match the same spec and are parsed in order into the same builder.
 *
 * To support a new file type: add an entry here + a parser in ./parsers.
 */
export interface FileSpec {
  id: string;
  /** French label shown in warnings. */
  label: string;
  pattern: RegExp;
  parse(text: string, ctx: ParseContext, builder: DatasetBuilder): void;
}

const part = String.raw`(?:[-_]\d+)?\.csv$`;
const re = (stem: string) => new RegExp(`^${stem}${part}`, 'i');

export const FILE_SPECS: readonly FileSpec[] = [
  { id: 'trips', label: 'Courses', pattern: re('(?:rider_lifetime_trips|trips_data)'), parse: parseTrips },
  { id: 'ratings', label: 'Notes reçues', pattern: re('rider_lifetime_ratings_received'), parse: parseRatings },
  { id: 'eats', label: 'Commandes Uber Eats', pattern: re('eats_order_details'), parse: parseEatsOrders },
  { id: 'profile', label: 'Profil', pattern: re('rider_account_profile_information'), parse: parseProfile },
  { id: 'payments', label: 'Moyens de paiement', pattern: re('payment_methods'), parse: parsePayments },
  { id: 'locations', label: 'Adresses enregistrées', pattern: re('rider_eater_saved_locations'), parse: parseLocations },
  { id: 'support', label: 'Support client', pattern: re('customer_support_tickets'), parse: parseSupport },
];

/** Known files deliberately skipped (sensitive and of little use). They are never decompressed. */
export const IGNORED_SPECS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /^eats_app_analytics/i, reason: 'ignoré volontairement (données techniques sensibles : appareil, IP…)' },
  { pattern: /^communications_/i, reason: 'ignoré volontairement (contenu des messages)' },
  { pattern: /^readme\.html?$/i, reason: 'documentation Uber, non utilisée' },
  { pattern: /^dashboard\.html?$/i, reason: 'fichier HTML, non utilisé' },
];

export type Classification =
  | { kind: 'spec'; spec: FileSpec }
  | { kind: 'ignored'; reason: string }
  | { kind: 'unknown' };

export function classify(base: string): Classification {
  const spec = FILE_SPECS.find((s) => s.pattern.test(base));
  if (spec) return { kind: 'spec', spec };
  const ign = IGNORED_SPECS.find((s) => s.pattern.test(base));
  if (ign) return { kind: 'ignored', reason: ign.reason };
  return { kind: 'unknown' };
}
