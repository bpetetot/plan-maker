# Spec: Selection panel

Replaces the selection popover with a fixed floating card on the left,
Excalidraw-style, showing per-element parameters and actions. Assembled from
the resolved wayfinder tickets ([map](map.md)); each section links the ticket
holding the decision's full detail and rejected alternatives.

## 1. Placement and anatomy

([01 — Panel prototype](issues/01-panel-prototype.md))

- Floating rounded card over the canvas, `left: 16px`, `top: 72px` — below
  the burger menu (top 16, ~40px tall) with a 16px gap. Width **232px**.
- Chrome: `--surface` background, `--border` 1px border, 10px radius, shadow
  — same family as the existing `.floating` chrome. Dark theme via the
  existing CSS variables only.
- Structure, top to bottom:
  1. **Header**: element-type icon in a tinted badge (`--flip-surface` /
     `--flip-text`) + element-type title (14px, semibold).
  2. **Sections** with uppercase muted labels (10.5px, letter-spacing,
     `--text-faint`): rows are label (`--text-muted`) left, value
     (tabular-nums) right, 13px.
  3. **Delete**: full-width danger button (existing `.danger` palette) at
     the bottom.
- The bottom-left zoom/undo controls do not move.
- The panel is **hidden when the selection is empty**. The selection
  popover, its anchoring code, and its CSS are removed.
- Desktop only (mobile is out of scope globally, plan-maker spec §10).
- UI icons from `lucide-react` exclusively (repo convention).

## 2. Content per selection

Selection model unchanged (`ElementRef[]`, walls and openings only).

### Wall ([02 — Wall in/out measure semantics in the panel](issues/02-wall-measure-semantics.md))

Title "Wall". One `Dimensions` section, **display-only**:

- **Nominal case** — the wall borders exactly one room (`interiorSide` in
  `src/model/rooms.ts` returns a side):
  - `Interior` — the interior side's silhouette reading (tape-measurable
    span between mitered Face corners), identical to that side's canvas
    Dimension.
  - `Exterior` — the exterior side's reading, i.e. the hors-tout extent.
  - `Thickness` — the wall's thickness.
- **Hard cases** — `interiorSide` returns null (standalone wall, party wall
  between two rooms, wall jutting into its own room): no orientation is
  claimed.
  - `Length` — the hors-tout extent, the only length shown.
  - `Thickness` — unchanged.
- No "Overall" row (redundant: Exterior and Length are the hors-tout).
- Values computed from `faceLength` (`src/model/faces.ts`) +
  `interiorSide`; never stored, so panel and canvas can never disagree.

### Door

Title "Door":

- `Width` section: the existing preset select (`OPENING_WIDTHS`, cm).
- `Options` section: the existing Hinge and Swing toggle buttons
  (`toggleHingeSide`, `toggleSwing`).
- Delete.

### Window

Title "Window": `Width` preset select + Delete.

### Multi-selection

Title "N elements" (count) + Delete — the current minimum, carried over.

## 3. Interactions

([04 — Panel interaction details](issues/04-panel-interaction-details.md))

- **Focus**: selecting an element never moves focus into the panel. Tab
  reaches the panel's controls in natural DOM order, no focus trap. The
  existing `isTypingTarget` rule keeps suspending canvas shortcuts (Delete,
  Escape, 1-4) while a panel control is focused.
- **During canvas drags** (wall point, group, opening): the panel stays
  visible and its values update live. No dimmed/inert/hidden state.
- **Show/hide**: instant — no animation. Content switches instantly when
  the selection changes type.
- **Short viewports**: card height capped to the space between its anchor
  (top 72px) and the bottom-left controls zone; internal vertical scroll
  beyond (`max-height` + `overflow-y: auto`).

## 4. Out of scope

(See the [map](map.md) for detail.)

- Editable wall measures (typed resize).
- Free numeric input for opening widths.
- Richer multi-selection (per-type counts, group actions).
- Panel visible on empty selection (tool options).
- Mobile/touch.

## 5. References

- Primary source: branch `prototype/selection-panel` (commit f3c1b29) — the
  retained variant A and the rejected B/C/popover-baseline variants.
- Vocabulary: `CONTEXT.md` (Dimension, Face, silhouette readings).

## 6. Implementation issues

- [05 — Selection panel replacing the popover](issues/05-selection-panel.md)
- [06 — Wall measure rows](issues/06-wall-measure-rows.md)
