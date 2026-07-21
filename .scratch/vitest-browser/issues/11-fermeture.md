# 11 — Fermeture : supprimer le shim, jsdom, et vérifier la CI

Type: task
Status: claimed
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
