import { geoMercator } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { decodePart, inBox, toPath, type PackedFeature } from '../../src/geo/basemap';
import { MERCATOR_MAX_LAT, tileUrl, visibleTiles } from '../../src/geo/tiles';

describe('offline basemap decoding', () => {
  const q = 1000;
  // A square around Lausanne, delta-encoded in 1/1000 degree.
  const square: PackedFeature = [6600, 46500, 6700, 46600, [[6600, 46500, 100, 0, 0, 100, -100, 0]]];
  const far: PackedFeature = [2300, 48800, 2400, 48900, [[2300, 48800, 100, 100]]];

  it('decodes delta-encoded parts', () => {
    expect(decodePart(square[4][0], q)).toEqual([
      [6.6, 46.5],
      [6.7, 46.5],
      [6.7, 46.6],
      [6.6, 46.6],
    ]);
  });

  it('culls features outside the visible box', () => {
    expect(inBox([square, far], [6.5, 46.4, 6.8, 46.7], q)).toEqual([square]);
    expect(inBox([square, far], [0, 40, 10, 50], q)).toHaveLength(2);
  });

  it('builds a closed planar SVG path', () => {
    const d = toPath([square], q, ([x, y]) => [x * 10, y * 10], true);
    expect(d).toBe('M66.0,465.0L67.0,465.0L67.0,466.0L66.0,466.0Z');
  });
});

describe('street tiles math', () => {
  it('builds OpenStreetMap tile URLs', () => {
    expect(tileUrl(14, 8496, 5800)).toBe('https://tile.openstreetmap.org/14/8496/5800.png');
  });

  it('covers the viewport with tiles that line up with the d3 projection', () => {
    const width = 800;
    const height = 500;
    const projection = geoMercator().center([6.63, 46.52]).scale(200_000).translate([width / 2, height / 2]);
    const origin: [number, number] = [projection([-180, 0])![0], projection([0, MERCATOR_MAX_LAT])![1]];
    const tiles = visibleTiles({ scale: projection.scale(), origin, k: 1, tx: 0, ty: 0, width, height });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(40);
    // Tiles fully cover the viewport.
    const minX = Math.min(...tiles.map((t) => t.x));
    const minY = Math.min(...tiles.map((t) => t.y));
    const maxX = Math.max(...tiles.map((t) => t.x + t.size));
    const maxY = Math.max(...tiles.map((t) => t.y + t.size));
    expect(minX).toBeLessThanOrEqual(0);
    expect(minY).toBeLessThanOrEqual(0);
    expect(maxX).toBeGreaterThanOrEqual(width);
    expect(maxY).toBeGreaterThanOrEqual(height);

    // The tile containing Lausanne (standard slippy-map formula) is drawn where d3 projects Lausanne.
    const z = Number(tiles[0].url.split('/')[3]);
    const n = 2 ** z;
    const lat = (46.52 * Math.PI) / 180;
    const fx = ((6.63 + 180) / 360) * n;
    const fy = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
    const t = tiles.find((tt) => tt.url.endsWith(`/${z}/${Math.floor(fx)}/${Math.floor(fy)}.png`))!;
    expect(t).toBeDefined();
    const [px, py] = projection([6.63, 46.52])!;
    expect(t.x + (fx - Math.floor(fx)) * t.size).toBeCloseTo(px, 0);
    expect(t.y + (fy - Math.floor(fy)) * t.size).toBeCloseTo(py, 0);
  });

  it('follows the zoom transform', () => {
    const base = { scale: 1000, origin: [400 - Math.PI * 1000, 250 - Math.PI * 1000] as [number, number], width: 800, height: 500 };
    const a = visibleTiles({ ...base, k: 1, tx: 0, ty: 0 });
    const b = visibleTiles({ ...base, k: 4, tx: -1200, ty: -750 });
    const zoomOf = (url: string) => Number(url.split('/')[3]);
    expect(zoomOf(b[0].url)).toBe(zoomOf(a[0].url) + 2);
  });
});
