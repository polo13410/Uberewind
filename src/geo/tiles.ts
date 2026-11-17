/**
 * Optional street tiles (opt-in only, see StreetsConsent in ui/map/Maps.tsx).
 * Pure tile math for a d3 Mercator projection combined with a d3-zoom transform.
 *
 * Provider: OpenStreetMap's standard tile layer (no API key). Usage policy:
 * https://operations.osmfoundation.org/policies/tiles/ — visible attribution,
 * a Referer identifying the site (we send the origin only), no bulk download.
 * Only the tile coordinates of the area on screen are requested — never any
 * Uber data.
 */

export const TILE_HOST = 'https://tile.openstreetmap.org';
export const TILE_ATTRIBUTION = [{ label: '© les contributeurs OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' }];
/** OSM's standard layer goes up to zoom 19. */
export const TILE_MAX_ZOOM = 19;

export interface Tile {
  key: string;
  url: string;
  x: number;
  y: number;
  size: number;
}

/** Latitude of the top edge of the Web Mercator world (tiles are square). */
export const MERCATOR_MAX_LAT = 85.0511287798066;

export interface TileView {
  /** d3 Mercator scale (projection.scale()). */
  scale: number;
  /**
   * Unzoomed screen position of the world's top-left corner, i.e.
   * [projection([-180, 0])[0], projection([0, MERCATOR_MAX_LAT])[1]] —
   * robust to the projection's center/translate settings.
   */
  origin: [number, number];
  /** d3-zoom transform. */
  k: number;
  tx: number;
  ty: number;
  width: number;
  height: number;
}

export function tileUrl(z: number, x: number, y: number): string {
  return `${TILE_HOST}/${z}/${x}/${y}.png`;
}

/**
 * Tiles covering the viewport. In d3's Mercator, x = R·λ + tx, so the world is
 * 2πR wide; at zoom k it is 2πR·k screen pixels, i.e. 2^z tiles of `size` px.
 */
export function visibleTiles(v: TileView, maxZoom = TILE_MAX_ZOOM): Tile[] {
  const worldPx = 2 * Math.PI * v.scale * v.k;
  const z = Math.max(0, Math.min(maxZoom, Math.round(Math.log2(worldPx / 256))));
  const n = 2 ** z;
  const size = worldPx / n;
  // Screen position of the world's top-left corner (λ = -180°, φ ≈ 85.05°) at the current zoom.
  const x0 = v.k * v.origin[0] + v.tx;
  const y0 = v.k * v.origin[1] + v.ty;
  const i0 = Math.floor(-x0 / size);
  const i1 = Math.floor((v.width - x0) / size);
  const j0 = Math.max(0, Math.floor(-y0 / size));
  const j1 = Math.min(n - 1, Math.floor((v.height - y0) / size));
  const tiles: Tile[] = [];
  if (i1 - i0 > 64 || j1 - j0 > 64) return tiles; // safety
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = ((i % n) + n) % n;
      tiles.push({ key: `${z}/${i}/${j}`, url: tileUrl(z, x, j), x: x0 + i * size, y: y0 + j * size, size });
    }
  }
  return tiles;
}
