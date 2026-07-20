# Plan Maker — MVP Specification

Status: draft, under review (wayfinder ticket [07](issues/07-write-mvp-spec.md))
Date: 2026-07-18

Every decision below was locked through the wayfinder map
([map.md](map.md)); each section links the ticket holding the full
rationale. This spec is the single reference for implementation.

Amended 2026-07-19 by the [measure-semantics map](../measure-semantics/map.md):
wall bodies, drawn length, dimension values, and opening placement dimensions
(§2, §4).

## 1. Product overview

A simple, intuitive web app for private individuals to draw 2D floor plans of a
house or apartment — for furnishing, moving, or renovation planning. Simplicity
beats precision: the tool favors fast, satisfying drawing over CAD-grade
accuracy.

- **Platform**: installable, offline-capable PWA; desktop-first (mouse/trackpad).
- **Data**: one single plan per browser, stored locally (IndexedDB), autosaved.
- **Sharing**: export as PNG image; transfer via JSON file export/import.
- **Stack**: React + TypeScript + Vite.

### MVP scope

- Draw walls forming rooms; rooms are detected automatically and show their area.
- Place doors and windows on walls.
- Automatic dimensions on every wall, always visible.
- Undo/redo.
- Automatic local save; installable PWA working fully offline.
- Export PNG, export/import JSON.

## 2. Domain model

Ticket: [Plan data model](issues/04-plan-data-model.md).

Walls form a **shared-vertex planar graph**: `Point` entities are vertices,
`Wall` edges reference them by id. Moving a corner moves every attached wall.

- **Rooms are derived, never stored.** Closed faces of the graph are detected at
  render time (minimal-cycle detection). Naming uses a `RoomLabel` annotation
  that applies to whichever detected room polygon contains its position — robust
  to wall edits. Accepted trade-off: no wall-less rooms.
- **Openings are owned by exactly one wall** (discriminated union on `type`).
  `offset` is the absolute distance in cm from the wall's start point to the
  opening's **center** — a door stays 20 cm from its corner when the wall is
  stretched; clamped if the wall shrinks. Deleting a wall deletes its openings.
- **Units**: integer centimeters, metric only. SVG renders 1 unit = 1 cm.
  Dimension display: meters with 2 decimals ("3,50 m") when ≥ 1 m, else cm.
- **Dimensions and areas are computed at render, never persisted.** A wall's
  dimension measures its rendered silhouette on the side it sits on (§4;
  semantics locked in the
  [measure-semantics map](../measure-semantics/map.md)). Room area is the
  shoelace formula on the interior-face polygon — the real floor surface —
  shown in m² at the label position.

```ts
type Cm = number; // integer centimeters

interface Point   { id: string; x: Cm; y: Cm }
interface Wall    { id: string; startPointId: string; endPointId: string; thickness: Cm } // default 10

interface BaseOpening { id: string; wallId: string; offset: Cm; width: Cm }
interface Door   extends BaseOpening { type: 'door'; hingeSide: 'start' | 'end'; swing: 'in' | 'out' }
interface Window extends BaseOpening { type: 'window' }
type Opening = Door | Window;

interface RoomLabel { id: string; name: string; x: Cm; y: Cm }

interface Plan {
  points:     Record<string, Point>;
  walls:      Record<string, Wall>;
  openings:   Record<string, Opening>;
  roomLabels: Record<string, RoomLabel>;
}
```

Collections are `Record<id, T>` (O(1) updates, no z-order to maintain); ids are
short nanoids. `Door.hingeSide` (which end of the wall holds the hinge) and
`Door.swing` (which side of the wall the door opens toward) are the fields the
popover's flip buttons toggle. (Ticket 05 briefly renamed them to
`flipHinge`/`flipSwing` booleans; spec review reverted to ticket 04's shape.)

## 3. Rendering

Ticket: [Plan rendering tech](issues/01-plan-rendering-tech.md).

**Plain SVG, React-managed** — shapes are JSX driven by React state.

- Browser-native per-element hit-testing; real DOM text for dimension labels.
- Zoom/pan via the `viewBox` attribute.
- Zero bundle cost; at tens of shapes SVG is far below any performance ceiling.
- PNG export needs a small serialize-to-canvas utility (inline fonts) — see §7.
- Runner-up if the scene ever grows to thousands of shapes: react-konva.

## 4. Editor UX and drawing interactions

