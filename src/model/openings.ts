import { fullThicknessSpan } from './faces';
import { wallAxis } from './geometry';
import type { Opening, Plan } from './types';

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
  const axis = wallAxis(plan, wall);
  if (!axis || axis.length < 1) return null;
  // Face bounds only, never neighbours: each would bound the other.
  // Gestures keep openings apart; a shrunk wall may draw them overlapping.
  const span = fullThicknessSpan(plan, wall);
  const offset = clampCenter(span, opening.width, opening.offset);
  const { a, u } = axis;
  return {
    cx: a.x + u.x * offset,
    cy: a.y + u.y * offset,
    angleDeg: (Math.atan2(u.y, u.x) * 180) / Math.PI,
    offset,
  };
}
