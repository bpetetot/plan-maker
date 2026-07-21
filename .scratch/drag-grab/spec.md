# Drag keeps the grab point under the cursor

Status: resolved

Dragging a door or window grabbed off-center recentered the element on the
cursor, causing a visible jump at the first pointer move. The same flaw
existed for room labels and dimension texts.

## Agreed behavior (grilling recap, 2026-07-21)

The rule: dragging an extended element keeps the grab point under the cursor
for the whole gesture.

1. **Mechanism** — at pointer-down, record the delta between the element's
   rendered position and the cursor; on move, place the element at
   cursor + delta. The delta is **absolute** for the whole drag: after the
   element hits a clamp (e.g. wall end), the cursor coming back re-sticks the
   element to cursor + delta exactly — no ratchet.
2. **Click threshold** — the opening drag aligns with the other drags'
   grammar: `moveOpening` only applies once the CLICK_PX threshold is
   crossed (`d.moved`). A click never modifies the plan.
3. **Scope** — the three extended elements: **Opening** (scalar delta along
   the wall axis), **Room label** (2D vector delta, `clampToRoom` unchanged),
   **Dimension text** (scalar delta along the Rail; the interior/exterior
   side is still decided by the actual cursor position, not the offset
   point).
4. **Exclusions** — a **Point** drag stays Snap-driven (cursor = target);
   a **group** drag already applies a delta — unchanged.
5. **Documentation** — CONTEXT.md's "Grab zone" entry states the rule; no
   ADR (reversible, unsurprising).

Tests: off-center grab → no jump; return from a clamp → no ratchet;
sub-threshold wiggle → plan intact.
