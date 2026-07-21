# Plan Maker

A PWA to draw simple 2D floor plans, per `CONTEXT.md`. Stack:
React + TypeScript + Vite, plain SVG rendering, zustand + zundo (undo/redo),
idb-keyval (autosave), vite-plugin-pwa.

## Development

- `npm run dev` — dev server (service worker enabled via `devOptions`)
- `npm test` / `npm run test:watch` — Vitest
- `npm run typecheck` — tsc
- `npm run lint` / `npm run format` — oxlint / oxfmt
- `npm run build` — typecheck + production build (generates the service worker); `npm run preview` serves it
- `node scripts/generate-icons.mjs` — regenerates the PWA icons in `public/`
- `node scripts/generate-measure-font.mjs` — regenerates the embedded
  measure-font subset (`src/transfer/measureFont.ts`) used by the PNG export

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

## Testing

- `*.test.tsx` runs in browser mode (Chromium), `*.test.ts` in node. The
  extension *is* the environment marker — there is no per-file docblock.
- The target decides the style, for events and queries alike:
  - a control a user could name (button, field, visible text) → semantic
    locator (`page.getBy*`) + `userEvent`
  - a point on the canvas, the `svg`, or `window` → `container.querySelector`
    + the `pointer()` / `mouse()` / `wheel()` helpers
- `key()` / `keyUp()` take no target: a keystroke leaves from whatever holds
  the focus and bubbles, which is what puts the guards on its path — the typing
  guard that silences shortcuts inside a field, and the `stopPropagation` a
  Headless UI panel applies to Escape. When a test turns on *where* the focus
  is, assert it (`expect(document.activeElement).toBe(…)`) rather than assume
  it — a keystroke sent from the wrong element passes for the wrong reason.
- Never construct an event object directly — always a `src/editor/testKit.ts`
  helper (`pointer`, `mouse`, `key`, `keyUp`, `wheel`, `blur`). They carry the mandatory
  init (`pointerId: 1`, `bubbles`), and they `await` React's commit, which
  browser mode does not do on its own. **Every dispatch must be awaited**;
  `pointer()` alone knows that a `pointermove` or a `wheel` commits a turn
  later than a `pointerdown`.
- `unmount()` and `cleanup()` from `vitest-browser-react` are async. An
  un-awaited one overlaps the next `act()` and breaks every later test in the
  file — the failure surfaces far from its cause.
- `page.getByText` matches substrings, unlike testing-library's `getByText`.
  Pass `{ exact: true }` when a shorter string could also match a hint or a
  longer label.
- No `act()` — it does not exist in browser mode. A state change made outside
  any dispatched event still needs a retrying assertion: `expect.element` on a
  locator, `expect.poll` on a hand-rolled DOM read. Reads of the zustand store
  right after an awaited dispatch stay synchronous.

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
