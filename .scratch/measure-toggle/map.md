# Map: show / hide all measures

Labels: wayfinder:map
Status: complete — implemented, see [ADR 0008](../../docs/adr/0008-hidden-measures-are-hidden-from-the-export-too.md)

## Destination

Wall dimensions and room areas stop being unconditional and hide together from a
single toggle beside the Grid's — on screen and, crucially, in the PNG export.

## Notes

- Domain code: `src/editor/render.tsx` (`RoomOverlay`, `PlanScene`),
  `src/editor/Editor.tsx` (state, button, conditional `DimLabel`),
  `src/transfer/png.tsx` (explicit export option), `src/App.tsx` (reads the
  preference at export time), new `src/editor/measurePref.ts` and
  `src/editor/preference.ts`.
- Prior art: `.scratch/snap-mode/` — the closest precedent, a one-issue feature
  producing a persisted preference, a toolbar button and an ADR. ADR 0005
  (interaction chrome is pinned to the screen) supplies the *exported* boundary
  this decision reuses.
- Standing preference: grill one question at a time, each with a recommended
  answer; act only after a confirmed recap.

## Decisions so far

- [01 — Measures are a state, and the export follows it](issues/01-measures-as-a-state.md)
  — a per-device show/hide preference covering wall dimensions and room areas,
  reaching the PNG export; membership settled by the rule "a measure is permanent
  and exported", which leaves gesture chrome and room names alone.
