# 06 — `setPointerCapture` survit-il au dispatch manuel ?

Type: prototype
Status: resolved
Blocked by: 02

## Question

C'est la question de faisabilité de toute la carte, remontée par `01`.

Le ticket `01` a établi que le dispatch manuel de `PointerEvent` est le **seul**
chemin possible pour les 144 appels pointer de la suite. Mais la spec W3C dit
que `setPointerCapture` lève `NotFoundError` quand le `pointerId` ne correspond
à aucun pointeur actif — et un événement synthétique n'en crée aucun.
`src/editor/Editor.tsx` appelle `setPointerCapture` à quatre endroits sans
garde (L285, L290, L339, L779). Aujourd'hui rien ne casse parce que
`testHelpers.ts` le remplace par un no-op ; en vrai navigateur ce filet
disparaît, et c'est précisément le fichier qu'on veut supprimer.

Le constat de `01` est **déduit de la spec, pas observé**. Il faut le vérifier
avant d'engager quoi que ce soit.

- **Confirmer ou infirmer**, sur le navigateur retenu en `02` : un
  `dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, ... }))` suivi
  d'un `setPointerCapture(1)` lève-t-il vraiment ? Tester avec et sans
  `isPrimary`, avec différents `pointerId`, et vérifier si le comportement
  diffère entre navigateurs si plusieurs sont envisagés.
- **Si ça lève** — quelle sortie ? Les pistes ouvertes par `01`, à évaluer sur
  leur coût réel et leur effet sur le reste :
  - garder les appels mais les envelopper d'un `try/catch` dans `Editor.tsx` —
    du code de production modifié pour les tests, à peser ;
  - piloter la souris par CDP (`cdp()`, chromium + playwright uniquement) ou
    par un `BrowserCommand` maison exposant `page.mouse` — des vrais
    événements, donc un vrai pointeur actif, mais une dépendance forte au
    provider ;
  - conserver un shim minimal pour `setPointerCapture` seul — la destination
    dit que `testHelpers.ts` disparaît, pas qu'aucun `setupFiles` n'existe ;
  - attendre la PR `pointer` amont — ce qui reporte l'effort en v5.
- **Si ça ne lève pas** — le noter et vérifier que la capture se comporte bien
  ensuite : après capture, la cible des `pointermove` change, ce que jsdom ne
  simulait pas. Les assertions de drag peuvent bouger pour cette seule raison.

## Réponse attendue

Un verdict observé (pas déduit), et si nécessaire le chemin de contournement
retenu. Tant que ce ticket n'est pas résolu, le coût réel de la migration est
inconnu et `04` ne peut pas être jugé représentatif.

## Answer

**Ça ne lève pas — à une condition, et elle n'est pas celle qu'on cherchait.**
Le risque remonté par `01` est réel mais mal ciblé : ce n'est pas le caractère
synthétique de l'événement qui décide, c'est le **`pointerId`**. Aucun
contournement n'est nécessaire : ni `try/catch` en production, ni CDP, ni
shim résiduel, ni attente de la v5.

### Le dispositif

`.scratch/vitest-browser/spike.{config.ts,test.tsx}`, 6 tests, Chrome Headless
Shell 149 via le provider de `02` — gardés comme actif de la carte.

```
npx vitest run --config .scratch/vitest-browser/spike.config.ts --reporter=verbose
→ Test Files 1 passed (1) | Tests 6 passed (6) | Duration 841ms
```

Chaque test est une **observation** qui journalise ce que le navigateur a fait,
pas une assertion sur ce que la spec dit qu'il devrait faire.

### Ce qui a été observé

**1. Seul `pointerId: 1` est accepté.** Matrice complète, ids × `isPrimary` :

| `pointerId` | `isPrimary: true` | `isPrimary: false` |
| ----------- | ----------------- | ------------------ |
| `0`         | `NotFoundError`   | `NotFoundError`    |
| **`1`**     | **ok**            | **ok**             |
| `2`         | `NotFoundError`   | `NotFoundError`    |
| `7`         | `NotFoundError`   | `NotFoundError`    |

