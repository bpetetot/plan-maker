// Wall and Point writes, plus the one reading that asks what a commit produced.
import type { Vec } from './geometry';
import { wallPoints } from './geometry';
import type { Opening, Plan } from './types';

export function movePoint(plan: Plan, id: string, x: number, y: number): Plan {
  return { ...plan, points: { ...plan.points, [id]: { id, x: Math.round(x), y: Math.round(y) } } };
}

export function setPoints(plan: Plan, updates: Record<string, { x: number; y: number }>): Plan {
  const points = { ...plan.points };
  for (const [id, p] of Object.entries(updates)) points[id] = { id, x: Math.round(p.x), y: Math.round(p.y) };
  return { ...plan, points };
}

// Openings die with their wall (spec §2).
export function deleteWall(plan: Plan, id: string): Plan {
  const wall = plan.walls[id];
  if (!wall) return plan;
  const walls = { ...plan.walls };
  delete walls[id];

  const openings: Record<string, Opening> = {};
  for (const opening of Object.values(plan.openings)) {
    if (opening.wallId !== id) openings[opening.id] = opening;
  }

  const usedPointIds = new Set<string>();
  for (const w of Object.values(walls)) {
    usedPointIds.add(w.startPointId);
    usedPointIds.add(w.endPointId);
  }
  const points: Plan['points'] = {};
  for (const point of Object.values(plan.points)) {
    if (usedPointIds.has(point.id)) points[point.id] = point;
  }

  return { ...plan, points, walls, openings };
}

// A plain setter: `t` arrives railed (ADR 0027), and the Rail binds again at
// every drawing — a stored placement is only ever a wish.
export function setDimPlacement(plan: Plan, wallId: string, t: number, side: 1 | -1): Plan {
  const wall = plan.walls[wallId];
  if (!wall) return plan;
  const dimPlacement = { t: Math.round(t * 1000) / 1000, side };
  return { ...plan, walls: { ...plan.walls, [wallId]: { ...wall, dimPlacement } } };
}

export function setWallThickness(plan: Plan, id: string, thickness: number): Plan {
  const wall = plan.walls[id];
  if (!wall || wall.thickness === thickness) return plan;
  return { ...plan, walls: { ...plan.walls, [id]: { ...wall, thickness } } };
}

/** The directions of the walls a Point holds, one per wall and unit length —
 *  the lines a held Shift can slide that Point along. */
export function wallAxesAt(plan: Plan, pointId: string): Vec[] {
  const axes: Vec[] = [];
  for (const wall of Object.values(plan.walls)) {
    const otherId =
      wall.startPointId === pointId
        ? wall.endPointId
        : wall.endPointId === pointId
          ? wall.startPointId
          : null;
    const other = otherId && plan.points[otherId];
    if (!other) continue;
    const dir = unit(plan.points[pointId], other);
    if (dir) axes.push(dir);
  }
  return axes;
}

// A wall too short to have a direction has none to lend.
function unit(from: Vec | undefined, to: Vec): Vec | null {
  if (!from) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length < 1 ? null : { x: dx / length, y: dy / length };
}

// The walls a chain drew: those lying on the polyline through its anchor Points,
// which excludes the halves a crossing split off a pre-existing wall (they sit
// on the crossed wall's line, not the drawn path).
export function wallsAlongPath(plan: Plan, anchorIds: string[]): string[] {
  const onSegment = (p: Vec, s: Vec, e: Vec): boolean => {
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return false;
    const t = ((p.x - s.x) * dx + (p.y - s.y) * dy) / len2;
    if (t < -0.001 || t > 1.001) return false;
    return Math.abs((p.x - s.x) * dy - (p.y - s.y) * dx) / Math.sqrt(len2) <= 1.5;
  };
  const ids: string[] = [];
  for (const wall of Object.values(plan.walls)) {
    const [a, b] = wallPoints(plan, wall);
    for (let i = 0; i < anchorIds.length - 1; i++) {
      const s = plan.points[anchorIds[i]];
      const e = plan.points[anchorIds[i + 1]];
      if (s && e && onSegment(a, s, e) && onSegment(b, s, e)) {
        ids.push(wall.id);
        break;
      }
    }
  }
  return ids;
}
