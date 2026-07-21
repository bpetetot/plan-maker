# Shortcuts are a registry, held keys are not

The editor's keyboard lived in one `useEffect` in `Editor.tsx`: a `switch` on
`e.key` that re-subscribed on every change to the chain, the selection, and two
callbacks. It worked, but it was a closed box — nothing could ask it what the
shortcuts *were*, so the key hints in the UI spelled them out a second time by
hand, and `Ctrl+Z` was discoverable only to someone who already knew it. It had
also drifted: two typing guards, one testing `SELECT` and one not; `Ctrl+1`
switching tools because the digits never checked their modifiers.

Shortcuts move to **`@tanstack/react-hotkeys`**, declared in one place,
`useEditorHotkeys.ts`. That file is a **registry**, not a relocated handler:
every row carries the `meta.name` it would be listed under, so a help screen or
a command palette can be rendered *from* it rather than duplicating it.

What the library replaces is not effort — it was forty lines — but the
guarantees underneath them. Modifiers now match strictly on all four flags, so
`Ctrl+1` is no longer a tool switch and `Mod+Z` versus `Mod+Shift+Z` is
unambiguous by construction rather than by ordering the `if`s correctly. `Mod`
resolves per platform. The typing guard becomes one declared option instead of
two hand-rolled predicates that disagreed.

Alt joins it as `useKeyHold('Alt')`. ADR 0007's reasoning is unchanged — the
toggle shows the *effective* state, so the key has to re-render — and the
tracker re-renders only on that key's own transitions. It also clears itself
when the window goes away, which 0007 had to arrange by hand.

## What deliberately did not move

Three things stayed behind, and none is an oversight:

- **Space.** `useSpaceHeld` tracks *and* calls `preventDefault`, and the second
  half is load-bearing: Space activates whatever button holds the focus, so
  without it clicking the Snap toggle and then panning would re-toggle Snap on
  every keypress. `useKeyHold` is a tracker — it observes and never intercepts.
  Splitting the hook into a tracker plus a `useHotkey` with an empty callback
  would buy nothing and put a phantom row in the registry. It gains the blur
  guard it was missing, which is the bug Alt already had fixed and Space did not.
- **The modifiers read off pointer events** — `e.shiftKey` on `pointerdown` for
  an additive marquee, `e.altKey` on `pointermove` during a group drag. Read
  from the event these are *more* correct than any tracker: they are right even
  when the key was already down before the window took focus, which no keyboard
  listener can know.
- **The room-name field's own `onKeyDown`.** Enter commits and Escape cancels
  *the edit*. That is a handler on a field, not an application shortcut, and it
  is why the registry must not fire underneath it.

## Considered Options

- **Fix the defects in place, no dependency** — rejected, but it was close: all
  of them were a dozen lines away. What tipped it is that the fixes leave the
  keyboard just as opaque, and every future key hint still has to be written
  twice. The dependency buys introspection, not correctness.
- **Split Escape's cascade into three `useHotkey`s** with `enabled` guards, one
  per branch, each next to its state — rejected: the `else if` chain expresses
  the priority for free, whereas three `enabled` conditions have to restate it
  (`!chain && sel.length`, `!chain && !sel.length`) and a missed clause fires two
  handlers at once. Three registrations on one key also means setting
  `conflictBehavior: 'allow'`, which switches off the warning that would have
  caught exactly that mistake. Colocation pays for independent shortcuts, not
  for branches of a single decision.
- **Keep the library's default `ignoreInputs`** — rejected. The default lets
  Ctrl/Meta combos and Escape through inside fields, which suits apps full of
  forms wanting `Mod+S` alive. Here it is two bugs: `Mod+Z` undoing the *plan*
  under a half-typed room name, and Escape running the cascade on top of the
  field's own cancel. The editor has exactly one field, and while it is open no
  editor shortcut is wanted.
- **Point the library at `window` to match the test helpers** — rejected; the
  helpers were wrong, not the default. See below.

## Consequences

- **`testKit.key()` dispatches at `document.activeElement`, not `window`.** The
  library listens on `document`, and an event dispatched *on* `window` runs only
  `window`'s own listeners — it never travels down. Aligning the library to the
  helper would have frozen a test artifact into production config, so the helper
  moved instead. This is the better test regardless: dispatching at `window`
  skipped the whole bubble path, which is why the typing guard and the Headless
  UI Escape shield had **no coverage at all** — they live below `window` and
  were structurally unreachable. Both are now tested.
- **The held-key tracker is a singleton that outlives the component tree.** A
  test ending mid-hold leaks into the next one, so the browser setup dispatches
  a `blur` after each test — the tracker's own release path rather than a reach
  into its internals.
- **The UI reads the registry instead of restating it.** The registry is keyed
  by *action* (`tool:wall`, `toggleSnap`, `undo`), and `keyHint(action)` returns
  the key in the visitor's own notation — so a Mac reader sees `⌘ Z` where a
  Linux reader sees `Ctrl+Z`, which the hand-written `title="Undo (Ctrl+Z)"`
  could never do. Where an action has a second binding for muscle memory
  (`Mod+Y`, `Backspace`) only the primary is ever displayed: a button shows one
  key. The prose hints that name Space, Shift or Alt stay written out — those
  are deliberately not registry entries, so there is nothing to look up.
- **Strict modifier matching narrows more than the Ctrl/Cmd exclusion it was
  chosen for.** All four flags must match exactly, so `Shift+S` no longer
  toggles Snap (the old code lowercased the key and only excluded Ctrl/Cmd/Alt),
  and `Mod+Shift+Y` no longer redoes. Both were accidents of a loose `if`, not
  affordances anyone asked for, but they were reachable and are now gone.
- **Alt is no longer resynced by unrelated keys.** The old handler set the state
  from `e.altKey` on *every* keydown, so tabbing into the window with Alt already
  down was corrected by the next keystroke. The tracker only knows the keys it
  saw pressed. The affordance is still self-correcting — press and release Alt —
  and the group drag, which reads the event directly, was never affected.
- **This supersedes two implementation notes in ADR 0007's consequences.** Alt
  is no longer "a `useRef` moved to `useState`" but a tracked key, and `S` is no
  longer guarded by "the existing `isTypingTarget`", which is deleted. The
  decision that ADR records — snap is a state, Alt inverts it — is untouched.
- **The library is alpha (0.10.0).** The version is pinned exactly rather than
  caret-ranged, so an `npm update` cannot deliver a silent API break. The blast
  radius is one file plus one `useKeyHold` call.
- `CONTEXT.md` is unchanged: no domain term moved. This is about what listens
  for a key, not what a key means.
