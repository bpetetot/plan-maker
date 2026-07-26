// CONTEXT.md: Axis lock — the line a held Shift confines a gesture to.
// A pure function of (origin, aim, axes, on), so the modifier is read live (ADR 0007).
import type { Vec } from './geometry';

/** The line the lock holds a gesture on: a point it runs through, and its
 *  direction, unit length. */
export interface AxisLock {
  at: Vec;
  dir: Vec;
}

/** What a gesture with no element under it borrows: the horizontal and the
 *  vertical, in that order, so a tie between them falls to the horizontal. */
export const WORLD_AXES: Vec[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

// A Point's coordinates are integer centimeters, so anything a line truly
// passes through sits well inside this; nothing else does.
const ON_AXIS_CM = 0.5;

const off = (lock: AxisLock, p: Vec) =>
  Math.abs((p.x - lock.at.x) * lock.dir.y - (p.y - lock.at.y) * lock.dir.x);

// The candidate whose line passes nearest the aim, recomputed at every aim.
export function axisLock(origin: Vec | null, aim: Vec, axes: Vec[], on: boolean): AxisLock | null {
  if (!on || !origin) return null;
  let best: AxisLock | null = null;
  let bestOff = Infinity;
  for (const dir of axes) {
    const lock = { at: origin, dir };
    const d = off(lock, aim);
    if (d < bestOff) {
      bestOff = d;
      best = lock;
    }
  }
  return best;
}

/** Whether a position sits on the axis — no lock filters nothing. */
export function onAxis(lock: AxisLock | null, p: Vec): boolean {
  return !lock || off(lock, p) <= ON_AXIS_CM;
}

/** The position brought onto the axis — no lock moves nothing. */
export function lockAim(lock: AxisLock | null, p: Vec): Vec {
  if (!lock) return p;
  const t = (p.x - lock.at.x) * lock.dir.x + (p.y - lock.at.y) * lock.dir.y;
  return { x: lock.at.x + lock.dir.x * t, y: lock.at.y + lock.dir.y * t };
}

/** The coordinate an axis holds still, when it is a world axis — null for a
 *  borrowed slant, which holds no coordinate at all. */
export function axialHeld(lock: AxisLock | null): 'x' | 'y' | null {
  if (!lock) return null;
  if (lock.dir.y === 0) return 'y';
  return lock.dir.x === 0 ? 'x' : null;
}
