# The registry covers the application, not the editor

ADR 0009 made the shortcuts a registry; ADR 0011 made the help dialog render
from it. Both described an *editor* registry, mounted inside `Editor`. Giving
the burger menu's actions keys — Open, Save as, Export, Reset, Theme — broke
that boundary: those actions have no editor to be mounted in.

The registry now covers the whole application and its hook is mounted in `App`,
the only node that sees both the menu and the editor. `useEditorHotkeys` is
`useAppHotkeys`. The invariant 0011 bought is unchanged and is exactly why this
was not solved with a second registry beside the first: **a shortcut cannot
exist undocumented**, and two registries would be two catalogues the help would
have to be taught to merge — a second place for a key to hide.

A fourth help section, `File`, joins Tools, Editor and View.

## Reaching the editor from above

Mounting the registry in `App` means the callbacks live where the editor's state
does not. The state was not lifted. It splits in two by nature, and the split is
the decision worth recording:

- **Preferences** — Grid and Measures — moved into a store (`preferences.ts`),
  as `helpStore.ts` did before them for the same reason: two triggers in
  different branches of the tree, neither a child of the other. `CONTEXT.md`
  already called these "per-device preferences, never part of the plan"; the
  store is that sentence in code. Snap stays out — it is not about what is
  displayed but about how a drawn point lands, and Alt inverts it per gesture.
- **View commands** — zoom in, zoom out, fit, 100% — stayed in `Editor`, reached
  through `useImperativeHandle` (`EditorCommands`). They read a camera measured
  against the `<svg>` element itself. Lifting that to `App` would have moved
  `useView`, the ref it measures and the pan/resize machinery with it, so that a
  keystroke could reach a number.

The editor's own pre-existing shortcuts — Escape's cascade, delete selection,
tool switching, snap — travel the same handle, for the same reason: they read
the wall chain mid-draw and the current selection, which have no business in
`App`. A ref is read at the moment the key is pressed, so no callback can go
stale and the handle needs no dependency list.

`editorCommands(ref)` is exported and used by both `App` and the test harness,
so the two ways of binding an editor to the registry cannot drift.

## What this revises in 0011

ADR 0011 justified leaving Grid, Measures, Fit and the file actions out of the
help dialog: "they are buttons on screen, already discoverable." That reasoning
held only while they had no keys. A key that exists and is not listed is the
exact failure 0011's non-empty `sections` type was built to make impossible, so
the criterion is now simply: **if it is registered, it is documented**. The
button is not a substitute for the entry; it is a second way in.

0011 also declined to lift the help state into `App` partly because it "would
have meant new required props on `Editor`, which every test rendering
`<Editor />` would have had to feed." Moving the registry up incurs that cost
anyway — a bare `<Editor />` no longer answers a keystroke. The answer is
`testHarness.tsx`: `EditorWithHotkeys`, the smallest thing that is both an
editor and a place shortcuts are bound. It shares `editorCommands` with `App`
rather than restating it.

## Consequences

- **`Mod+Backspace` for Reset sits one modifier from `Backspace` for delete
  selection.** This is the sharpest edge added. It is what the platform means by
  the key, so it was kept, with two mitigations: the confirmation now names what
  is lost rather than saying "it will be lost", and the shortcut is disabled on
  an empty plan, mirroring its menu item — a confirmation raised over a no-op
  teaches the user to dismiss confirmations unread. Neither mitigation removes
  the risk on a non-empty plan; the dialog is the only thing standing there.
  Reset deliberately gets **no `Mod+Delete` alias**: `Backspace` is an alias of
  delete-selection, but `Delete` is its *primary* key, so a second binding would
  double the slip it is already one modifier away from — and buy a second way to
  reach an action nobody needs two ways to reach.
- **Nothing is live before the app is ready.** The hook is mounted above the
  early return that renders nothing while the stored plan loads, so the file
  shortcuts would otherwise answer over an empty screen — `Mod+O` importing a
  plan that the pending restore then overwrites. The `enabled` predicate carries
  this alongside the help mute and the empty-plan reset guard.
- **Fit is `Shift+1`, not `Mod+0`.** `Mod+0` means "100%" in every application
  that has it, and fitting a plan lands on whatever ratio the plan needs. Both
  exist: `Shift+1` fits, `Mod+0` goes to 100%. The second needed no new view
  primitive — `zoomCenter` divides the scale by its factor and `zoomRatio` is
  the current scale over the 100% reference, so the ratio *is* the factor.
- **Zoom is registered on `=`, not `+`.** `+` is Shift+`=` on the layouts that
  have it, and the match is strict on Shift, so `Mod+Shift+=` rides along as a
  never-displayed alias and `display` says `+`. This widens 0011's `display`
  rule from "the key is a character Shift produces" to "the key typed is not the
  key registered" — the advertised key is still the working key, which is the
  part that matters.
- **`Shift+1` works on both keyboard layouts, and that is the library's doing.**
  On QWERTY the keystroke arrives as `!` and only `code: 'Digit1'` identifies it;
  on AZERTY it arrives as `1`, because there the digit needs Shift to be typed at
  all. `@tanstack/hotkeys` falls back to `code` for letters, digits and mapped
  punctuation, which covers both. Two tests dispatch the two forms deliberately.
- **The theme shortcut toggles light ⇄ dark rather than cycling all three
  preference values.** The preference has three values but only two appearances:
  cycling would spend one press in three changing nothing visible (`dark` →
  `system` on a dark system), and a shortcut that appears not to respond is worse
  than none. `System` remains a menu-only choice, which suits a set-once value.
  The preference consequently moved from `AppMenu` up to `App` — the keyboard and
  the three buttons set one value, and two `useThemePreference` calls would have
  been two states writing one storage key.
- **The menu shows its shortcuts as annotations, not as key badges.** The help
  dialog is a catalogue of keys, where the badge is the subject; in a menu the
  key is a footnote to an action. They are `aria-hidden`, so the items keep
  "Open" and "Reset" as their accessible names — the hints are glyphs, and a
  screen reader has no good reading for `⌘ ⇧ E`. The help dialog carries the same
  information in a form built to be read.
- **`measurePref.ts` is storage only now.** The session value ADR 0008 requires —
  so the export never prints measures the screen is hiding — moved to the
  preferences store, which is where the reason is written down. Because the store
  is a module singleton read from storage once per load, tests that need a
  session boundary call `reloadPreferences()`.
