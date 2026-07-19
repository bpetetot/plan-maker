# 01 — Panel prototype

Type: prototype
Status: resolved

## Question

What should the fixed vertical selection panel look and feel like? Build a
throwaway prototype wired to the real selection in the editor so the human can
react to something concrete: panel width, vertical structure and sections,
per-element-type header, spacing/typography, coexistence with the zoom and
undo/redo controls in the bottom-left corner, and dark theme. The retained
choices feed the spec.

## Comments

**Prototype ready — awaiting reaction.** Built per the /prototype UI branch
(sub-shape A: variants mounted on the real editor, wired to the live
selection). Run `npm run dev`, select an element, then flip variants with the
floating bottom pill or the `←`/`→` keys (`?variant=` in the URL is shareable):

- `A — Floating card`: rounded island top-left (Excalidraw-style), sectioned
  with uppercase labels, full-width delete at the bottom. Bottom-left controls
  untouched.
- `B — Full-height dock`: flat full-height column on the left edge, delete
  pinned at the bottom; the zoom/undo controls slide right while it is
  visible.
- `C — Corner stack`: compact card sitting just above the bottom-left
  controls, delete as an icon in the header.
- `popover`: the current behavior, kept as the baseline for comparison.

All variants: wall = display-only Inside/Outside/Overall/Thickness rows
(shortest-face = Inside is a placeholder — real semantics are ticket 02);
door = width preset select + Hinge/Swing + delete; window = select + delete;
multi = count + delete; hidden when the selection is empty. Dark theme works
via the existing CSS variables. Tests and production builds keep the popover
(prototype is dev-only).

Code: `src/editor/SelectionPanelPrototype.tsx` + wiring in
`src/editor/Editor.tsx` (uncommitted working tree; moves to a throwaway
branch once a verdict lands).

## Answer

**Variant A — Floating card — retained, positioned below the burger menu
(Excalidraw-style).** Verdict from the human after flipping through the
variants. Retained choices for the spec:

- Floating rounded card over the canvas, `left: 16px`, `top: 72px` — below
  the burger menu (top 16, ~40px tall) with a 16px gap, matching Excalidraw's
  island placement. Width **232px**.
- Structure: header (icon in a tinted badge + element-type title), sections
  with uppercase muted labels (`Dimensions` for walls, `Width` / `Options`
  for openings), full-width danger Delete button at the bottom.
- Bottom-left zoom/undo controls untouched (no coexistence conflict — the
  card is top-anchored).
- Panel hidden when the selection is empty; dark theme via the existing CSS
  variables (`--surface`, `--border`, `--flip-surface` badge).
- Rejected: B full-height dock (too heavy, moves the bottom-left controls),
  C corner stack.

Wall measure rows shown in the prototype (Inside / Outside / Overall /
Thickness, shortest-face placeholder) are **not** part of this verdict —
which rows and which semantics is ticket 02.

Primary source: branch `prototype/selection-panel` (commit f3c1b29) — the
four variants (A, B, C, popover baseline) and the `?variant=` switcher.
