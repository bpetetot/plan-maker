# 09 — Lot 3 : le rendu sans événement

Type: task
Status: resolved
Blocked by: 05

## Question

Quatre fichiers qui ne dispatchent **rien** : ils rendent puis inspectent le
SVG par attribut. Ils n'ont besoin ni de `pointer()` ni de `clientAt`, donc ce
lot ne dépend pas de `testKit.ts` et peut tourner en parallèle de `07`.

- `openingGlyphStyle.test.tsx` (86 l.)
- `openingGap.test.tsx` (98 l.)
- `grid.test.tsx` (102 l.)
- `render.test.tsx` (416 l.) — le plus gros fichier du repo.

Le seul changement attendu est mécanique : `render` de `@testing-library/react`
devient le `render` **async** de `vitest-browser-react`, et le fichier sort de
`STILL_JSDOM`. Les `container.querySelector` restent tels quels — c'est le
côté « géométrie » de la règle de `05`, et il ne bouge pas.

Point d'attention : c'est le lot où une différence de rendu entre jsdom et
Chromium se manifesterait si elle existait — ces fichiers sont ceux qui
assertent le plus finement sur les attributs SVG produits. `03` et `04` ont
prédit zéro écart ; si l'un d'eux tombe, c'est ici qu'on le verra, et la
prédiction centrale de la carte est à réexaminer.

## Answer

**Les quatre fichiers sont verts du premier coup, et la prédiction centrale de
la carte tient sur le lot qui la testait le plus finement : zéro attendu
recalculé.** Le diff filtré sur les lignes `expect` ne remonte que deux
enrobages `await` (`expect((await renderDim(...)).text.textContent)`) — les
valeurs elles-mêmes (`'4,10 m'`, `'3,90 m'`, `'-5,5 405,5 405,-5 -5,-5'`,
`'98.5'`…) sont intactes. **Aucun écart de rendu jsdom → Chromium sur les
attributs SVG**, sur les 416 lignes de `render.test.tsx` comme sur les trois
autres. `03` et `04` avaient raison ; la question est close, il n'y a rien à
réexaminer.

**C'est le seul lot sans trouvaille — et c'est une confirmation du découpage de
`05`, pas un coup de chance.** `07` et `08` ont chacun trouvé un piège de
timing (React commit sur son scheduler ; `unmount()`/`cleanup()` asynchrones,
`pointermove`/`wheel` à deux ticks). Ici, rien : ces fichiers ne dispatchent
aucun événement et ne mutent aucun état hors React, donc **la seule frontière
asynchrone est le `render()` lui-même**. Grouper par règle mise à l'épreuve
plutôt que par taille a bien isolé un lot qui n'avait aucune règle à éprouver —
le plus gros fichier du repo est passé sans un arbitrage.

**Le diff est purement mécanique**, quatre substitutions et rien d'autre :

- `import { cleanup, render } from '@testing-library/react'` →
  `import { render } from 'vitest-browser-react'` (`cleanup` n'est réimporté
  que dans `render.test.tsx`, qui s'en sert au milieu de tests) ;
- `afterEach(cleanup)` **supprimé** dans les quatre — le nettoyage est
  automatique, et il tourne *avant* chaque test ;
- les quatre helpers de rendu de `render.test.tsx` (`renderDim`, `renderWall`,
  `renderPatch`, `renderRubber`) et le `draw` de `grid.test.tsx` deviennent
  `async`, et leurs appelants `await` — c'est là que passent les +121/−121 du
  gros fichier, presque exclusivement des `() => {` → `async () => {` ;
- les **4 `cleanup()` en milieu de test** de `render.test.tsx` (l. 88, 254,
  274, 290 — des boucles qui rendent plusieurs variantes d'affilée) deviennent
  `await cleanup()`, le legs de `08` appliqué avant qu'il ne morde. Aucun n'a
  échoué, mais ils étaient exactement la configuration que `08` décrit comme
  invisible à la lecture.

Les `container.querySelector` n'ont pas bougé d'une ligne, comme annoncé : le
versant « géométrie » de la règle de `05` est inerte ici. Le namespace SVG ne
s'est pas posé en question — les quatre fichiers enveloppaient déjà leur
fragment dans un `<svg>`, donc React place les nœuds dans le bon namespace en
navigateur comme en jsdom.

**Un fait mineur pour `11`** : trois `describe` de fonctions pures voyagent
avec ces fichiers vers le projet browser (`gridLevels`, `labelAngle`,
`dimTravelBounds` — ni DOM ni rendu) et leurs `it()` restent synchrones. C'est
le prix assumé de « l'extension est le marqueur » décidé en `03` : le coût est
nul (même fichier, même page), et les extraire rouvrirait une liste
d'exceptions. Rien à trancher, juste à ne pas prendre pour un oubli.

**Perf : 6,7 s → ~4,9 s** sur la suite complète (9,4 s avant la migration ;
8,05 s après `07`, 6,7 s après `08`), trois runs consécutifs stables — 5,02 /
4,96 / 4,87 s. Le gain de 1,8 s pour quatre fichiers confirme le mécanisme
mesuré en `04` : c'est le montage d'un `environment` jsdom **par fichier** qui
coûte, et chaque fichier qui sort de `STILL_JSDOM` le rend. La liste tombe de
**9 à 5** — les cinq exacts du lot `10`.

**Confort en watch : toujours pas observé.** Le patch de brouillard demandait
aux lots `07`–`10` de le mesurer en passant ; ce lot ne l'a pas fait (tout est
passé en `vitest run`). Il reste entier pour `10`.

`npm run typecheck`, `npm run lint` et `oxfmt --check` sont propres. 36
fichiers / 405 tests verts. Rien n'est commité.
