# Showing the grid is asking to snap to it

> **Supersedes [ADR 0007](0007-snap-is-a-state-alt-inverts-it.md)** — Snap is no
> longer a state of its own, and Alt no longer inverts anything. What survives
> of that decision is its storage discipline, which the Grid already had.

The editor asked the user to hold two ideas at once. The Grid was "purely
visual: showing or hiding it never affects Snap", and Snap was a separate state
with its own button, its own key, and its own modifier. Four combinations
existed and only two of them meant anything to a person drawing a plan: grid
shown and snapping on, grid hidden and snapping off. The other two — a visible
ruling that attracts nothing, an invisible one that pulls every point — are
states the interface could reach and nobody could want.

The two become **one concept**: the Grid is Snap's alignment target *and* its
switch. Showing the grid puts placements and group moves on the 10 cm step;
hiding it takes them off. One button, one key (`G`), no modifier.

```
free = !gridVisible
```

And the Grid is now **hidden by default**. The plan a user draws is a plan of a
real home, whose walls do not land on 10 cm multiples; making the grid opt-in
means the measurements entered are the measurements kept, and the grid becomes
what it is for — a ruling you call up when you want to align to it.

What "free" *means* is unchanged, and this is what makes the merge affordable.
Snap's rungs are of two natures, and only the second is switched: the
**connection targets** (existing Point, wall body) stay live in both states, the
**alignment target** (the grid) exists only under a visible grid. A wall drawn
with the grid hidden still joins the plan's topology — it meets the point it was
aimed at, it lands on the wall body it was dropped on. `snapPoint` keeps its
single `free` flag and gains no branch; the whole change is what the editor
passes to it.

## What is deliberately lost

- **The Snap button and the `S` key.** `S` is left unassigned rather than
  reused: a freed key that immediately does something else is how a muscle
  memory becomes a surprise.
- **Alt's momentary inversion.** There is now no way to escape the current
  alignment for the length of one gesture — the only switch is `G`, which is
  global and persisted. This is the real cost, and it is paid twice: no
  momentary free placement under a shown grid, no momentary snapped one under a
  hidden grid.

  It is acceptable because of what the new default does to the shape of the
  problem. ADR 0007 introduced the inversion to protect a user who was *stuck on
  the grid*, which was then everyone's starting state; with the grid off by
  default that user now has to have asked for the grid, and can ask again. And
  in the other direction the connection targets — which cover nearly every "I
  want this to meet that" — never went away, so the hidden-grid user is not
  reaching for the grid nearly as often as the ladder suggests.

## Considered Options

- **Two toggles, both defaults flipped** — keeping Grid and Snap orthogonal and
  merely starting both off. Rejected: it leaves the two meaningless combinations
  in place and keeps a second button, a second key and a modifier alive to
  express a distinction nobody makes. Turning the grid on to read a plan and
  discovering it now moves the points is the *intended* reading of one toggle,
  not a bug of a merged one.
- **Keep Alt, re-aimed at the grid rung** — an escape hatch that suspends or
  restores the grid for one gesture. Rejected: it reintroduces the modifier the
  merge exists to remove, and the glossary would again have to explain two
  causes for one effect.
- **`G` momentary when held, toggling when tapped** — rejected: a third key
  mechanic to document and test, for the need the paragraph above judges
  marginal.
- **Dissolve "Snap" from the vocabulary, folding it into "Grid"** — rejected:
  the connection targets survive and have nothing to do with the grid, while
  `snap.ts`, `snapPoint` and `Snap.kind` keep saying snap throughout the code.
  The glossary would be lying about the module.

## Consequences

- **This amends [ADR 0004](0004-group-moves-realign-to-the-grid.md).** Its
  realignment is untouched mechanically — it still runs off `free` — but it is
  no longer a promise the model makes. Off-grid geometry stops being a
  deliberate exception that heals and becomes the default posture; the
  realignment is now simply what a visible Grid does to a group move, and a plan
  drawn without the grid never meets it.
- **This amends [ADR 0026](0026-a-preference-is-an-entry-in-a-table.md).** The
  table drops to three entries, and its `boolEntry` helper takes the default as
  a parameter — the stored sentinel being "the non-default value", `grid` stores
  `shown` where `measures` stores `hidden`. That ADR's consequence recording
  that the Alt inversion stayed in `Editor` no longer has a subject, and its
  note that Snap became readable outside React with no caller is settled by
  removal.
- ADR 0034 stands on its own. Shift's axis lock is untouched, and the "read off
  the live event, never tracked" discipline it generalised now has Shift as its
  only subject.
- `Editor` loses the `useState` on Alt that ADR 0007 had forced: no held key
  needs to re-render the chrome any more, and `PointerInput` loses `altKey`.
  `PointerCtx` and `SessionEnv` carry `gridVisible` where they carried
  `snapEnabled`.
- The stale `plan-maker:snap` key is left in local storage on existing devices.
  No migration is written: the product is not in production, and the key is read
  by nothing.
- `tests/editor/toggles/snap.test.tsx` is deleted rather than ported — the
  toggle it drove no longer exists. What deserved to survive moved into
  `grid.test.tsx`, which now asserts both halves of the one concept: what the
  sheet draws, and where a placement lands.
