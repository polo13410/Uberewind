import { useMemo, useState } from 'react';
import type { EatsOrder, Trip } from '../../core/types';
import rows from '../../geo/cities.json';
import { buildGazetteer, type GazetteerRow } from '../../geo/gazetteer';
import { eatsCities, rideCities, tripSegments, type MapLayer, type Segment } from '../../geo/mapData';
import { ChartCard, Empty } from '../components/Charts';
import { plural } from '../format';
import { GeoMap } from './GeoMap';

// Built once, the first time a map is shown (this module is lazy-loaded).
const GAZETTEER = buildGazetteer(rows as GazetteerRow[]);

interface MapCardProps {
  title: string;
  sub: string;
  layer: MapLayer;
  segments?: Segment[];
  describe: (n: number) => string;
  colorIndex?: number;
  unit: string;
  /** Draw OpenStreetMap street tiles under the data. */
  streets?: boolean;
}

function MapCard({ title, sub, layer, segments, describe, colorIndex, unit, streets = false }: MapCardProps) {
  const [focusName, setFocusName] = useState<string | null>(null);
  const focus = layer.cities.find((c) => c.name === focusName) ?? null;

  return (
    <ChartCard
      wide
      title={title}
      sub={sub}
      actions={
        <div className="map-actions">
          {layer.cities.length > 1 && (
          <label className="field">
            Centrer sur
            <select value={focus?.name ?? ''} onChange={(e) => setFocusName(e.target.value || null)}>
              <option value="">Toutes les villes</option>
              {layer.cities.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </label>
          )}
        </div>
      }
      data={{ headers: ['Ville', unit], rows: layer.cities.map((c) => [c.name, c.count]) }}
    >
      {layer.cities.length ? (
        <GeoMap
          streets={streets}
          cities={layer.cities}
          segments={segments}
          focus={focus}
          onSelectCity={setFocusName}
          describe={describe}
          colorIndex={colorIndex}
          ariaLabel={`${title} : ${layer.cities
            .slice(0, 10)
            .map((c) => `${c.name} ${describe(c.count)}`)
            .join(', ')}`}
        />
      ) : (
        <Empty>Aucune ville localisable.</Empty>
      )}
      <p className="map-foot">
        {layer.unresolved.length > 0 && <>Non localisées : {layer.unresolved.join(', ')}. </>}
        Ctrl + molette ou pincement pour zoomer, glisser pour déplacer.{' '}
        {streets
          ? 'Rues © les contributeurs OpenStreetMap.'
          : 'Fond de carte Natural Earth inclus dans le site, sans connexion. Les lacs, fleuves et grands axes apparaissent en zoomant.'}
      </p>
    </ChartCard>
  );
}

export function RidesMap({ trips }: { trips: readonly Trip[] }) {
  const layer = useMemo(() => rideCities(trips, GAZETTEER), [trips]);
  const segments = useMemo(() => tripSegments(trips), [trips]);
  return (
    <MapCard
      title="Carte des courses"
      sub={
        segments.length
          ? 'Une bulle par ville (taille = nombre de courses). Choisissez une ville pour voir vos trajets.'
          : 'Une bulle par ville (taille = nombre de courses).'
      }
      layer={layer}
      segments={segments}
      streets
      describe={(n) => plural(n, 'course', 'courses')}
      unit="Courses"
    />
  );
}

export function EatsMap({ orders, trips }: { orders: readonly EatsOrder[]; trips: readonly Trip[] }) {
  const layer = useMemo(() => eatsCities(orders, trips, GAZETTEER), [orders, trips]);
  return (
    <MapCard
      title="Carte des commandes"
      sub="Une bulle par ville de livraison (taille = commandes livrées). Les commandes n’ont pas d’adresse précise."
      layer={layer}
      describe={(n) => plural(n, 'commande', 'commandes')}
      colorIndex={1}
      unit="Commandes"
    />
  );
}

