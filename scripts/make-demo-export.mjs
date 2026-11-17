#!/usr/bin/env node
/**
 * Generates a FAKE Uber export (.zip) with realistic structure, for demos,
 * README screenshots and end-to-end tests. Every value is synthetic.
 *
 *   node scripts/make-demo-export.mjs [out.zip]     (default: demo/uber-demo-export.zip)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { strToU8, zipSync } from 'fflate';

export function makeDemoExport() {
  // Deterministic PRNG (mulberry32) so screenshots and tests are stable.
  let seed = 42;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const csv = (rows) =>
    rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';

  const CITIES = [
    { name: 'Paris', lat: 48.8566, lng: 2.3522, cur: 'EUR', w: 40, r: 0.06, street: 'Rue de la Démo' },
    { name: 'Lyon', lat: 45.764, lng: 4.8357, cur: 'EUR', w: 14, r: 0.04, street: 'Quai Fictif' },
    { name: 'Lausanne', lat: 46.5197, lng: 6.6323, cur: 'CHF', w: 18, r: 0.025, street: 'Avenue Exemple' },
    { name: 'Lisbon', lat: 38.7223, lng: -9.1393, cur: 'EUR', w: 8, r: 0.04, street: 'Rua Imaginária' },
    { name: 'New York', lat: 40.7128, lng: -74.006, cur: 'USD', w: 6, r: 0.06, street: 'Sample Street' },
    { name: 'Barcelona', lat: 41.3874, lng: 2.1686, cur: 'EUR', w: 6, r: 0.04, street: 'Carrer Inventat' },
  ];
  const weighted = CITIES.flatMap((c) => Array(c.w).fill(c));
  const PRODUCTS = ['uberX', 'uberX', 'uberX', 'Green', 'GREEN', 'Comfort', 'UberXL', 'Taxi'];
  const RATE = { EUR: 1.6, CHF: 2.4, USD: 2.1 };

  // ---- Trips
  const trips = [
    [
      'city_name', 'product_type_name', 'currency_code', 'request_timestamp_local', 'begintrip_timestamp_local',
      'dropoff_timestamp_local', 'begintrip_lat', 'begintrip_lng', 'dropoff_lat', 'dropoff_lng', 'begintrip_string',
      'destination_string', 'trip_distance_miles', 'trip_duration_seconds', 'status', 'original_fare_local',
    ],
  ];
  const start = Date.UTC(2019, 2, 1);
  const span = Date.UTC(2026, 9, 1) - start;
  for (let i = 0; i < 260; i++) {
    const c = pick(weighted);
    const hour = pick([7, 8, 8, 9, 12, 18, 19, 20, 22, 23, 0, 1, 2]);
    const req = new Date(start + Math.floor(rnd() * span));
    req.setUTCHours(hour, Math.floor(rnd() * 60), Math.floor(rnd() * 60));
    const status = rnd() < 0.82 ? 'completed' : rnd() < 0.7 ? 'rider_canceled' : 'unfulfilled';
    const a = [c.lat + (rnd() - 0.5) * c.r * 2, c.lng + (rnd() - 0.5) * c.r * 2.6];
    const b = [c.lat + (rnd() - 0.5) * c.r * 2, c.lng + (rnd() - 0.5) * c.r * 2.6];
    const km = Math.max(0.8, Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 76) * 1.3);
    const dur = Math.round(km * (110 + rnd() * 80));
    const begin = new Date(req.getTime() + (3 + rnd() * 6) * 60000);
    const end = new Date(begin.getTime() + dur * 1000);
    const done = status === 'completed';
    trips.push([
      c.name, pick(PRODUCTS), c.cur, fmt(req), done ? fmt(begin) : '', done ? fmt(end) : '',
      done ? a[0].toFixed(5) : '', done ? a[1].toFixed(5) : '', done ? b[0].toFixed(5) : '', done ? b[1].toFixed(5) : '',
      done ? `${1 + Math.floor(rnd() * 120)} ${c.street}, ${c.name}` : '', `${1 + Math.floor(rnd() * 120)} ${c.street}, ${c.name}`,
      done ? (km / 1.609344).toFixed(4) : '0', done ? dur : '0', status,
      done ? (4 + km * RATE[c.cur] * (0.8 + rnd() * 0.5)).toFixed(2) : status === 'rider_canceled' && rnd() < 0.3 ? '5.00' : '0',
    ]);
  }

  // ---- Eats (one line per item, order total repeated)
  const RESTOS = {
    Paris: ['Le Bistrot Démo', 'Sushi Fictif', 'Pizza Placebo', 'Bao Imaginaire'],
    Lyon: ['Bouchon Factice', 'Kebab Exemple'],
    Lausanne: ['Burger du Lac (démo)', 'Thaï Témoin', 'Poké Prototype', 'Tacos Test'],
    Lisbon: ['Pastelaria Modelo'],
  };
  const ITEMS = ['Burger classique', 'Frites', 'Poké saumon', 'Pad thaï', 'Margherita', 'Maki avocat', 'Bao porc', 'Tiramisu', 'Limonade', 'Salade César'];
  const eats = [
    ['City_Name', 'Restaurant_Name', 'Request_Time_Local', 'Final_Delivery_Time_Local', 'Order_Status', 'Item_Name', 'Item_quantity', 'Item_Price', 'Order_Price', 'Currency', 'Order_UUID', 'Fulfillment_Type'],
  ];
  const eatsCities = ['Paris', 'Paris', 'Lausanne', 'Lausanne', 'Lausanne', 'Lyon', 'Lisbon'];
  for (let o = 0; o < 150; o++) {
    const city = pick(eatsCities);
    const cur = city === 'Lausanne' ? 'CHF' : 'EUR';
    const t = new Date(Date.UTC(2020, 0, 1) + Math.floor(rnd() * (Date.UTC(2026, 9, 1) - Date.UTC(2020, 0, 1))));
    t.setUTCHours(pick([12, 12, 13, 19, 20, 20, 21, 22]), Math.floor(rnd() * 60), 0);
    const n = 1 + Math.floor(rnd() * 3);
    const lines = Array.from({ length: n }, () => ({ name: pick(ITEMS), qty: rnd() < 0.8 ? 1 : 2, price: 4 + Math.round(rnd() * 16) }));
    const total = (lines.reduce((s, l) => s + l.price * l.qty, 0) * (cur === 'CHF' ? 1.15 : 1) + 3.99).toFixed(2);
    const status = rnd() < 0.96 ? 'completed' : 'canceled';
    const uuid = `demo-${String(o).padStart(4, '0')}`;
    const resto = pick(RESTOS[city]);
    const ful = rnd() < 0.85 ? 'DELIVERY' : rnd() < 0.7 ? 'DELIVERY_THIRD_PARTY' : 'PICKUP';
    for (const l of lines) {
      eats.push([city, resto, fmt(t), status === 'completed' ? fmt(new Date(t.getTime() + 35 * 60000)) : '', status, l.name, l.qty, l.price, total, cur, uuid, ful]);
    }
  }

  const ratings = [['five_star_rating'], ...Array.from({ length: 180 }, () => [rnd() < 0.86 ? 5 : rnd() < 0.7 ? 4 : 3])];
  const profile = [
    ['firstname', 'rating', 'signup_timestamp'],
    ['Alex', '4.91', '2018-05-14T09:30:00.000Z'],
  ];
  const payments = [['profile_type'], ...['BANK_CARD', 'BANK_CARD', 'PAYPAL', 'APPLE_PAY', 'UBER_PAY'].map((x) => [x])];
  const locations = [
    ['Label', 'House number', 'Street name', 'City', 'Postal code', 'Country code'],
    ['home', '10', 'Rue de la Démo', 'Paris', '75011', 'FR'],
    ['work', '1', 'Avenue Exemple', 'Lausanne', '1003', 'CH'],
  ];
  const support = [['Date'], ...['2021-03-02 10:00:00', '2021-03-02 10:20:00', '2023-11-18 18:40:00'].map((d) => [d])];

  return zipSync({
    'Uber Data/Rider/rider_lifetime_trips-0.csv': strToU8(csv(trips)),
    'Uber Data/Rider/rider_lifetime_ratings_received-0.csv': strToU8(csv(ratings)),
    'Uber Data/Eats/eats_order_details-0.csv': strToU8(csv(eats)),
    'Uber Data/Account and Profile/rider_account_profile_information-0.csv': strToU8(csv(profile)),
    'Uber Data/Account and Profile/payment_methods-0.csv': strToU8(csv(payments)),
    'Uber Data/Account and Profile/rider_eater_saved_locations.csv': strToU8(csv(locations)),
    'Uber Data/Account and Profile/customer_support_tickets-0.csv': strToU8(csv(support)),
  });
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}` || process.argv[1]?.endsWith('make-demo-export.mjs')) {
  const out = process.argv[2] ?? 'demo/uber-demo-export.zip';
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, makeDemoExport());
  console.log(`Fake export written to ${out}`);
}
