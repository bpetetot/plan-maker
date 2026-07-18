# 07 — Write the MVP spec

Type: task
Status: resolved
Blocked by: 03, 04, 05, 06

## Comments

**2026-07-18 — Draft spec written, awaiting user review.**

Assembled every locked decision from tickets 01–06 into
[spec.md](../spec.md). Reconciled the ticket 05 data-model amendment: `Door`
now carries `flipHinge`/`flipSwing` booleans, superseding ticket 04's
`hingeSide`/`swing` fields. The map's remaining fog items are listed in the
spec as §9 "Open questions (not blocking implementation start)". Resolution
pending the user's review.

**2026-07-18 — Post-review addition.** The user locked the quality tooling:
Vitest for tests, oxlint + oxfmt (Oxc) for linting/formatting. Recorded in
spec §8; the §9 testing open question now covers only the test-strategy split.

## Answer

Spec written at [spec.md](../spec.md) and reviewed with the user (2026-07-18).
Two review outcomes:

- `Door` keeps ticket 04's `hingeSide: 'start'|'end'` / `swing: 'in'|'out'`
  fields — ticket 05's `flipHinge`/`flipSwing` boolean amendment is reverted
  (note added on that ticket); the popover flip buttons toggle these fields.
- Opening width management was confirmed as already covered (`width: Cm` in the
  model, popover width select 60–160 cm) — no spec change.

The map's remaining fog items are carried into spec §9 as open questions, not
blocking implementation start. This ticket was the destination: the map is
complete.

## Question

Assemble every locked decision from this map into `.scratch/plan-maker/spec.md`:
product scope, user flows, domain model, rendering tech, persistence and undo/redo
architecture, PWA setup, drawing interactions, export formats, and the out-of-scope
list. Review it with the user. Its completion is the destination of this map.
