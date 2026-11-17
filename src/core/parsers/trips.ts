import type { DatasetBuilder } from '../builder';
import type { ParseContext } from '../context';
import { readCsv, type FieldSpec } from '../csv';
import { normalizeCurrency, normalizeStatus, parseLocalTimestamp, parseNumber, secondsBetween } from '../values';

/** Valid [lat, lng] rounded to ~11 m, or null (missing, out of range, or the 0,0 placeholder). */
export function parseCoord(lat: string | null, lng: string | null): [number, number] | null {
  const a = parseNumber(lat).value;
  const b = parseNumber(lng).value;
  if (a == null || b == null || Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
  return [Math.round(a * 1e4) / 1e4, Math.round(b * 1e4) / 1e4];
}

const MILES_TO_KM = 1.609344;

/**
 * Current format: `rider_lifetime_trips-N.csv`.
 * Second aliases cover the older `trips_data.csv` format (best effort).
 */
const FIELDS = [
  { key: 'city', aliases: ['city_name', 'city'] },
  { key: 'product', aliases: ['product_type_name', 'product_type', 'global_product_name'] },
  { key: 'currency', aliases: ['currency_code', 'fare_currency', 'currency'] },
  { key: 'request', aliases: ['request_timestamp_local', 'request_time', 'request_time_local'] },
  { key: 'begin', aliases: ['begintrip_timestamp_local', 'begin_trip_time'] },
  { key: 'dropoff', aliases: ['dropoff_timestamp_local', 'dropoff_time'] },
  { key: 'from', aliases: ['begintrip_string', 'begin_trip_address'] },
  { key: 'to', aliases: ['destination_string', 'dropoff_address'] },
  { key: 'miles', aliases: ['trip_distance_miles', 'distance_miles'] },
  { key: 'km', aliases: ['trip_distance_km', 'distance_km'], fallback: true },
  { key: 'duration', aliases: ['trip_duration_seconds'] },
  { key: 'status', aliases: ['status', 'trip_or_order_status', 'trip_status'] },
  { key: 'fare', aliases: ['original_fare_local', 'fare_amount', 'fare'] },
  // Coordinates are used only for the on-device map (no tiles, no network).
  { key: 'pLat', aliases: ['begintrip_lat', 'begin_trip_lat'] },
  { key: 'pLng', aliases: ['begintrip_lng', 'begin_trip_lng'] },
  { key: 'dLat', aliases: ['dropoff_lat'] },
  { key: 'dLng', aliases: ['dropoff_lng'] },
] as const satisfies readonly FieldSpec[];

type Key = (typeof FIELDS)[number]['key'];

export function parseTrips(text: string, ctx: ParseContext, b: DatasetBuilder): void {
  const trips = (b.trips ??= []);
  let noDate = 0;
  let badNumbers = 0;

  const { rows, aborted } = readCsv<Key>(text, ctx, {
    fields: FIELDS,
    onHeader: (r) => {
      if (!r.has('request') && !r.has('begin') && !r.has('dropoff')) {
        ctx.warn('error', 'Aucune colonne de date (request_timestamp_local…) : fichier ignoré.');
        return false;
      }
      return true;
    },
    onRow: (row) => {
      const request = parseLocalTimestamp(row.request);
      const begin = parseLocalTimestamp(row.begin);
      const dropoff = parseLocalTimestamp(row.dropoff);
      const t = request ?? begin ?? dropoff;
      if (!t) {
        noDate++;
        return;
      }
      const miles = parseNumber(row.miles);
      const kmCol = parseNumber(row.km);
      const dur = parseNumber(row.duration);
      const fare = parseNumber(row.fare);
      badNumbers += [miles, kmCol, dur, fare].filter((n) => n.invalid).length;

      const km = miles.value != null ? miles.value * MILES_TO_KM : kmCol.value;
      trips.push({
        t,
        city: row.city,
        product: row.product,
        currency: normalizeCurrency(row.currency),
        status: normalizeStatus(row.status ?? (dropoff ? 'completed' : null)),
        km: km != null && km >= 0 ? km : null,
        durationSec: dur.value != null && dur.value >= 0 ? dur.value : secondsBetween(begin, dropoff),
        fare: fare.value,
        from: row.from,
        to: row.to,
        pickup: parseCoord(row.pLat, row.pLng),
        dropoffAt: parseCoord(row.dLat, row.dLng),
      });
    },
  });

  if (aborted) return;
  if (noDate) ctx.warn('warning', `${noDate} ligne(s) ignorée(s) sur ${rows} : date illisible.`);
  if (badNumbers) ctx.warn('warning', `${badNumbers} valeur(s) numérique(s) invalide(s) laissée(s) vides.`);
}
