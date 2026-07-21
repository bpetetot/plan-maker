# 04 — Migrer un premier fichier pour de vrai

Type: prototype
Status: resolved
Blocked by: 02, 03, 06

## Question

Toutes les décisions de style de test se prennent mieux sur du réel que sur
papier. Migrer **un** fichier de bout en bout, le faire passer au vert, et
mesurer ce que ça coûte.

- **Quel fichier.** Recommandation : `src/editor/dragGrab.test.tsx` — c'est
  le plus dépendant du shim (drag multi-étapes, `clientAt`, capture de
  pointeur), donc celui qui expose le plus de problèmes d'un coup. Un fichier
  facile ne prouverait rien.
- **Ce que le prototype doit établir concrètement :**
  - Les coordonnées. `clientAt()` calcule un point client depuis le viewBox et
    un `RECT` figé. Avec un vrai `getScreenCTM`, quel est son successeur — un
    helper qui lit le CTM réel, ou des locators et des gestes relatifs à
    l'élément qui rendent le calcul inutile ?
  - Le geste de drag. `01` a tranché qu'il n'est **pas** exprimable en
    `userEvent` : reste le dispatch manuel, dont ce ticket mesure le coût réel
    en lisibilité et en lignes. C'est la matière première du ticket `05`.
  - `setPointerCapture` réel : le verdict vient de `06`, mais c'est ici qu'on
    voit si la capture change la cible des `pointermove` et donc les
    assertions.
  - Le sort des `act()`. `01` est formel : `act` n'est pas exporté, les 47
    appels disparaissent. Le point d'attention est celui remonté par `01` —
    là où un `act()` entoure un dispatch manuel et où l'assertion lit l'état
    **zustand** (pas le DOM), `expect.element` ne réessaie pas. Vérifier si
    `expect.poll` suffit ou s'il faut un flush explicite, et à quel prix.
  - Le rendu réel du SVG : la mise en page donne-t-elle bien 800×600, les
    assertions de viewBox tombent-elles juste ?
- **Mesures à rapporter :** temps d'exécution du fichier avant/après, et
  taille du diff — les deux nourrissent les tickets de lot encore dans le
  brouillard.

Un test qui passait doit passer après, sans changer ce qu'il vérifie. Si une
assertion doit changer de valeur, c'est un fait à consigner, pas à absorber
silencieusement.

**À lander ici aussi : l'étape CI.** `02` a écrit le diff à la ligne près
(cache `actions/cache` sur `~/.cache/ms-playwright`, clé sur la version
`playwright-core`, puis `npx playwright install --with-deps --only-shell
chromium`) mais ne l'a pas landé — il aurait installé un navigateur
inutilisé. C'est ici, quand le premier vrai fichier browser existe, qu'il
atterrit et qu'une push le vérifie enfin. Reprendre le diff depuis `02`, ne
pas le réinventer.

Le canari `.scratch/vitest-browser/smoke.{config.ts,test.tsx}` posé par `02`
est à supprimer une fois ce fichier vert : il ne sert que d'intérim.

## Answer

**`src/editor/dragGrab.test.tsx` tourne en mode browser, 7 tests verts, et le
résultat central est un non-événement : aucun attendu n'a bougé.** Le `git diff`
filtré sur les lignes `expect` ne remonte que la ligne d'`import` — les sept
assertions de coordonnées sont identiques au caractère près. La prédiction de
`03` (« zéro attendu à recalculer ») est confirmée sur du réel, et sur le
fichier réputé le plus exposé.

Vert **du premier coup**, sans aucune itération sur les valeurs.

### La mesure qui renverse la prémisse : c'est plus rapide

