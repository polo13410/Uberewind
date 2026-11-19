import { geoDistance, geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { interpolateZoom } from 'd3-interpolate';
import { zoom, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { Feature, FeatureCollection, MultiLineString, MultiPoint } from 'geojson';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-50m.json';
import { inBox, loadBasemap, toPath, type Basemap, type Box } from '../../geo/basemap';
import type { CityPoint, Segment } from '../../geo/mapData';
import { MERCATOR_MAX_LAT, TILE_ATTRIBUTION, TILE_MAX_ZOOM, tileZoom, visibleTiles, type TileView } from '../../geo/tiles';
import { useChartTheme } from '../useChartTheme';

/*
 * Vector map: Natural Earth shapes bundled with the app, rendered as SVG with
 * d3-geo. By default no tiles and no network request at all. When zoomed on a
 * city, an offline orientation layer (lakes, rivers, urban areas, major roads)
 * is drawn. With `streets`, OpenStreetMap tiles replace the offline shapes.
 */

/** Zoom level (d3-zoom k) from which the offline orientation layer appears outside city view. */
const BASEMAP_MIN_K = 3;
const MAX_K = 60;

/**
 * Ctrl/⌘ + wheel. d3's default multiplies by 10 when Ctrl is held (meant for
 * trackpad pinches, which send tiny deltas), so one mouse-wheel notch zoomed ×4.
 * Same speed for pinches, but a notch is capped to about ×1.3.
 */
function wheelDelta(ev: WheelEvent): number {
  const d = -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : ev.deltaMode ? 1 : 0.002) * 10;
  return Math.max(-0.4, Math.min(0.4, d));
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const topo = world as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
const LAND = feature(topo, topo.objects.land) as FeatureCollection;
const BORDERS = mesh(topo, topo.objects.countries, (a, b) => a !== b) as MultiLineString;

interface GeoMapProps {
  cities: CityPoint[];
  segments?: Segment[];
  /** City to zoom on, or null for the overall view. */
  focus: CityPoint | null;
  onSelectCity?: (name: string | null) => void;
  /** e.g. `n => "12 courses"` */
  describe: (count: number) => string;
  colorIndex?: number;
  ariaLabel: string;
  /** Draw OpenStreetMap street tiles under the data. */
  streets?: boolean;
  /** Tooltip content for a hovered trip line. */
  segmentTooltip?: (s: Segment) => ReactNode;
}

/** Bounding "MultiPoint" with a minimum span (degrees) so a single city is not zoomed to the street. */
function extent(points: Array<[number, number]>, minSpan: number): Feature<MultiPoint> {
  let [minLat, maxLat, minLng, maxLng] = [90, -90, 180, -180];
  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  const padLat = Math.max(0, minSpan - (maxLat - minLat)) / 2;
  const padLng = Math.max(0, minSpan - (maxLng - minLng)) / 2;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPoint',
      coordinates: [
        [minLng - padLng, minLat - padLat],
        [maxLng + padLng, maxLat + padLat],
      ],
    },
  };
}

/** Stable default: a fresh `[]` on every render would re-fit the projection and reset the zoom. */
const NO_SEGMENTS: Segment[] = [];

