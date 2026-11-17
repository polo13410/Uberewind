import { useMemo, useState } from 'react';
import type { EatsOrder, LoadResult } from '../../core/types';
import { ChartCard, ColumnChart, HBarChart } from '../components/Charts';
import type { Column, SelectFilter } from '../components/DataTable';
import { DataTable } from '../components/DataTable';
import { Kpis } from '../components/Kpis';
import {
  fmtDateTime,
  fmtInt,
  fmtMoney,
  fmtMonthLong,
  fmtMonthShort,
  fulfillmentLabel,
  moneyList,
  orderStatusLabel,
  statusTone,
  WEEKDAYS,
  WEEKDAYS_LONG,
} from '../format';

const itemsText = (o: EatsOrder) => o.items.map((i) => `${fmtInt(i.qty)}× ${i.name}`).join(', ');

export function Eats({ result }: { result: LoadResult }) {
  const s = result.stats?.eats;
  const orders = result.dataset.orders ?? [];
  const [currency, setCurrency] = useState<string>('');

  const columns = useMemo<Column<EatsOrder>[]>(
    () => [
      { id: 'date', label: 'Date', sortValue: (o) => o.t, text: (o) => fmtDateTime(o.t), render: (o) => fmtDateTime(o.t), className: 'nowrap' },
      { id: 'rest', label: 'Restaurant', sortValue: (o) => o.restaurant },
      { id: 'city', label: 'Ville', sortValue: (o) => o.city },
      { id: 'items', label: 'Articles', sortValue: (o) => o.items.length, text: itemsText, render: (o) => itemsText(o) || '—', className: 'clip' },
      {
        id: 'total',
        label: 'Total',
        sortValue: (o) => o.price,
        render: (o) => (o.price != null && o.currency ? fmtMoney(o.price, o.currency) : '—'),
        className: 'num',
      },
      { id: 'mode', label: 'Mode', sortValue: (o) => (o.fulfillment ? fulfillmentLabel(o.fulfillment) : null) },
      {
        id: 'status',
        label: 'Statut',
        sortValue: (o) => orderStatusLabel(o.status),
        render: (o) => <span className={`tag ${statusTone(o.status)}`}>{orderStatusLabel(o.status)}</span>,
      },
    ],
    [],
  );

  const filters = useMemo<SelectFilter<EatsOrder>[]>(
    () => [
      { id: 'status', label: 'Statut', value: (o) => o.status, optionLabel: orderStatusLabel },
      { id: 'year', label: 'Année', value: (o) => o.t.slice(0, 4) },
      { id: 'cur', label: 'Devise', value: (o) => o.currency ?? '' },
    ],
    [],
  );

  if (!s) return null;

  const shownCurrencies = currency ? [currency] : s.currencies;
  const monthSeries = shownCurrencies.map((c) => ({ key: c, name: c }));
  const avg = s.spend.map((m) => fmtMoney(m.amount / m.count, m.currency));

  return (
    <>
      <Kpis
        items={[
          { label: 'Commandes livrées', value: fmtInt(s.completed), hint: `sur ${fmtInt(s.orders)} commandes` },
          { label: 'Total dépensé', value: moneyList(s.spend) },
          { label: 'Panier moyen', value: avg },
          { label: 'Annulées / non abouties', value: fmtInt(s.failed) },
          { label: 'Restaurants différents', value: fmtInt(s.restaurants) },
          { label: 'Lignes d’articles', value: fmtInt(s.itemLines), hint: 'commandes livrées' },
        ]}
      />
      <div className="grid">
        <ChartCard
          wide
          title="Dépenses par mois"
          sub={
            s.currencies.length > 1 && !currency
              ? 'Commandes livrées, montants empilés par devise (non convertis)'
              : 'Commandes livrées'
          }
          actions={
            s.currencies.length > 1 && (
              <label className="field">
                Devise
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="">Toutes (empilées)</option>
                  {s.currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )
          }
          data={{
            headers: ['Mois', ...shownCurrencies],
            rows: s.byMonth.map((m) => [fmtMonthLong(m.month), ...shownCurrencies.map((c) => fmtMoney(Number(m[c] ?? 0), c))]),
          }}
        >
          <ColumnChart
            data={s.byMonth}
            xKey="month"
            series={monthSeries}
            stacked
            height={260}
            xFormat={fmtMonthShort}
            tooltipTitle={(l) => fmtMonthLong(String(l))}
            valueFormat={(v, key) => fmtMoney(v, key)}
          />
        </ChartCard>
        <ChartCard title="Restaurants les plus commandés" sub="Nombre de commandes livrées" data={{ headers: ['Restaurant', 'Commandes'], rows: s.topRestaurants.map((r) => [r.key, r.count]) }}>
          <HBarChart items={s.topRestaurants} />
        </ChartCard>
        <ChartCard title="Articles favoris" sub="Quantité commandée" data={{ headers: ['Article', 'Quantité'], rows: s.topItems.map((r) => [r.key, r.count]) }}>
          <HBarChart items={s.topItems} colorIndex={1} />
        </ChartCard>
        <ChartCard
          title="Mode de livraison"
          sub="Toutes les commandes"
          data={{ headers: ['Mode', 'Commandes'], rows: s.fulfillment.map((r) => [fulfillmentLabel(r.key), r.count]) }}
        >
          <HBarChart items={s.fulfillment} label={fulfillmentLabel} colorIndex={2} />
        </ChartCard>
        <ChartCard
          title="Jour de commande"
          sub="Commandes livrées"
          data={{ headers: ['Jour', 'Commandes'], rows: s.weekdays.map((n, i) => [WEEKDAYS_LONG[i], n]) }}
        >
          <ColumnChart data={s.weekdays.map((n, i) => ({ key: WEEKDAYS[i], n }))} xKey="key" series={[{ key: 'n', name: 'Commandes' }]} />
        </ChartCard>
        <ChartCard
          title="Heure de commande"
          sub="Heure locale, commandes livrées"
          data={{ headers: ['Heure', 'Commandes'], rows: s.hours24.map((n, i) => [`${i} h`, n]) }}
        >
          <ColumnChart data={s.hours24.map((n, i) => ({ key: `${i}h`, n }))} xKey="key" series={[{ key: 'n', name: 'Commandes' }]} />
        </ChartCard>
      </div>
      <section className="card table-card" aria-labelledby="eats-table-title">
        <h3 id="eats-table-title">Toutes les commandes</h3>
        <DataTable
          caption="Commandes Uber Eats"
          rows={orders}
          columns={columns}
          filters={filters}
          initialSort={{ id: 'date', dir: 'desc' }}
         
        />
      </section>
    </>
  );
}
