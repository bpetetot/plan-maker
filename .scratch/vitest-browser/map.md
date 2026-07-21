# Map: Tests en mode browser (Vitest)

Labels: wayfinder:map

## Destination

Les **25 fichiers** de tests aujourd'hui en `// @vitest-environment jsdom`
tournent en mode browser de Vitest, `jsdom` / `@testing-library/dom` /
`@testing-library/react` sont désinstallés de `package.json`,
`src/editor/testHelpers.ts` (le shim de géométrie SVG) est supprimé, la CI est
verte, le tout commité.

## Notes

- **Cette carte va jusqu'à l'exécution** : la destination est un changement
  fait en place, pas un spec. Les tickets restent des décisions, mais les
  derniers (encore dans le brouillard) seront les lots de migration eux-mêmes.
- Skills : `/research` pour les faits externes, `/grilling` +
  `/domain-modeling` pour les tickets de décision, `/prototype` pour le
  premier fichier migré. Style de grilling : **une question à la fois, avec
  une recommandation**.
- Doc de référence donnée par le dev :
  <https://github.com/vitest-dev/vitest/tree/main/docs/guide/browser>
- **Prérequis réseau** : `cdn.playwright.dev` renvoie `403` (politique réseau)
  et aucun binaire navigateur n'est présent dans le sandbox. Le dev débloque
  le domaine côté hôte (`sbx policy allow network cdn.playwright.dev`) — sans
  ça, aucun ticket prototype n'est exécutable. Décision prise à l'ouverture
  de la carte.
