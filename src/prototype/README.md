# PROTOTYPE — wayfinder ticket 05: drawing interactions & editor layout

Throwaway code. Lives on the `prototype/05-drawing-interactions` branch; do not
build on it or merge it to `main`. The validated decisions are recorded in
`.scratch/plan-maker/issues/05-drawing-interactions-prototype.md`.

## Run

```
npm install
npm run dev
```

Open the printed URL. Switch variants with the floating black pill at the bottom
(or `?variant=A|B|C`, or ←/→ arrow keys).

## The three variants

All three share the same model (shared-vertex planar graph, integer cm, 10 cm
grid) and the same snapping (wall endpoints, 45° axis lock, grid). They disagree
about **gestures and chrome**:

- **A — Floating minimal**: full-bleed canvas, floating pill toolbar,
  click-to-click polyline walls (click start point to close, Esc/double-click to
  stop), contextual popover on the selection, dimensions always on. Pan with
  Space+drag, zoom with scroll or the bottom-right controls.
- **B — Workbench**: classic top bar + left tool rail + right properties panel.
  One wall per press–drag–release; chain by starting a drag on an existing
  corner. Dimensions toggle in the top bar. Editing happens in the panel.
- **C — Zen**: almost no chrome; keyboard-first tools (V/W/D/N), hover-based
  editing (no selection: hover + drag, hover + Delete), Backspace undoes the
  last chain segment, Shift disables snapping, dragging empty space pans. A
  status bar narrates every state.
