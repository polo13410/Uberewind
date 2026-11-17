import { DropZone } from './components/DropZone';
import { PrivacyBadge } from './PrivacyBadge';

export function Landing({ onFiles, loading }: { onFiles: (f: File[]) => void; loading?: string }) {
  return (
    <div className="container landing">
      <PrivacyBadge />
      <h1>Uber Data Viewer</h1>
      <p className="lead">
        Explorez vos courses et commandes Uber Eats à partir de l’export officiel de vos données. Le fichier est lu
        directement dans votre navigateur : rien n’est envoyé sur Internet, rien n’est conservé.
      </p>

      {loading ? (
        <div className="dropzone loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>{loading}</span>
        </div>
      ) : (
        <DropZone onFiles={onFiles} />
      )}

      <h2>Obtenir votre export</h2>
      <ol className="steps">
        <li>
          Dans l’app ou sur le site Uber : <b>Compte → Confidentialité → Télécharger vos données</b>.
        </li>
        <li>Uber vous envoie un lien par e-mail (souvent sous quelques jours). Téléchargez le fichier .zip.</li>
        <li>Déposez le .zip ci-dessus, sans le décompresser. Les fichiers .csv seuls fonctionnent aussi.</li>
      </ol>

      <h2>Confidentialité</h2>
      <ul>
        <li>Aucun serveur, aucune base de données, aucun traceur : le site est entièrement statique.</li>
        <li>
          La politique de sécurité du site interdit toute connexion réseau depuis la page (<code>connect-src 'none'</code>).
        </li>
        <li>
          E-mail, téléphone, adresses IP, identifiants d’appareil, numéros de carte et contenu des messages au support
          sont ignorés dès la lecture et ne sont jamais affichés.
        </li>
        <li>Fermer l’onglet ou cliquer sur « Charger un autre export » efface tout de la mémoire.</li>
      </ul>
    </div>
  );
}
