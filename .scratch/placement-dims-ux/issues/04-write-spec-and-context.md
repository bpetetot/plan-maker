# 04 — Write CONTEXT.md and the spec

Type: grilling
Status: resolved
Blocked by: 02 (resolved), 03 (resolved), 06 (resolved)

## Question

Turn the decisions of this map into the project's own words, ready to
implement.

- Rewrite the **Placement dimension** entry in `CONTEXT.md`: the new visual
  register, the selection-and-gesture trigger, whether a side still applies,
  and the removal of "they replace the wall's Dimension on that side's line
  for the duration of the gesture". Check the neighbouring entries — Dimension,
  Rail, Selection — for language that the change contradicts.
- Amend the plan-maker spec (`.scratch/plan-maker/spec.md`, §4 openings and
  §4 pan/zoom/dimensions) with the same rules, linking the tickets that
  decided them.
- Judge whether an ADR is warranted (`docs/adr/`). The stored plan model does
  not change — this is render and editor feedback only — so probably not, but
  state the call.

## Answer

Two judgement calls came up; everything else was transcription.

**The name survives.** `CONTEXT.md` keeps **Placement dimension**. The glossary
names what a thing *means* — the measure describing an Opening's placement —
not how it is drawn, and the register has now changed once already. Renaming
would also have cost: `clearance` is in this entry's own `_Avoid_` list, and the
change would ripple into the `measure-semantics` map, the spec and `PlacementDims`
in code. The vocabulary bleed that caused the original bug is blocked at the
entry instead: it opens with an explicit "deliberately not drawn as a
Dimension — no dimension line, no ticks, no witness lines, no offset from a
Face", and `_Avoid_` gains *Chip — the graphic is a chip, the concept is not*,
so nobody freezes the pixels into the language.

**An ADR is warranted — but not about placement dimensions.** The ADR-worthy
output of this map is the principle ticket 06 exposed in passing, which binds
decisions beyond this effort:
[ADR 0005 — Interaction chrome is pinned to the screen](../../../docs/adr/0005-interaction-chrome-is-pinned-to-the-screen.md).
A graphic obeys the drawing scale **if and only if it is exported**; export is
the definition, not a coincidental test, since the document is precisely what
has a real-world size. Size is pinned, position is not — chrome anchors in plan
coordinates so it never drifts off what it points at. The chip appears there as
a *consequence*, not the subject; the Grab zone's constant on-screen margin,
already in `CONTEXT.md`, turns out to be the same rule stated for one case. The
"stored model didn't change" test the ticket proposed does not discriminate —
ADR 0004 records a behavioural rule too.

Files written:

- `CONTEXT.md` — **Placement dimension** rewritten: chip register and its
  explicit non-Dimension framing, the gesture-**and**-selection trigger (every
  Opening of the Selection, a selected Wall silent for its Openings), the screen
  size lock with the centre left in plan coordinates, show-and-overflow, the
  zero clearance case, and the side demoted to choosing the *value* alone. The
  sentence "They replace the wall's Dimension on that side's line for the
  duration of the gesture" is gone — the registers coexist.
- `.scratch/plan-maker/spec.md` — §4 openings rewritten with the same rules and
  ticket links; §4 pan/zoom/dimensions gains the drawing-scale vs screen-pixel
  bullet; amendment note at the top.
- `docs/adr/0005-interaction-chrome-is-pinned-to-the-screen.md` — new.

**Neighbouring entries: nothing else needed changing.** Dimension, Rail,
Selection, Zoom and Tool panel were all read for contradictions and none
contradicts the new rules — Grab zone in fact anticipated ADR 0005, and Tool
panel's per-element measures stay the `selection-panel` effort's business.
Ticket 05 was amended to implement from these documents rather than from the
map's tickets, and pointed at the prototype branch to start from.
