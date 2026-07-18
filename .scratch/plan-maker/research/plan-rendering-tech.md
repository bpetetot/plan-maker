# Research: Rendering technology for the 2D floor plan editor

Question (from `../issues/01-plan-rendering-tech.md`): should the interactive 2D floor
plan editor in a React + TypeScript + Vite app be built on plain SVG (React-managed),
raw HTML Canvas 2D, or a canvas library (Konva/react-konva, Pixi.js, or similar)?

Researched: 2026-07-18. All versions, dates, and maintenance facts below were verified
against primary sources (npm registry, GitHub repos, official docs, MDN) on that date.
Bundle sizes are direct measurements (minified dist file + `gzip -9`) from each
package's published npm tarball, because bundlephobia was unreachable from the sandbox.

## Recommendation

**Plain SVG, React-managed.** Runner-up: **Konva + react-konva**.

At the stated scale (tens of walls, not thousands of shapes), SVG gives browser-native
hit-testing and per-element events, real text layout for dimension labels, one-attribute
zoom/pan via `viewBox`, zero bundle cost, no extra dependency to maintain, and the most
natural React integration possible — shapes are just JSX driven by state. The only real
cost is PNG export, which is a well-understood ~30-line utility. Every canvas option
trades that one small cost for hand-rolled or library-provided replacements of things
the browser already does, plus bundle weight and (for canvas) lost accessibility.

## Option analysis

### 1. Plain SVG (React-managed) — recommended

