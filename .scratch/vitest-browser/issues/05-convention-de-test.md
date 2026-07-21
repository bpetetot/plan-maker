# 05 — La convention de test, écrite noir sur blanc

Type: grilling
Status: resolved
Blocked by: 04

## Question

Le dev a tranché au cadrage que les deux styles d'événements cohabiteraient.
`01` a depuis retiré une partie du choix : `userEvent` n'a **aucune** primitive
pointer, donc les 144 appels pointer n'ont qu'un chemin, le dispatch manuel.
Restent 86 appels (`click` 38, `keyDown` 23, `change` 10, `doubleClick` 8,
`contextMenu` 7) pour lesquels le choix existe vraiment. Une règle floue
appliquée à 24 fichiers produit 24 styles différents ; ce ticket l'écrit
précisément, à la lumière de ce que `04` a réellement coûté.

- **La règle de partage, reformulée.** Elle ne porte plus que sur les 86
  appels non-pointer. `userEvent` pour tous (cohérent, vrais événements, mais
  asynchrone donc diff plus large) ? Dispatch manuel pour tous (proche du
  code actuel, cohérent avec les drags voisins) ? Ou un critère — et lequel,
  sachant qu'un même test mêle souvent un drag et un clic ? Passer les 25
  fichiers en revue et vérifier que la règle les classe sans ambiguïté ; si
  trois cas résistent, la règle est mauvaise.
- **La règle non négociable, établie par `06` : tout `pointerdown` dispatché à
  la main porte `pointerId: 1`.** Ce n'est pas un point de style — c'est ce qui
  fait tenir toute la migration. `new PointerEvent(...)` sans `pointerId` vaut
  `0`, et `setPointerCapture(0)` lève `NotFoundError` dans les quatre appels
  non gardés d'`Editor.tsx`. Aucun des 58 `fireEvent.pointerDown` actuels ne le
  précise. La question ici n'est donc pas *si*, mais *comment on la rend
  impossible à oublier* : helper de dispatch obligatoire (ce qui rejoint le
  point suivant), lint, ou simple consigne écrite ?
