# 02 — Alt free mode stays as-is

Type: grilling
Status: resolved

## Question

Alt (free mode) rounds to whole centimetres and thus creates off-grid points —
it is what triggers the original complaint. Does it survive the rework?

## Answer

Kept unchanged. Alt remains the deliberate escape hatch for cm-precision input
(real measurements of an existing home). The original problem is fixed by
realignment ([01](01-realign-reference-point.md)): as soon as the element is
moved again without Alt, everything returns to the grid.

Rejected alternatives: removing free mode (loses real-world non-multiple
measurements); making Alt placement "sticky off-grid" so later moves preserve
the offset (contradicts the realignment decision for those points).

## Comments

Decided in the charting grilling session (2026-07-20).

Partly overturned by [13](13-alt-keeps-connection-targets.md) (2026-07-20): Alt
survives as the cm-precision escape hatch, as decided here, but it no longer
suspends the *whole* ladder — the connection rungs (existing Point, wall body)
stay live so a freely drawn wall can still join the plan's topology. Only the
alignment rungs (45° axes, grid) are suspended.
