/**
 * Data model. Only the fields listed here ever leave the parser: everything
 * else in the CSV files (emails, phones, IPs, device ids, card numbers,
 * message bodies…) is dropped row by row and never stored.
 */

export type WarningLevel = 'info' | 'warning' | 'error';

export interface ParseWarning {
  level: WarningLevel;
  /** Base name of the file concerned, if any. */
  file?: string;
  message: string;
}

/** Naive local timestamp, normalised to `YYYY-MM-DD HH:MM:SS` (sortable as a string). */
export type LocalTime = string;

export interface Trip {
  /** Request time (falls back to begin / dropoff time). Always present. */
  t: LocalTime;
  city: string | null;
  /** Canonical product label (`Green` and `GREEN` share one label). */
  product: string | null;
  currency: string | null;
  /** Lower-case status: completed, rider_canceled, driver_canceled, unfulfilled… */
  status: string;
  km: number | null;
  durationSec: number | null;
  fare: number | null;
  from: string | null;
  to: string | null;
}

export interface EatsItem {
  name: string;
  qty: number;
}

export interface EatsOrder {
  /** Internal sequential id (the Uber UUID is only used for grouping). */
  id: number;
  t: LocalTime;
  deliveredAt: LocalTime | null;
  city: string | null;
  restaurant: string | null;
  status: string;
  currency: string | null;
  /** Order total (`Order_Price`), taken once per order, never summed per line. */
  price: number | null;
  fulfillment: string | null;
  items: EatsItem[];
  /** Number of CSV lines (article lines) for this order. */
  lineCount: number;
}

export interface SavedLocation {
  label: string;
  address: string;
}

export interface Profile {
  firstName: string | null;
  rating: number | null;
  /** `YYYY-MM-DD` */
  signupDate: string | null;
}

export interface SupportSummary {
  messages: number;
  first: LocalTime | null;
  last: LocalTime | null;
}

/** `null` means "file absent from the export". */
export interface Dataset {
  trips: Trip[] | null;
  /** Ratings received from drivers, star (1-5) → count. */
  ratings: Record<string, number> | null;
  orders: EatsOrder[] | null;
  profile: Profile | null;
  /** Payment methods count per profile type. */
  payments: Record<string, number> | null;
  locations: SavedLocation[] | null;
  support: SupportSummary | null;
}

export interface CountItem {
  key: string;
  count: number;
}

export interface MoneyItem {
  currency: string;
  amount: number;
  count: number;
}

export interface TimeBucketRow {
  /** Year, weekday (0 = Monday) or hour, depending on the series. */
  key: number;
  trips: number;
  orders: number;
}

export interface RideStats {
  total: number;
  completed: number;
  riderCanceled: number;
  km: number;
  hours: number;
  spend: MoneyItem[];
  byYear: CountItem[];
  cities: CountItem[];
  products: CountItem[];
  statuses: CountItem[];
  hours24: number[];
  weekdays: number[];
  scatter: { currency: string; points: { km: number; fare: number }[] }[];
  scatterSampled: boolean;
  ratings: CountItem[];
  ratingAvg: number | null;
  ratingCount: number;
}

export interface EatsStats {
  orders: number;
  completed: number;
  failed: number;
  restaurants: number;
  itemLines: number;
  spend: MoneyItem[];
  currencies: string[];
  /** One row per month (`YYYY-MM`) with one numeric key per currency. */
  byMonth: Array<{ month: string } & Record<string, number | string>>;
  topRestaurants: CountItem[];
  topItems: CountItem[];
  fulfillment: CountItem[];
  hours24: number[];
  weekdays: number[];
}

export interface OverviewStats {
  years: TimeBucketRow[];
  weekdays: TimeBucketRow[];
  hours: TimeBucketRow[];
  cities: CountItem[];
  firstActivity: LocalTime | null;
  lastActivity: LocalTime | null;
}

export interface Stats {
  overview: OverviewStats;
  rides: RideStats | null;
  eats: EatsStats | null;
}

export interface LoadResult {
  dataset: Dataset;
  stats: Stats | null;
  warnings: ParseWarning[];
  /** Base names of the files that were actually read. */
  filesRead: string[];
}
