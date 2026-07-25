# A model module is named for a domain noun

`src/model/` had a module called `operations.ts`. It named nothing, and it
showed: 576 lines gluing the graph surgery behind `settleEdit` to a bag of
twenty-two one-line setters, whose list followed the fields of `Plan` rather
than the needs of any caller.

A model module is now named for a **domain noun**, and owns both the readings
and the writes of that noun:

```
walls.ts     openings.ts     rooms.ts     rulers.ts     texts.ts
```

One module is named for a verb instead, because the graph it works on has no
single noun: `settle.ts` — `commitPoint`, `commitWall`, `mergeCoincidentPoints`,
`settleEdit`. Four exports, every one of them `plan → plan`. The kernel writes;
the readings live with the noun, which is why `wallsAlongPath` went to
`walls.ts` even though it exists to answer what `commitWall` produced.

## The alternatives

**Split by depth** — `settle.ts` plus one `edits.ts` for the twenty-two
setters. Rejected: it renames the bag without saying what is in it. "I delete
`edits.ts`" means nothing, where "I delete the Opening's writes" names six call
sites.

**Fold each setter into its caller**, as twenty of the twenty-two had exactly
one. Rejected: a single caller is not evidence that something is not of the
domain — `toggleSwing` is the door's law, it just happens to have one button.
Folding it into `ToolPanel.tsx` would move a pure `plan → plan` transform into
a React component, and its test out of the node suite into Chromium.

## The Opening's Rail moved with its noun

ADR 0027 put both Rails in `src/model/rail.ts`. The Opening's writes all bind
on `railedOpeningOffset`, and `rail.ts` reads `openingPlacement` — the noun axis
would have closed a cycle. `openingRail` and `railedOpeningOffset` therefore
live in `openings.ts`, and `rail.ts` keeps the Dimension's Rail alone.

This supersedes ADR 0027 **on its address only**. Its law is untouched: a Rail
yields a position, not bounds. And its section "the two Rails share a word, not
a law" — one binds the drawing, the other binds the plan and can refuse — is
now structural rather than a paragraph.

## Consequences

- **A test is not a caller.** An `export` needs a *production* importer.
  `knip` cannot see this: a test file is a module like any other, which is
  exactly how `ensurePoint`, `addWall`, `splitWall`, `roomDeletion`,
  `deleteRoomLabel` and `moveText` stayed exported with nothing calling them.
  The first three are private again and their behaviour is asserted through
  `commitPoint`, the public door to a host split; the last two are deleted.
- **Deleting a Selection is one operation.** `deleteSelection(plan, refs)`
  absorbs `detectRooms` + `selectionDeletion` + `deleteElements`, which are
  private now. The precondition that used to sit in a comment at the call site
  — read the rooms off the latest plan, never off a render-time closure — is
  structural: the function is handed the plan and reads them itself.
- **A family module reads and writes.** `openings.ts` and `rooms.ts` already
  did both in part; `selection.ts` no longer spreads `plan.rulers` or
  `plan.texts` behind their owners' backs, which is what had left `moveText`
  without a caller in the first place.
- No behaviour changes. 796 → 787 tests: nine assertions were duplicates of
  what the public interface already states.
