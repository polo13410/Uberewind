import { geoDistance, geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { Feature, FeatureCollection, MultiLineString, MultiPoint } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-50m.json';
import type { CityPoint, Segment } from '../../geo/mapData';
import { useChartTheme } from '../useChartTheme';

/*
 * Offline vector map: Natural Earth country shapes bundled with the app,
 * rendered as SVG with d3-geo. No tiles, no network request.
 */

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

export function GeoMap({ cities, segments = NO_SEGMENTS, focus, onSelectCity, describe, colorIndex = 0, ariaLabel }: GeoMapProps) {
  const th = useChartTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [width, setWidth] = useState(640);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<{ city: CityPoint; x: number; y: number } | null>(null);
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
      .scaleExtent([1, 60])
      .filter((ev: Event) => {
        if (ev.type === 'wheel') return (ev as WheelEvent).ctrlKey || (ev as WheelEvent).metaKey;
        if (ev.type.startsWith('touch')) return (ev as TouchEvent).touches.length > 1;
        return !(ev as MouseEvent).button;
      })
      .on('zoom', (ev: D3ZoomEvent<SVGSVGElement, unknown>) => setTransform(ev.transform));
    zoomRef.current = z;
    select(svg).call(z);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, []);

  // Reset the zoom only when the framing really changes (focused city, data, size),
  // never because of a mere re-render — zoom/pan events re-render on every frame.
  const framingKey = `${focus?.name ?? ''}|${cities.length}|${focusSegments.length}|${width}x${height}`;
  useEffect(() => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
    setHover(null);
  }, [framingKey]);

  const zoomBy = (k: number) => svgRef.current && zoomRef.current && select(svgRef.current).call(zoomRef.current.scaleBy, k);
  const reset = () => {
    if (focus) onSelectCity?.(null);
    else if (svgRef.current && zoomRef.current) select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  };

  const k = transform.k;
  const max = Math.max(1, ...cities.map((c) => c.count));
  const radius = (c: CityPoint) => 4 + 20 * Math.sqrt(c.count / max);
  const color = th.series[colorIndex % th.series.length];
  const labelled = new Set(cities.slice(0, 8).map((c) => c.name));
  if (focus) labelled.add(focus.name);

  const lines = focusSegments.map((s, i) => {
    const a = projection([s.from[1], s.from[0]]);
    const b = projection([s.to[1], s.to[0]]);
    return a && b ? <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} /> : null;
  });
  // City view: hollow = pick-up, filled = drop-off.
  const ends = focus
    ? focusSegments.flatMap((s, i) => {
        const a = projection([s.from[1], s.from[0]]);
        const b = projection([s.to[1], s.to[0]]);
        return [
          a ? <circle key={`a${i}`} className="map-start" cx={a[0]} cy={a[1]} r={3 / k} /> : null,
          b ? <circle key={`b${i}`} cx={b[0]} cy={b[1]} r={2.6 / k} /> : null,
        ];
      })
    : null;

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
    <div className="map" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="map-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
      >
        <rect className="map-water" width={width} height={height} />
        <g transform={transform.toString()}>
          <path className="map-land" d={paths.land} />
          <path className="map-border" d={paths.borders} />
          {lines.length > 0 && (
            <g className="map-trips" stroke={color}>
              {lines}
            </g>
          )}
          {ends && (
            <g className="map-ends" fill={color} color={color}>
              {ends}
            </g>
          )}
          <g>
            {cities.map((c) => {
              const p = projection([c.lng, c.lat]);
              if (!p) return null;
              const r = (focus ? Math.min(radius(c), 8) : radius(c)) / k;
              const active = focus?.name === c.name;
              return (
                <g key={c.name}>
                  <circle
                    className={`map-city${active ? ' is-active' : ''}${focus && !active ? ' is-dim' : ''}`}
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
                    onClick={() => onSelectCity?.(active ? null : c.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectCity?.(active ? null : c.name);
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
      <div className="map-overlay" aria-hidden="true">
        {scale && (
          <span className="map-scale">
            <i style={{ width: scale.px }} />
            {scale.label}
          </span>
        )}
        {focus && focusSegments.length > 0 && (
          <span className="map-key">
            <i className="k-start" style={{ borderColor: color }} /> départ <i className="k-end" style={{ background: color }} /> arrivée
          </span>
        )}
      </div>
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
