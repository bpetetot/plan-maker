# 05 — Implement the new placement dimensions

Type: task
Status: resolved
Blocked by: 04 (resolved)

## Question

Implement what the spec now states. Implement from the **project's own words**,
not from this map's tickets: `CONTEXT.md` → **Placement dimension**,
`.scratch/plan-maker/spec.md` §4 (openings, and pan/zoom/dimensions), and
[ADR 0005](../../../docs/adr/0005-interaction-chrome-is-pinned-to-the-screen.md).
The tickets hold the rationale if a rule looks arbitrary. Variant A of the
prototype on branch `prototype/placement-dim-register` (`8224bab`) already
renders the chosen register — start from it rather than from scratch.

The work, as far as it can be seen from here:

- Rewrite `PlacementDims` in `src/editor/render.tsx` to the chosen register.
- Add the selection trigger in `src/editor/Editor.tsx`, alongside the existing
  gesture trigger (`placementOpening`).
- Remove the wall-Dimension hiding workaround — the two now coexist.
- Update `src/editor/placementDims.test.tsx` and any test asserting the old
  hiding behavior; add coverage for the selection trigger and the hard cases
  from ticket 03.
- Confirm the PNG export is untouched: placement dims stay absent from
  `PlanScene`.

`npm run typecheck`, `npm test`, and `npm run lint` all green before this
ticket closes.

## Answer

Implemented. The chip register is in production and the hiding workaround is
gone; `npm run typecheck`, `npm test` (353 tests, 31 files), `npm run lint` and
`npm run build` are green.

What changed:

- **`src/editor/render.tsx`** — `PlacementDims` rewritten. It takes a `pxPerCm`
  prop and draws one `<rect fill="var(--accent)">` chip per clearance, rounded
  to a pill, with the value in `.placement-chip` text, wrapped in a single
  `translate(centre) rotate(angle) scale(1/pxPerCm)` group. `ExtentLine`, the
  `off` offset and the `.dim` class are all gone from it: the `at()` helper now
  returns a point on the wall *axis*, with no side term, so the side survives
  only where it picks the value (`interiorSide(rooms, wall) ?? frame.side`
  feeding `faceSpan`). The neighbour-chaining and the round-to-0 cm rule are
  untouched. No shrink branch and no line-drop branch remain — the old
  `withLine` heuristic was the shrink rule in disguise, and the chip overflows
  instead.
- **`src/styles.css`** — new `svg text.placement-chip`: 600 9px, filled
  `--accent-contrast`, and deliberately *without* `.dim`'s `--sheet` stroke
  halo, which existed to mask a rail crossing the text and would only muddy a
  filled chip.
- **`src/editor/Editor.tsx`** — `dimmedOpenings` replaces the single
  `placementOpening` at the render site: a `Map` keyed by opening id holding the
  gesture opening (ghost or moving) plus every `type: 'opening'` ref in `sel`.
  The map is what makes "gesture and selection render identically" literal —
  a drag that ends on a selected opening dedupes to one chip pair rather than
  transitioning between two renderings. Walls are no longer filtered against
  `placementOpening?.wallId`, so every `DimLabel` renders unconditionally.
- **`src/editor/placementDims.test.tsx`** — the three tests asserting the old
  vocabulary (dimension-line position, `translate(…,±15)`, line-and-tick counts)
  became tests of the new one: chips on the axis at `y = 0`, zero `<line>`
  elements, an `--accent` rect. Added: the pixel lock (`pxPerCm` 0.5 →
  `scale(2)`, constant rect height), overflow without shrink or shift, the
  plain-click selection trigger, a shift-click multi-selection showing all four
  chips across two openings, and a selected wall staying silent. The two
  "hides the wall dimension" assertions inverted to "the wall dimension stays".

Two things worth recording for whoever reads the diff:

- **The old "does not show them on a plain click — selecting is not moving"
  test is now its exact opposite**, and that is the visible face of this map's
  central decision. It was correct while the two registers shared a slot: a
  click could not raise placement dims without evicting the wall Dimension.
  Once the chip stopped occupying that slot, the reason for the restriction
  disappeared with it.
- **PNG export needed no work at all** — `PlanScene` never referenced
  `PlacementDims`, and still does not. ADR 0005 predicted this: chrome is
  excluded by the same rule that defines it, so there was no filter to add.
  `ExtentLine` survives with one caller (`DimLabel`); its comment claiming to
  be shared was corrected.
