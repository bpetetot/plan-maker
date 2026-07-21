# 11 — Fermeture : supprimer le shim, jsdom, et vérifier la CI

Type: task
Status: resolved
Blocked by: 08, 09, 10

## Question

Le dernier lot ne migre presque rien — il **supprime**, et c'est ce qui rend
la destination de la carte atteinte. `04` avait choisi une liste noire qui
rétrécit (`STILL_JSDOM`) précisément pour que cette étape soit une pure
soustraction.

**Les deux renommages** (décidés en `03` : l'extension *est* le marqueur
d'environnement) :

- `src/editor/preference.test.ts` → `.tsx` (veut un vrai DOM : `localStorage`)
- `src/theme/theme.test.ts` → `.tsx` (idem)
- `src/editor/roomTextBlocks.test.ts` **reste en `.ts`** — aucun global DOM,
  il tombe en node gratuitement.

**Les suppressions :**

- `src/editor/testHelpers.ts` — le fichier entier.
- `const STILL_JSDOM` et sa mention dans le projet `node` de `vite.config.ts`.
  À ce stade la liste doit être **vide** ; si elle ne l'est pas, un lot est
  incomplet.
- Les docblocks `// @vitest-environment jsdom` résiduels.
- `jsdom`, `@testing-library/dom`, `@testing-library/react`,
  `@testing-library/jest-dom` s'il y est — de `package.json`. Vérifier
  qu'aucun import ne subsiste (`grep -r "@testing-library" src/`).

**La CI, vérifiée pour de bon.** L'étape a été landée avec `04` (le diff écrit
à la ligne près en `02` : cache `actions/cache` sur `~/.cache/ms-playwright`,
clé sur la version `playwright-core` du lockfile) mais **n'a jamais tourné** —
il y faut une push. C'est le dernier fait non vérifié de la carte. Mesurer au
passage le temps du job à froid et à chaud, le cache faisant ~337 Mo.

**Décider du sort du spike** `.scratch/vitest-browser/spike.{config.ts,test.tsx}`,
conservé depuis `06`. Il documente le comportement de `setPointerCapture` par
`pointerId` — le fait sur lequel repose toute la migration. Le garder comme
canari, ou le supprimer maintenant que 25 fichiers l'exercent en continu ?

**Commiter.** La destination exige que le tout soit commité et la CI verte.

## Answer

**La destination est atteinte à un fait près, et ce fait n'est pas une
inconnue technique — c'est un identifiant manquant.** Les 25 fichiers tournent
en Chromium, jsdom et les deux paquets `@testing-library` sont désinstallés,
`src/editor/testHelpers.ts` n'existe plus, `STILL_JSDOM` non plus, et les
trois commits sont posés. Les quatre portes de la CI passent en local
(`format:check`, `lint`, `typecheck`, `test`). **Seule la CI elle-même n'a pas
tourné**, et pour une raison hors périmètre : la branche n'a jamais pu être
poussée.

