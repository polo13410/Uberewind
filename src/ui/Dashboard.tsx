import { useState } from 'react';
import type { LoadResult } from '../core/types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Tabs, type TabDef } from './components/Tabs';
import { WarningsPanel } from './components/WarningsPanel';
import { fmtDateLong, fmtInt } from './format';
import { PrivacyBadge } from './PrivacyBadge';
import { Account } from './tabs/Account';
import { Eats } from './tabs/Eats';
import { Overview } from './tabs/Overview';
import { Rides } from './tabs/Rides';

export function Dashboard({ result, onReset }: { result: LoadResult; onReset: () => void }) {
  const { dataset: d, stats } = result;

  // Only show tabs for which there is data.
  const tabs: TabDef[] = [];
  if (d.trips || d.orders) tabs.push({ id: 'overview', label: 'Vue d’ensemble' });
  if (stats?.eats) tabs.push({ id: 'eats', label: 'Uber Eats' });
  if (stats?.rides) tabs.push({ id: 'rides', label: 'Courses' });
  if (d.profile || d.payments || d.locations || d.support) tabs.push({ id: 'account', label: 'Compte' });

  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;

  const subtitle = [
    d.profile?.firstName && `Bonjour ${d.profile.firstName}`,
    d.profile?.signupDate && `membre depuis le ${fmtDateLong(d.profile.signupDate)}`,
    d.trips && `${fmtInt(d.trips.length)} courses`,
    d.orders && `${fmtInt(d.orders.length)} commandes Eats`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <header className="container topbar">
        <div className="topbar-row">
          <div>
            <h1>Mes données Uber</h1>
            {subtitle && <p className="sub">{subtitle}</p>}
          </div>
          <button type="button" className="btn" onClick={onReset}>
            ↺ Charger un autre export
          </button>
        </div>
        <p>
          <PrivacyBadge />
        </p>
        <WarningsPanel warnings={result.warnings} open={tabs.length === 0} />
      </header>

      {tabs.length > 0 ? (
        <>
          <nav className="tabbar" aria-label="Sections">
            <div className="container">
              <Tabs tabs={tabs} active={current!} onChange={setActive} />
            </div>
          </nav>
          <main className="container">
            <div role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`} tabIndex={0}>
              <ErrorBoundary key={current} label="cet onglet">
                {current === 'overview' && <Overview result={result} />}
                {current === 'eats' && <Eats result={result} />}
                {current === 'rides' && <Rides result={result} />}
                {current === 'account' && <Account result={result} />}
              </ErrorBoundary>
            </div>
          </main>
        </>
      ) : (
        <main className="container">
          <div className="notice">
            <h2>Aucune donnée exploitable</h2>
            <p>
              Aucun des fichiers déposés n’a pu être interprété. Vérifiez qu’il s’agit bien de l’export « Uber Data
              Request » (fichier .zip), puis réessayez. Le détail est indiqué dans les avertissements ci-dessus.
            </p>
            <button type="button" className="btn btn-primary" onClick={onReset}>
              Réessayer
            </button>
          </div>
        </main>
      )}
    </>
  );
}
