# Silencing a Measure is an act of drafting, so the plan carries it

> **Amends [ADR 0008](0008-hidden-measures-are-hidden-from-the-export-too.md)** —
> hiding is no longer global and unconditional, and the rejected option "store the
> choice in the plan" is reopened for a different question than the one it
> answered. The biconditional that ADR 0008 exists for is untouched.
>
> **Amends [ADR 0038](0038-the-room-profile-is-the-single-stored-carrier-of-a-derived-room.md)**
> — the mark it calls `condemned` is renamed **Hatching**, and hatching a floor no
> longer drops the Room area as a consequence of what the mark means. The
> one-carrier-per-room rule it sets is unchanged, and both new marks obey it.

Measures were all-or-nothing: a single toggle showed every wall Dimension and
every Room area or hid all of them. ADR 0008 opened by naming the problem this
leaves — "a plan dense enough to be useful is therefore a plan too noisy to show
anyone" — and could not solve it, because the only granularity it had was the
whole sheet. On a dwelling plan a handful of Dimensions matter (the overall
extents, the openings' spans) and a dozen are noise: interior partitions nobody
measures, short returns whose plates collide, a cupboard wall whose number sits
on a door. The escapes were to hide *every* number, producing a sheet nobody can
build from, or to keep the clutter.

A Measure can now be **Silenced** one element at a time, and the mark lives in
the plan: it survives a reload, travels with a saved file, and is taken back by
undo like any other Edit. Two optional marks carry it — `Wall.dimSilenced` and
`RoomProfile.areaSilenced` — each beside the sibling property its module already
owns. Absent means stated, `true` is the only value ever written.

## Why the plan, when ADR 0008 refused it

ADR 0008 rejected "store the choice in the plan" on the grounds that "the plan
carries geometry, not the way it is being looked at". That objection was aimed at
putting a per-device *preference* in the schema — one boolean meaning "this
device is not showing measures right now". It was never aimed at an act of
drafting.

And the plan already carries the *formatting* of a Dimension: where along its
wall it sits and on which side (ADR 0001). That property is purely
presentational, stored, exported, and undoable — and nobody calls it a
preference. A decision to say nothing at all about a wall is of the same nature
as a decision about where to say it. Once that is seen, the objection dissolves
for the per-element mark while staying entirely true for the global toggle, which
keeps its per-device storage untouched.

## Composition

`drawn = measures preference AND NOT silenced`. The global `M` toggle survives
unchanged: it keeps its entry in the preference table, its two readers, and its
storage discipline. So the one-keystroke clean sheet before an export still costs
nothing — it writes nothing to the plan, consumes no undo entry, and loses none
of the per-element choices the user composed. And ADR 0008's biconditional
survives intact: a Silenced Measure is a graphic that exists on neither screen
nor export, rather than one that changed sides.

## Two surfaces, one rule

The Tool panel gains a `DISPLAY` section whose switches read positively — up
means the thing appears on the Sheet. A single wall offers `Dimension`; a Room
offers `Area` and `Hatching`. The section stays single-element, preserving the
panel's existing rule that no Selection retypes several walls at once: the batch
path is the keyboard.

`Shift+M` silences every Measure a Selection carries — the Dimension of each
selected wall, and the Room area when the Selection reads as a Room (ADR 0014).
The mixed rule: any Measure still stated silences them all; none stated states
them all; an empty Selection does nothing, `M` already meaning "all".
Uniformising towards **silence** is deliberate — the dominant gesture is widening
a marquee over partitions, and each pass must finish the batch instead of undoing
the previous one. The price is that restoring everything takes `Mod+A` then
`Shift+M` twice.

Both surfaces turn the `measures` preference back on and then apply, following
the Ruler tool (ADR 0017) and ADR 0008's own statement that "adjusting a
Dimension's placement is formatting work, done with measures shown". Silencing is
formatting work of the same kind. The accepted oddity, recorded so nobody treats
it as a bug: turning a switch *down* can turn measures *on*. The rule is that a
formatting gesture shows its result, not that turning something off never turns
anything on.

## Condemned is retired in favour of Hatching

Once the mark's only remaining effect is the hatching, the concept and its
graphic are indistinguishable, and a term surviving only in the code and never in
the UI is a term nobody speaks. So `condemned` becomes `hatched` throughout, and
the glossary entry becomes **Hatching**, with `Condemned` recorded as retired in
its `_Avoid_` line — which is what keeps the word from growing back. The meaning
the old label carried (a chimney shaft, a lost corner, a void the walls enclose
but the dwelling does not inhabit) moves to the switch's tooltip, where the
current switch already puts its explanation.

Hatching no longer drops the area as a consequence of what the mark means. The
coupling becomes an **ergonomic default**: hatching a room writes `areaSilenced`
in the same Edit, so one gesture still produces the reading almost always wanted
and one undo takes both back — and the `Area` switch visibly drops in the section
directly above, which makes the coupling legible instead of hidden. Afterwards
the two marks are independent: a hatched floor *can* state its area, and
un-hatching never lifts `areaSilenced`, because the app does not overwrite an
explicit choice.

## Considered Options

- **A per-device preference keyed by element id** — rejected: opaque ids rot, an
  imported plan carries none of the keys, and there would be no undo. It also
  reproduces exactly the mismatch ADR 0008 accepted for one global boolean, at a
  scale where it stops being tolerable.
- **Collapsing the global `M` toggle into a bulk Edit** on the per-element marks,
  leaving one mechanism instead of two — rejected: the clean-sheet round trip
  would write the plan twice and destroy the user's composed set of exceptions.
  Two mechanisms composing as an AND is the cheaper answer.
- **Uniformising the mixed rule towards statement** — rejected above: a widened
  marquee would undo the previous pass, which is the gesture the feature exists
  for.
- **An on-canvas indication that a Measure is silenced** — a ghost outline, a
  hover reveal, a marker on the measures button. Rejected: it breaks ADR 0008's
  principle that nothing brings a hidden measure back on the canvas. The panel
  switch is the only tell, and it is also the remedy.
- **Direct manipulation on the Sheet** — double-click a plate to silence it, or a
  hover eye icon. Rejected as asymmetric: once silenced there is nothing left to
  aim at, so the return gesture would have to be the panel anyway.
- **A context menu** — rejected: the app has none, and introducing the paradigm
  for one command is not warranted.
- **Per-side silencing of a wall Dimension** — rejected: a wall has one Dimension
  with two readings depending on which side it sits; the mark is on the wall, not
  on a side.
- **Keeping `Condemned` in the glossary** beside Hatching, on the grounds that the
  *reason* a floor is hatched is a fact about a dwelling rather than a rendering
  — rejected once the mark's only effect became the graphic. The `_Avoid_` line is
  what makes the retirement safe.

## Consequences

- The **export** needs no work. The Sheet is drawn once and the export is a
  second reading of it (ADR 0024), so a Silenced Measure is absent from the PNG
  by construction.
- **Drag handles** go with the plate, which *is* the handle — the same
  non-special-case ADR 0008 already relies on for the global toggle. Re-placing a
  silenced Dimension means stating it, moving it, and silencing it again.
- **Selectability** is untouched: a wall stays selectable by its body's grab zone,
  which is chrome and not the plate, and a room stays selectable by its floor
  (ADR 0014) — the way back for an unnamed room whose area is silenced, which
  therefore draws no text block at all.
- A **split inherits `dimSilenced` on both halves**, deliberately unlike
  `dimPlacement`, which a split still drops: a placement describes a geometry that
  ceased to exist, whereas a silence describes an intention that still holds.
  (Whether dropping the placement is right at all is a separate question, noted
  and left alone.)
- `areaSilenced` joins the Room profile's `carries` predicate, so a profile
  holding nothing but that mark exists, persists, and is deleted the moment it
  loses it — exactly as the hatching mark behaves. Both marks ride on carriers
  that already have laws (ADR 0038), so reconciliation, orphan dropping, rigid
  translation and oldest-wins-on-merge all apply with no new rule.
- The **selection** module gains one reading — what Measures a Selection carries,
  and whether any is still stated — and performs no writes, a Selection never
  being part of the plan. A Ruler is excluded on purpose: it is stored content the
  user placed, deleted rather than muted. Openings and Texts carry no Measure.
- **No migration.** The project is not in production and the stored model may
  change freely until it is; absent means stated, so plans saved before this work
  validate unchanged and state every Measure.
