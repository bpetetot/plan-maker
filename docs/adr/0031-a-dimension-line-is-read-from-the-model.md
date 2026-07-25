# A Dimension line is read from the model, not assembled at the render

A **Dimension** is a Measure — a number the plan states about itself — but the
number only existed inside a React component. `sheet/measures.tsx` computed the
silhouette's width, chose the plate's box, decided where along the wall the
plate sat and whether the arrowheads pointed inward, then drew all four. The
model already held the same value under another name (`faceLength`, read by the
Tool panel) and the same rules under `railedDimT`; the drawing simply did not
call them. Around it, the wall's own axis — origin, unit direction, length, ISO
angle — was rebuilt in six modules with four different ideas of a wall too
short to have one, and `editor/chrome.tsx` reached into `sheet/measures.tsx` to
borrow it.

The figure is now a value the model reads:

```
wallDimension(plan, wall, fontPx)  →  DimensionLine | null
rulerDimension(ruler, fontPx)      →  DimensionLine | null
```

A **DimensionLine** (CONTEXT.md) carries the frame it runs on, the measured
extent, the value and its label, the railed position of the plate, the plate's
box, and whether the heads sit inside. `measures.tsx` places what it is given
and decides nothing. A wall Dimension and a Ruler are one drawing again,
because they were always one figure — which is what gives the Ruler a Rail it
never had.

## What this does not fix

The architecture review that proposed this candidate led with a defect: the
sheet re-deciding `arrowsFitInside` from the plate's *clipped* width while the
Rail decided it from the full width, so a plate could sit on an arrowhead. That
divergence is **unreachable for a wall**. `railedDimT` bounds the plate to
`[max(0, from + margin), min(L, to − margin)]`, and both cases where the `[0,1]`
clamp bites require `margin < thickness/2`, hence `halfW < thickness/2`, hence a
plate still inside the extent — so the clipped width always equalled the full
one. A span too narrow to hold the plate pins it to the middle and both
computations answer `false`.

It was reachable for a **Ruler**, and only because a Ruler had no Rail at all.
The motive for this ADR is therefore depth, not a bug: one address for a rule
that was written at two, plus the three real defects listed below.

## Considered Options

- **Two types, one per family** — rejected: `DimLabel` and `RulerLabel` were
  already the same forty lines twice, differing in the offset (a Face's, or
  none) and the extent (a silhouette, or the whole segment). Two types would
  have preserved the duplication this exists to remove, to honour a glossary
  distinction that is about *what a thing is*, not *how it is drawn*.
- **Naming the shared value `Dimension`** — rejected: `CONTEXT.md` reserves
  Dimension for the Measure and lists it among the Ruler's _Avoid_ terms,
  a Ruler being stored rather than computed. `DimensionLine` is the ISO name
  for the figure, and the vocabulary already used it (`dimLineFrame`,
  `dimLineOffset`, `--dim-line`).
- **Moving the plate's grab zone out to `chrome.tsx`** — rejected. ADR 0024
  decided the plate answers the pointer *in the sheet*, and that is exactly
  what justifies the `chrome` slot sitting between the texts and the measures:
  a plate must win the hit-test against the wall grab zone it overlaps. Lifting
  the zone out would leave that slot with a comment describing a rule nothing
  needed any more. `sheet/texts.tsx` already carries its own grab zone the same
  way.
- **`wallDimension(plan, wall, side, fontPx)`, as the review wrote it** —
  rejected: the drawn side is the plan's, so four callers would each have to
  remember to call `dimSide` and agree. The reading derives it. The drag keeps
  calling `railedDimT` directly, because there the side comes from the pointer,
  not from the plan.
- **Splitting `rail.ts` along its own documented asymmetry** (the Dimension's
  Rail binds the drawing, the Opening's binds the plan) — deferred. It is the
  honest seam, but it moves `openingRail` through `chrome.tsx`, `placement.ts`
  and `planDrag.ts` for reasons foreign to this change.
- **Unifying the three font-advance constants** (`rail.ts` 0.6 em,
  `texts.tsx` 0.55 em, `chrome.tsx` 5.4 px) — rejected on inspection. They
  measure three different typefaces. There is no shared truth to extract, only
  a shared multiplication.

## Consequences

- **Three visible changes, all corrections.** The plate's grab zone follows the
  plate plus a constant on-screen margin, where it was a hardcoded 60×16 in
  plan units — at high zoom it stole clicks tens of centimetres away, and it is
  now the same recipe as every other grab zone (ADR 0005). A Ruler's stored `t`
  rails at every drawing, so an imported extreme no longer plates its own
  arrowhead. And a short Dimension is a slightly finer target than it was.
- **`fontPx` is a parameter, not a convention.** No default survives:
  `PlanScene.dimFontPx` is required, the editor passes `DIM_FONT_PX`, and the
  export names its own `EXPORT_DIM_FONT_PX` where a bare `10` used to sit in
  the JSX. "The export must remember" is no longer a thing anyone can forget.
- **`wallAxis` in `model/geometry.ts` refuses only what has no direction.** The
  semantic thresholds stayed with the callers that mean something by them: `1`
  to project or place, `20` to state a Dimension. `faces`, `openings`, `snap`,
  `rail` and `chrome` all read the one frame.
- The `chrome.tsx → sheet/measures.tsx` import narrows but does not disappear,
  and should not: `DimText` is drawing, borrowed by the rubber-band wall, which
  ADR 0027 already ruled legitimate. Only the geometry half left.
- `RulerLabel.onPointerDown` and its grab rect are deleted: no adapter ever
  passed them. A Ruler is grabbed by the chrome's zone on its segment.
- The rule "10 cm past the Face" moved into the model, necessarily — the
  reading hands out an origin already offset.
- The reading is assertable in node (`dimension.test.ts`: value, side, the Rail
  at both font sizes, the head flip, both refusals, the Ruler's Rail). The
  browser suites and `png.test.ts` stay untouched as the iso-behaviour net —
  `png.test.ts` asserts the export's *wiring*, which no node test replaces —
  plus three browser tests for the new grab-zone recipe. 778 → 796.
