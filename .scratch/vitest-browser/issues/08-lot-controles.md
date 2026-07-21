# 08 — Lot 2 : les contrôles, userEvent et locators

Type: task
Status: resolved
Blocked by: 07

## Question

Le lot qui met à l'épreuve le versant `userEvent` de la règle de `05` : six
fichiers dont les interactions passent par des contrôles nommables. C'est ici
que `screen.getBy*` devient `page.getBy*`, que `fireEvent.click` devient
`await userEvent.click`, et que les assertions de présence deviennent
`await expect.element(...)`.

- `AppMenu.test.tsx` (66 l.) — **à traiter en premier.** Il est le
  représentant le plus pur du lot (66 lignes de `fireEvent.click` sur
  `getByTitle`), et le migrer tôt supprime du travail à la carte
  `headless-ui` avant qu'elle ne l'écrive : sa recherche a établi que Headless
  UI en jsdom exige quatre polyfills (`ResizeObserver`, `PointerEvent`,
  `innerText`, `getAnimations`), tous natifs en mode browser.
- `gridToggle.test.tsx` (54 l.)
- `zoomIndicator.test.tsx` (56 l.) — porte l'unique `fireEvent.wheel`, sur le
  `svg` avec des coordonnées : dispatch manuel, pas `userEvent`. Utilise aussi
  `zoomLabel`, désormais dans `testKit`.
- `snapToggle.test.tsx` (143 l.) — mixte : 5 `click` sur contrôle, 5
  `keyDown(window)`, et du `clientAt`. Bon test de la règle.
- `measuresToggle.test.tsx` (150 l.) — 12 `click`, le plus dense du lot.
- `toolPanel.test.tsx` (211 l.) — 9 `keyDown(window)`, 5 `change` sur
  `select`, et deux lectures `screen.getByText(label).nextElementSibling`.
  Ces deux-là ne se traduisent pas en locator : un locator ne navigue pas dans
  le DOM. Les basculer sur `container.querySelector`, conformément à la règle
  (ce n'est plus une désignation d'utilisateur mais une navigation).

Points d'attention :

- `userEvent.click` est **asynchrone** — tout test qui en contient devient
  `async`, et l'assertion qui suit doit être `await expect.element(...)` si
  elle porte sur un locator.
- `change(select, { target: { value: '80' } })` n'a pas d'équivalent direct :
  c'est `await userEvent.selectOptions(locator, '80')`. Vérifier que
  l'événement `change` réel déclenche bien le même chemin que le `change`
  synthétique actuel.
- Retirer chaque fichier de `STILL_JSDOM` au fur et à mesure.

## Answer

**Les six fichiers sont verts (85 tests en mode browser, 405 sur la suite
entière), zéro attendu recalculé — mais le versant `userEvent` de `05` n'est
pas ce qui a coûté cher. Ce lot a trouvé deux pièges que rien n'avait vus, et
tous deux relèvent du *timing*, pas du style.**

### La règle de `05` passe l'épreuve, sans exception

Le versant `userEvent` s'est traduit mécaniquement : `screen.getBy*` →
`page.getBy*`, `fireEvent.click` → `await userEvent.click`,
`fireEvent.change(select, { target: { value } })` →
`await userEvent.selectOptions(locator, value)` — le `change` réel emprunte
exactement le même chemin que le synthétique, aucun test n'a bougé. Les deux
lectures `getByText(label).nextElementSibling` de `toolPanel` ont basculé sur
`container.querySelector`, comme prévu : ce sont bien des navigations DOM
(`.panel-row-label` / `.panel-row-value`), pas des désignations d'utilisateur.
Un seul arbitrage non anticipé, tranché dans le sens de la règle : le `<select>`
du panneau est **unique dans toute l'app**, donc `page.getByRole('combobox')`
— un contrôle nommable — plutôt que `document.querySelector('.panel select')`.

### Piège 1 — `unmount()` est asynchrone, et non attendu il empoisonne le fichier

`gridToggle` et `snapToggle` gardent un test « remembers the choice across
sessions » qui démonte puis remonte. `unmount()` de `vitest-browser-react` est
**`async`** (il enveloppe `root.unmount()` dans un `act()`). Non attendu, son
`act()` chevauche celui du `render()` suivant : Chromium logge « overlapping
act() calls », et **tous les tests suivants du fichier échouent** avec un
`<body>` vide et des timeouts de 15 s. Sur `snapToggle` : 6 tests rouges,
46 s de run, et **aucun d'eux ne pointait vers la vraie cause** — chacun
passait isolément. `gridToggle` n'a pas été touché uniquement parce que son
test de démontage est le dernier du fichier. `await first.unmount()` supprime
warning et échecs. Même remarque pour `cleanup()`, appelé en cours de test dans
`measuresToggle`. Retenu dans `CLAUDE.md`.

### Piège 2 — React commit les événements *continus* un tour plus tard

`07` avait établi que React commit sur son scheduler, et qu'une macrotâche
cédée suffisait. **Ce n'est vrai que des événements discrets.** `pointerdown`,
`pointerup`, `keydown`, `click` sont flushés par React à la fin du dispatch ;
`pointermove` et `wheel` sont *planifiés*, et la tâche du scheduler est mise en
file **derrière** le `setTimeout(0)` déjà posé — leur commit tombe sur le
**second** tour. Mesuré, 5 exécutions par variante : un tick échoue
systématiquement (5/5), deux ticks réussissent systématiquement (5/5), un rAF
aussi (mais à 16 ms contre ~1 ms).

Ce n'est **pas un confort d'assertion** : c'est ce qui a cassé « places doors
with the preconfigured width », où le `pointerdown` qui pose la porte lit
l'`openPreview` écrit par le `pointermove` précédent. Une assertion réessayante
n'aurait rien réparé — le problème est *dans* le geste. Correctif au point
unique : `settle()` prend le type d'événement et cède **deux** macrotâches pour
`pointermove` / `wheel`. Coût mesuré : nul à l'échelle de la suite.

Conséquence : les tests restent écrits en assertions directes. `testKit` porte
la règle, conformément au principe de `05` (« le helper *est* l'application de
la règle »).

### Trois faits mineurs

- `page.getByText` **matche des sous-chaînes**, là où `screen.getByText` de
  testing-library était exact. `getByText('Wall')` a heurté le hint « Click to
  start a wall chain… » : `{ exact: true }` sur les trois titres de panneau.
- `testKit` passe de 6 à **9 exports** : `keyUp` et `blur` (les deux uniques
  dans `snapToggle`), `wheel` (l'unique de `zoomIndicator`, listener natif
  non-passif sur le `svg`). Le motif est clair — un helper nommé par type
  d'événement, chacun portant son init obligatoire. `11` jugera s'il faut
  refermer ça.
- `AppMenu.test.tsx` gardait un stub de `matchMedia` « parce que jsdom n'en a
  pas » ; le stub reste, pour une autre raison — épingler la préférence système
  de la machine qui exécute la suite. Le commentaire a été corrigé.

### État

`STILL_JSDOM` tombe de **15 à 9**. Suite complète : 36 fichiers / 405 tests
verts, typecheck et lint propres, **6,7 s** (8,05 s après `07`, 9,4 s à
l'origine). Trois exécutions consécutives du projet browser : stables. Rien
n'est commité.

**À porter dans `10`** : démonter un `Editor` fait tirer `flushSync` depuis le
`ResizeObserver` de `useView` (L111-123), ce qui logge « overlapping act() »
tant qu'un `act()` est ouvert. Bénin, mais `10` réécrit déjà ce bloc pour
retirer la béquille jsdom — un garde `isConnected` y refermerait le bruit.
