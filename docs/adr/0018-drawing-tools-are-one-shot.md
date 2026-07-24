# Drawing tools are one-shot

The **Ruler** already worked this way: after its second click the tool returns
to Select with the new Ruler selected (ADR 0017, CONTEXT.md: Ruler). The Wall
and the Opening tools did not. A wall chain stayed on the Wall tool after it
closed or was double-clicked, ready to start another chain; the Door and Window
tools stayed active after a placement so several openings could be dropped in a
row — and neither left anything selected (the opening was selected, but the tool
never handed back).

The decision is to make **every drawing tool one-shot**: a completed placement
returns to Select and leaves its result as the Selection. The Ruler's behaviour
becomes the general rule rather than a lone exception.

- **What is selected** — the thing just made. For an Opening, the Opening. For a
  wall chain, *the walls the chain drew* — the segments along its polyline of
  anchor Points, which excludes any half that a crossing split off a
  pre-existing wall (those sit on the crossed wall's line, not the drawn path).
  When those walls close a loop, the Selection is exactly a Room's boundary and
  so reads as that Room (ADR 0014) with no special casing.
- **What counts as completion** — a *positive* finish only: a chain closed onto
  its start Point or ended by a double-click, an Opening placed on a wall, a
  Ruler's second click. Completion, not merely termination.
- **Abort is not completion** — Escape and right-click end the pending chain (or
  the Ruler's pending first point) but keep the drawing tool active and select
  nothing. This preserves the cancel ladder (chain → Selection → tool) and
  matches the Ruler's existing abort, which already stays on the tool.
- **A no-op finish keeps the tool** — a double-click that drew no wall, or a
  click where `placeOpening` refuses the offset, placed nothing, so there is
  nothing to select and no reason to leave the tool.

## Considered Options

- **Keep openings repeatable, walls one-shot.** Rejected: the whole value of the
  change is one predictable rule across the drawing tools. A tool that sometimes
  sticks and sometimes hands back is the surprising thing to document and to
  learn.
- **Select only the last wall of a chain**, not all of them. Rejected: the last
  segment is a fraction of what was just drawn, and it never reads as a Room, so
  the common "draw a room, now name/adjust it" flow would land on one edge
  instead of the room.
- **Also return to Select on abort.** Rejected: Escape and right-click already
  mean "back out", and the cancel ladder steps chain → Selection → tool. Making
  an abort also switch tools would collapse that ladder and diverge from the
  Ruler, whose abort keeps the tool.
- **Select the drawn walls by id-diffing the plan** (walls present now minus
  walls present at chain start) instead of by geometry. Rejected: a chain that
  crosses an existing wall splits it, and the diff would then also capture those
  split halves. Collecting walls along the chain's polyline names exactly the
  drawn segments and is stateless with respect to the id churn each commit
  causes.

## Consequences

- The "place several openings in a row" workflow is gone: each opening now costs
  one tool re-selection. This is the deliberate trade — uniformity and an
  always-selected result over batch placement.
- The editor tracks the chain's anchor Points in draw order (a ref, so the id
  churn across commits never restages), and `wallsAlongPath` turns that path plus
  the final plan into the drawn walls at finish time — robust to the splits and
  merges a commit performs.
- Selecting the result means the Tool panel opens straight onto it — an Opening's
  parameters, or a chain's walls (a Room, when closed) — so the natural next
  step (rename the room, adjust a door) needs no extra click to reach.
