# A preference is an entry in a table

CONTEXT.md defines **one** Preference — the per-device choices about how the
editor looks or behaves. The code had four implementations of it. `snapPref.ts`
and `measurePref.ts` were four lines each, a key and a sentinel; the Grid's key
sat at the bottom of the module that *draws* the grid; the Theme had its own
load/save pair and did not use the shared helper at all. Adding a fifth
preference meant choosing which of the four shapes to copy.

The four now live in one table, in `src/preferences/preferences.ts`:

```
usePreferences                     // the zustand hook — React readers
getPreference(name)                // the value, for a non-React reader
setPreference(name, value)         // no-op when unchanged, then persists
togglePreference(name)             // the boolean entries only
reloadPreferences()                // re-read storage, as a fresh load does
```

The names carry `Preference` rather than being bare `get`/`set`/`toggle`: the
call sites already say which preference in the argument, but a bare `set` sits
in `Editor` among `setPlan`, `setSel` and `setTool` and reads as a React setter,
and three toggle tests already bind `toggle` to their own button locator.

Adding a preference is three lines in one file — its field in `Preferences`, its
entry in `TABLE`, its read in `loadAll` — rather than a module and a pair of
exports. The third is deliberate rather than derived: walking the table would
lose the per-key type and need a cast, where the list makes a forgotten
preference a compile error. The storage discipline
CONTEXT.md states — *a preference left at its default stores nothing*, and
*unavailable storage degrades silently* — is written once for four entries
instead of twice for two families.

## The session holds the value, for all four

ADR 0008 drew this conclusion for the Measure alone, because it was the only
preference with two readers (the screen and the export) and a read-back would
have printed measures the screen hides. The other three kept the value wherever
was convenient: Grid and Measure in a zustand store, Snap in a `useState` inside
`Editor`, the Theme in a `useState` inside a hook owned by `App`.

That split had a visible cost. Snap being component state, no non-React caller
could ask "is snap on?" — the asymmetry `measuresVisible()` had been added by
hand to fill on the Measure's side. And the Theme's `useState` could not be read
twice without becoming two states on one key, which is why `App` owned it and
passed it down to `AppMenu` in two props.

Both are gone: the store is the session, `get` is the door for a non-React
reader, and `AppMenu` reads the theme where it uses it.

## The `index.html` mirror stays, and is named

The anti-flash script in `index.html` duplicates the theme key, the resolution
rule and the two bar colors. It must run before the module bundle loads, or the
flash it exists to prevent comes back — so it can import nothing, and this
refactor does not reach it. Generating it from the table through a Vite
`transformIndexHtml` was considered and rejected: build machinery, a script to
emit dependency-free, and an `index.html` that no longer says what it serves —
for twelve lines and one key. The two "keep in sync" comments now point at the
two real mirrors instead: the key in `preferences.ts`, the colors in `theme.ts`.

## Consequences

- **This amends ADR 0008's last consequence**, which records the three boolean
  preferences sharing a `booleanPreference` helper. That helper is gone; what it
  held is `boolEntry`, a table entry rather than a pair of exported functions.
  Everything else ADR 0008 decides is unchanged, the Theme included — it now
  shares the discipline it had only been compared to.
- `reloadPreferences()` becomes the single test door, and covers Snap and the
  Theme for the first time. `testSetup.browser.ts` already called it after every
  test; the same line now re-seeds four values instead of two.
- `grid.tsx` is rendering again, and `theme/` keeps only what the Theme *is*:
  `resolveTheme`, `toggledTheme`, `applyResolvedTheme`, the bar colors, and
  `useThemeEffect` — a hook that returns nothing and only applies. `toggleTheme`
  left React with the value, and is testable beside its pure neighbours.
- The Alt inversion (`isFree`, ADR 0007) stayed in `Editor`. It reads the
  preference but is not one: Alt inverts a state for the length of a gesture and
  is never stored.
- Snap becoming readable outside React is **not** a need any caller has today —
  the PNG export reads only the Measure. It is a consequence of the one-table
  shape, recorded here so nobody hunts for the caller that justified it.
