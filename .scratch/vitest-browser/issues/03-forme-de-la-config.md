# 03 — Forme de la config : cohabitation node/browser, viewport, CSS

Type: grilling
Status: resolved
Blocked by: 01

## Question

Le mode browser ne se règle pas par docblock : il est par projet. Or le repo
active jsdom fichier par fichier, sur une config test logée dans
`vite.config.ts` avec `environment: 'node'` par défaut. La structure de la
config est donc à redessiner, et plusieurs choix en découlent.

- **Découpage.** Deux projets Vitest (`node` et `browser`) découpés par
  `include`/glob ? Si oui, sur quel critère un fichier tombe d'un côté ou de
  l'autre : son chemin (`src/editor/**` vs le reste), une convention de nom
  (`*.browser.test.tsx`), ou une liste explicite ? Le critère doit rester lisible
  quand un nouveau test s'ajoute dans six mois.
- **Où vit la config.** On garde tout dans `vite.config.ts`, ou on extrait un
  `vitest.config.ts` ? Attention : la config Vite porte le plugin PWA et le
  plugin React ; ce que les tests doivent hériter ou pas est à trancher (le
  service worker en dev n'a rien à faire dans une suite de tests).
- **Commandes.** `npm test` continue-t-il de tout lancer d'un coup ? Faut-il
  un `test:node` / `test:browser` séparés pour la boucle de dev, sachant que
  le browser sera plus lent ? Et que lance la CI ?
- **Viewport.** `testHelpers.ts` fige le canevas à 800×600 (`RECT`) et toutes
  les assertions en dépendent. En browser mode la taille vient d'un vrai
  viewport : on le fixe à 800×600 pour préserver les valeurs attendues, ou on
  choisit une autre taille et on assume de recalculer les attendus ? Où se
  fixe-t-il — config globale ou par test ?
- **CSS.** `src/styles.css` n'est importé que par `main.tsx`. En browser mode
  la taille rendue du SVG dépend de la mise en page réelle, donc du CSS. On
  l'importe dans un `setupFiles` (tous les tests voient le vrai style, plus
  fidèle mais plus fragile), dans chaque test qui en a besoin, ou pas du tout
  en imposant les dimensions autrement ? Même question pour les polices
  `@fontsource/jetbrains-mono`, qui affectent la mesure de texte — et
  `roomTextBlocks.test.ts` mesure du texte.
- **`setupFiles`.** Le repo n'en a aucun aujourd'hui. On en crée un ? Que
  contient-il exactement (CSS, reset du store, `cleanup`) ?
- **Isolation.** Le store zustand est un singleton, remis à zéro en
  `beforeEach`. Le mode browser isole-t-il les fichiers de la même manière que
  jsdom, et le pattern actuel tient-il tel quel ?

## Answer

Sept décisions, plus un fait bloquant découvert en sondant. Aucun fichier de
production n'a été touché : `03` décide, `04` écrit la config et la fait tourner.

### 1. Découpage — l'extension du fichier

`*.test.tsx` → projet `browser` ; `*.test.ts` → projet `node`.

Ce n'est pas une convention à retenir mais une propriété garantie par le
compilateur : **TypeScript interdit le JSX dans un `.ts`**, donc « je rends un
composant » ⇒ « j'écris du JSX » ⇒ « le fichier est `.tsx` ». Relevé au moment
de la décision, 33 fichiers sur 36 étaient déjà du bon côté :

|                    | `.ts` | `.tsx` |
| ------------------ | ----- | ------ |
| jsdom aujourd'hui  | 3     | 22     |
| node aujourd'hui   | 11    | 0      |