Ticket: [Drawing interactions and editor layout prototype](issues/05-drawing-interactions-prototype.md)
— variant A "Floating minimal" of the prototype (branch
`prototype/05-drawing-interactions`, commit `ff8c281`) embodies this behavior.

### Layout

- Full-bleed canvas; no persistent side panels.
- Floating pill toolbar top-center: **Select / Wall / Door / Window** with
  **V / W / D / N** shortcuts.
- One-line contextual hint under the toolbar.
- Floating zoom controls (+ / − / Fit) bottom-right.

### Drawing walls

- Click-to-click polyline chain with rubber-band preview and live length label.
  The ghost has square caps (the exact future body) and its label reads the
  overall (hors-tout) extent — axis + thickness. The snap ladder steps the
  endpoint, not that value, so the label reads a 10 cm multiple on an
  orthogonal run and ~14.1 cm multiples on a diagonal (see §Snapping).
- Clicking the chain's start point closes the room.
- Esc or double-click ends the chain; Alt temporarily disables snapping.

### Snapping

- To wall endpoints — green ring feedback.
- 45° axis lock — dashed green guide from the anchor. The endpoint steps by
  whole grid multiples *on each component* relative to the anchor, so a
  diagonal keeps an exact 45° and steps by ~14.1 cm; from an on-grid anchor it
  lands on a grid intersection, from an off-grid one it inherits the offset.
- 10 cm grid fallback — small green dot. The sheet shows a visible grid by
  default — dashed minor lines every 10 cm (the snap step), solid major lines every 50 cm,
  fading out when too dense on screen. A toggle next to the zoom controls
  shows/hides it (per-device preference); purely visual, grid snapping stays
  active either way.

### Selection and editing

- Click an element to select; a floating contextual popover appears next to it.
- Walls: endpoint handles to reshape, drag the body to move (grid-stepped);
  popover shows length + Delete.
- Delete/Backspace deletes the selection; Esc deselects.

### Doors and windows

- Placement: hover a wall + click, with a ghost preview clamped to fit the wall.
- Selection: click the opening's span on the wall (opening hit targets sit above
  wall hit targets).
- Move by dragging along the wall; resize via a width select in the popover
  (60–160 cm).
