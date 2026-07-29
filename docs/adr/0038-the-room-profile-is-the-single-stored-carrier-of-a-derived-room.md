# The Room profile is the single stored carrier of a derived room

> **Amended by [ADR 0039](0039-silencing-a-measure-is-an-act-of-drafting.md)** —
> the mark called `condemned` below is renamed **Hatching** (`hatched`), and it no
> longer drops the Room area as a consequence of what it means: a second mark,
> `areaSilenced`, does that, and hatching only writes it as a default in the same
> Edit. The rule this ADR sets is unchanged and now holds for both marks — one
> stored carrier per room, one reconciliation, one law.

A Room is derived from the walls and never stored (CONTEXT.md: Room), so anything
a room must remember — its name, a custom block placement, now the condemned
mark — needs a stored object reconciled after every wall change. When the
condemned mark arrived we chose to widen the existing carrier (the former Room
label, renamed Room profile) rather than add a `plan.condemnedRooms` beside it:
the reconciliation that ties a stored object to a derived room (home room by
loop, orphan dropping, rigid translation, oldest-wins on merge) is subtle enough
that two parallel copies would drift, and a room carrying a name *and* a mark
would otherwise need two stored objects kept coherent. The rule this sets: every
future per-room attribute (a floor color, a covering) joins the Room profile —
one stored carrier per room, one reconciliation, one law.