Écartés : le découpage par chemin (`src/editor/**` + deux hors-cadre —
lisible, mais liste d'exceptions à maintenir) et la convention de nom
`*.browser.test.tsx` (25 renommages, et redondante avec le répertoire).
L'`include` qui en sort n'a **aucune liste** à tenir à jour.

### 2. Les deux fuites, refermées par renommage

La réciproque de la règle est fausse — un `.ts` peut vouloir un DOM sans JSX.
Les trois exceptions relevées étaient exactement le patch de brouillard « les
trois fichiers sans rendu » de la carte :

- `roomTextBlocks.test.ts` — **aucun** global DOM (vérifié), calcule sa mise en
  page par des maths sur le modèle. Reste `.ts`, **tombe en node gratuitement**,
  son docblock jsdom était superflu.
- `preference.test.ts` — 10 usages de `localStorage`, rien d'autre.
- `theme.test.ts` — `localStorage` **plus** `document.documentElement.dataset`,
  `document.createElement('meta')`, `document.head`. Du vrai DOM.

Les deux derniers sont **renommés en `.tsx`**. L'extension devient donc le
**marqueur d'environnement**, pas un marqueur de JSX : la même opt-in par
fichier qu'aujourd'hui, déplacée du docblock (qui ne peut plus servir, le mode
browser étant par projet) vers le nom. Basculer un fichier d'environnement
reste une modification d'un caractère, visible dans l'arborescence. Coût
assumé : deux `.tsx` sans une ligne de JSX, à désamorcer par un commentaire
dans la config.

Bénéfice au passage : ces deux tests gagnent un **vrai `localStorage`** au lieu
de celui de jsdom. **Ce patch de brouillard est refermé** — le shim
`localStorage` en node n'aurait économisé que les ~830 ms d'un fichier browser.

### 3. Un seul fichier de config

Tout reste dans `vite.config.ts`. `defineConfig` devient une fonction, et
`VitePWA` est le seul plugin écarté sous `mode === 'test'` — **vérifié
empiriquement que Vitest force `mode = 'test'`**.

Mesuré sur le test de fumée de `02`, à chaud :

| config                                   | durée      | effet de bord              |
| ---------------------------------------- | ---------- | -------------------------- |
| `react()` seul                           | ~830 ms    | —                          |
| `react()` + `VitePWA`                    | ~1 400 ms  | écrit `dev-dist/sw.js`     |
| `react()` + `VitePWA` sous `mode!=='test'`| ~830 ms   | aucun                      |

Le plugin PWA **ne casse rien** en mode browser — les tests passent — mais il
coûte ~550 ms fixes par run, dans le `import`, et crache un `dev-dist/` à
chaque `npm test`.

Écarté : un `vitest.config.ts` séparé. Il **remplace** `vite.config.ts`, il ne
le complète pas : il faudrait y redéclarer `react()` et **répliquer à la main
tout ajout futur au pipeline Vite** (`resolve.alias`, `define`, un plugin de
transformation). Or `01` et `02` ont établi que les tests browser dépendent
précisément de ce pipeline — c'est lui qui traite `styles.css`. Une dérive
entre les deux fichiers se manifesterait par un test échouant pour une raison
sans rapport visible avec sa cause.

### 4. Commandes

```json
"test": "vitest run",
"test:node": "vitest run --project node",
"test:browser": "vitest run --project browser",
"test:watch": "vitest"
```

`npm test` reste **le tout** : c'est ce que lance la CI (inchangée — le seul
diff CI est l'installation du navigateur, déjà écrit en `02`, qui atterrira
avec `04`). Si le défaut ne lançait que node, un test browser cassé passerait
inaperçu jusqu'à la CI. `test:node` / `test:browser` sont des raccourcis de
boucle de dev, pas des modes. `--project` accepte aussi `!pattern` en v4.

**Pas de `postinstall`** installant Chromium : 337 Mo et 1 min 20 s imposés à
quiconque ne touche que `src/model/`. Un contributeur sans navigateur verra
`npm test` échouer sur le message explicite de Playwright
(`Executable doesn't exist… run npx playwright install`), qui est actionnable.

### 5. Viewport — 800×600, en config globale

**`RECT` n'était pas une convention arbitraire : c'était une simulation du
viewport.** L'app est en `100vw/100vh` avec toutes ses surcouches en
`position: absolute`/`fixed` — elles ne retranchent rien au SVG. Mesuré en
montant `Editor` dans Chromium avec `browser.viewport: { width: 800, height: 600 }` :

| | valeur mesurée |
| --- | --- |
| `svg.getBoundingClientRect()` | `{ left: 0, top: 0, width: 800, height: 600 }` — exactement |
| `viewBox` commité | `w = 800/S0`, `x = -80 - (800/S0 - 820)/2`, `S0 = 600/620` |
| `getScreenCTM().a` | `600/620` |
| après `page.viewport(1000, 800)` | rect réel `1000×800` |

La deuxième ligne est **la formule que `resizeView.test.tsx` attend déjà**.
Donc : **zéro attendu à recalculer** sur les 25 fichiers. La rupture redoutée
au cadrage (« toutes les assertions de coordonnées changent de nature ») n'a
pas lieu tant que le viewport vaut 800×600.

Exposition réelle relevée avant la mesure : 13 fichiers passent par
`clientAt(svg, px, py)` et expriment leurs coordonnées en espace plan — ils
sont insensibles à la taille pourvu que l'helper dise la vérité ;
`fitOnReplace` et `zoomIndicator` **calculent** leurs attendus depuis le rect,
donc sont déjà paramétrés. Seul `resizeView.test.tsx` mute `RECT`.

