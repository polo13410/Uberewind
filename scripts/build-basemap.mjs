#!/usr/bin/env node
/**
 * Builds src/geo/basemap.json: an offline "orientation" layer for the maps
 * (lakes, rivers, urban areas, major roads), from Natural Earth 1:10m
 * (public domain, https://www.naturalearthdata.com/).
 *
 * The output is ONE world-wide file, loaded whole: which part of the world
 * the user looks at is never revealed, not even to our own host.
 *
 * Usage:
 *   node scripts/build-basemap.mjs <dir-with-natural-earth-geojson>
 *   node scripts/build-basemap.mjs            # downloads the sources (dev time only)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const OUT = fileURLToPath(new URL('../src/geo/basemap.json', import.meta.url));
const dir = process.argv[2];

async function load(name) {
  const local = dir && join(dir, `${name}.geojson`);
  if (local && existsSync(local)) return JSON.parse(readFileSync(local, 'utf8'));
  console.log(`downloading ${name}…`);
  return (await fetch(`${RAW}${name}.geojson`)).json();
}

/** Douglas–Peucker on [lng, lat] points, tolerance in degrees. */
function simplify(points, tol) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-18;
    let max = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol * tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Coordinates are stored as integers in 1/1000 degree (~100 m), delta-encoded. */
const Q = 1000;

/**
 * Feature → [minLng, minLat, maxLng, maxLat, parts] where `parts` is an array
 * of flat [lng, lat, lng, lat, …] arrays (rings or lines).
 */
function pack(geometry, tol, minPoints) {
  const lines = [];
  const g = geometry;
  if (!g) return null;
  if (g.type === 'LineString') lines.push(g.coordinates);
  else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
  else if (g.type === 'Polygon') lines.push(...g.coordinates);
  else if (g.type === 'MultiPolygon') for (const p of g.coordinates) lines.push(...p);
  const parts = [];
  let [x0, y0, x1, y1] = [180, 90, -180, -90];
  for (const line of lines) {
    const s = simplify(line, tol).map(([x, y]) => [Math.round(x * Q), Math.round(y * Q)]);
    const dedup = s.filter((p, i) => i === 0 || p[0] !== s[i - 1][0] || p[1] !== s[i - 1][1]);
    if (dedup.length < minPoints) continue;
    for (const [x, y] of dedup) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    // Delta encoding: first point absolute, then differences (small ints → short JSON).
    const flat = [dedup[0][0], dedup[0][1]];
    for (let i = 1; i < dedup.length; i++) flat.push(dedup[i][0] - dedup[i - 1][0], dedup[i][1] - dedup[i - 1][1]);
    parts.push(flat);
  }
  return parts.length ? [x0, y0, x1, y1, parts] : null;
}

function layer(collections, tol, minPoints, keep = () => true) {
  const out = [];
  for (const fc of collections) for (const f of fc.features) if (keep(f.properties ?? {})) {
    const p = pack(f.geometry, tol, minPoints);
    if (p) out.push(p);
  }
  return out;
}

const [lakes, lakesEu, lakesNa, rivers, riversEu, riversNa, urban, roads] = await Promise.all(
  [
    'ne_10m_lakes',
    'ne_10m_lakes_europe',
    'ne_10m_lakes_north_america',
    'ne_10m_rivers_lake_centerlines',
    'ne_10m_rivers_europe',
    'ne_10m_rivers_north_america',
    'ne_10m_urban_areas',
    'ne_10m_roads',
  ].map(load),
);

const MAJOR_ROAD = /major highway|secondary highway|beltway|bypass|road/i;
const basemap = {
  source: 'Natural Earth 1:10m (public domain), simplified',
  /** Integers in 1/Q degree, delta-encoded: [minX, minY, maxX, maxY, [[x0, y0, dx, dy, …], …]] */
  q: Q,
  lakes: layer([lakes, lakesEu, lakesNa], 0.002, 4, (p) => (p.scalerank ?? 0) <= 11),
  rivers: layer([rivers, riversEu], 0.005, 2, (p) => (p.scalerank ?? 0) <= 10),
  urban: layer([urban], 0.006, 4, (p) => (p.area_sqkm ?? 99) >= 10),
  roads: layer([roads], 0.007, 2, (p) => MAJOR_ROAD.test(p.type ?? '') && !/ferry/i.test(p.type ?? '') && (p.scalerank ?? 99) <= 7),
};

const json = JSON.stringify(basemap);
writeFileSync(OUT, json);
for (const k of ['lakes', 'rivers', 'urban', 'roads']) {
  console.log(`${k.padEnd(7)} ${String(basemap[k].length).padStart(6)} features ${(JSON.stringify(basemap[k]).length / 1024).toFixed(0).padStart(6)} KB`);
}
console.log(`→ ${OUT} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
