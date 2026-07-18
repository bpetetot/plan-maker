# Room text block: direct manipulation

Status: done

Rework of the room label UX: the room's texts (optional name + area) form one
block manipulated directly on the sheet, Excalidraw-style. Supersedes the
popover-input naming flow. Glossary impact recorded in `CONTEXT.md`
(Room label, Selection).

## Model

- A **Room label** is a marker that positions the room's text block; its
  `name` may be empty. A room without a label shows its area at its centroid.
- The persistence schema already accepts an empty `name` — no migration.
- Room labels are **never part of the Selection** (no click-select, no
  Shift+click, no marquee capture, no group move/delete, no popover).

## Gestures (Select tool)

- **Drag** the block moves it — name and area always together. The block can
  never leave the room containing it at drag start: when the cursor exits, the
  block slides along the boundary (nearest interior point) and picks the
  cursor back up when it returns. On a room with no label, a nameless label is
  created once the pointer crosses the click threshold — creation and move are
  a single undo entry; a plain click never touches the plan.
- **Double-click** on the block or anywhere inside a room edits the name
  inline, directly on the sheet. No default name (`'Room'` is gone).
- **No reset or delete gesture**: the marker is never invisible or in the way
  — it always shows at least the area inside its room, and re-placing it is
  just another drag. Undo covers mistakes.
- When a room's wall loop breaks, its label is left untouched; it resumes its
  place if the loop closes again. A label left outside any room by wall edits
  renders its name when it has one (nothing when nameless), and drags freely —
  that is how it comes back into a room, where the constraint reapplies.

## Inline editing

- Single line. `Enter` and clicking away commit; `Escape` cancels.
- The plan is only touched on commit — one undo entry, none if unchanged.
- Committing an empty name clears the name only: the marker and the area's
  position survive. Committing empty on a room that never had a label creates
  nothing.
- The area line stays visible under the input while editing.

## Rendering

- Room name: 12px (same size as the area), still semibold and `--label`
  colored to keep the name/area hierarchy. PNG export pins the same 12px.
