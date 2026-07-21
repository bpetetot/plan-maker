# 10 — Lot 4 : les singularités

Type: task
Status: resolved
Blocked by: 07

## Question

Les cinq fichiers qui ne sont pas de la substitution. Chacun a une raison
propre, et l'un d'eux touche le code de production.

**`resizeView.test.tsx` (80 l.) — le seul qui déborde sur la production.**
Toute sa mécanique disparaît : `RECT.width = w` puis
`act(() => window.dispatchEvent(new Event('resize')))` devient
`await page.viewport(w, h)`, un vrai redimensionnement qui déclenche un vrai
`ResizeObserver`. Ce qui rend **morte** la béquille de `useView.ts` L116-123 —
`window.addEventListener('resize', syncMeasure)`, commentée « jsdom has no
ResizeObserver; tests drive resizes through window events ». **À trancher
ici** : la supprimer (elle n'a plus d'appelant, mais c'est un changement de
production dans une carte iso-comportement) ou la laisser (code mort commenté
pour une raison devenue fausse). Recommandation à instruire : la supprimer,
en la sortant du périmètre « tests » explicitement dans le commit.

**`fitOnReplace.test.tsx` (65 l.)** — les 4 `act(() => replacePlan(...))`.
Mutation du store hors React suivie d'une lecture DOM : chacun devient
`await expect.poll(() => viewBoxOf(container)).toEqual(...)`. `expectFraming`
devient donc `async`. C'est le seul fichier où la règle `act` de `05`
s'applique vraiment.

**`roomLabelText.test.tsx` (214 l.) et `roomLabelLifecycle.test.tsx` (127 l.)**
— les deux seuls fichiers où les deux styles s'enchaînent *dans un même
geste* : `doubleClick(svg, clientAt(...))` (dispatch manuel, coordonnées) fait
apparaître un `input`, sur lequel viennent un `change` et un `keyDown` (côté
`userEvent`). Vérifier que l'`input` est bien focalisé après le double-clic
réel — `userEvent.fill` l'exige, là où `fireEvent.change` s'en passait.

**`rightClickTool.test.tsx` (98 l.)** — 7 `contextMenu` sur le `svg`, dont un
qui **lit la valeur de retour** pour vérifier qu'un `preventDefault` a bien eu
lieu (`const notCancelled = fireEvent.contextMenu(svg)`). `dispatchEvent`
renvoie la même sémantique (`false` si annulé), donc le helper `pointer()` ne
convient pas — un `contextmenu` n'est pas un `PointerEvent`. Décider si
`testKit` gagne un second helper générique ou si ce fichier dispatche à nu.

## Answer

**Les cinq fichiers sont verts, chacun du premier coup, et aucun attendu n'a
été recalculé.** Le diff filtré sur les lignes `expect` ne remonte que des
réécritures de *requête* (`screen.` → `page.`), des enrobages `await`, et le
remplacement de `RECT.width/height` par une lecture du rect réel du `svg` —
qui est une lecture, pas un attendu. Les valeurs (`'AAA'`, `''`,
`'translate(175,300)'`, `499`, `233`, `S0 = 600/620`) sont intactes. Le lot
réputé le plus hétérogène est celui qui a le moins résisté : **zéro
trouvaille de timing**, là où `07` et `08` en avaient chacun une.

### Les deux décisions

**1. La béquille de `useView.ts` est supprimée** (L116-123). Le
`if (typeof ResizeObserver !== 'undefined')` et son repli
`window.addEventListener('resize', syncMeasure)` disparaissent ; il reste
trois lignes, `new ResizeObserver(() => flushSync(measure))`. Zéro effet en
production — le seul environnement au monde sans `ResizeObserver` était
jsdom, précisément ce qu'on retire. C'est le **seul fichier de production
touché par toute la carte**, et il doit sortir explicitement du périmètre
« tests » dans le message de commit.

**2. `testKit` gagne `mouse(el, type, init)`, pas deux helpers nommés.**
`dblclick` et `contextmenu` sont des `MouseEvent`, pas des `PointerEvent` —
`pointer()` ne convient pas. La forme retenue est **exactement parallèle à
`pointer(el, type, init)`** : une famille d'événements, un helper générique
sur le type. Il renvoie le booléen de `dispatchEvent` (`false` si annulé),
ce qui absorbe sans cas particulier l'assertion `preventDefault` de
`rightClickTool` — la seule du repo à lire une valeur de retour
d'événement. `testKit` passe de 9 à **10 exports** (et non 11), et un futur
`mousemove` n'y ajoutera rien. La question « faut-il refermer testKit »
reste posée à `11`, mais avec un export de moins à instruire.

