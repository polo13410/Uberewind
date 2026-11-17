# Uber Data Viewer

Prototype de site **100 % statique** qui affiche sous forme de tableau de bord l'export de données Uber (le zip « Uber Data Request »). Il couvre les courses, Uber Eats et le compte.

**Les données ne quittent jamais le navigateur.** Il n'y a ni backend, ni base de données, ni analytics, ni CDN. La Content-Security-Policy interdit toute connexion réseau depuis la page (`connect-src 'none'`).

> Non affilié à Uber Technologies Inc.

## Démarrer

```bash
npm install          # Node 26 requis (voir .nvmrc)
npm run dev          # http://localhost:5173
```

Pour obtenir un export : app ou site Uber, puis **Compte → Confidentialité → Télécharger vos données**. Déposez ensuite le `.zip` sur la page d'accueil. Vous pouvez aussi déposer plusieurs `.csv`, ou le dossier décompressé.

## Tester

```bash
npm test             # Vitest : module de parsing pur (fixtures dans tests/fixtures)
npm run test:e2e     # build + Playwright (Chromium) sur `vite preview` avec la CSP de production
PERF=1 npm test      # en plus : test de charge sur ~60 Mo de CSV synthétiques
npm run typecheck
```

- `tests/core/sample.test.ts` compare le résultat aux chiffres de référence de `sample-data/Uber Data/dashboard.html` : 68 courses terminées, ≈ 560 km, 127 commandes Eats, 322 lignes d'articles. Le test est **ignoré automatiquement** si `sample-data/` est absent. Ce dossier contient un vrai export personnel ; il est dans `.gitignore` et ne doit jamais être commité.
- Le test e2e vérifie plusieurs choses :
  - qu'**aucune requête ne quitte l'origine** et qu'aucune violation CSP n'apparaît ;
  - qu'un `fetch` externe est bien bloqué ;
  - que les valeurs sensibles des fixtures n'apparaissent pas dans le DOM ;
  - la navigation clavier dans les onglets et la remise à zéro ;
  - l'absence de scroll horizontal et une gouttière de 16 px à 375 px de large.
- La première exécution de Playwright nécessite `npx playwright install chromium`.

## Déployer sur Netlify

Le fichier `netlify.toml` contient tout le nécessaire : `npm run build`, dossier `dist`, Node 26 (`.nvmrc`, `engines`), en-têtes de sécurité.

1. Poussez le dépôt sur GitHub, GitLab ou Bitbucket.
2. Dans Netlify : *Add new site → Import an existing project*, puis choisissez le dépôt. Les réglages sont lus depuis `netlify.toml`.
3. Autre possibilité, sans git : `npm run build`, puis glissez le dossier `dist/` sur <https://app.netlify.com/drop>. Dans ce cas, les en-têtes de `netlify.toml` ne s'appliquent pas, mais la CSP reste présente dans le `<meta>` injecté au build.

