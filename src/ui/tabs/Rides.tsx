import { useMemo, useState } from 'react';
import type { LoadResult, Trip } from '../../core/types';
import { ChartCard, ColumnChart, Empty, HBarChart, ScatterPlot } from '../components/Charts';
import { DataTable, type Column, type SelectFilter } from '../components/DataTable';
import { Kpis, type Kpi } from '../components/Kpis';
import { fmtDateTime, fmtInt, fmtMoney, fmtNum, moneyList, statusTone, tripStatusLabel, WEEKDAYS, WEEKDAYS_LONG } from '../format';

export function Rides({ result }: { result: LoadResult }) {
  const s = result.stats?.rides;
  const trips = result.dataset.trips;
  const [scatterCur, setScatterCur] = useState<string | null>(null);

  const columns = useMemo<Column<Trip>[]>(
    () => [
      { id: 'date', label: 'Date', sortValue: (t) => t.t, text: (t) => fmtDateTime(t.t), render: (t) => fmtDateTime(t.t), className: 'nowrap' },
      { id: 'city', label: 'Ville', sortValue: (t) => t.city },
      { id: 'prod', label: 'Service', sortValue: (t) => t.product },
      { id: 'from', label: 'Départ', sortValue: (t) => t.from, className: 'clip' },
      { id: 'to', label: 'Arrivée', sortValue: (t) => t.to, className: 'clip' },
      { id: 'km', label: 'km', sortValue: (t) => t.km, render: (t) => (t.km != null ? fmtNum(t.km, 1) : '—'), className: 'num' },
      {
        id: 'min',
        label: 'min',
        sortValue: (t) => t.durationSec,
        render: (t) => (t.durationSec != null ? fmtInt(t.durationSec / 60) : '—'),
        className: 'num',
      },
      {
        id: 'fare',
        label: 'Tarif',
        sortValue: (t) => t.fare,
        render: (t) => (t.fare != null && t.currency ? fmtMoney(t.fare, t.currency) : '—'),
        className: 'num',
      },
      {
        id: 'status',
        label: 'Statut',
        sortValue: (t) => tripStatusLabel(t.status),
        render: (t) => <span className={`tag ${statusTone(t.status)}`}>{tripStatusLabel(t.status)}</span>,
      },
    ],
    [],
  );

  const filters = useMemo<SelectFilter<Trip>[]>(
    () => [
      { id: 'status', label: 'Statut', value: (t) => t.status, optionLabel: tripStatusLabel },
      { id: 'year', label: 'Année', value: (t) => t.t.slice(0, 4) },
      { id: 'city', label: 'Ville', value: (t) => t.city ?? '' },
    ],
    [],
  );

  if (!s) return null;

  const kpis: Kpi[] = [];
  if (trips) {
    kpis.push(
      { label: 'Courses terminées', value: `${fmtInt(s.completed)} / ${fmtInt(s.total)}` },
      { label: 'Distance', value: `${fmtInt(s.km)} km`, hint: 'courses terminées' },
      { label: 'Temps en voiture', value: `${fmtNum(s.hours, 1)} h` },
      { label: 'Dépensé', value: moneyList(s.spend), hint: 'tarif initial, hors pourboire' },
      { label: 'Annulées par vous', value: fmtInt(s.riderCanceled) },
    );
  }
  if (s.ratingAvg != null) {
    kpis.push({ label: 'Note moyenne reçue', value: `${fmtNum(s.ratingAvg, 2)} ★`, hint: `${fmtInt(s.ratingCount)} notes de chauffeurs` });
  }

  const scatter = s.scatter.find((x) => x.currency === scatterCur) ?? s.scatter[0];
  const scatterIndex = scatter ? s.scatter.indexOf(scatter) : 0;

  return (
    <>
      <Kpis items={kpis} />
      <div className="grid">
        {trips && (
          <>
            <ChartCard title="Courses par année" sub="Toutes les demandes" data={{ headers: ['Année', 'Courses'], rows: s.byYear.map((y) => [y.key, y.count]) }}>
              <ColumnChart data={s.byYear.map((y) => ({ key: y.key, n: y.count }))} xKey="key" series={[{ key: 'n', name: 'Courses' }]} />
            </ChartCard>
            <ChartCard title="Villes" data={{ headers: ['Ville', 'Courses'], rows: s.cities.map((c) => [c.key, c.count]) }}>
              <HBarChart items={s.cities.slice(0, 10)} />
            </ChartCard>
            <ChartCard title="Type de service" sub="Libellés normalisés (Green = GREEN)" data={{ headers: ['Service', 'Courses'], rows: s.products.map((c) => [c.key, c.count]) }}>
              <HBarChart items={s.products.slice(0, 10)} colorIndex={1} />
            </ChartCard>
            <ChartCard title="Statuts" data={{ headers: ['Statut', 'Courses'], rows: s.statuses.map((c) => [tripStatusLabel(c.key), c.count]) }}>
              <HBarChart items={s.statuses} label={tripStatusLabel} colorIndex={2} />
            </ChartCard>
            <ChartCard title="Heure de la demande" sub="Heure locale" data={{ headers: ['Heure', 'Courses'], rows: s.hours24.map((n, i) => [`${i} h`, n]) }}>
              <ColumnChart data={s.hours24.map((n, i) => ({ key: `${i}h`, n }))} xKey="key" series={[{ key: 'n', name: 'Courses' }]} />
            </ChartCard>
            <ChartCard title="Jour de la semaine" data={{ headers: ['Jour', 'Courses'], rows: s.weekdays.map((n, i) => [WEEKDAYS_LONG[i], n]) }}>
              <ColumnChart data={s.weekdays.map((n, i) => ({ key: WEEKDAYS[i], n }))} xKey="key" series={[{ key: 'n', name: 'Courses' }]} />
            </ChartCard>
            <ChartCard
              title="Prix vs distance"
              sub={`Courses terminées, en ${scatter?.currency ?? '—'}${s.scatterSampled ? ' (échantillon)' : ''}`}
              actions={
                s.scatter.length > 1 && (
                  <label className="field">
                    Devise
                    <select value={scatter?.currency ?? ''} onChange={(e) => setScatterCur(e.target.value)}>
                      {s.scatter.map((x) => (
                        <option key={x.currency} value={x.currency}>
                          {x.currency} ({fmtInt(x.points.length)})
                        </option>
                      ))}
                    </select>
                  </label>
                )
              }
            >
              {scatter ? (
                <ScatterPlot
                  points={scatter.points}
                  currency={scatter.currency}
                  colorIndex={scatterIndex}
                  fmtFare={(v) => fmtMoney(v, scatter.currency)}
                />
              ) : (
                <Empty>Aucune course avec prix et distance.</Empty>
              )}
            </ChartCard>
          </>
        )}
        {s.ratingCount > 0 && (
          <ChartCard title="Notes reçues des chauffeurs" data={{ headers: ['Étoiles', 'Notes'], rows: s.ratings.map((r) => [`${r.key} ★`, r.count]) }}>
            <ColumnChart
              data={['1', '2', '3', '4', '5'].map((k) => ({ key: `${k} ★`, n: s.ratings.find((r) => r.key === k)?.count ?? 0 }))}
              xKey="key"
              series={[{ key: 'n', name: 'Notes' }]}
            />
          </ChartCard>
        )}
      </div>
      {trips && (
        <section className="card table-card" aria-labelledby="rides-table-title">
          <h3 id="rides-table-title">Toutes les courses</h3>
          <DataTable caption="Courses" rows={trips} columns={columns} filters={filters} initialSort={{ id: 'date', dir: 'desc' }} />
        </section>
      )}
    </>
  );
}
