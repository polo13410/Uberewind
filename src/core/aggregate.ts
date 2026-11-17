import type {
  CountItem,
  Dataset,
  EatsOrder,
  EatsStats,
  MoneyItem,
  OverviewStats,
  RideStats,
  Stats,
  TimeBucketRow,
  Trip,
} from './types';
import { timeParts } from './values';

export const SCATTER_MAX_POINTS = 2000;

/** Count occurrences of the key returned by `fn` (null keys skipped), sorted desc. */
export function countBy<T>(items: readonly T[], fn: (x: T) => string | null | undefined): CountItem[] {
  const m = new Map<string, number>();
  for (const x of items) {
    const k = fn(x);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Keep the first `n` items and fold the rest into an "Autres" bucket. */
export function topWithOther(items: readonly CountItem[], n: number, otherLabel = 'Autres'): CountItem[] {
  if (items.length <= n) return [...items];
  const head = items.slice(0, n);
  const rest = items.slice(n).reduce((s, x) => s + x.count, 0);
  return [...head, { key: otherLabel, count: rest }];
}

export function sumByCurrency<T>(
  items: readonly T[],
  cur: (x: T) => string | null,
  amount: (x: T) => number | null,
): MoneyItem[] {
  const m = new Map<string, MoneyItem>();
  for (const x of items) {
    const c = cur(x);
    const a = amount(x);
    if (!c || a == null) continue;
    const e = m.get(c) ?? { currency: c, amount: 0, count: 0 };
    e.amount += a;
    e.count++;
    m.set(c, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}

const bucket = (n: number) => new Array<number>(n).fill(0);

export function computeRideStats(trips: readonly Trip[], ratings: Record<string, number> | null): RideStats {
  const completed = trips.filter((t) => t.status === 'completed');
  const hours24 = bucket(24);
  const weekdays = bucket(7);
  const years = new Map<number, number>();
  for (const t of trips) {
    const p = timeParts(t.t);
    hours24[p.hour]++;
    weekdays[p.weekday]++;
    years.set(p.year, (years.get(p.year) ?? 0) + 1);
  }

  // Price vs distance, one series per currency, deterministic down-sampling.
  const withBoth = completed.filter((t) => t.km != null && t.km > 0 && t.fare != null && t.fare > 0 && t.currency);
  const step = Math.max(1, Math.ceil(withBoth.length / SCATTER_MAX_POINTS));
  const series = new Map<string, { km: number; fare: number }[]>();
  withBoth.forEach((t, i) => {
    if (i % step !== 0) return;
    const arr = series.get(t.currency!) ?? [];
    arr.push({ km: Math.round(t.km! * 100) / 100, fare: t.fare! });
    series.set(t.currency!, arr);
  });

  const ratingItems = Object.entries(ratings ?? {})
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => Number(a.key) - Number(b.key));
  const ratingCount = ratingItems.reduce((s, r) => s + r.count, 0);
  const ratingSum = ratingItems.reduce((s, r) => s + Number(r.key) * r.count, 0);

  return {
    total: trips.length,
    completed: completed.length,
    riderCanceled: trips.filter((t) => t.status === 'rider_canceled').length,
    km: completed.reduce((s, t) => s + (t.km ?? 0), 0),
    hours: completed.reduce((s, t) => s + (t.durationSec ?? 0), 0) / 3600,
    spend: sumByCurrency(completed, (t) => t.currency, (t) => t.fare),
    byYear: [...years.entries()].sort((a, b) => a[0] - b[0]).map(([y, count]) => ({ key: String(y), count })),
    cities: countBy(trips, (t) => t.city),
    products: countBy(trips, (t) => t.product),
    statuses: countBy(trips, (t) => t.status),
    hours24,
    weekdays,
    scatter: [...series.entries()].map(([currency, points]) => ({ currency, points })),
    scatterSampled: step > 1,
    ratings: ratingItems,
    ratingAvg: ratingCount ? ratingSum / ratingCount : null,
    ratingCount,
  };
}

export function computeEatsStats(orders: readonly EatsOrder[]): EatsStats {
  const done = orders.filter((o) => o.status === 'completed');
  const hours24 = bucket(24);
  const weekdays = bucket(7);
  for (const o of done) {
    const p = timeParts(o.t);
    hours24[p.hour]++;
    weekdays[p.weekday]++;
  }
  const spend = sumByCurrency(done, (o) => o.currency, (o) => o.price);
  const currencies = spend.map((s) => s.currency);

  const months = new Map<string, Record<string, number>>();
  for (const o of done) {
    if (!o.currency || o.price == null) continue;
    const month = o.t.slice(0, 7);
    const row = months.get(month) ?? {};
    row[o.currency] = (row[o.currency] ?? 0) + o.price;
    months.set(month, row);
  }
  const byMonth = fillMonths([...months.keys()]).map((month) => {
    const row: { month: string } & Record<string, number | string> = { month };
    for (const c of currencies) row[c] = Math.round((months.get(month)?.[c] ?? 0) * 100) / 100;
    return row;
  });

  const items = new Map<string, number>();
  for (const o of done) for (const it of o.items) items.set(it.name, (items.get(it.name) ?? 0) + it.qty);

  return {
    orders: orders.length,
    completed: done.length,
    failed: orders.length - done.length,
    restaurants: new Set(done.map((o) => o.restaurant).filter(Boolean)).size,
    itemLines: done.reduce((s, o) => s + o.lineCount, 0),
    spend,
    currencies,
    byMonth,
    topRestaurants: countBy(done, (o) => o.restaurant).slice(0, 10),
    topItems: [...items.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, 10),
    fulfillment: countBy(orders, (o) => o.fulfillment),
    hours24,
    weekdays,
  };
}

/** Continuous list of `YYYY-MM` between the min and max month (gaps become 0). */
export function fillMonths(months: readonly string[]): string[] {
  if (!months.length) return [];
  const sorted = [...months].sort();
  const [y0, m0] = sorted[0].split('-').map(Number);
  const [y1, m1] = sorted[sorted.length - 1].split('-').map(Number);
  const out: string[] = [];
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, (m = 1)) : m++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (out.length > 600) break; // 50 years: guard against absurd dates
  }
  return out;
}

export function computeOverview(trips: readonly Trip[], orders: readonly EatsOrder[]): OverviewStats {
  const years = new Map<number, TimeBucketRow>();
  const weekdays: TimeBucketRow[] = Array.from({ length: 7 }, (_, key) => ({ key, trips: 0, orders: 0 }));
  const hours: TimeBucketRow[] = Array.from({ length: 24 }, (_, key) => ({ key, trips: 0, orders: 0 }));
  let first: string | null = null;
  let last: string | null = null;
  const add = (t: string, field: 'trips' | 'orders') => {
    const p = timeParts(t);
    const y = years.get(p.year) ?? { key: p.year, trips: 0, orders: 0 };
    y[field]++;
    years.set(p.year, y);
    weekdays[p.weekday][field]++;
    hours[p.hour][field]++;
    if (!first || t < first) first = t;
    if (!last || t > last) last = t;
  };
  for (const t of trips) add(t.t, 'trips');
  for (const o of orders) add(o.t, 'orders');

  const yearRows = [...years.values()].sort((a, b) => a.key - b.key);
  // Fill missing years so the axis is continuous.
  const filled: TimeBucketRow[] = [];
  if (yearRows.length) {
    for (let y = yearRows[0].key; y <= yearRows[yearRows.length - 1].key; y++) {
      filled.push(years.get(y) ?? { key: y, trips: 0, orders: 0 });
    }
  }

  const cities = countBy([...trips.map((t) => t.city), ...orders.map((o) => o.city)], (c) => c);
  return { years: filled, weekdays, hours, cities: topWithOther(cities, 8), firstActivity: first, lastActivity: last };
}

export function computeStats(d: Dataset): Stats {
  const trips = d.trips ?? [];
  const orders = d.orders ?? [];
  return {
    overview: computeOverview(trips, orders),
    rides: d.trips || d.ratings ? computeRideStats(trips, d.ratings) : null,
    eats: d.orders ? computeEatsStats(orders) : null,
  };
}
