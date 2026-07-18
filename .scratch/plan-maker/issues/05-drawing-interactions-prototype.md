# 05 — Drawing interactions and editor layout prototype

Type: prototype
Status: resolved
Blocked by: 01, 04

## Question

How should drawing feel? Build a cheap throwaway prototype (via `/prototype`) with
the chosen rendering tech to let the user react to:

- Wall drawing gesture: click-to-click polyline vs drag per wall; how to close a
  room; how to stop drawing.
- Snapping: to grid, to wall endpoints, to horizontal/vertical axes — and how the
  feedback looks.
- Selection and editing: moving walls, dragging endpoints, deleting.
- Placing doors/windows onto existing walls.
- Zoom/pan gestures and overall editor layout (toolbar placement, properties
  panel, dimension display toggle).

Resolution records the interaction decisions; the prototype itself is a linked
throwaway asset, not the deliverable.

## Comments

**2026-07-18 — Prototype built, awaiting user reactions.**

Asset: branch `prototype/05-drawing-interactions` (commit `7808e78`), a
standalone Vite + React + TS app with three structurally different editor
variants behind `?variant=` (floating switcher pill, ←/→ to cycle). Run with
`npm install && npm run dev`. Details in `src/prototype/README.md` on that branch.

All variants share the locked model (shared-vertex graph, integer cm, 10 cm
grid) and snapping (endpoints, 45° axis lock, grid); they disagree on gesture
and chrome:

- **A — Floating minimal**: click-to-click polyline walls (click start to
  close, Esc/dblclick to stop), floating pill toolbar, contextual popover on
  selection, dimensions always on.
- **B — Workbench**: press–drag–release = one wall (chain by starting on a
  corner), left tool rail + right properties panel, dimensions toggle.
- **C — Zen**: keyboard-first (V/W/D/N), hover-based editing (no selection),
  Backspace undoes last segment, Shift disables snap, drag empty space to pan.

Open questions for the user: wall gesture (click-click vs drag), room closing
feel, snap feedback (green ring/guides), edit surface (popover vs panel vs
hover), doors/windows placement flow, pan gesture, dimension display policy.

## Answer

Variant **A ("Floating minimal")** won on every axis, refined over three
feedback rounds (2026-07-18). Decisions locked for the MVP editor:

- **Editor layout**: full-bleed canvas; floating pill toolbar top-center
  (Select / Wall / Door / Window with V/W/D/N shortcuts); one-line contextual
  hint under the toolbar; floating zoom controls (+ / − / Fit) bottom-right;
  no persistent side panels.
- **Wall drawing**: click-to-click polyline chain with rubber-band preview and
  live length label. Clicking the chain's start point closes the room; Esc or
  double-click ends the chain; Alt temporarily disables snapping.
- **Snapping**: wall endpoints (green ring feedback), 45° axis lock (dashed
  green guide from the anchor), 10 cm grid fallback (small green dot). Feedback
  style validated as-is. **The grid itself is not displayed** — grid snapping
  stays active with no visual grid (a display toggle can be revisited later).
- **Selection & editing**: click an element to select it; a floating contextual
  popover appears next to it (no fixed properties panel). Walls: endpoint
  handles to reshape, drag the body to move (grid-stepped), popover shows
  length + Delete. Delete/Backspace deletes the selection; Esc deselects.
- **Doors & windows**: placement by hovering a wall + click, with a ghost
  preview clamped to fit the wall. Selection by clicking the opening's span at
  the wall (opening hit targets sit above wall hit targets). Move by dragging
  along the wall; resize via a width select in the popover (60–160 cm). Doors
  additionally get **⇋ Hinge** (left/right) and **⇵ Swing** (which side of the
  wall) flip buttons.
- **Data-model amendment to [Plan data model](04-plan-data-model.md)**: `Door`
  gains two booleans, `flipHinge` and `flipSwing`, to encode hinge end and
  swing side. *(Reverted during spec review — ticket 07: the user kept ticket
  04's `hingeSide: 'start'|'end'` / `swing: 'in'|'out'` fields; the popover
  flip buttons toggle those instead.)*
- **Pan/zoom**: scroll wheel zooms toward the cursor; Space+drag or
  middle-drag pans; zoom buttons + Fit as fallback.
- **Dimensions**: always visible on every wall (no toggle in the MVP).

Asset: throwaway branch `prototype/05-drawing-interactions` (final commit
`ff8c281`) — three variants behind `?variant=`; variant A embodies the locked
behavior.