- While placing or moving, **placement dimensions** flank the opening on the
  interior side when exactly one side of the wall faces a room (else the wall
  dimension's side), each chaining from the nearest neighbouring opening's
  edge when one intervenes, else from the silhouette end
  ([ticket](../measure-semantics/issues/04-opening-placement-dims.md)).
- Doors additionally get **⇋ Hinge** and **⇵ Swing** flip buttons in the
  popover.

### Pan, zoom, dimensions

- Scroll wheel zooms toward the cursor; Space+drag or middle-drag pans; zoom
  buttons + Fit as fallback.
- Dimensions are always visible on every wall (no toggle in the MVP).

### Wall bodies and dimension semantics

Tickets: [wall anchor](../measure-semantics/issues/02-wall-anchor-model.md),
[dimension display](../measure-semantics/issues/03-dimension-display-prototype.md);
prototype on branch `prototype/dim-display-variants`.

- Wall bodies are mitered at junctions; at a free end the body overhangs its
  Point by half the thickness (square cap). **Junction patches** — the
  polygon of all incident face corners around a Point — fill the central
  gaps outlines leave at T and angled crossings.
- A dimension measures **exactly the rendered silhouette on the side it sits
  on** (same corners as the outline: mitered faces at junctions, overhang at
  free ends), drawn as a broken dimension line with perpendicular ticks at
  the measured extent. Exterior of a closed room = hors-tout, invariant once
  drawn; interior = edge-to-edge room span. A value may refine when a new
  junction forms — accepted, made legible by the ticks.
- Dragging a dimension is purely positional (t along the wall, side across
  it); crossing sides switches between the interior and exterior readings.
- PNG export renders the same bodies and dimension rules (§7).

## 5. State, persistence, and undo/redo

Ticket: [Offline persistence and undo/redo architecture](issues/02-offline-persistence-and-undo.md).

- **Store**: `zustand` 5.x; optionally `immer` for updates.
- **Undo/redo**: `zundo` 2.x temporal middleware — immutable snapshots,
  `partialize` to exclude selection/camera state, history `limit` ~100,
  pause/resume (or `handleSet`) to group drags into one undo step. History is
  **in-memory only, never persisted**. Import resets it (§7).
- **Persistence**: `idb-keyval` — the whole plan as one atomic record
  `set("plan:current", { schemaVersion, savedAt, plan })`, plus a `plan:backup`
  last-known-good key, and **ordered schema migrations** run on load.
- **Autosave**: subscribe to the store, debounce 300–500 ms, flush on
  `visibilitychange`/`pagehide` (not `beforeunload`), surface
  `QuotaExceededError` in the UI, Web Lock for single-writer tab semantics.
- Call `navigator.storage.persist()` on startup.

## 6. PWA setup

Ticket: [PWA tooling and service worker strategy](issues/03-pwa-tooling.md).

- `vite-plugin-pwa` v1.x with the default `generateSW` (Workbox) strategy.
- Precache the entire static build (`**/*.{js,css,html,ico,png,svg,woff2}`);
  default `navigateFallback: 'index.html'`, `cleanupOutdatedCaches`.
- **Update flow**: `registerType: 'prompt'` — never `autoUpdate`, which would
  force-reload and lose unsaved in-memory editor state. React `ReloadPrompt`
  component on `useRegisterSW` (`virtual:pwa-register/react`), plus an hourly
  `registration.update()` check.
- Manifest: `name`, `short_name`, `id`, `start_url`, `display: 'standalone'`,
  `theme_color`, 192/512 px icons including a maskable 512.
- Offline testing: `devOptions.enabled: true` in dev; `vite build && vite
  preview` + DevTools offline toggle for the real service worker.

## 7. Export and import

Ticket: [Export formats (PNG image, JSON file)](issues/06-export-formats.md).

### PNG export

- **WYSIWYG, zero options, no dialog** — one click, one file. Renders exactly
  what the editor shows: walls, openings, room labels, dimensions. No grid, no
  UI chrome (selection, toolbar).
- Framed on the plan's bounding box plus a fixed **50 cm real-world margin**;
  rasterized at **2 px/cm**, capped at **4096 px on the long side** (density
  reduced to fit for very large plans). Output is independent of current
  zoom/pan — two exports of the same plan are pixel-identical.
- **Opaque white background**; no title, date, or scale legend.

### JSON export / import

- File schema = persisted model + envelope:
  `{ "format": "plan-maker", "version": <schemaVersion>, "plan": { … } }`.
  `format` cleanly rejects foreign JSON; `version` is the same schema version as
  the IndexedDB record, so import replays the **same migration chain** as
  storage — one schema, one migration path.
- **Import always replaces** (single-plan app). Silent if the canvas is empty
  (no walls); otherwise explicit confirmation ("Replace the current plan? It
  will be lost."). Import **resets the undo/redo history**. Invalid files or
  unknown `format` are rejected with an error, leaving the current plan
  untouched.
- File names: `plan-YYYY-MM-DD.json` / `plan-YYYY-MM-DD.png`; plain `.json`
  extension; the import picker accepts `.json` / `application/json`.

## 8. Tech stack summary

| Concern | Choice |
| --- | --- |
| Framework | React + TypeScript + Vite |
| Rendering | Plain SVG (React-managed), viewBox zoom/pan |
| State | zustand (+ optional immer) |
| Undo/redo | zundo (in-memory snapshots) |
| Persistence | idb-keyval, single-record autosave + backup key |
| PWA | vite-plugin-pwa (generateSW, prompt update) |
| Ids | nanoid |
| Testing | Vitest |
| Lint / format | oxlint / oxfmt (Oxc toolchain) |

Tests matter for quality: Vitest is the test runner (native Vite integration,
same config and transforms as the app). Linting is oxlint and formatting is
oxfmt, both from the Oxc toolchain.

## 9. Open questions (not blocking implementation start)

Carried from the map's fog; to settle during implementation or a follow-up
effort:

- Empty state and onboarding: what a first-time user sees and how they learn
  the tool.
- Full keyboard shortcut set beyond undo/redo and V/W/D/N.
- Testing strategy for the editor: the runner is locked (Vitest, §8); the unit
  vs interaction test split remains to be shaped during implementation.
- App name, visual identity, and basic theming.
- Accessibility and internationalization (French/English UI?) ambitions.

## 10. Out of scope (v2+)

- Furniture library.
- Multi-plan management (home page listing plans).
- Sharing / collaboration (requires a server; conflicts with offline-first).
- Mobile/touch support.
- Multi-device sync (JSON file export covers transfer).
- "Bare plan" PNG variant (no dimensions); PNG export options.
