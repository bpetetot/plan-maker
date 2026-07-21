# The registry documents itself — the help dialog is rendered, not written

ADR 0009 made the shortcuts a registry so a help screen could be rendered *from*
them rather than duplicating them. This is that screen, and it cashes the
promise the hard way: **section membership is a field on the registry entry**,
not a layout held by the dialog. `ShortcutsDialog.tsx` states a layout and knows
no shortcut by name. Adding a key is one line in `useEditorHotkeys.ts`, and it
appears in the help on its own — five more (`G`, `M`, zoom, `F`) are expected,
and the alternative was five chances to forget the second file, each failing
silently.

An entry declares `sections`, a map from section to **the label shown in that
section**. Escape is why it is a map and not a list: someone reading "Tools"
wants to know how to leave a tool, someone reading "Editor" wants the whole
cascade. Two sections carrying identical text would read as a rendering bug, so
the multiplicity has to earn itself by saying something different.

Within a section, **the label is the identity of an action**, and entries
sharing one merge into a single row showing its keys as alternatives — Escape
and right-click both leave a tool, and two rows carrying the same words read as
a rendering fault rather than as a choice. Nothing is declared paired, so a
shortcut that later says what a gesture already says joins it on its own. It
also means a label reused carelessly for two unrelated things silently merges
them, which is the failure this trades for, and it surfaces on screen.

The map is typed **non-empty**. An undocumented shortcut is the one failure mode
that is otherwise silent — nothing breaks, the key simply never appears — and a
test that has to notice it is weaker than a type that refuses to compile it. The
test left over asks the smaller question the type cannot: that the dialog
renders what the registry hands it.

The dialog documents the **interaction vocabulary**, not the keyboard. Anything
without a visible affordance belongs in it, which admits the pointer gestures
ADR 0009 deliberately keeps out of the registry — scroll-to-zoom, Space+drag,
Alt, Shift+click, right-click. They live in a twin `GESTURES` catalogue in the
same file, with the same `sections` field, and render in the same key-cap
column: the reader is after the way to do something, and the key/gesture split
is an artifact of what a hotkey library can register, not a distinction they
have any use for. The criterion also settles what stays out — Grid, Measures,
Fit and the file actions are buttons on screen, already discoverable.

## Consequences

- **`display` re-admits a hand-written hint, under one rule.** Help is `?`,
  registered `{ key: '?', shift: true }` — the match is strict on all four
  modifier flags and no layout produces `?` without Shift, so a bare `'?'` would
  never fire once. But `formatForDisplay` then renders `Shift+?`, naming a key
  nobody owns. `display: '?'` overrides it, and is legitimate **only when the
  key is itself a character Shift produces**, where the Shift is how you type it
  rather than a modifier of it. This does not reopen the hand-written hints 0009
  removed: the advertised key stays the working key — you read `?`, you press
  `?`. Any other use of the field does reopen them.
- **`?` is not in the library's key union**, so it is declared in the object
  form (`RawHotkey`), which types it through a `string & {}` escape hatch. `F1`
  rides along as a never-displayed alias, like `Mod+Y` and `Backspace`.
- **The dialog is a mode, and the mute is code we had to write.** Headless UI's
  Dialog intercepts Escape and nothing else; every other key still reaches the
  document listener, so `2` would switch tools behind the panel that hides the
  result. Rows are therefore disabled while it is open. Escape is the reverse
  trap and was found by test: the hotkey library calls `stopPropagation()` on a
  match, so an enabled `cancel` *beats* the Dialog and the panel stops closing —
  muting the rows is what hands Escape back. `help` alone stays live, so the key
  that opened it closes it.
- **The help state is a store, not App state.** Its two triggers sit in
  different branches — the burger menu opens it, the editor's `?` toggles it and
  must know it is open to mute itself — and neither is a child of the other.
  Lifting it into `App` would have meant new required props on `Editor`, which
  every test rendering `<Editor />` would have had to feed.
- **The one-line contextual hint is untouched**, and still repeats what the
  dialog says. The two serve different moments: the hint is unsolicited and
  catches the user who will never learn a dialog exists; the dialog is
  exhaustive and costs an intention. Trimming the free channel because the paid
  one now exists would be a net loss of discoverability.
- `CONTEXT.md` is unchanged. The help screen introduces no word the rest of the
  model needs — as in 0009, this is about what listens for a key, not what a key
  means.
