# 02 — Rendre le mode browser exécutable, ici et en CI

Type: task
Status: resolved
Blocked by: 01

## Question

Rien à décider : du travail à faire, sans lequel `04` est impossible. Le
sandbox n'a aucun binaire navigateur et `cdn.playwright.dev` renvoie `403`.

À faire :

- Vérifier que le déblocage réseau côté hôte a bien été appliqué
  (`sbx policy allow network cdn.playwright.dev`) ; tester aussi le fallback
  `playwright.azureedge.net` si le provider retenu en `01` en dépend. Si
  d'autres domaines sont nécessaires, remonter la liste précise au dev plutôt
  que de tâtonner.
- Installer le provider retenu par `01` et son binaire, headless, et prouver
  qu'il démarre — un test browser trivial (`expect(document.title)`) qui passe
  en vert. C'est le critère de résolution : pas « installé », mais « un test
  browser a tourné ».
- Ajouter l'étape correspondante à `.github/workflows/ci.yml` et vérifier
  qu'elle passe. Noter le surcoût en temps du job.
- Vérifier si le cache npm existant d'`actions/setup-node` suffit ou s'il faut
  cacher les binaires navigateur séparément.

## Réponse attendue

Consigner : le provider et sa version, la commande d'installation exacte, les
domaines réseau requis, le diff CI, et le temps d'installation mesuré. Les
tickets suivants s'appuient dessus.

## Answer

**Le mode browser tourne ici.** Un test browser réel est passé au vert — le
critère de résolution est atteint pour le local. La partie CI est spécifiée et
mesurée mais **pas encore landée** : voir « Reste à faire » plus bas.

### Provider et paquets

Installés en `devDependencies` :

```
npm install -D @vitest/browser-playwright playwright vitest-browser-react
```

- `@vitest/browser-playwright@4.1.10` — le provider en paquet séparé, comme
  `01` l'avait établi. S'utilise en **fonction** : `provider: playwright()`.
- `playwright@1.61.1` (`playwright-core` résolu en `1.61.1`) — nécessaire pour
  la CLI `playwright install`.
- `vitest-browser-react@2.2.0` — le rendu React.

`@testing-library/*` et `jsdom` sont **restés en place** : la suite actuelle en
dépend jusqu'à la fin de la migration. Leur retrait est le dernier geste de la
carte, pas celui-ci.

### Binaire navigateur

```
npx playwright install --with-deps --only-shell chromium
```

- **1 min 21 s** à froid, sur le sandbox (linux/arm64).
- Installe Chrome Headless Shell `149.0.7827.55` (build playwright
  `chromium-headless-shell-1228`) dans `~/.cache/ms-playwright/`.
- Poids du cache : **334 Mo** (headless shell) + **3,3 Mo** (ffmpeg) ≈ **337 Mo**.
- `--with-deps` n'a rien eu à faire ici : `playwright install-deps` répond
  déjà « All system dependencies are installed ». À conserver quand même pour
  la CI, où le runner n'a pas ces paquets.

### Domaines réseau — la liste précise

- `cdn.playwright.dev` — **débloqué, confirmé** : renvoie désormais `400` (le
  CDN lui-même) au lieu du `403` de la politique réseau. C'était le blocage
  dur ; il est levé.
- `playwright.download.prss.microsoft.com` — **toujours bloqué** (`403`,
  default deny). Playwright le tente en priorité pour ffmpeg via deux URL
  (`cdn.playwright.dev/dbazure/...` qui redirige, puis le domaine direct),
  échoue deux fois, **puis retombe sur `cdn.playwright.dev/builds/...` qui
  fonctionne**. L'installation aboutit donc, au prix de deux erreurs
  bruyantes dans les logs. Rien à débloquer, mais à ne pas confondre avec un
  échec réel si quelqu'un relit les logs.
- Aucun autre domaine requis.

### La preuve : le test de fumée

