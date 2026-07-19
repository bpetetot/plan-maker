# 02 — Wall in/out measure semantics in the panel

Type: grilling
Status: resolved

## Question

What exactly does the panel display for a selected wall? The two silhouette
readings (interior tape-measurable span, exterior hors-tout extent) are the
nominal case — but which value goes where for a wall without a single interior
side: a dangling wall, a party wall between two rooms, a wall jutting into its
own room (the same hard cases the placement dimensions had to settle)? And
what are the labels — "in"/"out", "interior"/"exterior", something else?

## Answer

Grilled with the human (2026-07-19), confirmed recap:

- **Nominal case** — the wall borders exactly one room (`interiorSide` in
  `src/model/rooms.ts` returns a side): three display-only rows.
  - **Interior** — the interior side's silhouette reading (tape-measurable
    span between mitered Face corners), the same value as that side's canvas
    Dimension.
  - **Exterior** — the exterior side's reading, i.e. the hors-tout extent.
  - **Thickness** — the wall's thickness.
- **Hard cases** — `interiorSide` returns null (standalone wall, party wall
  between two rooms, wall jutting into its own room): the panel does not
  claim an orientation.
  - **Length** — the hors-tout extent, the only length shown; the per-side
    detail stays readable on the canvas Dimensions.
  - **Thickness** — unchanged.
- **No "Overall" row** — redundant: the Exterior reading (nominal) and the
  Length fallback are both the hors-tout already.
- Labels: `Interior` / `Exterior` / `Length` / `Thickness` — aligned with
  the CONTEXT.md Dimension vocabulary (interior span, exterior hors-tout).
- Single source of truth with the canvas: values computed from
  `faceLength` (`src/model/faces.ts`) + `interiorSide`, never stored.

Rejected: two neutral rows in the hard cases (no way to tell which canvas
side a row maps to), per-room side labels (depends on often-empty room
names), an axis-length row (a number the canvas shows nowhere).
