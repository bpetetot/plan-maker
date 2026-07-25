# A Plan drag is a pure value, not a hook

Every drag that edits the plan — seven of them — was composed by hand inside
three pointer handlers: a nine-branch `pointermove`, a six-branch `pointerup`,
and seven hand-written drag openings. Nothing owned a drag, so the click
threshold was written five times, the button/space guard five times, and the
grab-point offset in six places; the drag state was mutated in place
(`d.moved = true`, `d.id = id`) because there was nowhere to put the next one.
The seam sat one level too low: the model was deep at "pure `Plan → Plan`
functions", but everything above it — snap, threshold, settle, history,
selection — was reassembled in the editor, and was therefore only reachable
through the DOM.

We named that composition **Plan drag** (CONTEXT.md) and gave it one address:
`src/editor/planDrag.ts`, three functions, each from `PlanDrag` to `PlanDrag`.

```
beginPlanDrag(plan, spec)   →  PlanDrag
aimPlanDrag(drag, at, env)  →  PlanDrag
commitPlanDrag(drag)        →  PlanDrag
```

The module is **pure** — no React, no store — so a whole drag is exercisable as
`commitPlanDrag(aimPlanDrag(aimPlanDrag(beginPlanDrag(…), a), b))` in a node
test. `Editor` keeps only the wiring: it holds the value in a ref, and after
each call mirrors out what it renders — the plan, the snap marker, the
placement dims — and applies `selection` on commit.

## Considered Options

- **A `usePlanDrag` hook, the shape `useView` already has for the camera** —
  rejected, and this is the decision a reader will trip over, because the
  symmetry sits right next door. `useView` owns camera state that lives nowhere
  else, so a hook is its natural home. A Plan drag owns nothing: it transforms
  a `Plan` that already lives in the store. Wrapping it in a hook would buy a
  slightly smaller `Editor` and cost the entire win — a hook cannot be run
  outside a browser, and node-testability was the point.
- **Letting the module own the history group** — impossible as posed, and worth
  recording so it is not re-proposed. A `withHistoryGroup(fn)` scope is
  synchronous; a drag spans `pointerdown` to `pointerup`, so there is no
  function to wrap. It stays in `Editor` — but see below.
- **Folding the Pan and the Marquee in, for one uniform `drag.current`** —
  rejected: neither edits the plan, so the return type would become a union of
  unrelated effects (camera | selection | plan), widening the interface exactly
  where the point was to narrow it. `Editor` keeps a two-line branch for them.
- **Collapsing the near-identical pairs** (`point`/`rulerEnd`,
  `opening`/`dim`, `label`/`newLabel`) down to four cases — rejected: a module
  is deep by the thinness of its interface, not by the fewness of its internal
  cases. `point` excludes its own id from the snap and never snaps to a wall
  body, `rulerEnd` does the opposite; `point` Settles, `rulerEnd` does not.
  Parameterising over those differences reads worse than naming them.

## Consequences

- **The history-group precondition ADR 0022 left open is now closed** — not by
  a wrapper, but because there is no longer a case it fails to cover. A Plan
  drag always opens a group; the `if (d.kind !== 'pan')` that used to decide it
  at pointer-up is gone, because `pan` is no longer one of these drags at all.
- The drag **owns its working plan** for the drag's duration, and the store
  mirrors it. This is not new in kind: the group drag already rebuilt from its
  own `orig` and ignored the store's plan; the other six now do the same.
- The one variant with a plan the store may not have: an `opening` Settles
  nothing, so its commit returns the plan by identity and zustand bails out of
  the re-render. The placement dims must therefore not be derived from the drag
  ref at render time — `Editor` mirrors them into state instead, or they would
  stay lit after the pointer came up.
- Alt is now read off the live event for all seven, where before only the group
  drag did and the other six read the tracked `altHeld`. They agree except when
  Alt goes down before the window has focus, where the event is the correct
  source — which is why the group drag was already written that way.
- The test count went **up**, not down. The 352 browser tests were kept
  untouched as the iso-behaviour net — most of what looked migratable asserts
  history grouping, which no pure module can test. The gain is that the *next*
  drag behaviour is assertable without a DOM.
- `selectionForRoom` moved from `Editor` to `src/model/selection.ts`: the
  module needs it, and so does the marquee, which stayed behind.
