import { Logo, Wordmark } from './brand/Logo';
import { DropZone } from './components/DropZone';
import { REPO_URL, UBER_DATA_URL } from './links';

const GitHubIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
    />
  </svg>
);

export function Landing({ onFiles, loading }: { onFiles: (f: File[]) => void; loading?: string }) {
  return (
    <div className="hero">
      <header className="hero-nav">
        <span className="hero-brand">
          <Logo size={30} invert />
          <span>Uberewind</span>
        </span>
        <a className="hero-gh" href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <GitHubIcon /> Code source
        </a>
      </header>

      <main className="hero-main">
        <Wordmark as="h1" className="hero-title" />
        <p className="hero-tagline">
          Rembobinez vos années Uber : courses, commandes Eats, villes et habitudes, en un coup d’œil.
        </p>

        <DropZone onFiles={onFiles} loading={loading} />

        <ul className="trust">
          <li>
            <span aria-hidden="true">🔒</span> Vos données restent sur votre appareil
          </li>
          <li>
            <span aria-hidden="true">🚫</span> Aucun serveur, aucun traceur
          </li>
          <li>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <GitHubIcon /> 100 % open source : vérifiez le code
            </a>
          </li>
        </ul>

        <ol className="hero-steps">
          <li>
            <span className="step-n" aria-hidden="true">
              1
            </span>
            <div>
              <h2>Demandez vos données</h2>
              <p>
                Sur{' '}
                <a href={UBER_DATA_URL} target="_blank" rel="noopener noreferrer">
                  la page « Télécharger vos données » d’Uber
                </a>{' '}
                (Compte → Confidentialité). Le lien arrive par e-mail, en quelques jours maximum.
              </p>
            </div>
          </li>
          <li>
            <span className="step-n" aria-hidden="true">
              2
            </span>
            <div>
              <h2>Glissez-déposez, profitez</h2>
              <p>Déposez le .zip ci-dessus, sans le décompresser : votre rétrospective s’affiche instantanément.</p>
            </div>
          </li>
        </ol>

        <details className="hero-privacy">
          <summary>Comment vos données sont protégées</summary>
          <ul>
            <li>Le site est entièrement statique : pas de serveur, pas de base de données, pas d’analytics.</li>
            <li>
              Sa politique de sécurité interdit toute connexion réseau depuis la page (<code>connect-src 'none'</code>) :
              même par erreur, vos données ne peuvent pas partir.
            </li>
            <li>
              E-mail, téléphone, adresses IP, identifiants d’appareil, numéros de carte et messages au support sont ignorés
              dès la lecture et ne sont jamais affichés.
            </li>
            <li>Rien n’est conservé : fermer l’onglet ou charger un autre export efface tout de la mémoire.</li>
            <li>
              Les cartes fonctionnent hors ligne. Seule exception, sur demande explicite : le fond de rues OpenStreetMap,
              désactivé par défaut. Il ne demande que des images de la zone affichée, jamais vos données.
            </li>
          </ul>
        </details>
      </main>
    </div>
  );
}
