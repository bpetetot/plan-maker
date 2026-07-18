# 06 — Export formats (PNG image, JSON file)

Type: grilling
Status: resolved
Blocked by: 04

## Question

Pin down the two export paths:

- PNG export: rendered at what resolution/scale? With or without grid, dimensions,
  background? Any margin/title conventions?
- JSON file import/export: is the file format simply the persisted data model
  (plus a format-version field), or a distinct interchange schema? What happens on
  importing a file into a browser that already holds a plan (replace vs prompt)?
  File naming and extension (`.json` vs a custom extension)?

Depends on the plan data model, which defines what gets serialized.

## Answer

Resolved by grilling session (2026-07-18).

### PNG export

- **WYSIWYG, zero options.** The PNG renders exactly what the editor shows: walls,
  openings, room labels, dimensions. No grid (not visible in the editor either), no
  UI chrome (selection handles, toolbar). No export dialog — one click, one file.
  A "bare plan" (no dimensions) variant is v2 material.
- **Framing & resolution.** Frame on the plan's bounding box (not the viewport),
  rasterized at a fixed **2 px/cm**, capped at **4096 px on the long side** (density
  is reduced to fit for very large plans). Output is independent of the current
  zoom/pan: two exports of the same plan are pixel-identical.
- **Dressing.** Fixed margin equivalent to **50 cm of real-world space** around the
  bounding box (room for outer dimensions). **Opaque white background** (transparent
  PNGs are unreadable on dark surfaces). No title, date, or scale legend — the MVP
  has no plan name, and a printed scale becomes wrong the moment the image is
  resized.

### JSON import/export

- **Schema = persisted model + envelope.** The file is
  `{ "format": "plan-maker", "version": <schemaVersion>, "plan": { …persisted model… } }`.
  `format` exists solely to cleanly reject foreign JSON at import; `version` is the
  same schema version as the IndexedDB record, so import replays the **same
  migration chain** as storage — one schema, one migration path to maintain.
- **Import into an existing plan.** Single-plan app, so import always replaces.
  If the canvas is empty (no walls): import silently. Otherwise: explicit
  confirmation ("Replace the current plan? It will be lost."). Import **resets the
  undo/redo history** (the in-memory zundo stack describes the old plan; keeping it
  would allow undoing into an incoherent state). An invalid file or unknown
  `format` is rejected with an error message, leaving the current plan untouched.
- **File naming.** Plain **`.json`** extension (a custom extension buys nothing
  without OS file association; the `format` field already identifies the file).
  Generated names: **`plan-YYYY-MM-DD.json`** and **`plan-YYYY-MM-DD.png`** (date
  of export; browsers auto-suffix `(1)` on same-day collisions). The import picker
  accepts `.json` / `application/json`.
