# 04 — What do opening placement dimensions measure?

Type: grilling
Status: resolved
Blocked by: 02

## Question

Placement dimensions currently measure along the Face on the side they sit
on, so an opening dimensioned from outside a room reads differently than from
inside. Decide their semantics:

- User's idea to study: always measure on the interior side of a room.
- What when the wall belongs to no room (dangling wall) or separates two
  rooms — which side is "interior"?
- Which reference at a wall end: the Face corner (miter) or the Point?
- Do the flanking values ignore neighbouring openings (as today) or chain
  from them?

Framing from ticket [03](03-dimension-display-prototype.md)'s resolution: a
wall Dimension now measures the rendered silhouette on the side it sits on
(mitered face corners at junction ends, half-thickness overhang at free
ends). The natural default is that placement dimensions use the same per-side
span for their outer bounds — this ticket decides whether that stands or
whether they are forced to the interior side of a room.

## Answer

Resolved 2026-07-19, grilling session.

1. **Side**: placement dimensions sit on the **interior side** whenever the
   wall borders exactly one detected room, regardless of where the wall's
   Dimension sits; they fall back to the wall's Dimension side when the wall
   borders no room (dangling wall) or two rooms (party wall).
2. **Outer bounds**: the silhouette span of the chosen side, per ticket
   [03](03-dimension-display-prototype.md)'s rule — mitered face corner at a
   junction end, half-thickness body overhang at a free end.
3. **Neighbouring openings**: each flanking dimension **chains from the near
   edge of the closest neighbouring opening** when one lies between the
   manipulated opening and the wall end; otherwise from the silhouette end.
   Values are always tape-measurable (the gap between openings, or opening
   to wall face) — the NF chain-dimension convention.
4. **Unchanged**: they replace the wall's Dimension on the chosen side's
   line for the duration of the gesture; a segment that rounds to zero shows
   nothing; pure editor feedback, never exported.