**React integration.** React DOM supports all built-in SVG elements natively in JSX
(`<svg>`, `<path>`, `<g>`, `<text>`, ...), with camelCased attributes and the full
standard event-handler set (`onPointerDown`, `onPointerMove`, `onWheel`, ...) on every
element ([react.dev components reference](https://react.dev/reference/react-dom/components),
[common props](https://react.dev/reference/react-dom/components/common)). The scene is
declarative: `plan state -> JSX`, exactly the React model. No reconciler bridge, no
imperative escape hatches.

**Hit-testing and interaction.** Browser-native and per-element. SVG's `pointer-events`
property controls whether fill, stroke, or both are event targets
([MDN pointer-events](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/pointer-events)).
Drag handles are just small SVG elements with pointer handlers; snapping feedback is
just conditional rendering of guide lines from state.

**Zoom/pan.** `viewBox="min-x min-y width height"` maps a user-space rectangle to the
viewport; shrinking width/height zooms, changing min-x/min-y pans
([MDN viewBox](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox)).
One attribute on the root `<svg>`, driven from React state — no library needed
(d3-zoom is available later if input-modality edge cases warrant it,
[d3-zoom docs](https://d3js.org/d3-zoom)).

**Performance at this scale.** MDN notes complex SVGs cost DOM processing per element;
secondary benchmarks put the practical SVG/canvas crossover around a few thousand
elements ([MDN Drawing graphics](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Drawing_graphics),
[jointjs.com SVG vs canvas](https://www.jointjs.com/blog/svg-versus-canvas)). A home
floor plan — tens of walls plus handles and labels, maybe low hundreds of nodes — is
two orders of magnitude below that.

**Text.** Native `<text>` uses real browser text layout (fonts, kerning, CSS), is in
the DOM, selectable, and exposed to accessibility tools; `<title>`/`<desc>` give
per-shape accessible names ([MDN text](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/text)).
MDN explicitly recommends SVG over canvas for accessible apps
([MDN Drawing graphics](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Drawing_graphics)).

**PNG export — the one weak spot.** Standard recipe: `XMLSerializer` -> SVG blob ->
`Image` -> `ctx.drawImage()` -> `canvas.toBlob()`
([MDN drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage)).
Gotchas: SVG loaded as an image cannot load external resources — external fonts or
stylesheets must be inlined as data: URIs or the export falls back to default fonts
([MDN SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image));
and cross-origin content taints the canvas, making `toBlob()` throw
([MDN toDataURL](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL)).
Mitigation: use inline styles/system fonts (or one inlined @font-face) in the plan
SVG. Bonus: SVG export itself (a likely floor-plan deliverable) is free.

**Bundle size.** 0 kB.

### 2. Konva + react-konva — runner-up

- Versions/maintenance: konva 10.3.0 (2026-04-30), react-konva 19.2.5 (2026-06-09,
  tracks React 19); repos actively pushed as of July 2026; effectively single-maintainer
  (Anton Lavrenov, backed by Open Collective and the Polotno SDK)
  ([npm konva](https://registry.npmjs.org/konva), [konvajs/konva](https://github.com/konvajs/konva),
  [konvajs/react-konva](https://github.com/konvajs/react-konva)).
- Bundle: konva 54.0 kB min+gzip (measured from official `konva.min.js`), plus
  react-konva ~7 kB gzip + react-reconciler/scheduler deps.
- React story: the best of any canvas library — official declarative binding via a
  custom react-reconciler (`<Stage><Layer><Rect draggable onDragEnd={...}/>`)
  ([react-konva README](https://github.com/konvajs/react-konva)). Konva's own docs note
  the cost of two abstraction layers (React on Konva on canvas)
  ([Konva React docs](https://konvajs.org/docs/react/index.html)).
- Features: per-shape events and built-in `draggable`; `Konva.Text`/`Label` shapes;
  one-call PNG export via `node.toDataURL()`; layer-per-canvas redraw model tuned for
  "thousands of shapes" ([konvajs.org performance tips](https://konvajs.org/docs/performance/All_Performance_Tips.html)).
- Verdict: everything the editor needs, and the natural fallback if the plan view ever
  grows into thousands of shapes or needs canvas-only effects. At tens of shapes it
  buys nothing over SVG while costing ~60+ kB gzip, a reconciler bridge, canvas text
  (no DOM/accessibility), and a single-maintainer dependency.

### 3. Raw Canvas 2D — rejected

Everything is hand-rolled: canvas is a single bitmap with no per-shape objects, so
hit-testing means maintaining your own display list and testing per event (browser
helpers stop at `isPointInPath`/`isPointInStroke`,
[MDN isPointInPath](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/isPointInPath));
every drag/hover/selection change needs a clear-and-redraw loop
([MDN Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas));
`fillText` draws single unwrapped lines with manual measurement
([MDN Drawing text](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Drawing_text));
HiDPI needs the devicePixelRatio backing-store recipe
([MDN devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio));
and content is invisible to accessibility tools
([MDN guidance](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Drawing_graphics)).
Its only win — trivial `toBlob()` PNG export — solves the one problem SVG has, at the
price of rebuilding everything SVG gives for free. Wrong trade at this scale.

### 4. Pixi.js + @pixi/react — rejected

pixi.js 8.19.0 (2026-06-04) is current and very actively team-maintained
([npm pixi.js](https://registry.npmjs.org/pixi.js), [pixijs/pixijs](https://github.com/pixijs/pixijs)),
but it is a WebGL/WebGPU engine built for high-throughput animation: full bundle
219.3 kB min+gzip (tree-shakeable), imperative `draw` callbacks even inside the React
binding, and no built-in dragging. @pixi/react 8.0.5 supports Pixi v8/React 19 but has
a slow cadence — last release 2025-12-01, no commits Feb–Jul 2026
([pixijs/pixi-react](https://github.com/pixijs/pixi-react)). Massive overkill for tens
of static-ish shapes; GPU rendering also makes crisp thin lines and text harder, not
easier.

### 5. Others checked

- **Fabric.js 7.4.0** (2026-05-18, active, ~428 open issues): strong built-in object
  manipulation (move/scale/rotate handles) and `IText`, 89.8 kB min+gzip, but **no
  official React binding** — its own README shows the imperative `useRef`/`useEffect`
  pattern ([fabricjs/fabric.js](https://github.com/fabricjs/fabric.js)). Fights React
  state ownership; a floor-plan editor wants domain-specific handles anyway.
- **Paper.js 0.12.18**: last npm release and last commit July 2024, 374 open issues —
  effectively unmaintained; excluded on maintenance alone
  ([paperjs/paper.js](https://github.com/paperjs/paper.js), [npm paper](https://registry.npmjs.org/paper)).

## Criteria matrix

| Criterion | SVG (React) | Raw Canvas 2D | Konva/react-konva | Pixi + @pixi/react |
|---|---|---|---|---|
| Hit-testing, drag handles | Browser-native, per element | Hand-rolled | Built-in, per shape | Built-in events; drag DIY |
| Perf at tens of shapes | Far below any limit | Fine | Fine | Fine (overkill) |
| Text for dimensions | Native DOM text, best quality | `fillText`, manual layout | Canvas text shapes | Canvas/BitmapText |
| PNG export | ~30-line serialize+drawImage util (font-inlining gotcha) | `toBlob()`, trivial | `node.toDataURL()`, trivial | `renderer.extract`, easy |
| Bundle (min+gzip) | 0 kB | 0 kB | ~61 kB+ | ~219 kB full (tree-shakeable) + ~100 kB binding |
| Maintenance risk | None (platform) | None (platform) | Healthy, single-maintainer | Core great; React binding slow cadence |
| React state fit | Perfect (plain JSX) | Poor (imperative loop) | Good (custom reconciler) | Middling (reconciler + imperative draw) |
| Accessibility | Real DOM, per-shape | None (bitmap) | None (bitmap) | None (bitmap) |

## Decision guidance

Adopt plain SVG. Revisit (switch to react-konva, the API-closest migration path) only
if the editor ever needs sustained animation of thousands of elements, pixel-level
effects, or profiled evidence of DOM-update jank — none of which a home floor plan at
tens of walls exhibits.
