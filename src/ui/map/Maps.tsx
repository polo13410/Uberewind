import { useId, useMemo, useState } from 'react';
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
  /** Offer the opt-in street tiles. */
  allowStreets?: boolean;
}

/**
 * Explicit, per-visit consent before any street tile is requested. Nothing is
 * remembered: the next visit starts again with streets off.
 */
function StreetsConsent({ onAccept, onCancel }: { onAccept: () => void; onCancel: () => void }) {
  const id = useId();
  return (
    <div className="consent" role="dialog" aria-modal="false" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
      <p id={`${id}-t`} className="consent-title">
        Afficher les rues ?
      </p>
      <p id={`${id}-d`}>
        Les rues viennent des serveurs d’OpenStreetMap. Pour les afficher, votre navigateur leur demande les images de
        la zone que vous regardez. OpenStreetMap voit donc cette zone, votre adresse IP et le nom de ce site, mais rien
        de votre export (ni trajets, ni dates, ni montants). Ce choix n’est pas retenu, l’option sera de nouveau
        désactivée à votre prochaine visite.
      </p>
      <div className="consent-actions">
        <button type="button" className="btn btn-primary" onClick={onAccept} autoFocus>
          Afficher les rues
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

function MapCard({ title, sub, layer, segments, describe, colorIndex, unit, allowStreets }: MapCardProps) {
  const [focusName, setFocusName] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [asking, setAsking] = useState(false);
  const [streets, setStreets] = useState(false);
  const focus = layer.cities.find((c) => c.name === focusName) ?? null;

  const toggleStreets = () => {
    if (streets) setStreets(false);
    else if (consented) setStreets(true);
    else setAsking(true);
  };

  return (
    <ChartCard
      wide
      title={title}
      sub={sub}
      actions={
        <div className="map-actions">
          {allowStreets && layer.cities.length > 0 && (
            <button type="button" className={`btn btn-toggle${streets ? ' is-on' : ''}`} aria-pressed={streets} onClick={toggleStreets}>
              <span aria-hidden="true">🗺️</span> Afficher les rues
            </button>
          )}
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
      {asking && (
        <StreetsConsent
          onAccept={() => {
            setConsented(true);
            setStreets(true);
            setAsking(false);
          }}
          onCancel={() => setAsking(false)}
        />
      )}
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
          ? 'Rues © les contributeurs OpenStreetMap, chargées à votre demande.'
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
      allowStreets
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

