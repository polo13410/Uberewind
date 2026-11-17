import { lazy, Suspense } from 'react';
import { useExportLoader } from '../state/useExportLoader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './Landing';

// Charts (Recharts) are only downloaded once an export has been parsed.
const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })));

export function App() {
  const { state, load, reset } = useExportLoader();

  return (
    <>
      {state.status === 'ready' ? (
        <ErrorBoundary label="le tableau de bord">
          <Suspense fallback={<Landing onFiles={load} loading="Préparation du tableau de bord…" />}>
            <Dashboard result={state.result} onReset={reset} />
          </Suspense>
        </ErrorBoundary>
      ) : state.status === 'error' ? (
        <div className="container landing">
          <div className="notice" role="alert">
            <h2>La lecture a échoué</h2>
            <p>{state.message}</p>
            <button type="button" className="btn btn-primary" onClick={reset}>
              Réessayer
            </button>
          </div>
        </div>
      ) : (
        <Landing onFiles={load} loading={state.status === 'loading' ? state.message : undefined} />
      )}
      <footer>
        <div className="container">
          Uber Data Viewer — prototype open source. Non affilié à Uber Technologies Inc. « Uber » et « Uber Eats » sont
          des marques de leurs propriétaires respectifs. Aucune donnée ne quitte votre appareil et aucune donnée n'est stockée.
        </div>
      </footer>
    </>
  );
}
