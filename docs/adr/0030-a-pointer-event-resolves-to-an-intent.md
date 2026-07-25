# A pointer event resolves to an Intent

Nothing existed between "a PointerEvent arrives" and "a Plan drag or a
Placement advances". Five pointerdown handlers each re-learned the
button/Space policy (three spellings, two of them divergent), the conversion
to plan coordinates (eight call sites), the Alt/free resolution (three
sources, one with a comment admitting the inconsistency), and the pointer
capture (four protocols, one of which was "start the drag in the child, let
the event bubble, capture in the svg"). The click-vs-drag threshold was
written twice with two different predicates: a per-axis box for the Marquee,
a euclidean distance in `planDrag.ts`. Two of those divergences were live
behaviors: Space + drag from a Point handle dragged the Point where the
glossary promises a Pan, and a small diagonal wobble was a click for the
Marquee but a drag for a Plan drag.

We named what the policy produces an **Intent** (CONTEXT.md) and gave the
resolution one address: `src/editor/pointer.ts`, a pure interpreter of the
whole pointer stream.

```
routePointerDown(state, input, target, ctx)  →  [state, Intent]
routePointerMove(state, input, ctx)          →  [state, Intent]
routePointerUp(state, input)                 →  [state, Intent]
routePointerCancel(state, input)             →  [state, Intent]
```

The module is pure — no React, no DOM. The JSX sources declare *what* was hit
(`sheet`, an element ref, a handle, a Dimension plate, a room-label line) and
stop the bubble; the router decides *what it means* — pan, marquee, grab,
toggle, placement click, hover — with the plan coordinates and the `free`
flag already resolved. Capture is an instruction carried by the intent, which
the `Editor` always applies to the svg: one protocol. The `Editor` keeps only
the dispatch: a switch that maps each intent onto the modules that already
own the behavior (`planDrag.ts`, ADR 0023; `placement.ts`, ADR 0025; the
selection). `planDrag` stops computing the threshold and receives the verdict
in its `AimEnv`.

## Considered Options

- **A classifier of the down alone** — rejected: the two promises that
  justify the module are undecidable at the down. The click threshold is
  settled between the down and the up, and capture and cancellation span the
  stream. A down-classifier would have unified the button policy and left the
  threshold written twice.
- **Letting the router hit-test from the plan** — rejected: the SVG paint
  order already encodes the grab-zone priorities (zones slipped between
  content and measures, handles above everything), with constant on-screen
  margins the model knows nothing about. Re-deriving that in geometry is a
  second implementation of what the eye sees, and none of the observed leaks
  came from hit-testing.
- **Keeping `planDrag`'s own `moved`** — rejected: one formula at two
  addresses is the drift this module exists to make unwritable. The rule "a
  handle has no click to tell a drag from" moved with it, as a property of
  the target kind.
- **Routing `enter`/`leave`, `contextmenu` and Escape too** — rejected: no
  policy crosses them (no button, no Space, no threshold), and the last two
  act on the Placement and the Tool, not on the pointer stream. Uniformity
  for its own sake widens the interface without deepening it.

## Consequences

- **Two behavior corrections, both toward the glossary.** Space + drag from a
  Point or Ruler handle now Pans. And one euclidean threshold decides
  click-vs-drag everywhere: a 3-by-3 px diagonal wobble is now a (empty)
  marquee where the per-axis box read a click, and the verdict is sticky — a
  marquee dragged out and back to its start stays a drag, as a Plan drag
  always did.
- Alt is read off the live event for placements too, closing the
  inconsistency ADR 0023 had closed for drags only; the tracked `altHeld`
  survives solely to re-render the snap toggle.
- Events from a second pointer are ignored while a gesture runs
  (pointerId-filtered), where they previously advanced the drag.
- The bubble-then-capture protocol is gone, and with it the reason handles
  had to `stopPropagation` — the policy no longer depends on DOM topology.
- The spec fields that only fed the threshold (`start` on `label`,
  `newLabel`, `opening`, `dim`) are deleted; `group` keeps its own for the
  translation delta.
- The policy is assertable in node (`pointer.test.ts`: buttons, Space per
  target, threshold bounds, Alt, capture); the browser suites stay untouched
  as the iso-behavior net, plus one browser test per correction.
