# 01 — Surface d'API et contraintes de Vitest 4 en mode browser

Type: research
Status: resolved

## Question

Établir les faits sur lesquels les tickets `02` à `05` vont trancher. Le repo
est en `vitest@^4.1.10`, `vite@^8`, `react@19.2`. Source primaire : la doc
officielle
<https://github.com/vitest-dev/vitest/tree/main/docs/guide/browser> et le code
de `vitest-dev/vitest` ; pas de blog posts.

Points à couvrir :

- **Packages et versions.** Que faut-il installer exactement (`@vitest/browser`
  et/ou autre) pour `vitest@4` ? Le rendu React : `vitest-browser-react` est-il
  la voie officielle, quelle version, quel statut de maintenance, supporte-t-il
  React 19.2 ? Que rend son `render()` — un locator, un container DOM, les
  deux ?
- **Forme de la config.** Le mode browser est par projet, pas par fichier. À
  quoi ressemble la cohabitation `node` + `browser` dans une même config
  (`test.projects` ? `instances` ?) ? La config test vit dans `vite.config.ts`
  ici — est-ce tenable ou faut-il un `vitest.config.ts` séparé ?
- **Providers.** `playwright` vs `webdriverio` vs `preview` : ce que chacun
  exige comme binaire, lequel tourne headless, lequel est recommandé. Le
  provider `preview` évite-t-il tout téléchargement (il compte, vu le blocage
  réseau) ?
- **Événements — le point critique.** Quelle est la surface exacte de
  `userEvent` exporté par `@vitest/browser/context` ? Précisément : peut-on
  exprimer un `pointerDown` à des coordonnées client arbitraires, puis N
  `pointerMove`, puis `pointerUp` — c'est le geste que 144 appels du repo
  effectuent. Existe-t-il un équivalent de `fireEvent` bas niveau ? Le
  `dispatchEvent(new PointerEvent(...))` manuel fonctionne-t-il normalement
  (a priori oui, DOM réel) et est-ce documenté/soutenu ? Comment `userEvent`
  interagit-il avec `setPointerCapture`, que l'éditeur utilise ?
- **Requêtes.** Les locators (`page.getByRole` etc.) sont-ils asynchrones et
  auto-retry ? Quel est le remplaçant de `screen.getByTitle` /
  `getByLabelText` / `queryByText` ? Y a-t-il un `cleanup` automatique entre
  tests ?
- **`act()`.** Les 47 `act()` du repo ont-ils encore un sens en mode browser,
  ou l'attente est-elle portée par les locators auto-retry ? Que dit la doc
  sur React et `act` en browser mode ?
- **Viewport et CSS.** Comment la taille de la page/du viewport se fixe-t-elle
  (config `viewport` ? `page.viewport()` ?) ? Les fichiers CSS importés le
  sont-ils réellement, et par quel mécanisme (`setupFiles` ? import dans le
  test ?) ?
- **CI headless.** Quelle étape faut-il ajouter à un job `ubuntu-latest` (une
  action officielle ? `npx playwright install --with-deps` ?), et quel est le
  coût en temps d'installation constaté.
- **Limites connues.** Ce qui ne marche pas ou est explicitement non supporté
  en mode browser et qui pourrait mordre ici : mocking, `vi.mock`, timers
  factices, `localStorage`, snapshots, watch mode.

Consigner les findings sur une branche jetable `research/vitest-browser`, avec
un pointeur depuis ce ticket.

## Answer

Findings complets (1017 lignes, ~48 liens de sources) :
`.scratch/vitest-browser/research/01-vitest-browser-api.md`, sur la branche
jetable `research/vitest-browser`, commit `6d1e639`. Doc lue au tag `v4.1.10`
(et non `main`, déjà passé en 5.0.0-beta).

Réponse à la question critique, en une ligne : **non**, un `pointerDown` à des
coordonnées client arbitraires suivi de N `pointerMove` puis d'un `pointerUp`
**ne s'exprime pas** avec `userEvent` en Vitest 4 — il n'y a aucune primitive
pointer dans sa surface, aucune option de coordonnée client, et **aucun
équivalent de `fireEvent`** en mode browser. Le dispatch manuel de
`PointerEvent` reste le seul moyen, mais il n'est pas soutenu par la doc et
bute sur `setPointerCapture` (qui doit lever `NotFoundError` sans pointeur
actif). Une API `pointer` officielle est en cours en amont
([PR #10780](https://github.com/vitest-dev/vitest/pull/10780), draft, base
`main` = v5) mais n'arrivera pas en v4.

Autres corrections de cadrage notables : le chemin d'import est `vitest/browser`
(et non `@vitest/browser/context`, qui était la v3) ; les providers sont
désormais des paquets séparés (`@vitest/browser-playwright`) et `provider` est
une fonction ; `preview` est un cul-de-sac (pas de headless, donc pas de CI) ;
`render()` de `vitest-browser-react@2.2.0` est asynchrone mais rend toujours un
`container` **et** un `locator` ; `act` n'est pas exporté.
