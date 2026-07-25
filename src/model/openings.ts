import { fullThicknessSpan } from './faces';
import { wallAxis } from './geometry';
import type { Opening, Plan, Wall } from './types';
import { defaultOpeningWidth, newId } from './types';

export interface Span {
  from: number;
  to: number;
}

// Span narrower than the width: straddle its middle, overflowing visibly
// rather than vanishing.
function clampCenter(span: Span, width: number, offset: number): number {
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

// The Opening's Rail (ADR 0027). `referenceOffset`, not the gesture's own
// overshoot, decides which end a neighbour bounds — so a rail never spans one.
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

export function placeOpening(
  plan: Plan,
  wallId: string,
  type: 'door' | 'window',
  offset: number,
  init?: { width?: number; hingeSide?: 'start' | 'end'; swing?: 'in' | 'out' },
): [Plan, string | null] {
  const wall = plan.walls[wallId];
  if (!wall) return [plan, null];
  const width = init?.width ?? defaultOpeningWidth(type);
  const clamped = railedOpeningOffset(plan, wall, offset, width);
  if (clamped === null) return [plan, null];
  const id = newId();
  const opening: Opening =
    type === 'door'
      ? {
          id,
          wallId,
          type,
          offset: clamped,
          width,
          hingeSide: init?.hingeSide ?? 'start',
          swing: init?.swing ?? 'in',
        }
      : { id, wallId, type, offset: clamped, width };
  return [{ ...plan, openings: { ...plan.openings, [id]: opening } }, id];
}

export function moveOpening(plan: Plan, id: string, offset: number): Plan {
  const opening = plan.openings[id];
  if (!opening) return plan;
  const clamped = railedOpeningOffset(plan, plan.walls[opening.wallId], offset, opening.width, opening);
  if (clamped === null) return plan;
  return { ...plan, openings: { ...plan.openings, [id]: { ...opening, offset: clamped } } };
}

export function setOpeningWidth(plan: Plan, id: string, width: number): Plan {
  const opening = plan.openings[id];
  if (!opening) return plan;
  const clamped = railedOpeningOffset(plan, plan.walls[opening.wallId], opening.offset, width, opening);
  if (clamped === null) return plan;
  return { ...plan, openings: { ...plan.openings, [id]: { ...opening, width, offset: clamped } } };
}

export function toggleHingeSide(plan: Plan, id: string): Plan {
  const opening = plan.openings[id];
  if (opening?.type !== 'door') return plan;
  const hingeSide = opening.hingeSide === 'start' ? 'end' : 'start';
  return { ...plan, openings: { ...plan.openings, [id]: { ...opening, hingeSide } } };
}

export function toggleSwing(plan: Plan, id: string): Plan {
  const opening = plan.openings[id];
  if (opening?.type !== 'door') return plan;
  const swing = opening.swing === 'in' ? 'out' : 'in';
  return { ...plan, openings: { ...plan.openings, [id]: { ...opening, swing } } };
}

export function deleteOpening(plan: Plan, id: string): Plan {
  if (!plan.openings[id]) return plan;
  const openings = { ...plan.openings };
  delete openings[id];
  return { ...plan, openings };
}
