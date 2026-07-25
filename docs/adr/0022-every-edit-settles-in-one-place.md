# Every edit settles in one place — one operation restores the invariants

> **Three statements below have since been overtaken.** The precondition "the
> settle must sit inside a history group", left to the caller here, is now the
> store's: an Edit is what one undo takes back, and no caller can see the group
> (ADR 0028). And "drawing a wall does not settle yet" is no longer true —
> `clickWall` settles each click against the plan that click started from, so a
> wall drawn across a labelled room reconciles its label immediately. Those two
> were gaps this ADR acknowledged. The third is a reversal: loading no longer
> keeps a pipeline of its own. It settles too — minus the label pass, the only
> one that needs a "before" — so a file arriving with crossing walls is now
> split on arrival, and orphan labels are still dropped rather than reconciled.
> The objection below holds; it covered more than it should. With it falls one
> consequence: `mergeCoincidentPoints` is no longer exported. The rule stated by
> this ADR is unchanged.

ADR 0002 ("walls only meet at shared Points") and ADR 0003 ("two Points never
coincide") each state an invariant, and each says drag end restores it. But the
sequence that restored them — merge, then planarize, then reconcile the room
labels — existed only as an expression inside the editor's pointer-up handler,
with four preconditions nothing stated: the three passes had to run in that
order, the set of displaced Points had to be rebuilt by hand from the
selection, the pre-gesture plan had to have been captured at pointer-down, and
the whole thing had to sit inside a history group. Nothing named the sequence,
so nothing could be reused, and the only way to exercise it was through the
DOM.

We gave it a name and a single address: **Settle** (CONTEXT.md), one operation
taking the plan the edit started from, the plan it produced, and the Points it
displaced. **Every edit that moves a Point or a Wall ends with it** — dragging,
and deleting. Edits that touch neither, such as sliding or widening an opening,
renaming a room, moving a Ruler or a Text, or choosing a dimension's placement,
are not exceptions: they can violate neither invariant and can orphan no label,
so there is nothing for them to settle. Two paths that *do* move walls are
deliberately outside the rule, and stay outside:

- **Loading a plan is not an edit.** There is no plan the change started from —
  the stored plan is both before and after. Routing it through the settle would
  mean handing room-label reconciliation a "before" whose loops are not yet
  closed, silently changing which room each label calls home. Loading keeps its
  own pipeline: merge coincident Points, then drop orphan labels.
- **Drawing a wall does not settle yet.** Wall commit already performs its own
  planar insertion and reuses nearby Points as it goes, so it needs neither the
  merge nor the planarize pass — but it never reconciles room labels either.
  Drawing a wall across a labelled room therefore leaves the label where it
  was until the next drag or delete. That is a real gap, and closing it changes
  behaviour, so it belongs to its own commit rather than to this one.

## Considered Options

- Make the settle a store action that also closes the gesture's history group —
  rejected: purity is the whole gain. A function that touches the store cannot
  be exercised outside a browser, and history grouping is the store's business,
  not the model's. The precondition "there must be a history group around the
  call" therefore survives this decision, unresolved and still held by the
  caller.
- Name it `commitEdit` — rejected: `commit` is taken twice over. In the model it
  names the *creators* (`commitPoint`, `commitWall`), which insert something new
  planarly; in the UI it names the user validating a Text. A closer that creates
  nothing and takes a before and an after would read as the generic form of
  `commitWall`, which is the exact contresens.

## Consequences

- `planarize` is no longer exported: the settle is its only caller. Its unit
  tests reach it through the settle, which is why a regression in the merge pass
  can now fail a test named for planar insertion — acceptable, since the merge
  pass keeps its own direct tests alongside.
- `mergeCoincidentPoints` stays exported: loading still calls it directly.
- Deleting elements runs the merge and planarize passes even though a delete
  displaces no Point and can create no crossing, so neither can act. The passes
  return the plan untouched and the cost is nil at floor-plan scale; the
  uniformity is the point — one place decides when a plan is settled.
- The "before" plan is the caller's responsibility and cannot be derived:
  comparing before and after would not tell a displaced Point from a new one,
  which is why the displaced set is passed in rather than computed.