| | avant (jsdom) | après (browser) |
| --- | --- | --- |
| `dragGrab.test.tsx` seul | **1,73 s** (dont 899 ms d'`environment`) | **~1,05 s** (3 runs : 1,06 / 1,06 / 1,03) |
| suite complète | 9,4 s (relevé `02`) | **~8,9 s** (9,04 / 8,82) |

Le mode browser n'est pas un surcoût, c'est un **gain de ~40 %** sur ce
fichier. La raison : monter un `environment` jsdom coûte ~900 ms **par
fichier**, là où le navigateur démarre **une fois** et se réutilise (`environment
0ms`, `setup 8ms` sur le projet browser). Le brouillard « Perf et DX de la
suite complète » penchait vers un risque à surveiller ; il penche maintenant
vers un bénéfice. À nuancer sur un point : ce fichier n'a que 7 tests et un
seul composant — la mesure vraiment décisive sera le premier lot de 5–6
fichiers, où le partage du navigateur joue à plein.

### Diff : 46 insertions, 39 suppressions, 153 → 160 lignes

Sept lignes de plus, et **zéro import de `testHelpers`** — c'est le premier
fichier du repo libre du shim. Le coût annoncé (« mesurer ce que coûte le
dispatch manuel en lisibilité ») est **plus faible que redouté** : les sept
lignes ajoutées sont presque toutes le passage des tests en `async`, pas la
gestuelle.

Ce qui disparaît : le docblock `@vitest-environment jsdom`, l'import
`@testing-library/react`, `beforeAll(installSvgGeometry)`, `afterEach(cleanup)`,
et l'import de `clientAt` / `installSvgGeometry`.

### Les quatre points que le ticket demandait d'établir

**1. Le successeur de `clientAt` — un helper de 4 lignes, et c'est le vrai.**

```ts
const clientAt = (svg: SVGSVGElement, px: number, py: number) => {
  const p = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!)
  return { clientX: p.x, clientY: p.y }
}
```

Contre les 12 lignes de l'ancien, qui réimplémentaient à la main l'inverse d'un
faux CTM (`Math.min(RECT.width/w, ...)`, centrage, translation). **L'option
« locators + gestes relatifs » est écartée** : `01` a établi que `userEvent`
n'a aucune primitive pointer, donc il n'existe pas de geste relatif à un
élément ; et surtout ces tests s'expriment en **coordonnées du plan** (« le
curseur voyage de +100 cm le long du mur »), pas en pixels d'un élément — la
transformation plan→client est le sujet, pas un détail à contourner.

Le helper est **local au fichier** pour l'instant. Sa promotion en helper
partagé est une décision de `05`, pas d'ici : `03` a montré que 13 fichiers en
dépendent, et deux autres (`fitOnReplace`, `zoomIndicator`) calculent depuis le
rect. Le point à trancher là-bas est qu'il lit le CTM **au moment de l'appel**,
donc après le rendu — ce que l'ancien faisait aussi, mais depuis le viewBox
*commité*, une nuance dont `zoomIndicator` dépend explicitement.

**2. Le geste de drag — un helper de 3 lignes, et il porte la règle de `06`.**

```ts
const pointer = (el: Element, type: string, init: PointerEventInit = {}) =>
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init }))
```

`bubbles: true` est **obligatoire** (React délègue au conteneur racine) ;
`pointerId: 1` est la règle gravée par `06`. Appliqué à **tous** les types, pas
au seul `pointerdown` : `06` a montré que seul `pointerdown` en a besoin, mais
le mettre par défaut dans le helper coûte zéro et supprime la possibilité de
l'oublier. Matière première pour `05` : la substitution est **mécanique**,
`fireEvent.pointerDown(el, init)` → `pointer(el, 'pointerdown', init)`, et le
seul geste réellement transformé est `fireEvent.pointerUp(svg)` →
`pointer(svg, 'pointerup')`.

**3. `setPointerCapture` — inerte, exactement comme `06` l'annonçait.** Les
quatre appels non gardés d'`Editor.tsx` sont traversés par ces tests, rien ne
lève, et **aucun `pointermove` n'est retargeté** : c'est pourquoi les
`pointermove` continuent d'être dispatchés sur le `svg` (et non sur la cible
capturée) sans que rien ne change. Aucun `try/catch`, aucune ligne de
production touchée.

