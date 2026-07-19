# 06 — Wall measure rows

Status: resolved
Blocked by: 05

Implements [spec](../spec.md) §2 "Wall" — the display-only measure rows in
the selection panel's `Dimensions` section.

## Scope

- Nominal case (`interiorSide` returns a side): `Interior` (interior side's
  silhouette reading via `faceLength`), `Exterior` (exterior side's reading,
  the hors-tout), `Thickness`.
- Hard cases (`interiorSide` null — standalone, party, jutting): single
  `Length` row (hors-tout) + `Thickness`; replaces 05's temporary row.
- Values always computed from `faceLength` + `interiorSide`, never stored —
  the panel must match the canvas Dimensions on every side.
- Unit tests covering the nominal case and the three hard cases (standalone
  wall, party wall between two rooms, wall jutting into its own room), plus
  live updates while a wall point moves.

## Comments

Implemented as `wallMeasures` in `src/model/rooms.ts`. One deviation from the
letter of the scope: the hard-case `Length` is the union of the two faces'
`faceSpan`s rather than a single `faceLength` — a lone face cannot express the
hors-tout when the two faces end at different abscissas (the jutting-wall case
pins this). Same silhouette machinery, same derive-on-render guarantee.
