/**
 * Offline city lookup (name → coordinates), used to place Uber Eats orders,
 * which only carry a city name. Pure: the raw rows are injected so tests can
 * use a tiny index and the app the full Natural Earth one (src/geo/cities.json).
 */

/** [name, asciiName | 0, ISO2, lat, lng, population] */
export type GazetteerRow = [string, string | 0, string, number, number, number];

export interface LatLng {
  lat: number;
  lng: number;
}

export type Gazetteer = Map<string, LatLng & { pop: number }>;

/** `Medellín` → `medellin`, `Saint-Étienne` → `saint etienne`, `Lausanne (VD)` → `lausanne`. */
export function normalizeCityName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Builds the lookup; when a name is ambiguous the most populated place wins. */
export function buildGazetteer(rows: readonly GazetteerRow[]): Gazetteer {
  const index: Gazetteer = new Map();
  for (const [name, ascii, , lat, lng, pop] of rows) {
    for (const n of [name, ascii]) {
      if (!n) continue;
      const k = normalizeCityName(n);
      const prev = index.get(k);
      if (!prev || pop > prev.pop) index.set(k, { lat, lng, pop });
    }
  }
  return index;
}

/**
 * Resolves an Uber city name. Tries the full name, then the part before a
 * separator (`Paris - CDG`, `Lausanne/Vaud`), then the first word.
 */
export function lookupCity(gaz: Gazetteer, name: string | null): LatLng | null {
  if (!name) return null;
  const candidates = [name, name.split(/\s[-–]\s|[/,]/)[0]];
  for (const c of candidates) {
    const hit = gaz.get(normalizeCityName(c));
    if (hit) return { lat: hit.lat, lng: hit.lng };
  }
  return null;
}
