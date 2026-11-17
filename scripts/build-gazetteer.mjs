#!/usr/bin/env node
/**
 * Builds src/geo/cities.json, the offline city index used to place Uber Eats
 * orders (which only carry a city name) on the map.
 *
 * Source: Natural Earth "populated places" (public domain),
 * https://www.naturalearthdata.com/ — ~7 300 places.
 *
 * Usage:
 *   node scripts/build-gazetteer.mjs                 # downloads the source
 *   node scripts/build-gazetteer.mjs places.geojson  # uses a local copy
 *
 * This runs at development time only; the site itself never downloads anything.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson';
const OUT = fileURLToPath(new URL('../src/geo/cities.json', import.meta.url));

const input = process.argv[2];
const geojson = input ? JSON.parse(readFileSync(input, 'utf8')) : await (await fetch(SOURCE)).json();

const round = (n) => Math.round(n * 1000) / 1000;
/** [name, asciiName | 0 when identical, ISO2, lat, lng, population] */
const rows = geojson.features
  .map((f) => f.properties)
  .filter((p) => p.name && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
  .map((p) => [
    p.name,
    p.nameascii && p.nameascii !== p.name ? p.nameascii : 0,
    p.iso_a2 && p.iso_a2 !== '-99' ? p.iso_a2 : '',
    round(p.latitude),
    round(p.longitude),
    Math.max(0, Math.round(p.pop_max ?? 0)),
  ])
  .sort((a, b) => b[5] - a[5]);

writeFileSync(OUT, JSON.stringify(rows));
console.log(`${rows.length} places → ${OUT} (${(JSON.stringify(rows).length / 1024).toFixed(0)} KB)`);