**4. Le sort d'`act()` — non-problème sur ce fichier, question toujours
ouverte ailleurs.** `dragGrab.test.tsx` n'avait **aucun** `act()` : ses
assertions lisent `usePlanStore.getState()` juste après le dispatch. Or
`dispatchEvent` est synchrone, React 19 traite le handler pendant le dispatch,
et le `set` de zustand est synchrone — la chaîne entière l'est, donc
l'assertion voit l'état à jour sans aucun flush. **Le risque remonté par `01`
n'est donc pas levé** : il porte sur les fichiers où un `act()` entoure un
dispatch *et* où l'assertion lit le DOM après un re-render. Ce fichier ne les
représente pas. Reste à `05` / aux lots.

**5. Le rendu SVG — 800×600 confirmé** par le simple fait que les sept
assertions passent : elles sont toutes calculées via `getScreenCTM()`, donc
un rect faux les aurait toutes fait tomber.

### La config, écrite et vérifiée

`03` est landé tel quel — `vite.config.ts` en fonction de `mode`, `VitePWA`
écarté sous test, `resolve.dedupe`, deux projects, viewport 800×600,
`src/testSetup.browser.ts` d'une ligne, scripts `test:node` / `test:browser`.
Le `resolve.dedupe` de `03` était bien **obligatoire** : sans lui, `Editor` ne
monte pas.

**Une décision non prévue par `03` : l'échafaudage transitoire.** La config de
`03` est la config *finale* ; la poser telle quelle bascule les 22 `.tsx`
encore en jsdom d'un coup. Choix retenu (avec le dev) : une **liste noire qui
rétrécit**, `const STILL_JSDOM` en tête de `vite.config.ts`, listant les 21
fichiers pas encore migrés. Le projet browser a **déjà sa forme finale**
(`include: ['src/**/*.test.tsx']`) et les exclut ; le projet node les reprend,
où leur docblock jsdom s'applique encore. Chaque lot retire des lignes ; le
dernier supprime la const et ses deux références — **l'état final de `03` est
atteint par pure suppression**, et la const est au passage la liste de ce qui
reste à faire. Écartée : la liste blanche qui grandit (miroir, mais la config
n'atteint sa forme finale qu'en réécrivant les deux `include`).

Effet de bord : l'`exclude` `.scratch/**` posé par `02` **disparaît**, devenu
inutile — les `include` des deux projets sont désormais portés sur `src/`, donc
rien sous `.scratch/` n'est ramassé. Le spike de `06` y reste consultable.

### État de la suite

`npm test` → **36 fichiers / 405 tests verts**, le compte exact d'avant.
`npm run typecheck`, `npm run lint`, `npm run format:check` verts.

### L'étape CI — landée, pas encore vérifiée

Le diff de `02` est repris **à la ligne près** dans `.github/workflows/ci.yml`
(résolution de la version `playwright-core` depuis le lockfile, `actions/cache`
sur `~/.cache/ms-playwright`, puis `npx playwright install --with-deps
--only-shell chromium`, lancé même sur cache hit). Un commentaire a été ajouté
pour expliquer le « même sur cache hit ».

**Fait à consigner honnêtement : elle n'est toujours pas vérifiée.** La
vérifier demande une push, action sortante non prise sans accord explicite. La
différence avec `02` est qu'elle n'est plus prématurée : le projet browser
existe et le navigateur installé sert désormais à quelque chose. La prochaine
push de cette branche la vérifie.

### Ménage

`.scratch/vitest-browser/smoke.{config.ts,test.tsx}` **supprimés** — le canari
de `02` a rempli son office, un vrai fichier migré le remplace.
Le spike de `06` (`spike.{config.ts,test.tsx}`) est **conservé** : il documente
le comportement du `pointerId`, qui n'est écrit nulle part ailleurs.

**Rien n'est commité** — le travail est sur la branche `install-vitest`, non
commité, à la main du dev.
