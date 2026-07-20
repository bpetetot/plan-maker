# 08 — Write the spec

Type: task
Status: resolved
Blocked by: 05, 06, 07, 09

## Question

Assemble `.scratch/grid-snap/spec.md` from all resolved decisions: the
realignment semantic and its reference-point rule, Alt free mode, the 45°
axis grid-crossing rule and its off-grid-anchor fallback, unchanged snap
priorities (including the fact that the ladder governs point placement, not
group moves — [09](09-realignment-merge-interaction.md)), merge-on-realignment,
and the absence of any drag feedback ([07](07-realignment-feedback.md), which
also revises 09's live-signal rule — the spec must state the silent behavior
once, not both versions). Update the snapping section of the main spec
(`.scratch/plan-maker/spec.md` §Snapping) or record a pointer, and note any
ADR that needs writing (the realignment semantic likely deserves one). This
completes the map's destination.

## Answer

[`spec.md`](spec.md) is written — the map's destination is reached.

Its shape, and the two judgement calls made while assembling it:

- Ten sections: problem, vocabulary, the snap ladder (unchanged), axis snapping
  relative to the anchor, group-move realignment (semantic, reference point,
  grid-only, merge), Alt free mode, the absence of feedback, code impact, the
  ADR to write, and out of scope. Every rule links the ticket that decided it,
  so the spec gists and the tickets hold the full reasoning.
- **The 07/09 contradiction is stated once, in its resolved form.** §7 says the
  rework ships silent, and records 09's live-signal argument as the thing to
  re-read on re-opening rather than as a rule. §5.4 keeps only 09's surviving
  half (unconditional merge). No section presents both versions as live.
- **The on-grid/off-grid axis rules are collapsed into one formulation** (§4),
  per [06](06-offgrid-anchor-axis-fallback.md): stepping is relative to the
  anchor, and [03](03-diagonal-grid-crossings.md)'s grid crossings are its
  on-grid special case — not a rule plus a fallback branch.

Main-spec update: **a pointer, not an edit.** §9 records the two edits
`.scratch/plan-maker/spec.md` §Snapping needs (relative-to-anchor axis stepping;
"grid-stepped" → "realigns to the grid" for wall body drags) and assigns them to
the implementation, since the main spec describes shipped behaviour and none of
this has shipped.

ADR: §9 calls for one alongside 0002 and 0003, carrying §5.1–§5.4 — the
realignment semantic is a model-level rule that interacts with planar insertion
and coincident merge. Writing it belongs to the implementation.

## Comments

Resolved 2026-07-20. Last ticket of the map.
