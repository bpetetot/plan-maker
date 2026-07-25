# A Rail yields a position, not bounds

CONTEXT.md defines the **Rail** — an invisible bounded travel line — and says
two things have one: a Dimension's text and an Opening. Both were bounded, and
both were bounded *twice*, by different code, in different layers. Where the
two bindings disagreed, the plate a gesture took hold of was not the plate the
sheet had drawn, and it jumped on the first pixel of the drag.

A Rail now answers one question — **where does this wish actually sit** — in
`src/model/rail.ts`:

```
dimSide(plan, wall)                                  // the side its rail runs along
railedDimT(plan, wall, side, t, fontPx?)             // binds the drawing
openingRail(plan, wall, reference, exclude?)         // bounds, which the chips measure
railedOpeningOffset(plan, wall, offset, width, o?)   // binds the plan, or refuses
```

The sheet draws that position, the drag grabs it, the write stores it.
`setDimPlacement` lost its `travel` parameter and is a plain setter again: the
only caller hands it a railed ratio.

## The defect this closes

`DimLabel` drew the plate at `clamp(bounds(fontPx), t)`. `onDimPointerDown`
computed its grab delta from the raw stored `t`. The two agree right after a
drag — the write clamped at the same font — and diverge as soon as the wall's
geometry moves under a placement nobody has touched since: a shortened wall, a
new junction remitering the face. The label was then drawn on its Rail and
grabbed off it, and the difference appeared as a jump.

The Opening had the same defect in the same shape: the glyph and its placement
chips are drawn at `openingPlacement().offset`, clamped for display, while the
grab read the stored `offset`. Both grabs now read what is drawn.

## The Rail still binds twice — deliberately

ADR 0024 decided that the Rail binds at every drawing, not only at the gesture:
the export's measure font is 10 px against the editor's 8, so the same stored
wish rails to two different places. That is not a duplication to remove, and
"nobody re-clamps" was never available. What this ADR removes is the second
*implementation* — the rule is written once and called wherever a position is
read.

## The two Rails share a word, not a law

They are deliberately asymmetric, and the module says so:

- A Dimension's Rail **binds the drawing**. The stored placement is a wish; the
  Rail is the law at whatever size it is drawn at.
- An Opening's Rail **binds the plan**. Every placement, move and widening lands
  on it, and a wall whose Rail is shorter than the opening refuses it outright —
  which is why `railedOpeningOffset` returns `null` where `railedDimT` cannot
  fail. Its display clamp, `openingPlacement`, is weaker on purpose: face bounds
  only, never neighbours, since each would otherwise bound the other.

## Consequences

- **The plate's box is model knowledge.** A Rail is defined by what must stay
  clear of the arrowheads, so its width is part of the Rail, not of the drawing.
  `plateBox` and `ARROW_LEN` live in `rail.ts`, and `sheet/measures.tsx` draws
  the box the model defines. One font-derived constant crosses into the domain;
  the alternative was the same number written twice.
- **`arrowsFitInside` is one rule where there were two.** `ExtentLine` and the
  Rail asked the same question — do the heads fit inside the extent — in two
  identical expressions, magic `8` included.
- `labelAngle` moved to `model/geometry.ts`: `dimSide` needs the ISO flip and
  `rail.ts` cannot import `sheet/`. It is an angle rule over a vector, with no
  plan in it, and its test is a node test now.
- `planDrag.ts` no longer imports a `.tsx` module. `chrome.tsx` still imports
  `DimText` and `dimLineFrame` from `sheet/` and should: it draws.
- `railedDimT` defaults to the editor's font, so the drag is bound to the size
  the editor draws at. The export never drags.
- The stored ratio's `[0, 1]` schema invariant now rests on the Rail, which
  clamps there, rather than on a guard inside the setter.
