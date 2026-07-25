// CONTEXT.md: Rail — the bounded travel line two things slide on (ADR 0027).
// The Dimension's binds the drawing; the Opening's binds the plan and lives
// with its own name, in `openings.ts`.
import { faceSpan } from './faces';
import { formatLength } from './format';
import { wallAxis, wallLength } from './geometry';
import type { Span } from './openings';
import type { Plan, Wall } from './types';

// The editor's measure size, in plan centimetres: a Dimension is drawing and
// zooms with the sheet. Advance width is JetBrains Mono's 0.6 em.
export const DIM_FONT_PX = 8;
const PLATE_PAD_X = 2;
const PLATE_PAD_Y = 1;

// The plate covers the whole text box, spaces included: grid, walls and
// neighbouring dimension lines must never show through a measure.
export const plateBox = (label: string, fontPx: number) => ({
  halfW: (label.length * 0.6 * fontPx) / 2 + PLATE_PAD_X,
  halfH: fontPx / 2 + PLATE_PAD_Y,
});

// Plan units. Tips sit exactly on the extent boundary, so the measured value
// stays exact whatever the head's size.
export const ARROW_LEN = 7;
// The shortest leader worth drawing: below it the two stubs are specks.
const MIN_LEADER = 8;

// ISO: heads sit inside the extent pointing outward, and flip outside pointing
// inward when the span runs out of room. What the Rail keeps clear.
export const arrowsFitInside = (span: number, plateWidth: number) =>
  span >= 2 * ARROW_LEN + plateWidth + MIN_LEADER;

// The side the dimension line sits on: the stored one, else upper for
// horizontal walls and left for vertical ones.
export function dimSide(plan: Plan, wall: Wall): 1 | -1 {
  if (wall.dimPlacement) return wall.dimPlacement.side;
  const axis = wallAxis(plan, wall);
  if (!axis) return -1;
  const raw = (Math.atan2(axis.b.y - axis.a.y, axis.b.x - axis.a.x) * 180) / Math.PI;
  // The ISO flip is what tells the two defaults apart.
  return axis.angle !== raw ? 1 : -1;
}

// The Rail a plated value slides on, as a ratio of the run's length. Shared:
// a Dimension and a Ruler are drawn as one DimensionLine (CONTEXT.md).
export function railedRatio(span: Span, length: number, halfW: number, t: number): number {
  const margin = arrowsFitInside(span.to - span.from, 2 * halfW) ? ARROW_LEN + halfW : halfW;
  let min = (span.from + margin) / length;
  let max = (span.to - margin) / length;
  // A span too narrow for the plate pins it to the middle. Clamped last: the
  // schema requires a ratio in [0, 1].
  if (min > max) min = max = (min + max) / 2;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return Math.min(clamp01(max), Math.max(clamp01(min), t));
}

// The Dimension's Rail. It binds the drawing, not the plan — a wider font
// shortens it, so the same stored wish rails differently at export size.
export function railedDimT(plan: Plan, wall: Wall, side: 1 | -1, t: number, fontPx: number): number {
  const length = wallLength(plan, wall);
  if (length < 1) return 0.5;
  const span = faceSpan(plan, wall, side);
  const half = plateBox(formatLength(Math.max(0, span.to - span.from)), fontPx).halfW;
  return railedRatio(span, length, half, t);
}