export function GeoMap({
  cities,
  segments = NO_SEGMENTS,
  focus,
  onSelectCity,
  describe,
  colorIndex = 0,
  ariaLabel,
  streets = false,
  segmentTooltip,
}: GeoMapProps) {
  const th = useChartTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [width, setWidth] = useState(640);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  /** Transform at the end of the last gesture: the offline layer is culled with it (not on every frame). */
  const [settled, setSettled] = useState<ZoomTransform>(zoomIdentity);
  const [basemap, setBasemap] = useState<Basemap | null>(null);
  const [hover, setHover] = useState<{ city: CityPoint; x: number; y: number } | null>(null);
  /** Hovered trip line (index in `focusSegments`). */
  const [hoverSeg, setHoverSeg] = useState<number | null>(null);
  /** Street tiles whose image has loaded (by URL), and the last tile level fully shown. */
  const [loadedTiles, setLoadedTiles] = useState<Set<string>>(() => new Set());
  const [backZ, setBackZ] = useState<number | null>(null);
  /** Running zoom animation (buttons, reset), cancelled by any user gesture. */
  const animRef = useRef<{ frame: number; target: ZoomTransform } | null>(null);
  const height = Math.round(Math.max(260, Math.min(440, width * 0.58)));

  // Responsive width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const focusSegments = useMemo(
    () => (focus ? segments.filter((s) => s.city === focus.name) : segments),
    [focus, segments],
  );

  // Projection fitted to what we want to show.
  const projection = useMemo(() => {
    const pts: Array<[number, number]> = focus
      ? [[focus.lat, focus.lng], ...focusSegments.flatMap((s) => [s.from, s.to])]
      : cities.map((c) => [c.lat, c.lng] as [number, number]);
    if (!pts.length) pts.push([46, 6]);
    // Extra room on the right for city labels, and for the zoom buttons.
    const pad = 32;
    const padRight = Math.min(110, width * 0.18);
    return geoMercator().fitExtent(
      [
        [pad, pad],
        [width - padRight, height - pad],
      ],
      extent(pts, focus ? 0.06 : 2),
    );
  }, [cities, focus, focusSegments, width, height]);

  const paths = useMemo(() => {
    const p = geoPath(projection);
    return { land: p(LAND) ?? '', borders: p(BORDERS) ?? '' };
  }, [projection]);

  // Pan & zoom: Ctrl/⌘ + wheel or pinch, drag; one-finger touch keeps scrolling the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_K])
      .wheelDelta(wheelDelta)
      .filter((ev: Event) => {
        if (ev.type === 'wheel') return (ev as WheelEvent).ctrlKey || (ev as WheelEvent).metaKey;
        if (ev.type.startsWith('touch')) return (ev as TouchEvent).touches.length > 1;
        return !(ev as MouseEvent).button;
      })
      .on('start', (ev: D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (ev.sourceEvent && animRef.current) {
          cancelAnimationFrame(animRef.current.frame);
          animRef.current = null;
        }
      })
      .on('zoom', (ev: D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform(ev.transform);
        // Hide the trip tooltip while the user pans or zooms.
        if (ev.sourceEvent) setHoverSeg(null);
      })
      // During an animation every frame ends a "gesture": settle only on the last one.
      .on('end', (ev: D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (!animRef.current) setSettled(ev.transform);
      });
    zoomRef.current = z;
    select(svg).call(z);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current.frame);
      select(svg).on('.zoom', null);
    };
  }, []);

  // Reset the zoom only when the framing really changes (focused city, data, size),
  // never because of a mere re-render — zoom/pan events re-render on every frame.
  const framingKey = `${focus?.name ?? ''}|${cities.length}|${focusSegments.length}|${width}x${height}`;
  useEffect(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current.frame);
      animRef.current = null;
    }
    if (svgRef.current && zoomRef.current) select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
    setSettled(zoomIdentity);
    setHover(null);
    setHoverSeg(null);
  }, [framingKey]);

  /** Smooth zoom to `to` (van Wijk & Nuij path, as d3 transitions do). */
  const animateTo = (to: ZoomTransform) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    if (animRef.current) cancelAnimationFrame(animRef.current.frame);
    const from = zoomTransform(svg);
    const [cx, cy] = [width / 2, height / 2];
    const view = (t: ZoomTransform): [number, number, number] => [(cx - t.x) / t.k, (cy - t.y) / t.k, width / t.k];
    const path = interpolateZoom(view(from), view(to));
    const ms = Math.max(250, Math.min(700, path.duration * 0.6));
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const [x, y, w] = path(easeInOut(p));
      const k = width / w;
      animRef.current = p < 1 ? { frame: requestAnimationFrame(step), target: to } : null;
      select(svg).call(z.transform, p < 1 ? zoomIdentity.translate(cx - x * k, cy - y * k).scale(k) : to);
    };
    animRef.current = { frame: requestAnimationFrame(step), target: to };
  };

  const zoomBy = (f: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    // Chained clicks start from where the running animation is heading.
    const from = animRef.current?.target ?? zoomTransform(svg);
    const k = Math.max(1, Math.min(MAX_K, from.k * f));
    const [cx, cy] = [width / 2, height / 2];
    animateTo(zoomIdentity.translate(cx - ((cx - from.x) / from.k) * k, cy - ((cy - from.y) / from.k) * k).scale(k));
  };
  const reset = () => {
    if (focus) onSelectCity?.(null);
    else animateTo(zoomIdentity);
  };

  const k = transform.k;

  // ---- Offline orientation layer (city view or zoomed in), culled to the settled viewport.
  const wantBasemap = !streets && (focus != null || settled.k >= BASEMAP_MIN_K);
  useEffect(() => {
    if (!wantBasemap || basemap) return;
    let alive = true;
    loadBasemap()
      .then((b) => alive && setBasemap(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [wantBasemap, basemap]);

  const basemapPaths = useMemo(() => {
    if (!wantBasemap || !basemap) return null;
    // Visible area (in degrees) at the settled zoom, with a 50 % margin for panning.
    const [x0, y0] = settled.invert([-width * 0.5, -height * 0.5]);
    const [x1, y1] = settled.invert([width * 1.5, height * 1.5]);
    const nw = projection.invert?.([x0, y0]);
    const se = projection.invert?.([x1, y1]);
    if (!nw || !se) return null;
    const box: Box = [nw[0], se[1], se[0], nw[1]];
    const proj = (p: [number, number]) => projection(p) as [number, number] | null;
    const q = basemap.q;
    return {
      urban: toPath(inBox(basemap.urban, box, q), q, proj, true),
      lakes: toPath(inBox(basemap.lakes, box, q), q, proj, true),
      rivers: toPath(inBox(basemap.rivers, box, q), q, proj, false),
      roads: toPath(inBox(basemap.roads, box, q), q, proj, false),
    };
  }, [wantBasemap, basemap, settled, projection, width, height]);

  // ---- Street tiles, positioned in screen space for the live transform.
  const tileView: TileView = {
    scale: projection.scale(),
    origin: [projection([-180, 0])?.[0] ?? 0, projection([0, MERCATOR_MAX_LAT])?.[1] ?? 0],
    k: transform.k,
    tx: transform.x,
    ty: transform.y,
    width,
    height,
  };
  const tileZ = streets ? tileZoom(tileView) : 0;
  const tiles = streets ? visibleTiles(tileView, TILE_MAX_ZOOM, tileZ) : [];
  const tilesReady = tiles.every((t) => loadedTiles.has(t.url));
  // While the tiles of a new zoom level load, the last complete level stays drawn
  // underneath (only tiles already loaded, so nothing extra is requested): no blank flash.
  const backTiles =
    streets && backZ != null && backZ !== tileZ && Math.abs(backZ - tileZ) <= 4
      ? visibleTiles(tileView, TILE_MAX_ZOOM, backZ).filter((t) => loadedTiles.has(t.url))
      : [];
  useEffect(() => {
    if (streets && tilesReady && tiles.length > 0 && backZ !== tileZ) setBackZ(tileZ);
  }, [streets, tilesReady, tiles.length, backZ, tileZ]);
  const onTileLoad = (url: string) =>
    setLoadedTiles((s) => {
      if (s.has(url)) return s;
      // Bounded memory: past a few hundred tiles, keep only what is on screen.
      const next = s.size > 600 ? new Set(tiles.map((t) => t.url).filter((u) => s.has(u))) : new Set(s);
      next.add(url);
      return next;
    });

  const max = Math.max(1, ...cities.map((c) => c.count));
  const radius = (c: CityPoint) => 4 + 20 * Math.sqrt(c.count / max);
  const color = th.series[colorIndex % th.series.length];
  const labelled = new Set(cities.slice(0, 8).map((c) => c.name));

  const projected = useMemo(
    () =>
      focusSegments.map((s) => {
        const a = projection([s.from[1], s.from[0]]);
        const b = projection([s.to[1], s.to[0]]);
        return a && b ? { a, b } : null;
      }),
    [focusSegments, projection],
  );
  const lines = projected.map((p, i) => (p ? <line key={i} x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]} /> : null));
  // City view: hollow = pick-up, filled = drop-off.
  const ends = focus
    ? projected.flatMap((p, i) =>
        p
          ? [
              <circle key={`a${i}`} className="map-start" cx={p.a[0]} cy={p.a[1]} r={3.2 / k} />,
              <circle key={`b${i}`} className="map-end" cx={p.b[0]} cy={p.b[1]} r={2.8 / k} />,
            ]
          : [],
      )
    : null;
  const hovered = hoverSeg != null ? projected[hoverSeg] : null;
  // Trip tooltip: above the trip (below it near the top edge), so it never covers its two ends.
  const segTip = (() => {
    if (!hovered) return null;
    const xs = [transform.applyX(hovered.a[0]), transform.applyX(hovered.b[0])];
    const ys = [transform.applyY(hovered.a[1]), transform.applyY(hovered.b[1])];
    const half = Math.min(150, width / 2);
    const x = Math.max(half, Math.min(width - half, (xs[0] + xs[1]) / 2));
    const top = Math.min(...ys) - 8;
    return top > 110 ? { x, y: top, below: false } : { x, y: Math.max(...ys) + 8, below: true };
  })();

  // Scale bar: nice round distance for ~100 px at the current zoom.
  const scale = (() => {
    const y = height / 2;
    const p0 = projection.invert?.([width / 2, y]);
    const p1 = projection.invert?.([width / 2 + 100, y]);
    if (!p0 || !p1) return null;
    const kmPer100 = (geoDistance(p0, p1) * 6371) / k;
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].filter((n) => n <= kmPer100 * 1.2).pop();
    if (!nice) return null;
    return { px: (nice / kmPer100) * 100, label: nice < 1 ? `${nice * 1000} m` : `${nice} km` };
  })();

  return (
    <div
      className={`map${streets ? ' has-streets' : ''}${th.dark ? ' is-dark' : ''}`}
      ref={wrapRef}
      style={{ '--series': color } as CSSProperties}
    >
      {streets && (
        // HTML <img> (not SVG <image>) so each tile can send the site origin as Referer,
        // which OSM's tile policy requires, while the page itself stays `no-referrer`.
        <div className="map-tiles" aria-hidden="true">
          {backTiles.map((t) => (
            <img
              key={`b${t.key}`}
              className="is-back"
              src={t.url}
              alt=""
              referrerPolicy="origin"
              draggable={false}
              style={{ left: t.x, top: t.y, width: t.size + 0.5, height: t.size + 0.5 }}
            />
          ))}
          {tiles.map((t) => (
            <img
              key={t.key}
              className={loadedTiles.has(t.url) ? 'is-loaded' : undefined}
              src={t.url}
              alt=""
              referrerPolicy="origin"
              decoding="async"
              draggable={false}
              onLoad={() => onTileLoad(t.url)}
              style={{ left: t.x, top: t.y, width: t.size + 0.5, height: t.size + 0.5 }}
            />
          ))}
        </div>
      )}
      <svg
        ref={svgRef}
        className="map-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => {
          setHover(null);
          setHoverSeg(null);
        }}
      >
        {!streets && <rect className="map-water" width={width} height={height} />}
        <g transform={transform.toString()}>
          {!streets && <path className="map-land" d={paths.land} />}
          {basemapPaths && (
            <g className="map-basemap">
              <path className="bm-urban" d={basemapPaths.urban} />
              <path className="bm-lake" d={basemapPaths.lakes} />
              <path className="bm-river" d={basemapPaths.rivers} />
              <path className="bm-road" d={basemapPaths.roads} />
            </g>
          )}
          {!streets && <path className="map-border" d={paths.borders} />}
          {lines.length > 0 && (
            <g className={`map-trips${hovered ? ' has-hover' : ''}`} stroke={color}>
              {lines}
            </g>
          )}
          {ends && (
            <g className={`map-ends${hovered ? ' has-hover' : ''}`} fill={color}>
              {ends}
            </g>
          )}
          {hovered && (
            <g className="map-trip-hi" stroke={color} fill={color}>
              <line x1={hovered.a[0]} y1={hovered.a[1]} x2={hovered.b[0]} y2={hovered.b[1]} />
              <circle className="map-start" cx={hovered.a[0]} cy={hovered.a[1]} r={4.5 / k} />
              <circle className="map-end" cx={hovered.b[0]} cy={hovered.b[1]} r={4 / k} />
            </g>
          )}
          {segmentTooltip && lines.length > 0 && (
            // Wide transparent strokes: the visible lines are too thin to hover.
            <g className="map-hits">
              {projected.map((p, i) =>
                p ? (
                  <line
                    key={i}
                    x1={p.a[0]}
                    y1={p.a[1]}
                    x2={p.b[0]}
                    y2={p.b[1]}
                    onMouseEnter={() => setHoverSeg(i)}
                    onMouseLeave={() => setHoverSeg((h) => (h === i ? null : h))}
                  />
                ) : null,
              )}
            </g>
          )}
          <g>
            {cities.map((c) => {
              // City view: the focused city's bubble would hide its own trips.
              if (focus?.name === c.name) return null;
              const p = projection([c.lng, c.lat]);
              if (!p) return null;
              const r = (focus ? Math.min(radius(c), 8) : radius(c)) / k;
              return (
                <g key={c.name}>
                  <circle
                    className={`map-city${focus ? ' is-dim' : ''}`}
                    cx={p[0]}
                    cy={p[1]}
                    r={r}
                    fill={color}
                    stroke={th.surface}
                    tabIndex={0}
                    role="button"
                    aria-label={`${c.name} : ${describe(c.count)}`}
                    onMouseEnter={() => setHover({ city: c, x: transform.applyX(p[0]), y: transform.applyY(p[1]) - r * k })}
                    onFocus={() => setHover({ city: c, x: transform.applyX(p[0]), y: transform.applyY(p[1]) - r * k })}
                    onBlur={() => setHover(null)}
                    onClick={() => onSelectCity?.(c.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectCity?.(c.name);
                      }
                    }}
                  />
                  {labelled.has(c.name) && (
                    <text className="map-label" x={p[0] + r + 4 / k} y={p[1]} fontSize={12 / k} dominantBaseline="middle">
                      {c.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      {hover && (
        <div className="tt map-tooltip" style={{ left: hover.x, top: hover.y }} role="status">
          <div className="tt-row">
            <b>{describe(hover.city.count)}</b>
          </div>
          <div className="tt-title">{hover.city.name}</div>
        </div>
      )}
      {segTip && hoverSeg != null && segmentTooltip && (
        <div
          className={`tt map-tooltip is-trip${segTip.below ? ' is-below' : ''}`}
          style={{ left: segTip.x, top: segTip.y }}
          role="status"
        >
          {segmentTooltip(focusSegments[hoverSeg])}
        </div>
      )}
      <div className="map-overlay" aria-hidden="true">
        {scale && (
          <span className="map-scale">
            <i style={{ width: scale.px }} />
            {scale.label}
          </span>
        )}
        {focus && focusSegments.length > 0 && (
          <span className="map-key">
            <i className="k-start" /> Départ
            <i className="k-line" />
            <i className="k-end" /> Arrivée
          </span>
        )}
      </div>
      {streets && (
        <div className="map-attrib">
          {TILE_ATTRIBUTION.map((a) => (
            <a key={a.href} href={a.href} target="_blank" rel="noopener noreferrer">
              {a.label}
            </a>
          ))}
        </div>
      )}
      <div className="map-controls">
        <button type="button" className="map-btn" onClick={() => zoomBy(1.6)} aria-label="Zoomer">
          +
        </button>
        <button type="button" className="map-btn" onClick={() => zoomBy(1 / 1.6)} aria-label="Dézoomer">
          −
        </button>
        <button type="button" className="map-btn" onClick={reset} aria-label="Vue d’ensemble">
          ⤢
        </button>
      </div>
    </div>
  );
}