- **Le dispatch manuel est désavoué par la doc Vitest.** On l'assume comme
  convention durable, ou on l'écrit comme dette avec la PR `pointer` amont
  (#10780, base v5) comme porte de sortie identifiée ? Ça détermine si un
  helper maison encapsule le dispatch pour être remplaçable d'un seul endroit
  le jour où l'API officielle atterrit.
- **Les requêtes.** Locators partout, ou `container.querySelector` conservé là
  où il l'est déjà ? Beaucoup de tests de l'éditeur sélectionnent des nœuds
  SVG par attribut, ce que les locators sémantiques ne couvrent pas bien.
- **Le successeur de `testHelpers.ts`.** Le fichier meurt, mais `viewBoxOf`,
  `zoomLabel` et `clientAt` ont chacun un remplaçant à nommer et à loger.
  Nouveau module d'helpers, ou dissolution dans les tests ?
- **`act()`.** Verdict général : on les supprime tous, on les garde, ou au cas
  par cas selon un critère.
- **Où la convention est écrite.** `CLAUDE.md` (section Conventions),
  `CONTEXT.md`, ou un `docs/` dédié ? Elle doit être trouvable par un agent
  qui écrit un nouveau test dans six mois.
- **Le découpage en lots.** À la lumière du coût mesuré en `04` : combien de
  fichiers par ticket, dans quel ordre, et faut-il traiter à part les trois
  fichiers sans rendu (`preference.test.ts`, `theme.test.ts`,
  `roomTextBlocks.test.ts`) qui pourraient rester en `node` ? Ce point
  gradue le brouillard en tickets de migration.
- **Coordination `headless-ui`.** `src/AppMenu.test.tsx` est aussi dans le
  périmètre de la carte voisine. Qui migre quoi en premier ?

## Answer

**Une seule règle gouverne tout : la cible décide.** Le partage n'a jamais été
un arbitrage de style entre deux bibliothèques — c'est une propriété de ce
qu'on désigne. Le relevé le montre sans ambiguïté : les **38** `click` sont
**tous** sur un élément obtenu par `screen.getBy*` (aucune coordonnée), les 8
`doubleClick` sont **tous** sur le `svg` avec un `clientAt(...)`, les 7
`contextMenu` et l'unique `wheel` sont sur le `svg`, et les 23 `keyDown` se
scindent nettement — 18 sur `window` (raccourcis globaux), 5 sur un `input`.
Le type d'événement ne prédit rien ; la cible prédit tout.

D'où la règle, qui vaut **à la fois pour les événements et pour les
requêtes** :

> Si je peux désigner la cible comme un utilisateur — un bouton, un champ, un
> texte visible — je la requête par un locator sémantique et je l'actionne
> avec `userEvent`. Si je dois désigner un *point*, le `svg`, ou `window`, je
> la trouve par `container.querySelector` et je dispatche à la main.

Répartition : **53 appels** côté `userEvent` (38 `click`, 10 `change`, 5
`keyDown` sur `input`), **178** côté dispatch manuel (144 pointer, 8
`doubleClick`, 7 `contextMenu`, 1 `wheel`, 18 `keyDown` sur `window`). Les
25 fichiers se classent sans exception, et un même test mêle les deux styles
sans que ce soit une incohérence — c'est la règle qui s'applique deux fois.

Les locators sont réservés aux contrôles pour une raison de fond, pas de
commodité : ils réessaient et vérifient l'actionnabilité, ce qui n'a de sens
que sur quelque chose d'actionnable. Un `rect[width="120"][fill="transparent"]`
n'est pas actionnable, il est *géométrique* — `getByTestId` ne le rendrait
sémantique qu'en ajoutant des attributs de test au code de production, hors du
périmètre iso-comportement de la carte.

### Les six règles, telles qu'elles seront écrites

À poser en section `## Testing` de `CLAUDE.md` — le seul document qu'un agent
charge sans qu'on le lui demande. `CONTEXT.md` est le glossaire de domaine ;
un ADR ou un `docs/testing.md` ne serait lu que par quelqu'un qui sait déjà
qu'il existe.

```markdown
## Testing

- `*.test.tsx` runs in browser mode (Chromium), `*.test.ts` in node. The
  extension *is* the environment marker — there is no per-file docblock.
- The target decides the style, for events and queries alike:
  - a control a user could name (button, field, visible text) → semantic
    locator (`page.getBy*`) + `userEvent`
  - a point on the canvas, the `svg`, or `window` → `container.querySelector`
    + the `pointer()` helper
- Never construct a `PointerEvent` directly — always `pointer()` from
  `src/editor/testKit.ts`. It carries the mandatory `pointerId: 1`.
- No `act()` — it does not exist in browser mode. After a state change made
  outside React, the assertion must retry: `expect.element` on a locator,
  `expect.poll` on a hand-rolled DOM read. Reads of the zustand store right
  after a synchronous dispatch stay synchronous.
```

Le *pourquoi* ne va pas dans `CLAUDE.md` mais dans `testKit.ts`, à l'endroit
exact où le remplaçant atterrira :

```ts
// Vitest browser mode has no fireEvent, and userEvent has no pointer
// primitives — pointer gestures are dispatched by hand. This is deliberate
// but not endorsed by the docs: an official `pointer` API is in draft
// upstream (vitest#10780, targeting v5). When it lands, this helper is the
// single place to swap.
//
// pointerId 1 is mandatory: Chromium reserves it for the mouse and treats it
// as permanently active — the only id setPointerCapture accepts without
// throwing (see ticket 06).
export const pointer = (el: Element, type: string, init: PointerEventInit = {}) =>
  el.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init }),
  )
```

Le `...init` après `pointerId` laisse techniquement l'écraser. C'est assumé :
personne ne le passe (0 occurrence de `pointerId` dans `src/`), et le
verrouiller interdirait un jour un test multi-pointeurs pour un risque
théorique. **Aucune règle de lint** — le helper est le seul chemin, et un
`new PointerEvent` à nu dans un test serait un intrus visible en revue.

### `testKit.ts` : un module, quatre exports

`src/editor/testKit.ts` — nom neuf, pour que `testHelpers.ts` soit *supprimé*
et non renommé : plus une ligne de shim ne survit. Il porte `pointer`,
`clientAt`, `viewBoxOf`, `zoomLabel` — soit ~20 lignes au total. `RECT` et
`installSvgGeometry` meurent (le viewport vient de la config, la géométrie du
vrai navigateur). Le découpage en deux modules aurait coûté deux imports par
fichier pour 10 lignes chacun ; dissoudre `viewBoxOf` et `zoomLabel` dans
leurs deux fichiers respectifs aurait dupliqué une une-ligne sans rien gagner.

`clientAt` est le gros gagnant de la migration — 4 lignes lisant le vrai CTM
au lieu de 12 lignes inversant un faux :

```ts
export const clientAt = (svg: SVGSVGElement, px: number, py: number) => {
  const p = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!)
  return { clientX: p.x, clientY: p.y }
}
```

### `act()` : la carte se trompait d'un ordre de grandeur

Le relevé de cadrage annonçait **47** occurrences. Il y en a **7, dans 2
fichiers** — `fitOnReplace` (4) et `resizeView` (1 helper, appelé plusieurs
fois). Le « risque non résolu » que `01` laissait ouvert est donc un risque à
deux fichiers, et il prend deux formes distinctes :

- `fitOnReplace` : `act(() => replacePlan(...))` — une mutation du store hors
  React suivie d'une lecture **DOM** synchrone (`viewBoxOf(container)`).
  C'est exactement le cas qui exige une assertion réessayante →
  `await expect.poll(() => viewBoxOf(container)).toEqual(FAR_PLAN_FIT)`.
- `resizeView` : `act(() => window.dispatchEvent(new Event('resize')))` — ce
  n'est pas un `act()` à remplacer, c'est **toute la mécanique** `RECT` +
  `resizeTo()` qui disparaît au profit d'un vrai `await page.viewport(w, h)`.
  Ce fichier est le seul qui touche la béquille jsdom en production
  (`useView.ts` L116-123), et il est isolé dans le lot `10`.

Le verdict « au cas par cas » n'existe pas : `act` n'est pas exporté en mode
browser (`01`). Le seul choix réel était entre une assertion réessayante et un
`flush()` explicite ; ce dernier réintroduit précisément l'attente fixe que le
mode browser supprime.

### Découpage : 5 lots, groupés par règle mise à l'épreuve

21 fichiers en liste noire (`STILL_JSDOM`) + 2 renommages `.ts` → `.tsx`
(`preference`, `theme`, qui veulent un vrai DOM ; `roomTextBlocks` reste en
node). Les grouper par taille aurait mélangé le trivial et le singulier — un
lot rouge n'aurait pas dit quelle règle est fausse. Groupés par ce qu'ils
exercent, chaque lot valide une partie de la convention et isole les cas durs :

- **`07` — pointer pur** : `dragMerge`, `dragSplit`, `groupRealign`,
  `freeSnap`, `dimSelection`, `placementDims` (~800 l.). Crée `testKit.ts`,
  y rapatrie les helpers locaux de `dragGrab`, pose la section `## Testing`.
- **`08` — contrôles** : `AppMenu`, `measuresToggle`, `snapToggle`,
  `gridToggle`, `toolPanel`, `zoomIndicator`. Première mise à l'épreuve de
  `userEvent` + locators + `expect.element`.
- **`09` — rendu sans événement** : `render` (416 l.), `grid`, `openingGap`,
  `openingGlyphStyle`. Aucun dispatch, uniquement `render` + `querySelector`.
- **`10` — les singularités** : `resizeView`, `fitOnReplace`, `roomLabelText`,
  `roomLabelLifecycle`, `rightClickTool`.
- **`11` — fermeture** : renommages, suppression de `testHelpers.ts`,
  `STILL_JSDOM`, `jsdom`, `@testing-library/*`, CI vérifiée pour de bon.

### La collision `headless-ui` n'existe pas — et l'ordre s'inverse

Vérification faite : `.scratch/headless-ui/` n'existe sur **aucune branche**.
Le seul artefact est un asset de recherche sur `research/headless-ui-plain-css`
(commit `0e374b8`), répondant à son ticket `01`. `AppMenu.tsx` est intact.
Il n'y a donc rien à coordonner — et le bénéfice court dans l'autre sens.

Cette recherche a établi que Headless UI en jsdom exige **quatre polyfills** :
`ResizeObserver` (« the one that will actually bite » — le state machine du
`Menu` appelle `detectMovement` à chaque fermeture), `PointerEvent`,
`innerText`, `getAnimations`. **Tous les quatre sont natifs en mode browser.**
Migrer `AppMenu.test.tsx` d'abord ne lève pas un risque, ça supprime un pan de
travail de la carte voisine avant qu'elle ne l'écrive.

Et le fichier est 66 lignes de `fireEvent.click(screen.getByTitle(...))` — le
représentant le plus pur du côté `userEvent` de la règle. Il va donc **tôt,
dans le lot `08`**, pas en dernier.
