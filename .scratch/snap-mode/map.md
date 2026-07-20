# Map: global snap / free toggle

Labels: wayfinder:map
Status: complete — implemented, see [ADR 0007](../../docs/adr/0007-snap-is-a-state-alt-inverts-it.md)

## Destination

Snap stops being a permanent behavior that Alt escapes and becomes a state with
two values, persisted per device, with Alt inverting it in both directions.

## Notes

- Domain code: `src/model/snap.ts` (unchanged — the `free` flag already carried
  the semantics), `src/editor/Editor.tsx` (four call sites), new
  `src/editor/snapPref.ts` for the preference.
- Prior art: ADR 0004 (group moves realign to the grid), ADR 0006 (axis snapping
  targets absolute grid crossings), `.scratch/grid-snap/issues/02-keep-alt-free-mode.md`
  and `13-alt-keeps-connection-targets.md`.
- Standing preference: grill one question at a time, each with a recommended
  answer; act only after a confirmed recap.

## Decisions so far

- [01 — Snap is a state, Alt inverts it](issues/01-snap-as-a-state.md) — a
  per-device on/off preference with a magnet toggle and the `S` shortcut; Alt
  flips whichever state is current, so the escape hatch works both ways. The
  meaning of "free" is unchanged, so `snapPoint` gains no branch.
