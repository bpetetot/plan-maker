# Restyle the Dimension register: teal ink, ISO arrowheads

Status: resolved
Type: prototype

## Question

The Dimension register (extent line, extent markers, value text) lived in the
same slate greys as the Grid and could be confused with it. Which style —
form × tint — separates it cleanly, in both themes and in the PNG export?

## Method

Interactive throwaway prototype (grilling session, 2026-07-21): a realistic
mini-plan on the real grid (exact opacities, zoom fade, embedded measure
font), 4 forms (perpendicular ticks / 45° oblique ticks / ISO arrowheads /
modern overlay pills) × 4 tints (current grey / terracotta / teal / violet),
light + dark themes, zoom slider, selected-state vignette.

The prototype is captured on the throwaway branch `proto/dim-style`
(`.scratch/dim-style/prototype.html` there — a standalone HTML page).

## Answer

**ISO arrowheads in teal.** Decided by the user after manipulating the
prototype. The tint separates the measure register from the grid by hue
rather than grey value, stays clear of the selection blue and the snap
green, and the arrowheads keep the measured extent legible. On short spans
the heads move outside the extent onto leader lines, pointing inward (ISO
convention when space runs out).

Implemented in the app: `--dim-line` / `--dim-text` teal tokens (light
#93c9c3 / #1d7d74, dark #4d7d78 / #7fc4bc), arrowheads in
`src/editor/render.tsx` (ExtentLine), pinned light values in the PNG
export. `--rail` (drag feedback) was decoupled from the dimension ink in
the process. No ADR: easily reversible styling, no lasting trade-off.