### Ce que chaque fichier a appris

**`resizeView.test.tsx` — `page.viewport()` attend le redimensionnement.**
Toute la mécanique `RECT.width = w` + `act(dispatchEvent('resize'))` devient
un `await page.viewport(w, h)` : un vrai redimensionnement, un vrai
`ResizeObserver`, un vrai `flushSync`. **Fait mesuré, non supposé** : j'avais
d'abord gardé un `expect.poll` de garde avant chaque lecture ; les retirer
laisse les 4 tests verts sur trois runs consécutifs. `page.viewport()`
résout **après** que le redimensionnement a été appliqué et commité — les
assertions restent donc directes, comme partout ailleurs dans la suite. Le
fichier gagne en revanche un `afterEach(() => page.viewport(800, 600))` :
**le viewport est un état partagé du navigateur**, pas une fixture de
fichier, et il est réutilisé par les 35 autres fichiers. C'est le premier
état global de la migration qui demande une restauration explicite —
l'isolation par fichier vérifiée en `03` ne couvre pas ça.

**`fitOnReplace.test.tsx` — la règle `act()` de `05`/`07`, appliquée une
fois.** C'est bien le seul fichier concerné, et la version resserrée par `07`
est exactement la bonne : `replacePlan()` mute le store **hors de tout
événement dispatché**, donc il n'existe aucun `settle()` pour couvrir le
commit. Les 4 `act(() => replacePlan(...))` deviennent des appels nus, et
c'est `expectFraming` qui devient `async` avec un `expect.poll` en tête.
`RECT.width/height` disparaît au profit du `getBoundingClientRect()` du
`svg` — ce qui rend l'helper indépendant du viewport configuré au lieu de le
dupliquer.

**`rightClickTool.test.tsx` — `mouse()` couvre les 7 `contextMenu` sans
exception.** Y compris `expect(await mouse(svg, 'contextmenu')).toBe(false)`,
qui vérifie le `preventDefault` : `dispatchEvent` a la même sémantique de
retour que `fireEvent`, la ligne ne change que de forme. `activeTool()`
bascule sur `page.getByLabelText(label).element()`, et deux
`screen.getByText('Door')` prennent `{ exact: true }` — le legs de `08`
appliqué avant qu'il ne morde (le panneau et le bouton d'outil portent tous
deux « Door »).

**`roomLabelText.test.tsx` et `roomLabelLifecycle.test.tsx` — le point
d'attention du ticket est levé : l'`autoFocus` porte.** La crainte était
qu'`userEvent.fill` exige un focus que `fireEvent.change` n'exigeait pas.
Elle ne se matérialise pas : l'input est monté avec `autoFocus` et un
`onFocus={e => e.target.select()}`, et après un `dblclick` réel le focus est
déjà dessus — `userEvent.keyboard('{Enter}')` atteint la bonne cible **sans
clic préalable**. Les deux styles s'enchaînent donc dans un même geste sans
couture : `mouse(svg, 'dblclick', clientAt(...))` puis `userEvent.fill` /
`keyboard`. Un arbitrage neuf, dans le sens de la règle de `05` et calqué
sur le `getByRole('combobox')` de `08` : **l'input n'a aucun nom accessible**
(ni label, ni placeholder, seulement une classe) mais c'est le **seul champ
texte de l'app**, donc `page.getByRole('textbox')`. Corollaire utile,
l'absence de l'input ne se teste plus par `=== null` mais par
`.elements().length`, la forme locator-native qui ne lève pas.

### Brouillard refermé : le confort en watch est bon, aucun ticket

Dernière occasion de regarder, et le verdict est net. **Rerun mesuré à
325 ms**, contre 1,08 s à froid sur le même fichier — le navigateur reste
debout entre deux passes et se réutilise, exactement comme entre deux
fichiers d'un même run. Un piège d'outillage à connaître pour la suite :
**Vitest retombe en mode `run` quand `stdout` n'est pas un TTY**, donc
`npx vitest` depuis un shell d'agent ne watch rien ; il faut `--watch`
explicite. Le patch « perf et DX » de la carte est refermé pour de bon,
dans le même sens que `04`.

### État

`STILL_JSDOM` tombe de 5 à **0** — la liste est vide, le signal que `11`
attend, et sa suppression (avec ses deux références) lui revient. 36
fichiers / **405 tests verts**, **~3,9 s** (contre ~4,9 s après `09`),
trois runs stables. Typecheck, lint et format propres. `CLAUDE.md` mis à
jour : `mouse` rejoint la liste des helpers sanctionnés. Rien n'est commité.
