// CONTEXT.md: Alignment guide — the line an existing Point offers a gesture,
// its own row or its own column, discovered by the aim (ADR 0037).
import type { AxisLock } from './axisLock';
import type { Rect, Vec } from './geometry';
import { distance } from './geometry';
import type { Plan, Point } from './types';

/** The line, as a value: which coordinate it holds, at what, and the Point
 *  that offered it — the chrome draws the segment back to that Point. */
export interface AlignmentGuide {
  pointId: string;
  held: 'x' | 'y';
  at: number;
}

export interface GuideSearch {
  /** In plan centimeters, tighter than the ladder's: a guide is a band across
   *  the whole sheet, not a disc (ADR 0037). */
  tolerance: number;
  exclude?: Set<string>;
  /** The Points a guide may come from: one whose source is off screen cannot
   *  be explained. Everything when absent. */
  within?: Rect | null;
}

// Per coordinate: the nearest line, then the nearest source Point, then the
// lowest id — the last step is what keeps the winner stable across aims.
interface Candidate {
  guide: AlignmentGuide;
  line: number;
  from: number;
}

const HELD = ['x', 'y'] as const;

const shows = (r: Rect | null | undefined, p: Point) =>
  !r || (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);

const beats = (a: Candidate, b: Candidate) => {
  if (a.line !== b.line) return a.line < b.line;
  if (a.from !== b.from) return a.from < b.from;
  return a.guide.pointId < b.guide.pointId;
};

/** At most two — one per held coordinate, the two competitions independent, so
 *  a crossing is nothing but two winners at once. */
export function alignmentGuides(plan: Plan, aim: Vec, search: GuideSearch): AlignmentGuide[] {
  const best: Record<'x' | 'y', Candidate | null> = { x: null, y: null };
  for (const p of Object.values(plan.points)) {
    if (search.exclude?.has(p.id)) continue;
    if (!shows(search.within, p)) continue;
    const from = distance(p.x, p.y, aim.x, aim.y);
    for (const held of HELD) {
      const line = Math.abs(aim[held] - p[held]);
      if (line > search.tolerance) continue;
      const candidate: Candidate = { guide: { pointId: p.id, held, at: p[held] }, line, from };
      const winner = best[held];
      if (!winner || beats(candidate, winner)) best[held] = candidate;
    }
  }
  return HELD.map((held) => best[held])
    .filter((c) => c !== null)
    .map((c) => c.guide);
}

/** Where a guide meets a line — null when the two are parallel, which is the
 *  only way they never meet. */
export function guideCrossing(guide: AlignmentGuide, lock: AxisLock): Vec | null {
  const along = lock.dir[guide.held];
  if (along === 0) return null;
  const t = (guide.at - lock.at[guide.held]) / along;
  return { x: lock.at.x + lock.dir.x * t, y: lock.at.y + lock.dir.y * t };
}
