# Wayfinder map — Plan Maker MVP

Label: wayfinder:map

## Destination

A written MVP spec (`.scratch/plan-maker/spec.md`) with every product and technical
decision locked: scope, data model, rendering tech, offline persistence, PWA setup,
drawing interactions, and export formats. Implementation starts afterwards in
separate sessions — this map plans, it does not build.

## Notes

- Domain: a simple, intuitive web app for private individuals to draw 2D floor
  plans (house, apartment). Simplicity beats precision.
- Skills to consult while resolving tickets: `/grilling`, `/domain-modeling`,
  `/prototype`, `/research`.
- The user converses in French; all repo artifacts (map, tickets, spec, code) are
  written in English per repo conventions.
- Locked during initial framing (2026-07-18):
  - Target users: private individuals (furnishing, moving, renovation planning).
  - MVP drawing scope: walls/rooms, doors & windows, automatic dimensions.
  - Single plan per browser (no multi-plan management in MVP).
  - Export as image (PNG) + import/export as a JSON file.
  - Installable PWA, local data (IndexedDB), automatic save.
  - Desktop-first (mouse/trackpad).
  - Stack foundation: React + TypeScript + Vite.
  - Undo/redo included in the MVP.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Plan rendering tech](issues/01-plan-rendering-tech.md) — plain React-managed SVG (native hit-testing, DOM text for dimensions, viewBox zoom/pan, zero bundle cost); runner-up react-konva if the scene ever reaches thousands of shapes.
- [Offline persistence and undo/redo architecture](issues/02-offline-persistence-and-undo.md) — idb-keyval single-record autosave (debounced, flush on visibilitychange, backup key, schema migrations) + zustand/zundo in-memory snapshot history, never persisted; `navigator.storage.persist()` on startup.
- [PWA tooling and service worker strategy](issues/03-pwa-tooling.md) — vite-plugin-pwa v1 with generateSW precache-all and `registerType: 'prompt'` (auto-update would reload and lose unsaved editor state) + React ReloadPrompt; manifest with id/start_url/standalone and 192/512+maskable icons.
- [Plan data model](issues/04-plan-data-model.md) — shared-vertex planar graph (Point + Wall by ids); rooms derived from closed loops at render, named via RoomLabel annotations; openings (Door/Window union) owned by one wall with absolute center offset; integer cm, metric only, 10 cm grid with point/angle snapping; dimensions and areas computed at render, never stored; `Record<id, T>` collections, nanoid ids.
- [Drawing interactions and editor layout prototype](issues/05-drawing-interactions-prototype.md) — variant A "Floating minimal" won: full-bleed canvas, floating toolbar (V/W/D/N), click-to-click polyline walls (click start to close, Esc/dblclick to end), endpoint/45°/grid snapping with green feedback but no visible grid, contextual popover editing, openings placed by hover+click and edited in place (doors get hinge/swing flips — `Door` gains `flipHinge`/`flipSwing`), Space/middle-drag pan + wheel zoom, dimensions always on. Prototype on branch `prototype/05-drawing-interactions`.
- [Export formats (PNG image, JSON file)](issues/06-export-formats.md) — PNG: WYSIWYG (dimensions on, no grid/UI), framed on plan bounds + 50 cm margin, 2 px/cm capped at 4096 px, opaque white, no title/legend, zero options. JSON: `{format, version, plan}` envelope around the persisted model, import replays the storage migration chain; import replaces (silent if canvas empty, confirm otherwise) and resets undo history; files named `plan-YYYY-MM-DD.json`/`.png`.
- [Write the MVP spec](issues/07-write-mvp-spec.md) — spec written at [spec.md](spec.md) and reviewed with the user; review reverted ticket 05's `flipHinge`/`flipSwing` amendment back to `hingeSide`/`swing`. **Destination reached — the map is complete.**

## Not yet specified

Remaining fog was judged non-blocking for implementation and carried into
[spec.md §9 "Open questions"](spec.md) (onboarding/empty state, full keyboard
shortcuts, testing strategy, app name/theming, accessibility & i18n). Nothing
left to chart on this map.

## Out of scope

- Furniture library — deferred to v2.
- Multi-plan management (home page listing plans) — deferred to v2.
- Sharing / collaboration — requires a server, conflicts with offline-first.
- Mobile/touch support in the MVP — desktop-first; revisit later.
- Multi-device sync — out of this effort; the JSON file export covers transfer.
