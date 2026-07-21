import { fullThicknessSpan } from './faces';
import { distance, wallPoints } from './geometry';
import type { Opening, Plan, Wall } from './types';

export interface Span {
  from: number;
  to: number;
}

// Span narrower than the width: straddle its middle, overflowing visibly
// rather than vanishing.
export function clampCenter(span: Span, width: number, offset: number): number {
  if (span.to - span.from <= width) return (span.from + span.to) / 2;
  const half = width / 2;
  return Math.max(span.from + half, Math.min(span.to - half, offset));
}

export interface OpeningPlacement {
  cx: number;
  cy: number;
  angleDeg: number;
  offset: number;
}

// Clamped for display only, never stored: a regrown wall gives the place back.
export function openingPlacement(plan: Plan, opening: Opening): OpeningPlacement | null {
  const wall = plan.walls[opening.wallId];
  if (!wall) return null;
  const [a, b] = wallPoints(plan, wall);
  const length = distance(a.x, a.y, b.x, b.y);
  if (length < 1) return null;
  // Face bounds only, never neighbours: each would bound the other.
  // Gestures keep openings apart; a shrunk wall may draw them overlapping.
  const span = fullThicknessSpan(plan, wall);
  const offset = clampCenter(span, opening.width, opening.offset);
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  return {
    cx: a.x + ux * offset,
    cy: a.y + uy * offset,
    angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
    offset,
  };
}

// CONTEXT.md: Rail. `referenceOffset`, not the gesture's own overshoot, decides
// which end a neighbour bounds — so a rail never spans a neighbour.
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
