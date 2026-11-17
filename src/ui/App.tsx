import { lazy, Suspense } from 'react';
import { useExportLoader } from '../state/useExportLoader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './Landing';
import { REPO_URL } from './links';

// Charts (Recharts) are only downloaded once an export has been parsed.
const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })));

export function App() {
  const { state, load, reset } = useExportLoader();
  const onLanding = state.status !== 'ready';

  return (
    <div className={onLanding ? 'page page-hero' : 'page'}>
      {state.status === 'ready' ? (
        <ErrorBoundary label="le tableau de bord">
          <Suspense fallback={<Landing onFiles={load} loading="Préparation du tableau de bord…" />}>
            <Dashboard result={state.result} onReset={reset} />
          </Suspense>
        </ErrorBoundary>
      ) : state.status === 'error' ? (
        <div className="hero">
          <main className="hero-main">
            <div className="notice" role="alert">
              <h2>La lecture a échoué</h2>
              <p>{state.message}</p>
              <button type="button" className="btn btn-primary" onClick={reset}>
                Réessayer
              </button>
            </div>
          </main>
        </div>
      ) : (
        <Landing onFiles={load} loading={state.status === 'loading' ? state.message : undefined} />
      )}
      <footer className="site-footer">
        <span>Non affilié à Uber</span>
        <span aria-hidden="true">·</span>
        <span>Aucune donnée envoyée ni stockée</span>
        <span aria-hidden="true">·</span>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          Open source (MIT)
        </a>
      </footer>
    </div>
  );
}
