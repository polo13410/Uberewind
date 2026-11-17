import type { LoadResult } from '../../core/types';
import { ChartCard, ColumnChart, HBarChart, type Series } from '../components/Charts';
import { Kpis, type Kpi } from '../components/Kpis';
import { fmtInt, fmtNum, moneyList, WEEKDAYS, WEEKDAYS_LONG } from '../format';

export function Overview({ result }: { result: LoadResult }) {
  const { stats, dataset } = result;
  if (!stats) return null;
  const { overview: o, rides, eats } = stats;

  const kpis: Kpi[] = [];
  if (rides && dataset.trips) {
    kpis.push(
      { label: 'Courses terminées', value: fmtInt(rides.completed), hint: `sur ${fmtInt(rides.total)} demandées` },
      { label: 'Distance parcourue', value: `${fmtInt(rides.km)} km` },
      { label: 'Temps en voiture', value: `${fmtNum(rides.hours, 1)} h` },
      { label: 'Dépensé en courses', value: moneyList(rides.spend) },
    );
  }
  if (eats) {
    kpis.push(
      { label: 'Commandes Uber Eats', value: fmtInt(eats.orders), hint: `dont ${fmtInt(eats.completed)} livrées` },
      { label: 'Dépensé en Eats', value: moneyList(eats.spend) },
    );
  }

  const series: Series[] = [];
  if (dataset.trips) series.push({ key: 'trips', name: 'Courses' });
  if (dataset.orders) series.push({ key: 'orders', name: 'Commandes Eats' });
  const both = series.length > 1;
  const sub = both ? 'Courses (toutes) et commandes Eats (toutes)' : undefined;

  const total = (r: { trips: number; orders: number }) => r.trips + r.orders;

  return (
    <>
      <Kpis items={kpis} />
      <div className="grid">
        <ChartCard
          title="Activité par année"
          sub={sub}
          data={{ headers: ['Année', ...series.map((s) => s.name)], rows: o.years.map((y) => [String(y.key), ...series.map((s) => y[s.key as 'trips'])]) }}
        >
          <ColumnChart data={o.years.map((y) => ({ ...y, key: String(y.key) }))} xKey="key" series={series} stacked={both} />
        </ChartCard>
        <ChartCard
          title="Jour de la semaine"
          sub={sub}
          data={{ headers: ['Jour', 'Total'], rows: o.weekdays.map((d) => [WEEKDAYS_LONG[d.key], total(d)]) }}
        >
          <ColumnChart
            data={o.weekdays.map((d) => ({ ...d, key: WEEKDAYS[d.key] }))}
            xKey="key"
            series={series}
            stacked={both}
          />
        </ChartCard>
        <ChartCard
          title="Heure de la journée"
          sub="Heure locale de la demande"
          data={{ headers: ['Heure', 'Total'], rows: o.hours.map((h) => [`${h.key} h`, total(h)]) }}
        >
          <ColumnChart
            data={o.hours.map((h) => ({ ...h, key: `${h.key}h` }))}
            xKey="key"
            series={series}
            stacked={both}
            tooltipTitle={(l) => `${String(l).replace('h', '')} h – ${Number(String(l).replace('h', '')) + 1} h`}
          />
        </ChartCard>
        <ChartCard
          title="Villes"
          sub={both ? 'Courses et commandes confondues' : undefined}
          data={{ headers: ['Ville', 'Activités'], rows: o.cities.map((c) => [c.key, c.count]) }}
        >
          <HBarChart items={o.cities} />
        </ChartCard>
      </div>
    </>
  );
}
