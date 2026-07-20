# 01 — Snap is a state, Alt inverts it

Type: grilling
Status: resolved

**The question:** Alt was the only way to escape the snap ladder, which made
drawing a whole plan from real measurements a posture (hold Alt for the session)
rather than a gesture. Should snapping become a global mode, and what happens to
Alt if it does?

## Answer

Snap becomes a **state with two values**, on by default, and Alt becomes an
**inversion** of the current state rather than a cause of its own:

```
free = !snapEnabled !== altHeld
```

The escape hatch therefore works in both directions — Alt reaches a Free move
from Snap and a snapped placement from Free — which is what makes the mode safe
to leave on.

Decided, one question at a time:

- **Semantics of Free — unchanged.** Exactly the existing Free move: connection
  targets (Point, wall body) survive, alignment targets (45° axis, grid) are
  suspended. `snapPoint` keeps its single `free` flag and gains no branch.
- **Lifetime — per-device preference**, `localStorage`, never in the plan, never
  exported. Same discipline as the Grid and the Theme.
- **Grid coupling — none, in either direction.** CONTEXT.md already fixed one
  direction; keeping the converse true leaves two orthogonal toggles.
- **Affordance — a `Magnet` button** next to the Grid one in the bottom-left
  floating group, showing the **effective** state (Alt included), so it answers
  "will this snap, right now". A click always toggles the mode, never the
  inversion.
- **Shortcut — `S`**, under the existing `isTypingTarget` guard.
- **Vocabulary — no new term.** The `Snap` entry of CONTEXT.md gains its state
  and `Free move` is redefined without its cause, which keeps its
  `_Avoid_: Free mode` line literally true.

Rejected alternatives are recorded in
[ADR 0007](../../../docs/adr/0007-snap-is-a-state-alt-inverts-it.md): Free
meaning no snap at all, Free keeping the axis lock, storing the mode in the
plan, resetting to Snap on load, and Free hiding or dimming the Grid.

**Consequence to assume:** this amends ADR 0004's promise that off-grid geometry
heals on its first ordinary move. With a persisted mode that move may never
come — a whole plan can now live off-grid, deliberately and durably.

## Comments

Decided and implemented in a grilling session (2026-07-20). Alt moved from a
`useRef` to `useState` in the editor so the toggle can render the effective
state; auto-repeat is absorbed by React's bail-out on an unchanged value.