Global plutôt que par test : 24 fichiers sur 25 veulent la même chose, et un
défaut de config s'oublie moins qu'un `beforeEach`. `resizeView.test.tsx`
passe à `await page.viewport(w, h)`, qui déclenche le **vrai `ResizeObserver`**
— il couvrira enfin le chemin de production au lieu de la béquille jsdom.

Vigilance pour `05` : le viewport **persiste d'un test à l'autre** dans un même
fichier (page partagée). `resizeView` doit le remettre à 800×600 en `afterEach`
— exactement ce que fait déjà son `afterEach` sur `RECT`.

### 6. CSS oui, polices non

`setupFiles` importe `styles.css`, pour le seul projet browser.

**Aucune assertion actuelle n'en dépend** — vérifié : `getComputedTextLength`,
`getBBox`, `measureText`, `getComputedStyle`, `offsetWidth`, `scrollWidth`
n'apparaissent **nulle part** dans `src/` ; le seul test touchant au style est
`render.test.tsx` via `classList`, qui lit l'attribut `class`. Et importer le
CSS ou non ne change ni le rect ni les coordonnées (les deux variantes du
probe passent à l'identique — Vitest neutralise déjà la marge du `body`).

La raison est ailleurs : **sans lui, les surcouches perdent `position: absolute`
et retombent dans le flux.** Les tests interagiraient avec une mise en page qui
n'existe nulle part en production. C'est là que ça mord : les locators de
Vitest vérifient l'**actionnabilité** avant de cliquer, donc un bouton qui en
vrai est masqué par un panneau serait cliquable dans le test. Migrer vers un
vrai navigateur pour tester une mise en page fictive remplacerait le shim
`testHelpers.ts` par un shim implicite.

Contrepartie assumée : un changement de `styles.css` peut désormais casser des
tests. Le risque est borné — c'est le `position: absolute` qui compte, pas les
couleurs.

**Les polices restent dehors.** Rien ne mesure de texte, donc
`@fontsource/jetbrains-mono` ne changerait aucun pixel qu'une assertion
regarde, et ajouterait du chargement **asynchrone** (`document.fonts.ready`)
sur 22 fichiers — de la flakiness pure. Le repli `ui-monospace, monospace` de
la règle `svg text.dim` suffit. Si un test mesure du texte un jour, il
importera la police lui-même et cette décision se rouvrira sur un cas concret.

### 7. `setupFiles` minimal

`src/testSetup.browser.ts`, une seule ligne : `import './styles.css'`. Le
projet node n'a aucun `setupFiles`.

- **Pas de reset du store.** Les 22 fichiers ne partent pas du même plan
  (`emptyPlan()`, `squareRoomPlan()`, un `buildPlan` sur mesure) ; leur
  `beforeEach` est déjà l'endroit qui le dit. Le remonter en global cacherait
  dans la config une prémisse que chaque test énonce aujourd'hui.
- **Pas de `cleanup`** — et il ne se déplace pas, il **disparaît** : `01` a
  établi qu'il est automatique en mode browser et qu'il tourne **avant** chaque
  test (l'inverse de testing-library). Les 25 `afterEach(cleanup)` sont à
  supprimer, pas à migrer.

**Isolation vérifiée empiriquement** : deux fichiers, le premier salissant le
singleton zustand *et* `globalThis`, le second les trouvant vierges. Le mode
browser isole par fichier comme jsdom ; le pattern `beforeEach` actuel tient
tel quel.

### Fait bloquant : `resolve.dedupe` est obligatoire

Sans `resolve: { dedupe: ['react', 'react-dom'] }`, tout test montant `Editor`
échoue sur `Invalid hook call` / `Cannot read properties of null (reading
'useCallback')` : le bundle optimisé de **`zustand`** résout React vers
`node_modules/react/cjs/react.development.js` (CJS) pendant que
`vitest-browser-react` embarque sa propre copie. Deux React, deux registres de
hooks.

Le spike de `06` ne l'avait pas rencontré — il rendait un composant à `useState`
local, sans toucher au store. C'est un fait, pas un arbitrage.

### La config décidée

```ts
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'test' ? [] : [VitePWA({ … })])],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: true },
  test: {
    exclude: [...defaultExclude, '.scratch/**'],
    projects: [
      { test: { name: 'node', include: ['src/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'browser',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/testSetup.browser.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            viewport: { width: 800, height: 600 },
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
}))
```

### Remontée à la carte, hors périmètre de `03`

`src/editor/useView.ts` L116-123 porte une **béquille jsdom dans le code de
production** : `window.addEventListener('resize', syncMeasure)`, commentée
« jsdom has no ResizeObserver; tests drive resizes through window events ».
`testHelpers.ts` n'est donc pas le seul shim que la destination efface — le
patch de brouillard « suppression finale de `testHelpers.ts` » est plus large
qu'écrit.
