// CONTEXT.md: Axis lock — the world axis a held Shift confines a gesture to.
// A pure function of (origin, aim, on), so the modifier is read live (ADR 0007).
import type { Vec } from './geometry';

/** The coordinate the lock *holds*, and the value it holds it at — so a
 *  horizontal lock is `{ held: 'y' }` and every consumer reads it uninverted. */
export interface AxisLock {
  held: 'x' | 'y';
  at: number;
}

// The nearer of the two world axes, recomputed at every aim; a tie falls to the
// horizontal by the comparison itself.
export function axisLock(origin: Vec | null, aim: Vec, on: boolean): AxisLock | null {
  if (!on || !origin) return null;
  return Math.abs(aim.x - origin.x) >= Math.abs(aim.y - origin.y)
    ? { held: 'y', at: origin.y }
    : { held: 'x', at: origin.x };
}

/** Whether a position sits on the axis — no lock filters nothing. */
export function onAxis(lock: AxisLock | null, p: Vec): boolean {
  return !lock || p[lock.held] === lock.at;
}

/** The position brought onto the axis — no lock moves nothing. */
export function lockAim(lock: AxisLock | null, p: Vec): Vec {
  return lock ? { ...p, [lock.held]: lock.at } : p;
}
