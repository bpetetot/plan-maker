import type { Vec } from './geometry';
import { distance, nearestWall, wallLength, wallPoints } from './geometry';
import type { Plan } from './types';
import { GRID } from './types';

export interface Snap {
  x: number;
  y: number;
  kind: 'point' | 'wall' | 'axis' | 'grid' | 'free';
  pointId?: string;
  wallId?: string;
  axisFrom?: Vec;
}

export interface SnapOptions {
  tolerance: number;
  anchor?: Vec;
  exclude?: Set<string>;
  walls?: boolean;
  free?: boolean;
}

const AXIS_STEP = Math.PI / 4;
const AXIS_TOLERANCE = (8 * Math.PI) / 180;
// Grazing-angle intersections farther than this many tolerances are not aimed at (ADR 0002).
const AXIS_INTERSECTION_REACH = 2;

// Ordered by octant from +x: `lockedAxis` indexes this by rounded octant.
const AXIS_LATTICE: Vec[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

function lockedAxis(anchor: Vec, x: number, y: number): { direction: Vec; step: Vec } | null {
  const length = Math.hypot(x - anchor.x, y - anchor.y);
  if (length <= 1) return null;
  const angle = Math.atan2(y - anchor.y, x - anchor.x);
  const octant = Math.round(angle / AXIS_STEP);
  if (Math.abs(angle - octant * AXIS_STEP) >= AXIS_TOLERANCE) return null;
  const step = AXIS_LATTICE[((octant % 8) + 8) % 8];
  const norm = Math.hypot(step.x, step.y);
  return { direction: { x: step.x / norm, y: step.y / norm }, step };
}

// `t ≡ -anchor · step` because every axis step is a unit lattice component, so `step⁻¹ = step`.
// `t > 0` holds the endpoint strictly beyond the anchor.
function nearestCrossing(anchor: number, step: number, projection: number): number | null {
  if (step === 0) return null;
  const residue = (((-anchor * step) % GRID) + GRID) % GRID;
  const n = Math.max(residue > 0 ? 0 : 1, Math.round((projection - residue) / GRID));
  return residue + n * GRID;
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

// Priority (spec §4, ADR 0002): point > wall body > 45° axis > grid.
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
      const [a, b] = wallPoints(plan, near.wall);
      const length = wallLength(plan, near.wall);
      if (length >= 1) {
        // Locked axis ∩ wall beats the orthogonal projection: keeps the drawn wall straight (ADR 0002).
        // Rounding may drift a fraction of a cm; the junction holds because the wall is split there.
        let px = a.x + ((b.x - a.x) / length) * near.t;
        let py = a.y + ((b.y - a.y) / length) * near.t;
        let axisFrom: Vec | undefined;
        const axis = aligning && options.anchor ? lockedAxis(options.anchor, x, y) : null;
        if (options.anchor && axis) {
          const direction = axis.direction;
          const wx = b.x - a.x;
          const wy = b.y - a.y;
          const denominator = direction.x * wy - direction.y * wx;
          if (Math.abs(denominator) > 1e-9) {
            const t = ((a.x - options.anchor.x) * wy - (a.y - options.anchor.y) * wx) / denominator;
            const ix = options.anchor.x + t * direction.x;
            const iy = options.anchor.y + t * direction.y;
            const s = ((ix - a.x) * wx + (iy - a.y) * wy) / (length * length);
            const within =
              t > 0 && // ray, not line: never behind the anchor
              s >= 0 &&
              s <= 1 &&
              distance(ix, iy, x, y) <= options.tolerance * AXIS_INTERSECTION_REACH;
            if (within) {
              px = ix;
              py = iy;
              axisFrom = { x: options.anchor.x, y: options.anchor.y };
            }
          }
        }
        return { x: Math.round(px), y: Math.round(py), kind: 'wall', wallId: near.wall.id, axisFrom };
      }
    }
  }

  if (!aligning) return { x: Math.round(x), y: Math.round(y), kind: 'free' };

  if (options.anchor) {
    const axis = lockedAxis(options.anchor, x, y);
    if (axis) {
      // Grid crossings taken absolutely, not stepped from the anchor (ADR 0006).
      // A diagonal has two interleaved families (x-aligning, y-aligning); nearest the cursor wins.
      const { step } = axis;
      const projection =
        ((x - options.anchor.x) * step.x + (y - options.anchor.y) * step.y) /
        (step.x * step.x + step.y * step.y);
      const t = [
        nearestCrossing(options.anchor.x, step.x, projection),
        nearestCrossing(options.anchor.y, step.y, projection),
      ]
        .filter((c) => c !== null)
        .reduce((near, c) => (Math.abs(c - projection) < Math.abs(near - projection) ? c : near));
      return {
        x: Math.round(options.anchor.x + t * step.x),
        y: Math.round(options.anchor.y + t * step.y),
        kind: 'axis',
        axisFrom: { x: options.anchor.x, y: options.anchor.y },
      };
    }
  }

  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID, kind: 'grid' };
}
