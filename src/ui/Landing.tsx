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
          Déposez l’export de vos données Uber pour voir vos courses et vos commandes Uber Eats sous forme de graphiques
          et de cartes.
        </p>

        <DropZone onFiles={onFiles} loading={loading} />

        <p className="trust">
          Les données que vous déposez sont lues uniquement dans votre navigateur, sans passer par un serveur. Le{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            code est entièrement open source
          </a>
          .
        </p>

        <ol className="hero-steps">
          <li>
            <span className="step-n" aria-hidden="true">
              1
            </span>
            <div>
              <h2>Demandez vos données à Uber</h2>
              <p>
                Ça se passe sur{' '}
                <a href={UBER_DATA_URL} target="_blank" rel="noopener noreferrer">
                  la page « Télécharger vos données » d’Uber
                </a>{' '}
                (Compte → Confidentialité). Uber envoie ensuite un lien par e-mail, en général sous quelques jours.
              </p>
            </div>
          </li>
          <li>
            <span className="step-n" aria-hidden="true">
              2
            </span>
            <div>
              <h2>Déposez le fichier reçu</h2>
              <p>Pas besoin de décompresser le .zip, il suffit de le déposer ci-dessus. La lecture prend quelques secondes.</p>
            </div>
          </li>
        </ol>

        <details className="hero-privacy">
          <summary>Comment vos données sont traitées</summary>
          <ul>
            <li>
              Le site est une application React statique. Il n’a pas été prévu pour enregistrer vos données, il n’y a
              donc pas de serveur derrière, ni de base de données, ni d’outil de mesure d’audience.
            </li>
            <li>
              La page est configurée pour bloquer toute connexion réseau sortante (<code>connect-src 'none'</code> dans
              sa politique de sécurité). Même en cas de bug, elle ne pourrait pas envoyer vos données.
            </li>
            <li>
              Certaines colonnes de l’export ne sont pas lues du tout. C’est le cas de l’e-mail, du téléphone, des
              adresses IP, des identifiants d’appareil, des numéros de carte et des messages envoyés au support.
            </li>
            <li>
              Rien n’est sauvegardé. Les données restent en mémoire le temps de la visite et disparaissent quand vous
              fermez l’onglet ou chargez un autre export.
            </li>
            <li>
              Les cartes sont dessinées à partir de fichiers inclus dans le site, sans connexion. Si vous activez
              l’option « Afficher les rues » (désactivée par défaut), le navigateur télécharge les images de la zone
              affichée depuis OpenStreetMap. Rien de votre export ne leur est envoyé.
            </li>
          </ul>
        </details>
      </main>
    </div>
  );
}
