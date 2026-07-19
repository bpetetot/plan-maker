# Plan Maker

A PWA to draw simple 2D floor plans, per `.scratch/plan-maker/spec.md`. Stack:
React + TypeScript + Vite, plain SVG rendering, zustand + zundo (undo/redo),
idb-keyval (autosave), vite-plugin-pwa.

## Development

- `npm run dev` — dev server (service worker enabled via `devOptions`)
- `npm test` / `npm run test:watch` — Vitest
- `npm run typecheck` — tsc
- `npm run lint` / `npm run format` — oxlint / oxfmt
- `npm run build` — typecheck + production build (generates the service worker); `npm run preview` serves it
- `node scripts/generate-icons.mjs` — regenerates the PWA icons in `public/`

## Structure

- `src/model/` — pure domain: types, geometry, snapping, plan operations, room detection
- `src/store/` — zustand plan store, zundo history (drag grouping helpers)
- `src/persistence/` — schema version + migrations + validation, IndexedDB storage, autosave
- `src/transfer/` — JSON export/import envelope, PNG export
- `src/editor/` — the SVG editor (variant A UX), shared render pieces, viewBox hook
- `src/pwa/` — service worker update prompt

## Conventions

- Not in production yet: the stored plan model can change freely — no schema
  migrations for existing plans are required until production
- All code, comments, and documentation should be written in English
- Add comments to the code only when necessary and when they add value
- UI icons come from `lucide-react` exclusively — never hand-rolled SVG or
  Unicode glyphs (exception: the zoom-percentage button, which is a text
  indicator)

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
