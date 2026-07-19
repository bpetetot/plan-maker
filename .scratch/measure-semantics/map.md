# Wayfinder map: Measure semantics with wall thickness

Label: wayfinder:map

## Destination

A decided measurement semantics for walls that have thickness — how walls are
anchored when drawn, what a wall Dimension shows (and its stability while
chaining walls), and what opening placement dimensions measure — recorded as
amended CONTEXT.md language and an amended spec, ready to implement.
Implementation happens outside this map.

## Notes

- Domain docs: `CONTEXT.md` at the repo root (ubiquitous language), ADRs in
  `docs/adr/`. Key entries at stake: Wall, Face, Dimension, Placement
  dimension, Snap.
- Current behavior: a Dimension measures along the Face on the side it sits on
  (`src/model/faces.ts`, `src/editor/render.tsx`), so the two sides of a wall
  show different values, and values jump as junctions form while chaining.
- Skills: grilling tickets use `/grilling` + `/domain-modeling` (one question
  at a time, with a recommendation); prototype tickets use `/prototype`;
  research tickets use `/research`.
- Project motto: simplicity beats precision (audience: private individuals).
- Not in production: the stored plan model can change freely, no schema
  migrations required (recorded in CLAUDE.md).

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [01 — How do architecture tools handle wall reference lines and dimensioning?](issues/01-research-architect-conventions.md) — pro tools anchor and measure on a junction-invariant reference line (faces are derived cleanup geometry); consumer tools use a fixed centerline but expose room-meaningful inside/outside values; opening dims split center (US frame) vs edges (masonry, DIN/NF) — findings in `research/architect-wall-conventions.md`.
- [02 — What is a wall's drawing and storage anchor?](issues/02-wall-anchor-model.md) — the centered axis stays the only anchor and the only snap reference; the axis length is the junction-invariant canonical measure, and room-side values are a display/entry concern for tickets 03/04.
- [03 — How should wall dimensions be displayed?](issues/03-dimension-display-prototype.md) — body mitered at junctions with half-thickness overhangs at free ends and junction patches at crossings; drawing is hors-tout (label/step = axis + thickness); a dimension measures exactly the rendered silhouette on its side, with extent tick marks (4×4 m drawn room: 4.00 outside, 3.80 inside); export follows; prototype on branch `prototype/dim-display-variants`.
- [04 — What do opening placement dimensions measure?](issues/04-opening-placement-dims.md) — always on the interior side when the wall borders exactly one room (fallback: the wall Dimension's side); outer bounds follow ticket 03's silhouette rule; each side chains from the nearest neighbouring opening's edge when one intervenes; still gesture-only feedback, never exported.
- [05 — Write the amended spec and CONTEXT.md](issues/05-write-spec-and-context.md) — CONTEXT.md entries (Wall, Face, Dimension, Placement dimension) and spec §2/§4 amended; no ADR needed (stored model unchanged). **The map is complete: no open tickets, no fog — the way is clear for implementation.**

## Not yet specified

## Out of scope

- Implementing the decided semantics — a follow-up effort once this map's spec
  amendment is written.
