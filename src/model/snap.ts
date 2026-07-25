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

export interface SnapOptions {
  tolerance: number;
  exclude?: Set<string>;
  walls?: boolean;
  free?: boolean;
}

// Rigid: one delta landing `ref` on a grid intersection, not a per-element snap —
// an off-grid group heals on its first move instead of carrying its offset forever.
export function realignDelta(
  ref: Vec | null,
  dx: number,
  dy: number,
  free?: boolean,
): { dx: number; dy: number } {
  if (free || !ref) return { dx: Math.round(dx), dy: Math.round(dy) };
  const grid = (v: number) => Math.round(v / GRID) * GRID;
  return { dx: grid(ref.x + dx) - ref.x, dy: grid(ref.y + dy) - ref.y };
}

// Priority: point > wall body > grid.
// A free move (Alt) filters the ladder, not short-circuits it: alignment rungs off, connection rungs on.
export function snapPoint(plan: Plan, x: number, y: number, options: SnapOptions): Snap {
  const aligning = !options.free;

  let best: { id: string; x: number; y: number } | null = null;
  let bestDistance = options.tolerance;
  for (const point of Object.values(plan.points)) {
    if (options.exclude?.has(point.id)) continue;
    const d = distance(point.x, point.y, x, y);
    if (d < bestDistance) {
      bestDistance = d;
      best = point;
    }
  }
  if (best) return { x: best.x, y: best.y, kind: 'point', pointId: best.id };

  if (options.walls) {
    const near = nearestWall(plan, x, y, options.tolerance);
    if (near) {
      const axis = wallAxis(plan, near.wall);
      if (axis && axis.length >= 1) {
        // Rounding may drift a fraction of a cm; the junction holds because the wall is split there.
        const px = axis.a.x + axis.u.x * near.t;
        const py = axis.a.y + axis.u.y * near.t;
        return { x: Math.round(px), y: Math.round(py), kind: 'wall', wallId: near.wall.id };
      }
    }
  }

  if (!aligning) return { x: Math.round(x), y: Math.round(y), kind: 'free' };

  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID, kind: 'grid' };
}
