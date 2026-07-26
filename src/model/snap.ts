import type { AxisLock } from './axisLock';
import { lockAim, onAxis } from './axisLock';
import type { Vec } from './geometry';
import { distance, nearestWall, wallAxis } from './geometry';
import type { Plan } from './types';
import { GRID } from './types';

export interface Snap {
  x: number;
  y: number;
  kind: 'point' | 'wall' | 'grid' | 'free';
  pointId?: string;
  wallId?: string;
}

/** The two alignment constraints a gesture carries — Alt's free move, and the
 *  Axis lock, which has the last word over every rung below. */
interface Alignment {
  free?: boolean;
  lock?: AxisLock | null;
}

export interface SnapOptions extends Alignment {
  tolerance: number;
  exclude?: Set<string>;
  walls?: boolean;
}

// Rigid: one delta landing `ref` on a grid intersection, not a per-element snap —
// an off-grid group heals on its first move instead of carrying its offset forever.
export function realignDelta(
  ref: Vec | null,
  dx: number,
  dy: number,
  a: Alignment,
): { dx: number; dy: number } {
  // A group's lock is `delta = 0` on the held coordinate, which holds every one
  // of its points on its own axis — so `at` is never read here.
  const held = a.lock?.held;
  const locked = (d: { dx: number; dy: number }) =>
    held === undefined ? d : held === 'x' ? { ...d, dx: 0 } : { ...d, dy: 0 };
  if (a.free || !ref) return locked({ dx: Math.round(dx), dy: Math.round(dy) });
  const grid = (v: number) => Math.round(v / GRID) * GRID;
  return locked({ dx: grid(ref.x + dx) - ref.x, dy: grid(ref.y + dy) - ref.y });
}

// Priority: point > wall body > grid.
// A free move (Alt) filters the ladder, not short-circuits it: alignment rungs off, connection rungs on.
export function snapPoint(plan: Plan, x: number, y: number, options: SnapOptions): Snap {
  const aligning = !options.free;
  const lock = options.lock ?? null;

  let best: { id: string; x: number; y: number } | null = null;
  let bestDistance = options.tolerance;
  for (const point of Object.values(plan.points)) {
    if (options.exclude?.has(point.id)) continue;
    // The lock filters the search rather than displacing its result: an aligned
    // Point still connects through a nearer one that the axis excludes.
    if (!onAxis(lock, point)) continue;
    const d = distance(point.x, point.y, x, y);
    if (d < bestDistance) {
      bestDistance = d;
      best = point;
    }
  }
  if (best) return { x: best.x, y: best.y, kind: 'point', pointId: best.id };

  if (options.walls) {
    // The wall is met from the axis, and the projection is vetoed if it leaves
    // it: a perpendicular wall connects, an oblique or parallel one falls through.
    const from = lockAim(lock, { x, y });
    const near = nearestWall(plan, from.x, from.y, options.tolerance);
    if (near) {
      const axis = wallAxis(plan, near.wall);
      if (axis && axis.length >= 1) {
        // Rounding may drift a fraction of a cm; the junction holds because the wall is split there.
        const px = axis.a.x + axis.u.x * near.t;
        const py = axis.a.y + axis.u.y * near.t;
        const on = { x: Math.round(px), y: Math.round(py) };
        if (onAxis(lock, on)) return { ...on, kind: 'wall', wallId: near.wall.id };
      }
    }
  }

  if (!aligning) return { ...lockAim(lock, { x: Math.round(x), y: Math.round(y) }), kind: 'free' };

  const grid = (v: number) => Math.round(v / GRID) * GRID;
  return { ...lockAim(lock, { x: grid(x), y: grid(y) }), kind: 'grid' };
}
