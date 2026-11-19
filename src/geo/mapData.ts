import type { EatsOrder, Trip } from '../core/types';
import { lookupCity, normalizeCityName, type Gazetteer } from './gazetteer';

export interface CityPoint {
  name: string;
  lat: number;
  lng: number;
  count: number;
  /** Where the position comes from: the user's own trips, or the offline city index. */
  source: 'trips' | 'gazetteer';
}

export interface Segment {
  from: [number, number];
  to: [number, number];
  city: string | null;
  /** The trip itself, for the hover tooltip. */
  trip: Trip;
}

export interface MapLayer {
  cities: CityPoint[];
  /** City names that could not be placed on the map. */
  unresolved: string[];
}

/** Median is robust to a few outliers (an airport run, a wrong GPS fix). */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** City name (normalised) → median pick-up position of the user's trips there. */
export function tripCityCentroids(trips: readonly Trip[]): Map<string, { lat: number; lng: number }> {
  const acc = new Map<string, { lat: number[]; lng: number[] }>();
  for (const t of trips) {
    if (!t.city || !t.pickup) continue;
    const k = normalizeCityName(t.city);
    const a = acc.get(k) ?? { lat: [], lng: [] };
    a.lat.push(t.pickup[0]);
    a.lng.push(t.pickup[1]);
    acc.set(k, a);
  }
  return new Map([...acc].map(([k, a]) => [k, { lat: median(a.lat), lng: median(a.lng) }]));
}

function layer(
  counts: Map<string, number>,
  centroids: Map<string, { lat: number; lng: number }>,
  gaz: Gazetteer,
  prefer: 'trips' | 'gazetteer',
): MapLayer {
  const cities: CityPoint[] = [];
  const unresolved: string[] = [];
  for (const [name, count] of counts) {
    const own = centroids.get(normalizeCityName(name));
    const indexed = lookupCity(gaz, name);
    const pick = prefer === 'trips' ? (own ? 'trips' : indexed ? 'gazetteer' : null) : indexed ? 'gazetteer' : own ? 'trips' : null;
    const pos = pick === 'trips' ? own : pick === 'gazetteer' ? indexed : null;
    if (!pos || !pick) unresolved.push(name);
    else cities.push({ name, lat: pos.lat, lng: pos.lng, count, source: pick });
  }
  cities.sort((a, b) => b.count - a.count);
  return { cities, unresolved: unresolved.sort() };
}

function countByCity<T>(items: readonly T[], city: (x: T) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of items) {
    const c = city(x);
    if (c) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

/** Rides: one bubble per city (all requests), placed at the median of the user's own pick-ups. */
export function rideCities(trips: readonly Trip[], gaz: Gazetteer): MapLayer {
  return layer(countByCity(trips, (t) => t.city), tripCityCentroids(trips), gaz, 'trips');
}

/** Eats: one bubble per city (delivered orders). Orders have no coordinates: offline index first. */
export function eatsCities(orders: readonly EatsOrder[], trips: readonly Trip[], gaz: Gazetteer): MapLayer {
  const done = orders.filter((o) => o.status === 'completed');
  return layer(countByCity(done, (o) => o.city), tripCityCentroids(trips), gaz, 'gazetteer');
}

/** Completed trips with both ends known, down-sampled to `max` for rendering. */
export function tripSegments(trips: readonly Trip[], max = 3000): Segment[] {
  const ok = trips.filter((t) => t.status === 'completed' && t.pickup && t.dropoffAt);
  const step = Math.max(1, Math.ceil(ok.length / max));
  const out: Segment[] = [];
  for (let i = 0; i < ok.length; i += step) out.push({ from: ok[i].pickup!, to: ok[i].dropoffAt!, city: ok[i].city, trip: ok[i] });
  return out;
}
