# A placement is a value that carries no plan

Five state machines lived as ad-hoc `useState` in `Editor`: the wall chain
(`chain`, `chainAnchors`), the Ruler's pending A, the Opening's aimed preview,
the Text's spot, and the aimed snap they all shared. Nothing owned them, so
four `tool ===` ladders had to be kept in agreement by hand — the `pointerdown`
branch, the `pointermove` branch, the hint line, and the snap marker's
three-term visibility condition — and `switchTool` was a list of five setters
that had to be extended every time a gesture grew a new piece of state.

We named that composition **Placement** (CONTEXT.md) and gave it one address:
`src/editor/placement.ts`.

```
beginPlacement(tool)                  →  Placement
aimPlacement(placement, plan, at, env)   →  Placement
clickPlacement(placement, plan, at, env) →  PlacementResult
finishPlacement(placement, plan)         →  PlacementResult
cancelPlacement(placement)               →  Placement | null
placementChrome(placement, plan, defaults) → PlacementChrome
placementStage(placement)                → PlacementStage
```

## It does not carry a plan, and `planDrag.ts` does

This is the decision a reader will trip over, because the symmetry sits right
next door: ADR 0023 made a Plan drag a value that owns `orig` and `plan` for
the drag's duration, and mirrors them out. A Placement deliberately does not.

A drag is **atomic**: between `pointerdown` and `pointerup` nothing else edits
the plan, so a snapshot is safe. A placement **spans several commits** — a wall
chain writes one undo entry per click, and between two clicks the plan can move
under it: `Ctrl+Z`, a thickness change in the Tool panel, a restored autosave.
A carried plan would go stale exactly there. So the plan is an argument on
every call, and a click *returns* the plan it produced. This is also why the
chain names its Points by id rather than by position: commits churn them.

Restoring the symmetry would reintroduce the bug the id-keyed chain avoids.

## Considered Options

- **One value for all six Tools, Select included** — rejected. Select poses
  nothing; a `{ kind: 'select' }` variant would put a non-placement in the type
  and turn the four remaining `tool === 'select'` reads (marquee, room hover,
  the three grab-zone families) into periphrases on a placement that is not
  one. `Placement | null` says it better: `null` under Select.
- **The screen reads the placement's variant directly** — rejected. It would
  move the `switch` rather than remove it: every render site would still have
  to know each variant. `placementChrome` returns four flat fields —
  `snap`, `rubber`, `ghost`, `rulerGhost` — that `Editor` folds one-to-one into
  components. No field names a Tool, so the snap marker now appears because
  something is aimed, not because the tool is Wall, Ruler or Text.
- **The module returns the hint line** — rejected: the phrases interpolate
  `keyHint`, which reads the shortcut registry (ADR 0011), and user-facing
  strings do not belong in a pure module. It exposes a `PlacementStage` instead
  — one flat word per state — and `Editor` holds a total `Record` keyed by it,
  so a missing hint is a type error rather than a blank line on screen.
- **Folding the inline text box in** — rejected, and split out instead. The
  Room-label editor, the Text placement's editor and the Text re-edit are one
  concern (a box on the sheet that commits on blur), and it is irreducibly
  about focus and DOM. Putting it in the placement would have dragged the blur
  cycle into the module that exists to be testable without one. It became
  `inlineEditor.tsx`, and the placement's Text case now ends at "open a box
  here" — `clickPlacement` returns an `editor` position and writes nothing.
- **Settling the wall chain while we were there** — deliberately not done. ADR
  0022 records the gap ("drawing a wall does not settle yet") and says closing
  it changes behaviour, so it belongs to its own commit. It is now one line
  inside `clickWall`, and the reason it is still absent is this paragraph, not
  an oversight.

## Consequences

- **No test changed.** The 711 tests passed untouched across the three commits;
  the browser suite is the iso-behaviour net, exactly as ADR 0023 used it.
  `placement.test.ts` adds 16 node tests on top — the chain's four endings, the
  Opening's refusal, the Ruler's mis-click, the Text's editor request, and each
  cancel.
- `Editor` lost six pieces of state (`chain`, `chainAnchors`, `rulerA`, `snap`,
  `openPreview`, `textDraft`) and two cancel refs; `switchTool` is two setters
  where it was five, and nothing needs adding to it when a gesture grows.
- **The drag's snap no longer reaches a `setState`.** It never reached the
  screen either: the marker was gated on the Wall, Ruler and Text tools, and no
  Plan drag starts under those. It was write-only state, and it is gone.
- One inconsistency is **preserved rather than settled**: Alt is read off the
  live event when a Text is placed, and off the tracked `altHeld` for the Wall
  and Ruler tools. They differ only when Alt goes down before the window has
  focus, where ADR 0023 argues the event is the correct source. Unifying them
  is a behaviour change and belongs to its own commit; `Editor` marks the spot.
- `CLICK_PX` and the snap tolerance moved to `gesture.ts`, shared by the drag,
  the marquee and the placement. The Ruler's mis-click reach did **not** join
  them: written `CLICK_PX / 4`, it looked like the same family but says
  something else — two aimed positions are the same point — and is now
  `SAME_POINT_PX`.