En-têtes envoyés : `Content-Security-Policy` (voir `csp.ts`), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` et `Cross-Origin-Resource-Policy`.

## Architecture

```
src/
  core/                 Parsing pur, sans DOM, entièrement testé
    loadExport.ts       Point d'entrée : (.zip | .csv)[] → { dataset, stats, warnings }. Ne lève jamais d'exception.
    registry.ts         Nom de fichier → parseur (détection par nom, jamais par position)
    parsers/*.ts        Un parseur par type de fichier, avec liste blanche de colonnes et alias
    csv.ts              PapaParse ligne par ligne + projection sur les seules colonnes utiles
    decode.ts           UTF-8 / UTF-16 / repli Windows-1252, décompte des caractères « � »
    values.ts           Nombres et dates tolérants, normalisation des libellés (Green/GREEN), liste noire de colonnes
    aggregate.ts        Statistiques des graphiques et KPIs
  worker/parser.worker.ts   Exécute loadExport hors du thread UI
  state/useExportLoader.ts  Cycle de vie du worker, état en mémoire seulement ; reset() efface tout
  ui/                   React : accueil, tableau de bord (4 onglets), graphiques Recharts, tableaux
csp.ts                  Source unique de la CSP (meta au build, en-tête de preview, vérifiée contre netlify.toml)
```

**Flux :**

1. **Dépôt.** `DropZone` transmet les objets `File` au **Web Worker** par `postMessage`. Le thread UI ne lit jamais le contenu.
2. **Décompression.** Le worker utilise `fflate.unzipSync` avec un filtre : seuls les fichiers reconnus sont décompressés. `eats_app_analytics` (IP, IMEI…) et `communications_*` ne sont jamais décompressés.
3. **Lecture.** Chaque fichier passe par `decode`, puis PapaParse lit les lignes une à une. À chaque ligne, seules les colonnes de la liste blanche sont copiées, puis le parseur produit des enregistrements compacts.
4. **Finalisation et retour.** `finalizeDataset` normalise les libellés et regroupe les lignes Eats par `Order_UUID`. `computeStats` calcule les agrégats. Le worker renvoie le résultat.
5. **Affichage.** React garde le résultat en mémoire et l'affiche. Le code des graphiques (Recharts) est chargé à la demande.

**Confidentialité au parsing :**
- Chaque parseur déclare une **liste blanche** de champs ; aucune autre colonne n'est lue.
- En plus, `SENSITIVE_HEADER_RE` empêche qu'un alias résolve vers une colonne email, téléphone, IP, IMEI, appareil, carte, BIN, message, contenu, nom de famille ou coordonnées GPS.
- Les tickets de support ne donnent que le nombre de messages et les dates. Les moyens de paiement ne donnent qu'un décompte par type.
- Ni `localStorage` ni IndexedDB : fermer l'onglet ou cliquer sur « Charger un autre export » efface tout.

**Choix techniques :**
- **Recharts** : composants React en SVG. Aucun style injecté par attribut, donc compatible avec `style-src 'self'` strict.
- **fflate** : zip rapide et léger, qui permet de filtrer avant décompression.
- **Tableaux** : affichage limité à 200 lignes avec « Afficher plus », recherche texte, filtres et tri par colonne (`aria-sort`).

## Ajouter un nouveau type de fichier

Exemple : `driver_lifetime_trips-*.csv`.

1. **Modèle.** Dans `src/core/types.ts`, ajoutez le type d'enregistrement et un champ dans `Dataset` (`null` signifie « fichier absent »).
2. **Builder.** Dans `src/core/builder.ts`, ajoutez l'accumulateur correspondant.
3. **Parseur.** Dans `src/core/parsers/`, écrivez `parseX(text, ctx, builder)` :
   - déclarez la liste blanche `FIELDS` (`{ key, aliases: [...] }`, alias par ordre de priorité, comparés après normalisation casse/espaces/BOM) ;
   - appelez `readCsv(text, ctx, { fields, onHeader, onRow })` ;
   - signalez les problèmes avec `ctx.warn(level, message)`, sans jamais lever d'exception.
4. **Registre.** Dans `src/core/registry.ts`, ajoutez une entrée à `FILE_SPECS` : `{ id, label, pattern: re('driver_lifetime_trips'), parse: parseX }`. Le motif accepte automatiquement les suffixes `-0`, `-1`…
5. **Finalisation.** Dans `src/core/loadExport.ts`, recopiez le builder vers le `Dataset` dans `finalizeDataset`. Ajoutez au besoin des agrégats dans `aggregate.ts`.
6. **Tests.** Ajoutez une fixture minuscule dans `tests/fixtures/` et un test dans `tests/core/`. Pensez à un cas de colonnes manquantes et à un cas de confidentialité.
7. **Interface.** Ajoutez un onglet ou une carte dans `src/ui/`. L'onglet doit être masqué quand la donnée vaut `null`.

## Limites connues

- Les formats ont été validés sur **un seul export réel** (rider et eater, 2026, en anglais). Les alias de l'ancien format `trips_data.csv` sont fournis au mieux, sans test sur données réelles. Les exports chauffeur (driver) ne sont pas gérés : ils sont listés comme « non reconnus ».
- Les heures sont affichées telles qu'Uber les fournit (`*_local`), sans conversion de fuseau.
- Les dépenses ne sont pas converties entre devises. Le graphique empilé « Dépenses par mois » additionne visuellement des devises différentes ; un sélecteur permet d'isoler une devise.
- Les dépenses de courses reprennent `original_fare_local` des courses terminées : hors pourboire, sans frais d'annulation.
- Le bundle de la page d'accueil fait ≈ 230 Ko (72 Ko gzip) ; les graphiques ajoutent ≈ 460 Ko (130 Ko gzip), chargés après le dépôt.
- Sur ~50 Mo de CSV, l'affichage prend ≈ 3 s, et la réception du résultat fige l'UI ≈ 0,2 s (clonage structuré). Au-delà de ~300 Mo par fichier, le fichier est ignoré avec un avertissement.
