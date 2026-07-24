# A stored ruler obeys the measures toggle

The Measure is *computed from the plan, never stored*, and ADR 0008 drew a clean
line under that: what the Measures toggle governs is exactly the set of graphics
that are *permanent and exported* — the wall Dimension and the Room area — while
gesture chrome is left out. On that reading "permanent" and "computed" travelled
together, because every measure the plan drew was a number it derived from its
own geometry.

The **Ruler** breaks the pairing. It is a measurement the user hand-places and
expects to keep, so it is **stored** in the plan JSON like a wall. But it is
drawn as a Dimension — arrowheads, a line, a plated length — and it is a number
added to the sheet, the very kind of noise the Measures toggle exists to clear.

The decision is that these two facts are settled on **two independent axes**, and
the Ruler takes the unusual corner:

- **Persistence** — always. A Ruler is part of the plan, round-tripped through
  save, JSON export, and reload unconditionally. The file envelope carries no
  visibility state, so a Ruler is in the plan whether or not measures are showing
  when it is exported.
- **Visibility** — gated by the Measures toggle, exactly as a Dimension is.
  Hidden on screen and absent from the PNG export while measures are hidden, and
  **inert** while hidden: it cannot be clicked, marqueed, or Select-all'd, so a
  clean sheet stays clean and offers no invisible drag target.

**ADR 0008 stays true, unamended.** Its membership rule quantifies over graphics
the toggle governs on the sheet, and the Ruler's graphic *is* one — permanent,
exported, hideable. What ADR 0008 never claimed is the converse: that everything
the toggle hides is computed. Storage is an orthogonal question about where the
number's *definition* lives, not about whether its *drawing* is a measure. The
Ruler is stored data whose drawing is, for the toggle's purposes, a measure —
and the two axes simply do not have to agree.

## Considered Options

- **Make the Ruler always visible**, ignoring the toggle, since it is stored like
  a wall. Rejected: a Ruler is precisely a number the user adds to the sheet, and
  hiding measures is how a clean sheet is produced to share (ADR 0008). A
  persisted number that ignored the toggle would punch the noise straight back
  through the one escape ADR 0008 built.
- **Give each Ruler its own visibility flag** in the plan. Rejected: it puts a
  per-device display concern into the persistence schema and asks the user to
  manage two hiding mechanisms for the same kind of graphic. The Measures toggle
  already answers "show the numbers or not"; a Ruler is a number.
- **Treat the Ruler as pure chrome** — not stored, recomputed or re-drawn each
  session — so it would fall out of the schema and the export cleanly. Rejected:
  the whole point of the feature is a measurement the user places *and keeps*.
  Chrome is what belongs to a gesture; a Ruler outlives its gesture.
- **Persist the Ruler but exempt it from the toggle in the export only**, showing
  it on every printed sheet. Rejected: it re-splits the WYSIWYG guarantee ADR
  0008 restored, exporting something the screen does not show.

## Consequences

- Storage and visibility are decoupled in the code: `addRuler` /
  `moveRulerEndpoint` / `deleteRuler` and `validatePlan` treat the Ruler as plain
  plan geometry, while the editor scene and `PlanScene` gate the `RulerLabel`
  loop on `measuresVisible` — the same predicate that gates the `DimLabel` loop.
  Neither reader consults the other.
- Selection, marquee, Select-all, and hover for Rulers are all gated on measures
  being shown, so "hidden" means hidden for interaction too, not merely for
  paint — mirroring ADR 0008's rule that no selection or gesture brings a hidden
  measure back.
- The JSON round-trip needs no visibility branch: the envelope never carried a
  toggle state, so "persisted regardless of the Measures toggle" is already what
  a plain round-trip test asserts.
- The Measure definition in CONTEXT.md names the Ruler as its one deliberate
  exception, so the membership rule ("a measure is permanent and exported")
  keeps a single documented dissent rather than quietly admitting a second kind
  of thing.
