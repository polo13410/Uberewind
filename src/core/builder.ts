import type { EatsItem, LocalTime, SavedLocation, Trip } from './types';

/** Raw Eats CSV line (one per article), before grouping into orders. */
export interface EatsLine {
  groupKey: string;
  t: LocalTime;
  deliveredAt: LocalTime | null;
  city: string | null;
  restaurant: string | null;
  status: string;
  currency: string | null;
  orderPrice: number | null;
  fulfillment: string | null;
  item: EatsItem | null;
}

/**
 * Mutable accumulator filled by the per-file parsers (several parts of the
 * same file type, e.g. `-0.csv` and `-1.csv`, append to the same arrays), then
 * turned into an immutable Dataset by `finalizeDataset`.
 * A field stays `undefined` while no file of that type was read.
 */
export interface DatasetBuilder {
  trips?: Trip[];
  ratings?: Record<string, number>;
  eatsLines?: EatsLine[];
  profile?: { firstName: string | null; rating: number | null; signupDate: string | null };
  payments?: Record<string, number>;
  locations?: SavedLocation[];
  support?: { messages: number; first: LocalTime | null; last: LocalTime | null };
}