Message exact : `Failed to execute 'setPointerCapture' on 'Element': No active
pointer with the given id is found.`

**2. `isPrimary` et `pointerType` n'ont aucun effet.** `mouse`, `pen` et
`touch` passent tous les trois avec l'id `1`. Ce n'est donc pas une histoire
de pointeur « primaire » : Chromium réserve l'id `1` à la souris et la
considère **active en permanence**.

**3. Le `pointerdown` préalable ne sert à rien.** Le test le plus révélateur :
`setPointerCapture(1)` sur un élément **sans qu'aucun événement n'ait été
dispatché** renvoie `ok`. Ce n'est pas le dispatch qui crée le pointeur actif —
il l'était déjà. La prémisse de `01` (« un événement synthétique ne crée aucun
pointeur actif ») est **exacte** ; c'est sa conclusion qui ne suit pas, parce
que la souris n'a jamais eu besoin d'être créée.

**4. La capture réussit mais n'engage rien.** Après un `setPointerCapture(1)`
qui renvoie `ok` : `hasPointerCapture(1)` vaut **`false`**, et **aucun**
`gotpointercapture` / `lostpointercapture` n'est émis. `releasePointerCapture(1)`
passe aussi sans lever. L'appel est accepté et **se comporte en no-op** — le
UA n'a pas de vraie entrée pointeur à router.

**5. Donc aucun retargeting.** Un `pointermove` dispatché sur un *autre*
élément après capture n'atteint que cet autre élément (`hits: ['other']`),
jamais le capteur. C'était la branche « si ça ne lève pas, vérifier que les
assertions de drag ne bougent pas » du ticket : **elles ne bougent pas**. La
capture est aussi inerte en browser mode qu'elle l'était sous le no-op de
`testHelpers.ts`, et les tests dispatchent de toute façon les `pointermove`
directement sur le `<svg>`.

**6. Le patron d'`Editor.tsx` passe tel quel.** Un composant React reproduisant
les L285/290/339/779 — `onPointerDown` appelant `ref.current.setPointerCapture(
e.pointerId)` sans garde — sur un `pointerdown` dispatché à la main avec
`pointerId: 1` : `outcomes: ['ok']`, `thrown: null`.

### La conséquence actionnable

Le piège n'est pas là où `01` le plaçait, mais il est bien réel :
**`new PointerEvent(...)` sans `pointerId` explicite vaut `0`** — l'id qui lève.
Et `grep -rn "pointerId" src/ --include=*.test.*` renvoie **0 occurrence** :
aucun des 58 `fireEvent.pointerDown` actuels ne le précise (`fireEvent` le
tolérait, `testHelpers.ts` neutralisant la capture derrière).

> **Tout `pointerdown` dispatché à la main doit porter `pointerId: 1`.**

Portée exacte du besoin, vérifiée sur `Editor.tsx` : `pointerId` n'y apparaît
**que** dans les quatre `setPointerCapture`, jamais dans une comparaison, et
`releasePointerCapture` n'est jamais appelé. Seul le `pointerdown` est donc
concerné — les `pointermove` / `pointerup` peuvent l'omettre. Par cohérence, le
helper de dispatch qu'écrira `04` le posera partout ; c'est à `05` de le
graver.

### Réserve à consigner

Ce verdict tient à un **détail d'implémentation de Chromium** (souris = id `1`,
active en permanence), pas à une garantie de la spec — laquelle donnerait
plutôt raison à `01`. `02` ayant retenu chromium seul, la migration est sûre
telle qu'elle est cadrée ; mais **ajouter Firefox ou WebKit aux `instances`
rouvrirait cette question**, et c'est le seul chemin qui la rouvre. Noté en
hors-scope sur la carte.

### Effet sur la carte

Le risque de faisabilité est **levé** : la migration complète en v4 est
atteignable sans toucher au code de production. Le patch de brouillard « la
destination elle-même, si `06` tourne mal » n'a plus lieu d'être, et `04` peut
être jugé représentatif.