Deux fichiers jetables, gardés comme actif de la carte (ils serviront de
canari jusqu'à ce que `04` livre un vrai fichier migré) :

- `.scratch/vitest-browser/smoke.config.ts` — config minimale
  (`browser.enabled`, `headless: true`, `provider: playwright()`,
  `instances: [{ browser: 'chromium' }]`, `root` sur le dossier de l'effort).
  Elle **ne préjuge pas** de `03` : c'est un fichier à part, lancé par
  `--config`, qui ne touche pas `vite.config.ts`.
- `.scratch/vitest-browser/smoke.test.tsx` — deux tests.

```
npx vitest run --config .scratch/vitest-browser/smoke.config.ts
→ Test Files 1 passed (1) | Tests 2 passed (2) | Duration 866ms
```

Le second test est le plus instructif : il rend un `<svg>` via
`vitest-browser-react` et vérifie que **`getScreenCTM()` renvoie une vraie
matrice** et que `getBoundingClientRect()` donne la vraie largeur. C'est
exactement ce que `testHelpers.ts` simule aujourd'hui — la substance de la
migration est donc démontrée disponible, pas seulement le démarrage du
navigateur.

Confirme aussi deux faits de `01` en passant : le `render()` de
`vitest-browser-react` est bien **async** et rend bien un `container`
utilisable en `querySelector` — le style du repo survit.

### Effet de bord traité : `.scratch` était dans le glob de test

Poser un `*.test.tsx` sous `.scratch/` l'a fait ramasser par `npm run test`,
qui a échoué (1 fichier en échec sur 37). Corrigé dans `vite.config.ts` :

```diff
+import { defaultExclude } from 'vitest/config'
 …
   test: {
     environment: 'node',
+    exclude: [...defaultExclude, '.scratch/**'],
   },
```

Additif et orthogonal à `03` — ne préempte aucune de ses décisions.
Après correction : **36 fichiers / 405 tests verts**, `npm run typecheck` vert.

### Coût de la suite browser — première mesure

Le test de fumée tourne en **~870 ms** (dont ~100 ms d'import), là où les 36
fichiers node prennent 9,4 s au total. Le démarrage du navigateur n'est donc
**pas** le coût dominant qu'on craignait. À confirmer sur un vrai fichier à
`04` — c'est là que se juge la question perf laissée dans le brouillard.

### Le diff CI (préparé, non landé)

Le cache npm d'`actions/setup-node` **ne suffit pas** : les binaires vivent
dans `~/.cache/ms-playwright`, hors `node_modules`. Il faut un cache séparé,
clé sur la version de `playwright-core` lue dans le lockfile.

```diff
       - name: Install dependencies
         run: npm ci

+      - name: Resolve Playwright version
+        id: pw
+        run: echo "version=$(node -p "require('./package-lock.json').packages['node_modules/playwright-core'].version")" >> "$GITHUB_OUTPUT"
+
+      - name: Cache Playwright browsers
+        uses: actions/cache@v4
+        id: pw-cache
+        with:
+          path: ~/.cache/ms-playwright
+          key: playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}
+
+      - name: Install Playwright browser
+        run: npx playwright install --with-deps --only-shell chromium
+
       - name: Format
```

Notes sur ce diff :

- `install` est lancé **même sur cache hit** : il est quasi instantané quand
  le binaire est déjà là, et il installe les deps système apt que le cache ne
  couvre pas. Pas de `if: steps.pw-cache.outputs.cache-hit != 'true'`.
- Surcoût attendu : **~1 min 20 s à froid** (mesuré ici en arm64 ; le runner
  x64 devrait être comparable ou plus rapide), **quelques secondes sur cache
  hit**. Cache de ~337 Mo, sous la limite de 10 Go d'`actions/cache`.

### Reste à faire — pourquoi la CI n'est pas landée

Le ticket demandait de « vérifier qu'elle passe ». Le vérifier exige de
pousser une branche, donc une action sortante que je n'ai pas prise sans
accord. Surtout, landé maintenant, ce diff installerait **un navigateur que
rien n'utilise** en CI (~1 min 20 s à froid par run, sans aucun test browser
dans la config par défaut) jusqu'à ce que `03`/`04` atterrissent.

**Décision : le diff CI atterrit avec `04`**, quand le premier vrai fichier
browser existe — la même push le vérifie alors pour de bon. Ce n'est pas un
report indéfini : c'est une seule étape déplacée d'un cran dans la carte, et
elle est ici spécifiée à la ligne près.
