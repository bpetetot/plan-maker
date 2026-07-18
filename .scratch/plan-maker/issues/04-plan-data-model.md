# 04 — Plan data model

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

What is the domain model of a plan? To decide via `/grilling` + `/domain-modeling`
with the user:

- How walls are represented (independent segments vs connected graph/polygons) and
  whether rooms are explicit entities or derived from enclosed wall loops.
- How doors/windows attach to walls (offset along the wall, width, swing direction).
- Units and scale: metric only? Real-world coordinates (cm/m) vs pixel coordinates
  with a scale factor. Grid size and snapping increments.
- How automatic dimensions and room areas are derived from the model.
- The resulting TypeScript entity shapes, which also seed the persisted/exported
  JSON format.

Findings from "Plan rendering tech" (coordinate system fit) and "Offline
persistence and undo/redo architecture" (serialization constraints) feed this
discussion.

## Answer

Decided with the user via grilling (2026-07-18):

- **Walls: shared-vertex planar graph.** `Point {id, x, y}` entities plus `Wall {id, startPointId, endPointId, thickness}` edges referencing them. Moving a corner moves every attached wall; closing a room loop is natural. Rejected: independent segments (corners drift apart), room-first polygons (rigid, party-wall merging pain).
- **Rooms: derived, never stored.** Closed faces of the planar graph are detected at render time (minimal-cycle detection); the user draws walls and rooms "appear" with their area. Naming via a lightweight `RoomLabel {id, name, x, y}` annotation: it applies to whichever detected room polygon contains its position — robust to wall edits. Trade-off accepted: no wall-less rooms.
- **Openings: owned by exactly one wall.** Discriminated union on `type`: `Door {wallId, offset, width, hingeSide: 'start'|'end', swing: 'in'|'out'}` and `Window {wallId, offset, width}`. `offset` is the **absolute distance in cm from the wall's start point to the center of the opening** (not a ratio — a door stays 20 cm from its corner when the wall is stretched; clamp if the wall shrinks). Deleting a wall deletes its openings.
- **Units & snapping:** integer centimeters, metric only; SVG renders 1 unit = 1 cm, viewBox handles zoom/pan. Grid at 10 cm with major lines at 1 m; snapping to grid, to existing points, and to 0°/90° angles (45° available, Shift to free the angle — exact interaction to be tuned in ticket 05). Dimension display: meters with 2 decimals ("3,50 m") when ≥ 1 m, else cm.
- **Dimensions & areas: computed at render, never persisted** (keeps zustand/zundo snapshots minimal). Wall length = point-to-point distance (centerline), every wall dimensioned in the MVP; room area = shoelace formula on the detected face polygon, shown in m² at the label position. Centerline measurement slightly overestimates area vs inner-face — accepted, simplicity beats precision. Visual clutter of always-on dimensions is a rendering question for ticket 05.
- **TypeScript shapes / persisted JSON** (same shape for store, IndexedDB, and file export; envelope `{schemaVersion, savedAt, plan}` from ticket 02):

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

  Collections are `Record<id, T>` (O(1) updates, no z-order to maintain); ids are short nanoids; `thickness` is per-wall with a 10 cm default.
- The fog item "versioning/migration story for the persisted plan format" is covered by this format plus ticket 02's `schemaVersion` + ordered-migrations decision; the spec (ticket 07) records it.
