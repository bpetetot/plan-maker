# 01 — Group moves realign a reference point to the grid

Type: grilling
Status: resolved

## Question

Moving a wall or a multi-selection currently snaps the *displacement* to the
10 cm grid (`snapDelta`), so an off-grid element stays offset forever. What
should the new semantic be?

## Answer

Realign instead of delta-step: the group still moves rigidly (internal shape
preserved — the existing `snapDelta` comment's invariant stays), but the delta
is computed so that the **reference point** lands exactly on a grid
intersection. An off-grid element realigns on its first non-Alt move.

Rejected alternatives: forcing every point of the group onto the grid
(distorts 45° diagonals and internal non-multiple geometry); keeping delta
snapping and adding an explicit "realign" command (doesn't fix the default
experience).

Which point is the reference is a separate open ticket
([05](05-reference-point-rule.md)).

## Comments

Decided in the charting grilling session (2026-07-20).
