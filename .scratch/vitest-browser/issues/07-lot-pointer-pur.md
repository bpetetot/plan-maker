# 07 — Lot 1 : le dispatch pointer pur

Type: task
Status: resolved
Blocked by: 05

## Question

Le premier lot de migration, et le seul qui crée quelque chose : il pose
`src/editor/testKit.ts` puis migre les six fichiers qui ne font que du
dispatch pointer suivi d'une lecture du store — la forme exacte que `04` a
déjà validée sur `dragGrab.test.tsx`. Si la convention de `05` est bonne, ce
lot est de la substitution ligne à ligne.

**Créer `src/editor/testKit.ts`** avec les quatre exports arrêtés en `05` :
`pointer`, `clientAt`, `viewBoxOf`, `zoomLabel` — corps et commentaires écrits
en toutes lettres dans la réponse de `05`. Puis **rapatrier `dragGrab.test.tsx`
dessus** : `04` y a laissé `pointer` et `clientAt` en helpers locaux, ils
doivent disparaître au profit de l'import.

**Migrer les six fichiers**, en les retirant de `STILL_JSDOM` dans
`vite.config.ts` au fur et à mesure :

- `dimSelection.test.tsx` (55 l.)
- `dragSplit.test.tsx` (94 l.)
- `dragMerge.test.tsx` (100 l.)
- `freeSnap.test.tsx` (107 l.)
- `groupRealign.test.tsx` (166 l.)
- `placementDims.test.tsx` (280 l.)

**Poser la section `## Testing` dans `CLAUDE.md`** — le texte est écrit dans
`05`. Elle atterrit ici et pas plus tard : elle référence `testKit.ts`, qui
existe à partir de ce lot, et les lots suivants doivent pouvoir s'y référer.

Points d'attention :

- `freeSnap` et `placementDims` portent des `keyDown(window, ...)` — côté
  dispatch manuel selon la règle. `holdAlt()` maintient `Alt` sans `keyup` ;
  vérifier que les `pointermove` suivants portent bien `altKey: true`, le
  code lisant le modificateur sur l'événement pointer et non un état global.
- `placementDims` est aussi le plus gros du lot et mêle pointer et un `click`
  sur contrôle — c'est le premier fichier où les deux styles cohabitent dans
  un même test. Si la règle produit ici quelque chose d'illisible, c'est le
  signal que `05` s'est trompé, et il faut le remonter avant le lot `08`.
- Attendu, d'après `04` : aucun `expect` ne bouge, le diff est presque
  entièrement l'ajout d'`async`/`await` sur les `render`.

## Answer

**Les six fichiers sont verts, aucun attendu n'a bougé — mais la convention de
`05` était incomplète, et le lot l'a découvert du premier coup.** Le `git diff`
filtré sur les lignes `expect` ne remonte que des réécritures de *requête*
(`screen.getByText` → `page.getByText`) : pas une seule valeur recalculée. La
prédiction de `03`/`04` tient donc sur les six fichiers, y compris
`placementDims`, le seul où les deux styles cohabitent dans un même test — et
la cohabitation est lisible, `05` n'a pas à être revu sur ce point.

### Le trou dans la convention : `fireEvent` enveloppait chaque dispatch dans `act()`

Première exécution : **8 tests rouges sur 37**, tous avec la même signature —
`svg.querySelectorAll('circle')` renvoie 0 après un marquee, `points.a` n'a pas
bougé après un drag de groupe. Diagnostic mesuré (sonde jetable, supprimée
depuis) :

```
sync: 0   |   après un tick macrotâche: 1   |   après un rAF: 1
```

React commit sur son *scheduler* (une tâche `MessageChannel`), **pas à
l'intérieur de `dispatchEvent`**. Rien n'est rendu quand le dispatch retourne.
Les anciens tests ne le voyaient pas parce que **`fireEvent` de
`@testing-library/react` enveloppe chaque dispatch dans `act()`** — le filet
n'était pas `testHelpers.ts`, il était dans `fireEvent`, et `01` comme `05`
l'ont manqué. Ça ne casse pas que les lectures DOM : dans `groupRealign`, le
3ᵉ `pointerdown` d'un enchaînement lisait un `sel` périmé dans une closure non
recommitée, donc **aucun geste multi-étapes ne tenait**.

`05` traitait `act()` comme un problème à 7 occurrences dans 2 fichiers. C'est
en réalité **une propriété de chacun des 178 dispatchs manuels**.

**Correctif, en un seul endroit : `pointer()` et `key()` sont asynchrones** —
elles dispatchent de façon synchrone (les sémantiques de capture et de
`preventDefault` sont intactes) puis cèdent une macrotâche. Ce n'est pas
l'`attente fixe` que `05` refusait : aucune durée n'est devinée, on rend la
main au scheduler, exactement ce que faisait `act()`. Mesuré : `setTimeout(0)`
coûte ~4 ms, `requestAnimationFrame` ~16 ms — d'où la macrotâche. Le style
`await pointer(...)` s'aligne d'ailleurs sur `await userEvent.*`.

**Deux exports de plus que les quatre arrêtés en `05`** :
- `key(el, k, init)` — pendant de `pointer` pour les 18 `keyDown(window)`
  (2 ici, le reste dans `08`/`10`). Sans lui, `freeSnap` dupliquait le yield.
- `settle()` reste **privé** au module : personne n'a besoin de l'appeler à la
  main, et le rendre public inviterait à des attentes ad hoc.

`testKit.ts` fait donc 6 exports / ~30 lignes au lieu de 4 / ~20.

### La règle « la cible décide » passe l'épreuve, telle quelle

- `placementDims` : `fireEvent.click(screen.getByLabelText('Door'))` →
  `await userEvent.click(page.getByLabelText('Door'))`, et les 14 assertions de
  texte visible passent aux locators. Les `getAllByText(...).toHaveLength(n)`
  deviennent `await expect.poll(() => page.getByText(...).elements())` — le
  seul motif de comptage, `expect.element` ne portant pas de `toHaveCount`.
- `freeSnap` : `holdAlt()` sans `keyup` fonctionne à l'identique, les
  `pointermove` suivants portent bien `altKey: true`. Point d'attention du
  ticket levé.
- `setPointerCapture` traverse encore les quatre appels non gardés sans lever.

### Section `## Testing` posée dans `CLAUDE.md`

Le texte de `05` est repris **avec deux amendements** issus de ce qui précède :
`pointer()` / `key()` sont nommées ensemble et décrites comme attendant le
commit React ; la règle `act()` est **resserrée** — elle ne vise plus « tout
changement d'état hors React » mais « un changement d'état hors de tout
événement dispatché » (le cas `fitOnReplace` de `10`), les lectures qui suivent
un dispatch *attendu* étant redevenues synchrones.

### Effets de bord

- **`.gitignore`** : le mode browser écrit `src/editor/__screenshots__/` et
  `.vitest-attachments/` **à côté du test qui échoue**, dans `src/`. Découvert
  par la première exécution rouge. Les deux sont ignorés ; c'est un fait
  d'exploitation que les lots suivants rencontreront à chaque échec.
- `STILL_JSDOM` passe de 21 à **15 fichiers**.
- **Perf** : suite complète **8,05 s** (9,4 s avant migration, ~8,9 s après
  `04`) — les ~180 yields de 4 ms ne se voient pas, chaque fichier migré
  économisant les ~900 ms de montage jsdom.

36 fichiers / 405 tests verts, `typecheck` et `lint` propres, `format` passé.
Rien n'est commité.
