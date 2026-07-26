import type { AlignmentGuide } from './alignment';
import { alignmentGuides, guideCrossing } from './alignment';
import type { AxisLock } from './axisLock';
import { axialHeld, lockAim, onAxis } from './axisLock';
import type { Rect, Vec } from './geometry';
import { distance, nearestWall, wallAxis } from './geometry';
import type { Plan } from './types';
import { GRID } from './types';

export interface Snap {
  x: number;
  y: number;
  kind: 'point' | 'wall' | 'alignment' | 'grid' | 'free';
  pointId?: string;
  wallId?: string;
  /** The guides the position rides, at most two — filled whether or not
   *  anything draws them (ADR 0036). */
  guides?: AlignmentGuide[];
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
  /** The alignment rung's own reach, in plan centimeters. Absent, the rung
   *  does not run — the caller is the one who knows a screen pixel. */
  guideTolerance?: number;
  /** The gesture's own origin Point, which is never a candidate: the Axis lock
   *  owns it, the Alignment guide owns every other Point (ADR 0037). */
  origin?: string;
  /** What the viewport shows, in plan coordinates. Everything when absent. */
  viewport?: Rect | null;
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
  const held = axialHeld(a.lock ?? null);
  const locked = (d: { dx: number; dy: number }) =>
    held === null ? d : held === 'x' ? { ...d, dx: 0 } : { ...d, dy: 0 };
  if (a.free || !ref) return locked({ dx: Math.round(dx), dy: Math.round(dy) });
  const grid = (v: number) => Math.round(v / GRID) * GRID;
  return locked({ dx: grid(ref.x + dx) - ref.x, dy: grid(ref.y + dy) - ref.y });
}

// The guides on offer at this aim, the gesture's own origin taken out — none
// when the caller named no reach.
function guidesFor(plan: Plan, aim: Vec, options: SnapOptions): AlignmentGuide[] {
  if (options.guideTolerance === undefined) return [];
  return alignmentGuides(plan, aim, {
    tolerance: options.guideTolerance,
    exclude: options.origin ? new Set(options.exclude).add(options.origin) : options.exclude,
    within: options.viewport,
  });
}

// The one rule (ADR 0037), on a slant: the position a guide yields is its
// crossing, so a near-parallel one falls out of tolerance on its own.
function nearestCrossing(guides: AlignmentGuide[], lock: AxisLock, aim: Vec, reach: number) {
  let best: { guide: AlignmentGuide; at: Vec } | null = null;
  let bestDistance = reach;
  for (const guide of guides) {
    const at = guideCrossing(guide, lock);
    if (!at) continue;
    const d = distance(at.x, at.y, aim.x, aim.y);
    if (d <= bestDistance) {
      bestDistance = d;
      best = { guide, at };
    }
  }
  return best;
}

// Priority: point > wall body > alignment > grid. A free move drops the grid
// rung alone — the guides are not the Grid's to switch off (ADR 0037).
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

  const aim = { x, y };
  const guides = guidesFor(plan, aim, options);
  const held = axialHeld(lock);

  // A borrowed slant holds no coordinate, so a guide meets it at one point
  // rather than lending it one — and the grid has no hold on it at all.
  if (lock && !held) {
    const crossed = nearestCrossing(guides, lock, aim, options.guideTolerance ?? 0);
    const on = crossed ? crossed.at : lockAim(lock, aim);
    const landed = { x: Math.round(on.x), y: Math.round(on.y) };
    return crossed ? { ...landed, kind: 'alignment', guides: [crossed.guide] } : { ...landed, kind: 'free' };
  }

  // The lock has the last word on its own coordinate, so a guide holding it has
  // nothing left to hold.
  const live = guides.filter((g) => g.held !== held);
  const grid = (v: number) => Math.round(v / GRID) * GRID;
  const base = lockAim(lock, aligning ? { x: grid(x), y: grid(y) } : { x: Math.round(x), y: Math.round(y) });
  if (live.length > 0) {
    // The held coordinates come from the guides, the free one from the rung
    // below — exactly how the lock already composes.
    const on = { ...base };
    for (const g of live) on[g.held] = g.at;
    return { ...on, kind: 'alignment', guides: live };
  }
  return { ...base, kind: aligning ? 'grid' : 'free' };
}
