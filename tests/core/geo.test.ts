import { describe, expect, it } from 'vitest';
import rows from '../../src/geo/cities.json';
import { buildGazetteer, lookupCity, normalizeCityName, type GazetteerRow } from '../../src/geo/gazetteer';
import { eatsCities, rideCities, tripSegments } from '../../src/geo/mapData';
import type { EatsOrder, Trip } from '../../src/core/types';
import { loadExport } from '../../src/core/loadExport';
import { fixture, utf8 } from './helpers';

const tiny: GazetteerRow[] = [
  ['Paris', 0, 'FR', 48.86, 2.34, 9_904_000],
  ['Paris', 0, 'US', 33.66, -95.55, 25_000],
  ['Medellín', 'Medellin', 'CO', 6.27, -75.58, 3_297_000],
  ['Lausanne', 0, 'CH', 46.53, 6.65, 265_702],
];

const trip = (city: string, pickup: [number, number] | null, status = 'completed'): Trip => ({
  t: '2024-01-01 10:00:00',
  city,
  product: null,
  currency: null,
  status,
  km: null,
  durationSec: null,
  fare: null,
  from: null,
  to: null,
  pickup,
  dropoffAt: pickup ? [pickup[0] + 0.01, pickup[1] + 0.01] : null,
});

const order = (city: string | null, status = 'completed'): EatsOrder => ({
  id: 0,
  t: '2024-01-01 12:00:00',
  deliveredAt: null,
  city,
  restaurant: 'R',
  status,
  currency: 'EUR',
  price: 10,
  fulfillment: null,
  items: [],
  lineCount: 1,
});

describe('gazetteer', () => {
  const gaz = buildGazetteer(tiny);

  it('normalises accents, case and qualifiers', () => {
    expect(normalizeCityName('Medellín')).toBe('medellin');
    expect(normalizeCityName('Saint-Étienne')).toBe('saint etienne');
    expect(normalizeCityName('Lausanne (VD)')).toBe('lausanne');
  });

  it('resolves names, preferring the most populated homonym', () => {
    expect(lookupCity(gaz, 'Paris')).toEqual({ lat: 48.86, lng: 2.34 });
    expect(lookupCity(gaz, 'MEDELLIN')).toEqual({ lat: 6.27, lng: -75.58 });
    expect(lookupCity(gaz, 'Lausanne - Gare')).toEqual({ lat: 46.53, lng: 6.65 });
    expect(lookupCity(gaz, 'Atlantis')).toBeNull();
    expect(lookupCity(gaz, null)).toBeNull();
  });

  it('the bundled Natural Earth index covers the sample cities', () => {
    const full = buildGazetteer(rows as GazetteerRow[]);
    for (const c of ['Paris', 'Lausanne', 'Annecy', 'Grenoble', 'Medellin', 'Cali', 'Istanbul', 'Miami', 'Lyon', 'Marseille']) {
      expect(lookupCity(full, c), c).not.toBeNull();
    }
  });
});

describe('map layers', () => {
  const gaz = buildGazetteer(tiny);

  it('places ride cities at the median of the user own pick-ups, gazetteer as fallback', () => {
    const trips = [trip('Paris', [48.85, 2.35]), trip('Paris', [48.87, 2.33]), trip('Paris', [10, 10]), trip('Lausanne', null)];
    const l = rideCities(trips, gaz);
    expect(l.cities[0]).toMatchObject({ name: 'Paris', count: 3, source: 'trips', lat: 48.85, lng: 2.35 });
    expect(l.cities[1]).toMatchObject({ name: 'Lausanne', source: 'gazetteer', lat: 46.53 });
    expect(l.unresolved).toEqual([]);
  });

  it('places Eats cities with the offline index and lists unknown ones', () => {
    const l = eatsCities([order('Paris'), order('Paris'), order('Atlantis'), order('Paris', 'canceled'), order(null)], [], gaz);
    expect(l.cities).toEqual([{ name: 'Paris', lat: 48.86, lng: 2.34, count: 2, source: 'gazetteer' }]);
    expect(l.unresolved).toEqual(['Atlantis']);
  });

  it('falls back to trip centroids for Eats cities missing from the index', () => {
    const l = eatsCities([order('Smallville')], [trip('Smallville', [40, -90])], gaz);
    expect(l.cities[0]).toMatchObject({ name: 'Smallville', source: 'trips', lat: 40 });
  });

  it('keeps only completed trips with both ends, down-sampled', () => {
    const trips = [...Array.from({ length: 10 }, () => trip('Paris', [48.8, 2.3])), trip('Paris', [1, 1], 'rider_canceled'), trip('Paris', null)];
    expect(tripSegments(trips)).toHaveLength(10);
    expect(tripSegments(trips, 5)).toHaveLength(5);
  });
});

describe('trip coordinates parsing', () => {
  it('reads pick-up / drop-off coordinates and rejects invalid ones', () => {
    const csv =
      'city_name,request_timestamp_local,status,begintrip_lat,begintrip_lng,dropoff_lat,dropoff_lng\n' +
      'Paris,2024-01-01 10:00:00,completed,48.869831,2.402781,48.88399,2.34949\n' +
      'Paris,2024-01-02 10:00:00,completed,0,0,95,2\n' +
      'Paris,2024-01-03 10:00:00,rider_canceled,,,,\n';
    const r = loadExport([{ name: 'rider_lifetime_trips-0.csv', bytes: utf8(csv) }]);
    const byDay = Object.fromEntries(r.dataset.trips!.map((t) => [t.t.slice(8, 10), t]));
    expect(byDay['01']).toMatchObject({ pickup: [48.8698, 2.4028], dropoffAt: [48.884, 2.3495] });
    expect(byDay['02']).toMatchObject({ pickup: null, dropoffAt: null });
    expect(byDay['03']).toMatchObject({ pickup: null, dropoffAt: null });
  });

  it('still never reads saved-location coordinates', () => {
    const r = loadExport([fixture('locations.csv', 'rider_eater_saved_locations.csv')]);
    expect(JSON.stringify(r)).not.toContain('46.51');
  });
});
