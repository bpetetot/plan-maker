# An Edit is what one undo takes back — and the store owns it

The plan store was a pass-through: `setPlan(updater)` took any function of the
plan and wrote whatever came out. Everything that made a run of those writes
*one* thing for the user lived outside it. `beginHistoryGroup` and
`endHistoryGroup` were two free exports talking to each other through a
module-level `groupSnapshot`, so nothing prevented an `end` without a `begin`,
or a second `begin` silently overwriting the snapshot the first was holding.
ADR 0022 named the precondition and left it where it found it: "there must be a
history group around the call" survived that decision, held by the convention
of two lines in `Editor.tsx`.

The store now owns the concept and gives it a name: **Edit** (CONTEXT.md), what
one undo takes back.

- `editPlan(edit)` is one write, one undo entry, and it **returns the plan it
  landed**. The opening width, which the model narrows when the entered one
  will not fit, is now read off that return rather than off a render closure
  `Editor.tsx` already documented as possibly stale. The other read-back — the
  id of a text just created — still computes outside the store: `addText`
  returns `[plan, id]`, and a one-plan return cannot carry the id. Naming a
  second store member for a single caller was not worth it.
- `beginEdit()` returns the only handle that can write across a drag:
  `aim(plan)` writes without an entry, `land(plan)` writes and closes. Nothing
  else hands one out, so the pair cannot be split, and the pre-gesture snapshot
  lives in that handle's closure rather than in a module variable.
- An Edit left open — the editor unmounts mid-drag, the pointer-up never
  arrives — would keep zundo paused *and* autosave suspended for the life of
  the app. Every entry point — `beginEdit`, `editPlan`, `replacePlan` — lands
  it first, and the abandoned handle goes inert. It lands rather than reverts:
  the aims that got through are work the user did, and dropping them to be tidy
  would cost more than persisting one plan that never settled.
- The store carries `editOpen`, and autosave skips while it is true. A drag
  longer than the 400 ms debounce no longer persists a half-settled plan.

The whole write surface is module functions now — `editPlan`, `beginEdit`,
`replacePlan`, `undo`, `redo` — with `usePlanStore` left for reading. The
`setPlan` prop `Editor` was passing down to `ToolPanel` is gone.

## Considered Options

- Keep `beginHistoryGroup`/`endHistoryGroup` and merely repackage them —
  rejected: renaming a convention leaves it a convention. The pairing had to
  become something the types hold, not something a reader must check.
- `withEdit(fn)`, a scoped callback that opens and closes around one call —
  rejected: impossible to unpair by construction, but a Plan drag spans a
  pointer-down, N pointer-moves and a pointer-up. It would have meant inverting
  the control of the whole pointer path to satisfy the shape.
- Let the store settle too, capturing the "before" itself — rejected, and this
  is where ADR 0022 still holds: purity is the gain. `settleEdit` stays a
  function of two plans in `model/`, called by the three edit paths that have
  something to settle. The store decides what one undo takes back; it does not
  decide what a plan means.
- Have autosave key off the plan reference changing, as it always had —
  rejected once the suspension existed: `settleEdit` returns its `after`
  untouched when it has nothing to correct, so a landing can write the very
  reference the last aim wrote. Keyed on the reference, a whole drag would
  never be saved. Autosave compares against the last plan *it* saw instead.

## Consequences

- ADR 0022's dangling precondition is closed: the history group is not
  something a caller can forget, because a caller can no longer see it.
- `usePlanStore` is a read hook. A component that writes imports a function; it
  does not receive one.
- `editOpen` is not in the tracked state — `partialize` still takes only the
  plan, so it takes no undo entry and no history step.
- The Edit is the store's unit, not the Plan drag's: today they coincide one to
  one, and nothing in the store knows about drags.
