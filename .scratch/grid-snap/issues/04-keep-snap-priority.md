# 04 — Snap priority unchanged

Type: grilling
Status: resolved

## Question

Current priority is existing point > wall body > 45° axis > grid. Point and
wall snapping can target off-grid positions (a junction projected onto a wall,
an Alt-placed point). Should the grid take precedence, per a literal reading
of "always snap to grid intersections"?

## Answer

Keep the current priority. Connecting geometry comes first: snapping onto an
existing point or a wall junction keeps the plan topologically clean even when
the target is off-grid. The grid remains the fallback — it is what guarantees
alignment when nothing else attracts.

Rejected alternative: grid-first (points/walls only attract when themselves
on-grid) — would make connecting two walls with an off-grid junction nearly
impossible.

## Comments

Decided in the charting grilling session (2026-07-20).
