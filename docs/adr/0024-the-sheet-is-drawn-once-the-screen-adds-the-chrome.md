# The sheet is drawn once; the screen adds the chrome

ADR 0005 told two populations apart — the **drawing**, which is what the export
prints, and the **interaction chrome**, which exists only so the drawing can be
manipulated — and left them living in one file, listed twice. `Editor` wrote its
own list of content layers and `PlanScene` wrote a twin one for the export, with
nothing tying them together. The drift had already started: a Dimension's
placement was clamped to its Rail at the editor's 8 px and drawn at 10 px in the
export, so a plate the editor promised would clear the arrowheads could sit on
them. ADR 0021 already claimed "the editor and the export, which share
`PlanScene`"; only `png.tsx` imported it.

The **Sheet** (CONTEXT.md) is now one module, `src/sheet/`, called by both
adapters:

```
PlanScene({ plan, rooms, measuresVisible, dimFontPx, decor?, chrome? })
```

The export passes neither optional prop and gets the drawing, alone. The screen
passes both. Parity stops being a property to check and becomes a fact of
structure: a layer is added in one place or it exists nowhere.

## Considered Options

- **A flat bundle of optional props** — `selKeys`, `hoverWall`, `hoverRuler`,
  `hiddenTextId`, `labels`, `editingKey` and five handlers. Rejected: eleven
  props for seven layers is an interface as large as the body, which is the
  opposite of what a seam is for. `decor.element(ref)` says the same thing once,
  because `ElementRef` already names exactly the four decorated families and
  `refKey` is already the currency of the Selection.
- **Two lists plus a parity test** — cheap, and it would have caught the
  `fontPx` drift. Rejected: it reports the divergence instead of making it
  impossible, and "add the layer in both places" stays the rule.
- **One chrome overlay above the scene**, as the review's diagram drew it —
  rejected, and this is the decision a reader will trip over. The grab zones sit
  *between* the texts and the measures on purpose: a Dimension plate must win
  the hit-test against the wall grab zone it overlaps. Lifting the chrome above
  the measures would lose that silently, on tight plans only. Hence the `chrome`
  slot at that exact line — an ugliness that pays for a rule the code already
  stated in a comment.
- **`PlanContent` + `PlanMeasures`, assembled by each adapter** — rejected: the
  export would have to remember to call both, which reintroduces the very
  forgetting this removes.

## Consequences

- **The Rail binds at render, not only at the gesture.** `DimLabel` clamps the
  stored ratio with the `fontPx` it is actually drawing, so the export cannot
  overflow a Rail computed for a narrower plate. The stored placement is a wish;
  the Rail is the law at whatever size (CONTEXT.md: Rail).
- `transfer/png.tsx` no longer imports `../editor/render`. Dependencies read
  `editor → sheet ← transfer`: the export stops going through the editor to
  reach the drawing.
- `render.tsx` (1100 lines) is gone, split by family — `walls`, `openings`,
  `rooms`, `texts`, `measures`, `paint`, `scene` — with the chrome in
  `editor/chrome.tsx`. Its test file split along the same line.
- `JunctionPatches` takes a `selected(wallId)` predicate rather than the whole
  Selection: the scene answers it from the same `decor` as everything else.
- A **ghost preview is chrome drawn with the sheet's pieces** — `Editor` still
  imports `OpeningGlyph` and `RulerLabel` directly for the placement previews.
  That is not a leak: the preview is chrome (ADR 0005), it just happens to be
  drawn with a drawing component.
- **The export borrows the stylesheet instead of restating it.**
  `sheet/sheet.css` holds the drawing's rules and `theme/light.css` the light
  palette; `styles.css` imports both, `png.tsx` inlines both. No rule and no
  token value is written twice, and the export is light by construction, `:root`
  resolving to the exported `<svg>` where the dark override cannot match. The one
  literal left is the export's white paper — the frame rect and the canvas
  backdrop — which is the artifact's, not the theme's.
  Two costs came with it: vitest returns empty strings for CSS imports unless
  `css: true`, and the borrowed text must be wrapped in CDATA — the export is
  XML, so one `<` in a CSS comment closes the `<style>` element and the document
  rasterizes to nothing. A browser test now parses the export for that, the only
  export test outside node: 709 tests never caught it, because none of them
  parsed what they built.
- ADR 0021 is not amended. It was written ahead of the code; this makes it true.
- The test count went up, not down: 711. The browser tests were kept as the
  iso-behaviour net, and four were added — the Rail at export size, the Rail on
  a screen placement its geometry outgrew, the chrome not leaking, and the
  export parsing as XML.
