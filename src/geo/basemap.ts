/**
 * Offline orientation layer (lakes, rivers, urban areas, major roads) built by
 * scripts/build-basemap.mjs from Natural Earth 1:10m. One world-wide file,
 * always loaded whole, so the viewed region is never revealed to anyone.
 */

/** [minX, minY, maxX, maxY, parts] — integers in 1/q degree; parts are delta-encoded [x0, y0, dx, dy, …]. */
export type PackedFeature = [number, number, number, number, number[][]];

export interface Basemap {
  q: number;
  lakes: PackedFeature[];
  rivers: PackedFeature[];
  urban: PackedFeature[];
  roads: PackedFeature[];
}

export type LayerName = 'urban' | 'lakes' | 'rivers' | 'roads';

/** [west, south, east, north] in degrees. */
export type Box = [number, number, number, number];

let pending: Promise<Basemap> | null = null;

/** Lazy-loads the basemap chunk (same origin, same file for every user). */
export function loadBasemap(): Promise<Basemap> {
  pending ??= import('./basemap.json').then((m) => (m.default ?? m) as unknown as Basemap);
  return pending;
}

/** Decodes one delta-encoded part into [lng, lat] points. */
export function decodePart(part: number[], q: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < part.length; i += 2) {
    x += part[i];
    y += part[i + 1];
    pts.push([x / q, y / q]);
  }
  return pts;
}

/** Features of a layer whose bounding box intersects `box`. */
export function inBox(features: readonly PackedFeature[], box: Box, q: number): PackedFeature[] {
  const [w, s, e, n] = box.map((v) => v * q);
  return features.filter((f) => f[0] <= e && f[2] >= w && f[1] <= n && f[3] >= s);
}

/**
 * Planar SVG path for the features (projected point by point: no spherical
 * clipping, so ring winding in the source data can't produce inverted fills).
 */
export function toPath(
  features: readonly PackedFeature[],
  q: number,
  project: (p: [number, number]) => [number, number] | null,
  closed: boolean,
): string {
  let d = '';
  for (const f of features) {
    for (const part of f[4]) {
      const pts = decodePart(part, q);
      let started = false;
      for (const p of pts) {
        const xy = project(p);
        if (!xy) continue;
        d += `${started ? 'L' : 'M'}${xy[0].toFixed(1)},${xy[1].toFixed(1)}`;
        started = true;
      }
      if (started && closed) d += 'Z';
    }
  }
  return d;
}
