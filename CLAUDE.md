# Plan Maker

A PWA to draw simple 2D floor plans, per `CONTEXT.md`. Stack:
React + TypeScript + Vite, plain SVG rendering, zustand + zundo (undo/redo),
idb-keyval (autosave), vite-plugin-pwa.

## Development

- `npm run dev` — dev server (service worker enabled via `devOptions`)
- `npm test` / `npm run test:watch` — Vitest
- `npm run typecheck` — tsc
- `npm run lint` / `npm run format` — oxlint / oxfmt
- `npm run knip` — knip: unused files, dependencies and exports
- `npm run build` — typecheck + production build (generates the service worker); `npm run preview` serves it
- `node scripts/generate-icons.mjs` — regenerates the PWA icons in `public/`
- `node scripts/generate-measure-font.mjs` — regenerates the embedded
  measure-font subset (`src/transfer/measureFont.ts`) used by the PNG export

## Structure

- `src/model/` — pure domain, one module per noun (walls, openings, rooms,
  rulers, texts) plus geometry, snapping, and the `settle.ts` graph kernel
- `src/store/` — zustand plan store, zundo history (drag grouping helpers)
- `src/persistence/` — schema version + migrations + validation, IndexedDB storage, autosave
- `src/preferences/` — the per-device preference table (grid, measures, snap, theme)
- `src/transfer/` — JSON export/import envelope, PNG export
- `src/sheet/` — the drawing itself, by family (walls, openings, rooms, texts,
  measures) behind `PlanScene`; called by both the editor and the PNG export
- `src/editor/` — the SVG editor (variant A UX), interaction chrome, viewBox hook
- `src/pwa/` — service worker update prompt

`src/` holds only what ships. The suite lives in `tests/`, mirroring `src/`
directory for directory, with the shared support at its root: `kit.ts` (event
dispatch), `helpers.ts` (plan fixtures), `panel.ts` (tool-panel readers),
`harness.tsx` (`EditorWithHotkeys`), `setup.browser.ts` (the browser project's
`setupFiles`).

`tests/editor/` is the one folder that does not mirror module for module: 49 of
its 52 files drive `Editor.tsx` through its surface, so they are grouped by the
noun they exercise — `view/`, `drag/`, `tools/`, `text/`, `toggles/`, `ruler/`,
`room/`, `shortcuts/` — leaving `chrome` and `pointer` at the root as the module
tests they are. A test named for a module keeps the module's name; a test named
for a scenario drops the prefix its folder already carries. The tool panel on an
entity belongs in that entity's folder — `text/panel.test.tsx`,
`room/panel.test.tsx`, `ruler/panel.test.tsx` — leaving `tools/toolPanel.test.tsx`
for what has no folder of its own.

`vitest.config.ts` is the test config, `vite.config.ts` the build config. Vitest
loads only the former, which is why it declares its own `react()` plugin.

## Conventions

- Not in production yet: the stored plan model can change freely — no schema
  migrations for existing plans are required until production
- All code, comments, and documentation should be written in English
- Comments: max 2 lines, five justified cases only — see `docs/agents/comments.md`
- A symbol is `export`ed only when another module imports it — never ahead of a
  hypothetical caller. Add the `export` in the commit that adds the import;
  `knip` enforces it
- **A test is not a caller** (ADR 0032). An `export` needs a *production*
  importer: an internal seam kept public for its own test is a frozen seam, and
  `knip` cannot see it — a test file is a module like any other. Assert the
  behaviour through the interface that has a real caller
- A module in `src/model/` is named for a domain noun and owns that noun's
  readings *and* its writes (ADR 0032); `settle.ts` is the one exception, named
  for what it does because the graph it settles has no single noun
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
- `EditorWithHotkeys` pins the hotkey platform to `linux`, so `Mod` resolves to
  `Ctrl` wherever the suite runs: for a `Mod` shortcut dispatch `{ ctrlKey: true }`,
  never `{ metaKey: true }`. Pass `platform="mac"` only to exercise Cmd on purpose.
- Never construct an event object directly — always a `tests/kit.ts`
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