- Décisions de cadrage prises à l'ouverture :
  - **Migration complète**, pas un pilote suivi d'un batch hors carte.
  - **Les deux styles d'événements cohabiteront** : `userEvent` là où le
    geste est le sujet, dispatch manuel de `PointerEvent` là où seule la
    conséquence compte. ⚠️ Décision prise sur une prémisse fausse (`01` :
    `userEvent` n'a aucune primitive pointer), puis **réécrite en `05`** — le
    critère final n'est ni le geste ni le type d'événement, c'est la cible.

### État des lieux (relevé au cadrage)

- `vitest.config` n'existe pas séparément : la config test vit dans
  `vite.config.ts`, `test: { environment: 'node' }`. Le mode jsdom est activé
  **par docblock**, fichier par fichier. Or le mode browser ne se règle *pas*
  par fichier — il est par projet, d'où un découpage à trancher (`03`).
- 25 fichiers concernés : 22 dans `src/editor/`, plus `src/AppMenu.test.tsx`
  et `src/theme/theme.test.ts`. Trois d'entre eux ne rendent pas de composant
  (`preference.test.ts`, `theme.test.ts` — `localStorage` ;
  `roomTextBlocks.test.ts`).
- API testing-library réellement utilisée, étroite : `render` (101×), `act`
  (47×), `cleanup`, et seulement quatre requêtes `screen.getByText` /
  `getByLabelText` / `getByTitle` / `queryByText`.
- Le cœur est `fireEvent` **pointer** : 58 `pointerDown`, 45 `pointerMove`,
  41 `pointerUp`, plus 38 `click`, 23 `keyDown`, 10 `change`, 8
  `doubleClick`, 7 `contextMenu`, 1 `wheel`.
- `src/editor/testHelpers.ts` (~80 lignes) réimplémente `getScreenCTM`,
  `getBoundingClientRect`, `DOMMatrix`, `DOMPoint` et `setPointerCapture`,
  avec un canevas figé à 800×600 (`RECT`). `clientAt()` est l'inverse manuel
  de ce faux CTM. **C'est le gain principal de la migration** — et le point
  de rupture : toutes les assertions de coordonnées changent de nature.
- `src/styles.css` n'est importé que par `src/main.tsx`, jamais par un test.
  En browser mode la taille du SVG dépend d'une vraie mise en page — donc du
  CSS. À trancher dans `03`.
- CI : `.github/workflows/ci.yml`, `ubuntu-latest`, `npm ci` puis
  `npm run test`. Aucune étape d'installation de navigateur.
- **Carte voisine en vol** : `.scratch/headless-ui/` migre `AppMenu.tsx` vers
  Headless UI et touche `src/AppMenu.test.tsx`, qui est aussi dans le
  périmètre d'ici. Risque de collision à surveiller.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [01 — Surface d'API et contraintes de Vitest 4 en mode browser](issues/01-research-vitest-browser-api.md)
  — **La réponse à la question critique est non** : `userEvent` (import
  `vitest/browser`, et non `@vitest/browser/context` qui était la v3) n'expose
  **aucune** primitive pointer, aucune option de coordonnée client, et il
  n'existe **aucun équivalent de `fireEvent`** en mode browser. Le dispatch
  manuel de `PointerEvent` est le seul chemin pour les 144 appels pointer —
  possible (DOM réel) mais désavoué par la doc. Une API `pointer` officielle
  est en draft en amont ([PR #10780](https://github.com/vitest-dev/vitest/pull/10780))
  sur base v5, donc pas en v4. **Risque de faisabilité remonté** :
  `setPointerCapture` doit lever `NotFoundError` sans pointeur actif, et un
  événement synthétique n'en crée aucun ; `Editor.tsx` a 4 appels non gardés
  (L285, L290, L339, L779) — c'est précisément ce que `testHelpers.ts`
  neutralise aujourd'hui, et ce filet disparaît en vrai navigateur. Déduit
  de la spec W3C, **non confirmé empiriquement** → ticket `06`.
  Autres faits : `preview` est un cul-de-sac (pas de headless, et il
  retire `@testing-library/dom` par transitivité) donc le déblocage de
  `cdn.playwright.dev` est un **blocage dur** ; providers désormais en
  paquets séparés (`@vitest/browser-playwright`) et `provider` est une
  fonction ; `test.projects` découpe node/browser et `test:` peut rester dans
  `vite.config.ts` ; `vitest-browser-react@2.2.0` supporte React 19 et son
  `render()` est **async** mais rend toujours un `container` **et** un
  `locator` — le style `container.querySelector('rect[...]')` du repo
  survit ; les locators sont synchrones et paresseux (ce sont les *actions*
  et *assertions* qui réessaient) ; le nettoyage automatique tourne **avant**
  chaque test (inversé par rapport à testing-library) ; `act` n'est pas
  exporté du tout, donc les 47 appels doivent disparaître — sans danger là où
  un `await userEvent.*` les remplace, mais **risque non résolu** là où ils
  entourent un dispatch manuel dont l'assertion lit l'état zustand, que
  `expect.element` ne réessaie pas (`expect.poll` ou flush explicite) ;
  `page.viewport(w, h)` et `browser.viewport` (défaut `414x896`) fixent la
  taille ; le CSS est toujours traité en mode browser, donc un `setupFiles`
  qui importe `styles.css` fonctionne ; pas d'action CI officielle, mais
  Vitest lui-même cache les binaires et lance
  `playwright install --with-deps --only-shell`.

- [02 — Rendre le mode browser exécutable, ici et en CI](issues/02-provisionner-navigateur.md)
  — **Le mode browser tourne ici, un test browser est passé au vert.** Le
  blocage dur est levé : `cdn.playwright.dev` répond (`400` au lieu du `403`
  de politique). Provider `@vitest/browser-playwright@4.1.10` en fonction
  (`provider: playwright()`), plus `playwright@1.61.1` et
  `vitest-browser-react@2.2.0` ; `npx playwright install --with-deps
  --only-shell chromium` → Chrome Headless Shell 149, **1 min 21 s à froid**,
  **337 Mo** de cache. `playwright.download.prss.microsoft.com` reste bloqué
  mais Playwright retombe tout seul sur `cdn.playwright.dev/builds/...` —
  deux erreurs bruyantes dans les logs, aucune conséquence. Le test de fumée
  (`.scratch/vitest-browser/smoke.{config.ts,test.tsx}`, gardé comme canari)
  ne prouve pas que le navigateur démarre : il vérifie que **`getScreenCTM()`
  renvoie une vraie matrice** et que `getBoundingClientRect()` donne la vraie
  largeur — la substance même de la migration, disponible. Confirme au
  passage que le `render()` de `vitest-browser-react` est async **et** rend un
  `container` querySelectable. Effet de bord traité : `.scratch/**` ajouté à
  `test.exclude` dans `vite.config.ts` (additif, n'empiète pas sur `03`),
  suite à 36 fichiers / 405 tests verts. **Perf : ~870 ms** pour le fichier de
  fumée, le démarrage du navigateur n'est donc pas le coût dominant redouté.
  Le **diff CI est écrit à la ligne près** (cache `actions/cache` séparé sur
  `~/.cache/ms-playwright`, clé sur la version `playwright-core` du lockfile —
  le cache npm de `setup-node` ne suffit pas) mais **volontairement non
  landé** : il installerait un navigateur inutilisé jusqu'à `04`. Il
  atterrira avec `04`, qui le vérifiera pour de bon.

- [06 — `setPointerCapture` survit-il au dispatch manuel ?](issues/06-spike-setpointercapture.md)
  — **Ça ne lève pas, et le risque de faisabilité est levé** : la migration
  complète en v4 tient sans toucher au code de production (ni `try/catch`, ni
  CDP, ni shim résiduel, ni attente de la v5). Mais le verdict ne tient pas
  pour la raison supposée par `01` : ce n'est pas le caractère synthétique de
  l'événement qui décide, c'est le **`pointerId`**. Chromium réserve l'id `1`
  à la souris et la considère **active en permanence** — `setPointerCapture(1)`
  passe même **sans qu'aucun événement n'ait été dispatché**, tandis que les
  ids `0`, `2`, `7` lèvent tous `NotFoundError`, quels que soient `isPrimary`
  (sans effet) et `pointerType` (sans effet). La prémisse de `01` était juste,
  sa conclusion ne suivait pas. **Conséquence actionnable** : `new
  PointerEvent(...)` sans `pointerId` vaut `0`, l'id qui lève — et aucun des 58
  `fireEvent.pointerDown` actuels ne le précise (0 occurrence de `pointerId`
  dans `src/`). Règle à graver en `05` : **tout `pointerdown` dispatché à la
  main porte `pointerId: 1`** ; seul le `pointerdown` est concerné, `Editor.tsx`
  n'utilisant `pointerId` que dans ses quatre `setPointerCapture` et n'appelant
  jamais `releasePointerCapture`. Second constat, rassurant pour les
  assertions : la capture réussit mais **est un no-op** —
  `hasPointerCapture()` reste `false`, aucun `gotpointercapture`, et **aucun
  retargeting** des `pointermove` suivants. Elle est donc aussi inerte qu'avec
  le no-op de `testHelpers.ts` : **les assertions de drag ne bougent pas pour
  cette raison**. Spike gardé comme actif
  (`.scratch/vitest-browser/spike.{config.ts,test.tsx}`, 6 tests, 841 ms).

- [03 — Forme de la config : cohabitation node/browser, viewport, CSS](issues/03-forme-de-la-config.md)
  — **La rupture redoutée n'a pas lieu : zéro attendu à recalculer.** `RECT`
  n'était pas une convention arbitraire mais **une simulation du viewport** —
  l'app est en `100vw/100vh` avec toutes ses surcouches en `position: absolute`,
  donc le rect du SVG *est* le viewport. Mesuré en montant `Editor` dans
  Chromium avec `browser.viewport: { width: 800, height: 600 }` :
  `getBoundingClientRect()` rend `{0, 0, 800, 600}` exactement, et le `viewBox`
  commité tombe sur la formule que `resizeView.test.tsx` attend déjà
  (`S0 = 600/620`, `w = 800/S0`). **Découpage : l'extension du fichier** —
  `*.test.tsx` → browser, `*.test.ts` → node, garanti par le compilateur
  (TypeScript interdit le JSX dans un `.ts`), 33 fichiers sur 36 déjà du bon
  côté et **aucune liste d'exceptions** à maintenir ; l'extension devient le
  marqueur d'environnement, ce qui **referme le patch « trois fichiers sans
  rendu »** : `roomTextBlocks.test.ts` tombe en node gratuitement (aucun global
  DOM), `preference.test.ts` et `theme.test.ts` sont renommés `.tsx` (ils
  veulent un vrai DOM). **Config : un seul fichier**, `vite.config.ts`, avec
  `defineConfig` en fonction et `VitePWA` écarté sous `mode === 'test'` (mesuré :
  le plugin coûte ~550 ms par run et écrit `dev-dist/`) — un `vitest.config.ts`
  séparé *remplacerait* la config Vite au lieu de la compléter, imposant de
  répliquer tout ajout futur au pipeline dont les tests dépendent. **Commandes :**
  `npm test` reste le tout (CI inchangée), plus `test:node` / `test:browser` en
  `--project` ; pas de `postinstall` navigateur. **CSS oui, polices non** : un
  `setupFiles` d'une ligne (`src/testSetup.browser.ts` → `import './styles.css'`)
  — non pour une assertion existante (il n'y en a aucune : rien ne mesure de
  texte dans `src/`) mais parce que sans lui les surcouches retombent dans le
  flux et les locators vérifieraient l'actionnabilité sur une mise en page
  inexistante en production. **Pas de reset du store ni de `cleanup`** dans le
  setup : l'isolation par fichier est **vérifiée empiriquement**, et le cleanup
  est automatique. **Fait bloquant découvert** : `resolve.dedupe: ['react',
  'react-dom']` est **obligatoire** — `zustand` résout React vers le build CJS
  pendant que `vitest-browser-react` embarque sa copie, d'où `Invalid hook call`
  sur tout test montant `Editor` ; le spike de `06` ne l'avait pas vu, il ne
  touchait pas au store. Config décidée écrite en entier dans le ticket ; elle
  s'écrit et se vérifie en `04`.

- [04 — Migrer un premier fichier pour de vrai](issues/04-prototype-premier-fichier.md)
  — **`dragGrab.test.tsx` est vert en mode browser, du premier coup, et aucun
  attendu n'a bougé** : le `git diff` filtré sur les lignes `expect` ne remonte
  que la ligne d'`import`. La prédiction de `03` (« zéro attendu à recalculer »)
  est confirmée sur le fichier réputé le plus exposé. **La prémisse perf est
  renversée : c'est plus rapide.** 1,73 s → **~1,05 s** sur ce fichier (−40 %),
  suite complète 9,4 s → **~8,9 s** — monter un `environment` jsdom coûte
  ~900 ms **par fichier**, là où le navigateur démarre une fois et se réutilise
  (`environment 0ms`). **Diff : +46/−39, 153 → 160 lignes**, sept lignes de plus
  qui sont presque toutes le passage en `async` : le coût du dispatch manuel en
  lisibilité est plus faible que redouté. Les deux successeurs sont des helpers
  locaux minuscules — `clientAt` en **4 lignes** (`new DOMPoint(px, py)
  .matrixTransform(svg.getScreenCTM()!)`, contre 12 lignes d'inverse d'un faux
  CTM), et `pointer(el, type, init)` en **3 lignes** portant `bubbles: true`
  (obligatoire, React délègue) et le `pointerId: 1` de `06` par défaut ; leur
  promotion en helpers partagés reste à `05`. `setPointerCapture` traverse les
  quatre appels non gardés d'`Editor.tsx` sans lever et **sans retargeting**,
  comme annoncé. **Le risque `act()` de `01` n'est pas levé, il n'est pas
  représenté ici** : ce fichier n'avait aucun `act()` et lit zustand après un
  dispatch synchrone — la question reste entière pour les fichiers qui lisent le
  DOM. Config de `03` landée telle quelle (le `resolve.dedupe` était bien
  obligatoire), plus une décision non prévue : **l'échafaudage transitoire est
  une liste noire qui rétrécit** (`const STILL_JSDOM`, 21 fichiers), le projet
  browser ayant déjà sa forme finale — la fin de migration est une **pure
  suppression**. L'`exclude` `.scratch/**` de `02` disparaît, devenu inutile.
  **L'étape CI est landée** (diff de `02` à la ligne près) mais **toujours pas
  vérifiée** : il y faut une push. Canari de `02` supprimé, spike de `06`
  conservé. 36 fichiers / 405 tests verts ; rien n'est commité.

- [05 — La convention de test, écrite noir sur blanc](issues/05-convention-de-test.md)
  — **Une seule règle gouverne tout : la cible décide** — et elle vaut pour les
  événements *comme* pour les requêtes, ce qui supprime le second arbitrage.
  « Si je peux désigner la cible comme un utilisateur (bouton, champ, texte
  visible), je la requête par un locator et je l'actionne avec `userEvent` ; si
  je dois désigner un *point*, le `svg` ou `window`, je la trouve par
  `container.querySelector` et je dispatche à la main. » Le relevé la valide
  sans exception : les **38** `click` sont **tous** sur un `screen.getBy*` sans
  coordonnée, les 8 `doubleClick` **tous** sur le `svg` avec `clientAt`, les 23
  `keyDown` se scindent proprement (18 `window`, 5 `input`). Répartition
  finale : **53 appels `userEvent`, 178 dispatch manuel**. Le type d'événement
  ne prédit rien, la cible prédit tout. **`pointer()` de
  `src/editor/testKit.ts` est le seul chemin sanctionné** pour un
  `PointerEvent` (porte `pointerId: 1` et `bubbles: true`) — pas de règle de
  lint, le helper *est* l'application de la règle, et le point de remplacement
  unique le jour où `vitest#10780` (v5) atterrit ; le commentaire du helper
  porte la dette et nomme la sortie. `testKit.ts` (nom neuf : `testHelpers.ts`
  est supprimé, pas renommé) porte `pointer`, `clientAt`, `viewBoxOf`,
  `zoomLabel`, ~20 lignes. **La carte se trompait d'un ordre de grandeur sur
  `act()`** : 7 occurrences dans 2 fichiers, pas 47 — et aucun choix, `act`
  n'existe pas en mode browser ; la règle est « assertion réessayante après un
  changement d'état hors React » (`expect.element` sur locator, `expect.poll`
  sur lecture DOM), les lectures zustand après dispatch synchrone restant
  synchrones. Convention écrite en `## Testing` dans **`CLAUDE.md`** (seul doc
  auto-chargé), le pourquoi dans `testKit.ts`. **Découpage : 5 lots groupés par
  règle mise à l'épreuve**, pas par taille — `07` pointer pur (crée `testKit`),
  `08` contrôles, `09` rendu sans événement, `10` singularités, `11` fermeture.
  **La collision `headless-ui` n'existe pas** : `.scratch/headless-ui/` n'est
  sur aucune branche, seul un asset de recherche existe (`0e374b8`), et
  `AppMenu.tsx` est intact — mieux, le bénéfice court dans l'autre sens, cette
  recherche ayant établi que Headless UI en jsdom exige quatre polyfills
  (`ResizeObserver`, `PointerEvent`, `innerText`, `getAnimations`) tous natifs
  en mode browser. `AppMenu.test.tsx` va donc **tôt**, dans le lot `08`.

- [07 — Lot 1 : le dispatch pointer pur](issues/07-lot-pointer-pur.md)
  — **Six fichiers verts, zéro attendu recalculé — et un trou dans `05`,
  trouvé du premier coup.** Le diff filtré sur les `expect` ne remonte que des
  réécritures de *requête* ; la règle « la cible décide » passe l'épreuve telle
  quelle, `placementDims` mêlant les deux styles sans devenir illisible. Mais
  8 tests sur 37 étaient rouges pour une raison qu'aucun ticket n'avait vue :
  **React commit sur son scheduler, pas dans `dispatchEvent`** — et si les
  anciens tests ne le voyaient pas, c'est que **`fireEvent` de
  testing-library enveloppait chaque dispatch dans `act()`**. Le filet n'était
  pas `testHelpers.ts`, il était dans `fireEvent`. Ça ne cassait pas que les
  lectures DOM : une closure non recommitée périmait `sel` au 3ᵉ `pointerdown`,
  donc aucun geste multi-étapes ne tenait. **`05` chiffrait `act()` à 7
  occurrences dans 2 fichiers ; c'est une propriété des 178 dispatchs.**
  Correctif en un point : **`pointer()` et `key()` deviennent asynchrones** —
  dispatch synchrone puis une macrotâche cédée (mesuré : 4 ms, contre 16 ms
  pour un rAF) ; pas une attente fixe, un rendu de main au scheduler, ce que
  faisait `act()`. `testKit.ts` porte donc **6 exports** et non 4 (`key` en
  plus, `settle` privé). La règle `act()` de `CLAUDE.md` est **resserrée** :
  elle ne vise plus qu'un changement d'état hors de *tout* événement dispatché
  (le cas `fitOnReplace` de `10`). Effet d'exploitation à connaître : le mode
  browser écrit `__screenshots__/` et `.vitest-attachments/` **dans `src/`** à
  chaque échec — les deux sont désormais dans `.gitignore`. `STILL_JSDOM`
  tombe de 21 à 15. **Perf : 8,05 s** pour la suite (9,4 s avant, ~8,9 s après
  `04`) — les ~180 yields ne se voient pas.

- [08 — Lot 2 : les contrôles, userEvent et locators](issues/08-lot-controles.md)
  — **Six fichiers verts, zéro attendu recalculé — et le versant `userEvent` de
  `05` n'est pas ce qui a coûté cher.** La règle passe sans exception :
  `selectOptions` emprunte le même chemin que le `change` synthétique, les deux
  `getByText(label).nextElementSibling` de `toolPanel` basculent sur
  `container.querySelector` comme prévu, et le seul arbitrage neuf va dans le
  sens de la règle (le `<select>` est **unique dans l'app**, donc
  `getByRole('combobox')`). Les deux vraies trouvailles sont des pièges de
  *timing*. **`unmount()` et `cleanup()` de `vitest-browser-react` sont
  asynchrones** : non attendu, l'`act()` d'un `unmount()` chevauche celui du
  `render()` suivant et **casse tous les tests suivants du fichier** — sur
  `snapToggle`, 6 rouges et 46 s de run, aucun ne pointant vers la cause, tous
  verts isolément ; `gridToggle` n'était épargné que parce que son démontage
  est le dernier test. **Et `07` n'était vrai que des événements discrets** :
  `pointerdown`/`up`/`keydown`/`click` sont flushés en fin de dispatch, mais
  `pointermove` et `wheel` sont *planifiés* derrière le `setTimeout(0)` déjà
  posé — leur commit tombe au **second** tour (mesuré 5×5 : un tick échoue
  toujours, deux ticks réussissent toujours, un rAF aussi mais à 16 ms contre
  ~1 ms). Ce n'est pas un confort d'assertion : ça cassait le geste lui-même,
  le `pointerdown` qui pose une porte lisant l'`openPreview` écrit par le
  `pointermove` — aucune assertion réessayante n'y aurait rien changé.
  Correctif au point unique, `settle()` cède deux macrotâches pour les types
  continus ; les tests restent en assertions directes, `testKit` porte la règle.
  Trois faits mineurs : **`page.getByText` matche des sous-chaînes** là où
  `screen.getByText` était exact (heurt avec un hint → `{ exact: true }`) ;
  `testKit` passe de 6 à **9 exports** (`keyUp`, `blur`, `wheel`), un helper par
  type d'événement portant son init obligatoire — `11` jugera s'il faut
  refermer ; le stub `matchMedia` d'`AppMenu` survit pour une autre raison
  (épingler la préférence système de la machine, pas pallier jsdom).
  `STILL_JSDOM` tombe de 15 à **9**. Suite : 405 tests verts, **6,7 s** (8,05 s
  après `07`), trois runs consécutifs stables ; rien n'est commité.

- [09 — Lot 3 : le rendu sans événement](issues/09-lot-rendu.md)
  — **Quatre fichiers verts du premier coup, et la prédiction centrale de la
  carte tient sur le lot qui la testait le plus finement : zéro attendu
  recalculé.** Le diff filtré sur les `expect` ne remonte que deux enrobages
  `await` ; les valeurs (`'4,10 m'`, `'-5,5 405,5 405,-5 -5,-5'`, `'98.5'`…)
  sont intactes. **Aucun écart de rendu jsdom → Chromium sur les attributs
  SVG**, y compris sur les 416 lignes de `render.test.tsx` — la question du
  point d'attention est close, il n'y a rien à réexaminer. **C'est le seul lot
  sans trouvaille, et c'est une confirmation du découpage de `05`** : là où
  `07` et `08` ont chacun trouvé un piège de timing, ces fichiers ne
  dispatchent rien et ne mutent aucun état hors React, donc **la seule
  frontière asynchrone est le `render()`**. Grouper par règle mise à l'épreuve
  a isolé un lot qui n'en éprouvait aucune, et le plus gros fichier du repo
  est passé sans un arbitrage. Diff mécanique en quatre substitutions :
  l'import, `afterEach(cleanup)` **supprimé** (nettoyage automatique, et
  *avant* chaque test), les cinq helpers de rendu passés en `async` avec leurs
  appelants (c'est là que passent les +121/−121 du gros fichier), et les **4
  `cleanup()` en milieu de test** de `render.test.tsx` passés en `await` — le
  legs de `08` appliqué avant qu'il ne morde. Les `container.querySelector`
  n'ont pas bougé d'une ligne ; le namespace SVG ne s'est pas posé, les quatre
  fichiers enveloppant déjà leur fragment dans un `<svg>`. **Perf : 6,7 s →
  ~4,9 s**, trois runs stables — le gain de 1,8 s pour quatre fichiers
  reconfirme que c'est le montage d'un `environment` jsdom **par fichier** qui
  coûte. `STILL_JSDOM` tombe de 9 à **5**, les cinq exacts du lot `10`.
  Typecheck, lint et format propres ; rien n'est commité.

- [10 — Lot 4 : les singularités](issues/10-lot-singularites.md)
  — **Cinq fichiers verts du premier coup, zéro attendu recalculé, et zéro
  trouvaille de timing** : le lot réputé le plus hétérogène est celui qui a le
  moins résisté, là où `07` et `08` en avaient chacun une. Les deux décisions
  sont prises. **La béquille de `useView.ts` est supprimée** (le
  `if (typeof ResizeObserver !== 'undefined')` et son repli
  `window.addEventListener('resize')`) — seul fichier de production touché par
  toute la carte, à sortir explicitement du périmètre « tests » au commit ;
  zéro effet réel, le seul environnement sans `ResizeObserver` était jsdom.
  **`testKit` gagne `mouse(el, type, init)`** et non deux helpers nommés :
  strictement parallèle à `pointer(el, type, init)`, il renvoie le booléen de
  `dispatchEvent` (`false` si annulé), ce qui absorbe sans cas particulier la
  seule assertion du repo qui lit un retour d'événement
  (`expect(await mouse(svg, 'contextmenu')).toBe(false)`) — **10 exports**, pas
  11. **Le point d'attention du ticket est levé** : après un `dblclick` réel,
  l'`autoFocus` de l'input porte, `userEvent.keyboard` atteint la bonne cible
  sans clic préalable, et les deux styles s'enchaînent dans un même geste sans
  couture. Arbitrage neuf dans le sens de `05`, calqué sur le
  `getByRole('combobox')` de `08` : l'input n'a **aucun nom accessible** mais
  c'est le seul champ texte de l'app → `getByRole('textbox')`. Deux faits
  mesurés, non supposés : **`page.viewport()` résout après le commit du
  redimensionnement** (les `expect.poll` de garde retirés, trois runs verts),
  donc les assertions restent directes ; mais **le viewport est un état partagé
  du navigateur**, pas une fixture de fichier — premier global de la migration
  à demander une restauration explicite (`afterEach`), ce que l'isolation par
  fichier de `03` ne couvre pas. `fitOnReplace` confirme être **le seul**
  fichier où la règle `act()` mord. `STILL_JSDOM` tombe de 5 à **0**. Suite :
  405 tests verts, **~3,9 s** (~4,9 s après `09`) ; typecheck, lint et format
  propres ; rien n'est commité.

- [11 — Fermeture : supprimer le shim, jsdom, et vérifier la CI](issues/11-fermeture.md)
  — **La destination est atteinte à un fait près, et ce fait n'est pas une
  inconnue technique : c'est un identifiant manquant.** Tout est supprimé
  (`testHelpers.ts`, `STILL_JSDOM`, les trois docblocks, jsdom et les deux
  `@testing-library` de `package.json`), les deux renommages `.ts` → `.tsx`
  sont verts sans une ligne de plus, et **trois commits sont posés**. Suite
  finale : **36 fichiers, 405 tests, ~3,96 s** — et surtout **`environment
  1ms`**, la preuve chiffrée qu'aucun jsdom n'est plus monté (9,4 s au départ).
  Les quatre portes passent en local, mais **la CI n'a jamais tourné** : le
  remote est en SSH que le proxy du sandbox n'authentifie pas, l'HTTPS rend
  `could not read Username` — **aucun token GitHub en secret du sandbox**
  (`sbx secret set $(hostname) github -t "$(gh auth token)"` côté hôte). Et
  le workflow ne se déclenche que sur `pull_request` ou push vers
  `main`/`production` : **pousser la branche seule ne lancerait rien**, il
  faut une PR. Deux découvertes, toutes deux en marge : **la CI était déjà
  rouge avant cette carte** — le `render.tsx` de `HEAD` n'est pas conforme à
  `oxfmt` 0.59 (vérifié isolément, version identique avant/après), correctif
  ramassé par un lot et **sorti dans son propre commit** pour ne pas faire
  passer un bug CI préexistant pour un effet de bord des tests ; et **`jsdom`
  survit dans le lockfile en peer optionnel de `vitest` lui-même**, où le
  régénérer à zéro ne l'enlève pas et retire au passage des entrées
  multi-plateformes (`@emnapi/*`, `@napi-rs`) — 2122 lignes de diff contre 416
  pour le `npm uninstall` chirurgical, qui est celui retenu. **Spike
  supprimé**, et pas parce qu'il fait doublon : vivant dans `.scratch/`, hors
  de tout `include`, **aucun runner ne le lançait** — en faire un vrai canari
  demanderait de le promouvoir dans `src/`, soit de la couverture nouvelle,
  hors périmètre. Ordre des commits contraint : `useView` **après** la
  migration, le retrait du repli `window.resize` cassant `resizeView.test`
  tant que ce fichier pilote encore par événement window.

## Not yet specified

**Le brouillard est vide, et la carte est close à une vérification près.**
Il ne reste aucune décision : le seul reliquat est **la CI, à voir verte** —
pas un ticket, une action bloquée sur un secret sandbox à poser côté hôte,
puis une PR à ouvrir (le workflow ignore les pushes de branche). Mesurer à
cette occasion le job à froid et à chaud, le cache Playwright faisant ~337 Mo.

## Out of scope

- Les tests purs (`src/model/`, `src/store/`, `src/transfer/`,
  `src/persistence/`) — ils tournent en `environment: node` sans DOM et n'ont
  aucune raison de bouger. `persistence.test.ts` garde `fake-indexeddb`.
- Les tests end-to-end / parcours applicatifs complets. Le mode browser est
  ici un environnement d'exécution pour des tests de composants, pas une
  bascule vers du e2e.
- Changer de runner ou de framework d'assertion — on reste sur Vitest.
- **Élargir `browser.instances` au-delà de chromium** (Firefox, WebKit). `06`
  a montré que la faisabilité du dispatch manuel repose sur un détail
  d'implémentation de Chromium (souris = `pointerId: 1`, active en permanence)
  et non sur une garantie de la spec — laquelle interdirait plutôt la capture.
  Ajouter un second navigateur rouvrirait donc la question centrale de la
  carte ; c'est le seul chemin qui la rouvre, et il est hors de cette
  destination.
- Ajouter de la couverture de test nouvelle. La migration est à
  iso-comportement : un test qui passe aujourd'hui doit passer après, et
  aucun cas non couvert aujourd'hui n'est à couvrir dans cet effort.