**Le lot n'a rien trouvé, comme `09` et `10` avant lui** — trois des cinq lots
sur cinq n'ont opposé aucune résistance. Suppressions et renommages sans un
arbitrage : les deux fichiers passés en `.tsx` (`preference`, `theme`) sont
verts sans une ligne de plus, `roomTextBlocks.test.ts` tombe en node
gratuitement comme `03` l'avait prédit, et `STILL_JSDOM` était bien **vide** —
aucun lot n'était incomplet. Suite finale : **36 fichiers, 405 tests, ~3,96 s**
et surtout **`environment 1ms`**, la preuve chiffrée qu'aucun jsdom n'est plus
monté nulle part (9,4 s au départ, ~900 ms par fichier de montage
d'environnement).

**Deux découvertes, toutes deux en marge de la migration.**

1. **La CI était déjà rouge avant cette carte**, sur une étape que personne
   n'avait regardée. Le `render.tsx` de `HEAD` n'est pas conforme à
   `oxfmt` 0.59 — vérifié en extrayant le fichier de `HEAD` et en le passant
   au formateur isolément, et en confirmant que la version d'`oxfmt` est
   identique dans le lockfile d'avant et d'après (0.59.0, mes opérations npm
   n'y sont pour rien). Un lot avait ramassé le correctif au passage via un
   `npm run format`. **Sorti dans son propre commit** : ce n'est pas de la
   migration, et le confondre aurait fait passer un correctif CI préexistant
   pour un effet de bord des tests. Conséquence à connaître : la CI que `11`
   devait vérifier n'aurait de toute façon pas été verte sans ce commit.

2. **`jsdom` survit dans le lockfile, et c'est correct de l'y laisser.** Il y
   reste en **peer optionnel de `vitest` lui-même** (`"optional": true,
   "peer": true`), pas comme dépendance du projet — `npm ls jsdom` donne
   `vitest@4.1.10 -> jsdom@29.1.1`. Régénérer le lockfile à zéro ne l'enlève
   pas et **retire au passage des entrées optionnelles multi-plateformes**
   (`@emnapi/*`, `@napi-rs/wasm-runtime`) qui n'ont rien demandé : 2122 lignes
   de diff contre 416 pour le `npm uninstall` chirurgical. Le lockfile retenu
   est celui du `npm uninstall`. La destination visait `package.json`, qui est
   propre ; le reste appartient à vitest.

**Sort du spike : supprimé**, et l'argument n'est pas « c'est couvert
ailleurs ». Le garder « comme canari » était une illusion : il vit dans
`.scratch/`, hors de tout `include` de projet, donc **aucun runner ne le
lance** — si Chromium changeait son traitement du `pointerId: 1`, le spike ne
dirait rien et les 25 fichiers deviendraient rouges exactement pareil. Pour
qu'il soit réellement un canari il faudrait le promouvoir dans `src/`, c'est-à-dire
**ajouter de la couverture de test — explicitement hors périmètre** de cette
carte. Entre un test que rien n'exécute (qui pourrit) et une extension du
périmètre, aucune des deux ne se défend : le fait vit dans `06` et dans le
commentaire de `pointer()` dans `testKit.ts`, qui est le point de remplacement
unique le jour où `vitest#10780` atterrit.

**Découpage en trois commits**, chacun vert dans son propre contexte de
dépendances, et l'ordre est contraint : `useView` **après** la migration et
non avant, puisque retirer le repli `window.addEventListener('resize')` casse
`resizeView.test` tant que ce fichier pilote encore les redimensionnements par
événement window.

- `3d79c24 style(editor): reformat render.tsx to oxfmt` — le correctif CI
  préexistant, isolé.
- `65fecce test: run component tests in Vitest browser mode` — 46 fichiers,
  +3334/−1171, la migration entière (tests, config, `testKit.ts`,
  `testSetup.browser.ts`, `CLAUDE.md`, `.gitignore`, l'étape CI, les
  désinstallations, la carte elle-même).
- `98552aa refactor(editor): drop the ResizeObserver fallback in useView` —
  le seul fichier de production touché par la carte, sorti du périmètre
  « tests » comme `10` l'exigeait.

**Le fait qui reste non vérifié, et ce qu'il faut pour le lever.** `git push`
échoue deux fois : le remote est en SSH (`git@github.com:…`), que le proxy du
sandbox ne sait pas authentifier, et l'URL HTTPS équivalente rend
`could not read Username` — **aucun token GitHub n'est configuré comme secret
du sandbox**. À lever côté hôte par
`sbx secret set $(hostname) github -t "$(gh auth token)"`. Second point à
connaître avant de réessayer : le workflow ne se déclenche que sur
`pull_request` ou sur un push vers `main`/`production`, donc **pousser la
branche seule ne lancerait rien** — il faut une PR. Le dev a choisi
« pousser seulement, PR plus tard » ; les mesures à froid / à chaud du job
(cache Playwright ~337 Mo) restent donc à prendre à ce moment-là.
