import type { LoadResult } from '../../core/types';
import { countBy } from '../../core/aggregate';
import { ChartCard, Empty, HBarChart } from '../components/Charts';
import { Kpis, type Kpi } from '../components/Kpis';
import { fmtDate, fmtDateLong, fmtInt, fmtNum, paymentLabel } from '../format';

export function Account({ result }: { result: LoadResult }) {
  const { profile, payments, locations, support } = result.dataset;

  const kpis: Kpi[] = [];
  if (profile) {
    kpis.push(
      { label: 'Note passager', value: profile.rating != null ? `${fmtNum(profile.rating, 2)} ★` : '—' },
      { label: 'Inscription', value: profile.signupDate ? fmtDateLong(profile.signupDate) : '—' },
    );
  }
  if (support) {
    kpis.push(
      { label: 'Messages au support', value: fmtInt(support.messages), hint: 'contenu non lu ni affiché' },
      {
        label: 'Période du support',
        value: support.first ? `${fmtDate(support.first)} → ${fmtDate(support.last)}` : '—',
      },
    );
  }
  if (payments) {
    kpis.push({ label: 'Moyens de paiement', value: fmtInt(Object.values(payments).reduce((a, b) => a + b, 0)), hint: 'enregistrés (historique)' });
  }

  const payItems = payments
    ? Object.entries(payments)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
    : [];

  // Same label used several times (e.g. two "home") is shown once with a count.
  const labelCounts = locations ? countBy(locations, (l) => l.label) : [];

  return (
    <>
      <Kpis items={kpis} />
      <div className="grid">
        {payments && (
          <ChartCard
            title="Moyens de paiement enregistrés"
            sub="Par type (les numéros de carte ne sont pas lus)"
            data={{ headers: ['Type', 'Nombre'], rows: payItems.map((p) => [paymentLabel(p.key), p.count]) }}
          >
            <HBarChart items={payItems} label={paymentLabel} />
          </ChartCard>
        )}
        {locations && (
          <section className="card" aria-labelledby="loc-title">
            <h3 id="loc-title">Adresses enregistrées</h3>
            <p className="card-sub">{fmtInt(locations.length)} adresse(s), {fmtInt(labelCounts.length)} libellé(s)</p>
            {locations.length ? (
              <ul className="locations">
                {locations.map((l, i) => (
                  <li key={i}>
                    <b>{l.label}</b>
                    <br />
                    <span className="muted">{l.address}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty />
            )}
          </section>
        )}
      </div>
    </>
  );
}
