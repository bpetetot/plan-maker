// CONTEXT.md: Rail — the bounded travel line two things slide on (ADR 0027).
// A railed value is where a stored wish actually sits, so the sheet draws and
// the gesture grabs the same position.
import { faceSpan, fullThicknessSpan } from './faces';
import { formatLength } from './format';
import { labelAngle, wallLength, wallPoints } from './geometry';
import type { Span } from './openings';
import { clampCenter, openingPlacement } from './openings';
import type { Opening, Plan, Wall } from './types';

// Editor size; the PNG export passes its own via PlanScene. Advance width is
// JetBrains Mono's 0.6 em.
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
  const [a, b] = wallPoints(plan, wall);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const raw = (Math.atan2(dy, dx) * 180) / Math.PI;
  return labelAngle(dx, dy) !== raw ? 1 : -1;
}

// The Dimension's Rail: a ratio of the wall's length keeping the plate clear
// of the arrowheads. It binds the drawing, not the plan — a wider font
// shortens it, so the same stored wish rails differently at export size.
export function railedDimT(plan: Plan, wall: Wall, side: 1 | -1, t: number, fontPx = DIM_FONT_PX): number {
  const length = wallLength(plan, wall);
  if (length < 1) return 0.5;
  const span = faceSpan(plan, wall, side);
  const half = plateBox(formatLength(Math.max(0, span.to - span.from)), fontPx).halfW;
  const margin = arrowsFitInside(span.to - span.from, 2 * half) ? ARROW_LEN + half : half;
  let min = (span.from + margin) / length;
  let max = (span.to - margin) / length;
  // A span too narrow for the plate pins it to the middle. Clamped last: the
  // schema requires a ratio in [0, 1].
  if (min > max) min = max = (min + max) / 2;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return Math.min(clamp01(max), Math.max(clamp01(min), t));
}

// The Opening's Rail. `referenceOffset`, not the gesture's own overshoot,
// decides which end a neighbour bounds — so a rail never spans a neighbour.
export function openingRail(plan: Plan, wall: Wall, referenceOffset: number, excludeId?: string): Span {
  const { from: spanFrom, to: spanTo } = fullThicknessSpan(plan, wall);
  let from = spanFrom;
  let to = spanTo;
  for (const other of Object.values(plan.openings)) {
    if (other.wallId !== wall.id || other.id === excludeId) continue;
    const placement = openingPlacement(plan, other);
    if (!placement) continue;
    const half = other.width / 2;
    if (placement.offset <= referenceOffset) from = Math.max(from, placement.offset + half);
    else to = Math.min(to, placement.offset - half);
  }
  return { from, to };
}

// Unlike the Dimension's, this Rail binds the plan: `null` is the refusal a
// wall too short pronounces (CONTEXT.md: Rail). `opening` is the one being
// moved or widened — it bounds nothing itself. Omit it when placing a new one,
// where the desired offset plays that part.
export function railedOpeningOffset(
  plan: Plan,
  wall: Wall | undefined,
  offset: number,
  width: number,
  opening?: Opening,
): number | null {
  if (!wall) return null;
  const reference = (opening && openingPlacement(plan, opening)?.offset) ?? offset;
  const rail = openingRail(plan, wall, reference, opening?.id);
  if (rail.to - rail.from < width) return null;
  // Mitered rail ends are not whole centimetres: round first, rail last, so a
  // flush opening lands exactly on its bound.
  return clampCenter(rail, width, Math.round(clampCenter(rail, width, offset)));
}
