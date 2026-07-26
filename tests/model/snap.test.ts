import { describe, expect, it } from 'vitest';
import { realignDelta, snapPoint } from '../../src/model/snap';
import { buildPlan } from '../helpers';

const plan = buildPlan((b) => {
  const p1 = b.point(0, 0);
  const p2 = b.point(400, 0);
  b.wall(p1, p2);
});

describe('snapPoint', () => {
  it('snaps to a nearby existing point first', () => {
    const s = snapPoint(plan, 8, 5, { tolerance: 15 });
    expect(s.kind).toBe('point');
    expect(s).toMatchObject({ x: 0, y: 0 });
    expect(s.pointId).toBeDefined();
  });

  it('skips excluded points', () => {
    const excluded = Object.keys(plan.points)[0];
    const s = snapPoint(plan, 8, 5, { tolerance: 15, exclude: new Set([excluded]) });
    expect(s.kind).not.toBe('point');
  });

  it('falls back to the 10 cm grid', () => {
    const s = snapPoint(plan, 203, 118, { tolerance: 5 });
    expect(s).toMatchObject({ x: 200, y: 120, kind: 'grid' });
  });

  it('a free move (Alt) only rounds to integers', () => {
    const s = snapPoint(plan, 203.4, 117.8, { tolerance: 15, free: true });
    expect(s).toMatchObject({ x: 203, y: 118, kind: 'free' });
  });

  it('a free move keeps the existing-point rung', () => {
    const s = snapPoint(plan, 8, 5, { tolerance: 15, free: true });
    expect(s).toMatchObject({ x: 0, y: 0, kind: 'point' });
    expect(s.pointId).toBeDefined();
  });

  it('a free move drops the grid rung', () => {
    const s = snapPoint(plan, 203, 118, { tolerance: 5, free: true });
    expect(s).toMatchObject({ x: 203, y: 118, kind: 'free' });
  });
});

describe('realignDelta', () => {
  it('lands the reference point on a grid intersection', () => {
    // ref off-grid by (3, -4); the delta absorbs it
    expect(realignDelta({ x: 103, y: 96 }, 147.2, -63.8, {})).toEqual({ dx: 147, dy: -66 });
  });

  it('realigns an off-grid reference even for a near-zero displacement', () => {
    expect(realignDelta({ x: 103, y: 96 }, 1, -1, {})).toEqual({ dx: -3, dy: 4 });
  });

  it('keeps an on-grid reference on the grid', () => {
    expect(realignDelta({ x: 100, y: 100 }, 147.2, -63.8, {})).toEqual({ dx: 150, dy: -60 });
  });

  it('a free move (Alt) only rounds to integer centimeters', () => {
    expect(realignDelta({ x: 103, y: 96 }, 147.2, -63.8, { free: true })).toEqual({ dx: 147, dy: -64 });
  });

  it('falls back to whole-centimeter rounding without a reference point', () => {
    expect(realignDelta(null, 147.2, -63.8, {})).toEqual({ dx: 147, dy: -64 });
  });
});

describe('realignDelta under a lock', () => {
  const horizontal = { at: { x: 103, y: 96 }, dir: { x: 1, y: 0 } } as const;

  it('zeroes the held delta and realigns the free one', () => {
    expect(realignDelta({ x: 103, y: 96 }, 147.2, -63.8, { lock: horizontal })).toEqual({
      dx: 147,
      dy: 0,
    });
  });

  it('leaves an off-grid reference off-grid on the held coordinate', () => {
    // y stays 96: the lock preserves the alignment the group had
    expect(realignDelta({ x: 103, y: 96 }, 1, -1, { lock: horizontal })).toEqual({ dx: -3, dy: 0 });
  });

  it('holds the x under a vertical lock', () => {
    expect(
      realignDelta({ x: 103, y: 96 }, 147.2, -63.8, { lock: { at: { x: 103, y: 96 }, dir: { x: 0, y: 1 } } }),
    ).toEqual({
      dx: 0,
      dy: -66,
    });
  });

  it('zeroes the held delta without a reference point too', () => {
    expect(realignDelta(null, 147.2, -63.8, { lock: horizontal })).toEqual({ dx: 147, dy: 0 });
  });

  it('composes with a free move: 1 cm on the free coordinate, zero on the held one', () => {
    expect(realignDelta({ x: 103, y: 96 }, 147.2, -63.8, { free: true, lock: horizontal })).toEqual({
      dx: 147,
      dy: 0,
    });
  });
});

describe('snapPoint under a lock', () => {
  // A horizontal lock through (0, 0): the axis is y = 0.
  const axis = { at: { x: 0, y: 0 }, dir: { x: 1, y: 0 } } as const;

  it('an aligned point beats a nearer one off the axis', () => {
    const crowded = buildPlan((b) => {
      b.point(400, 0);
      b.point(397, 5);
    });
    const s = snapPoint(crowded, 396, 2, { tolerance: 15, lock: axis });
    expect(s).toMatchObject({ x: 400, y: 0, kind: 'point' });
  });

  it('takes no point at all when none is on the axis', () => {
    const off = buildPlan((b) => {
      b.point(397, 5);
    });
    const s = snapPoint(off, 396, 2, { tolerance: 15, lock: axis });
    expect(s.kind).not.toBe('point');
  });

  it('connects to a wall that crosses the axis', () => {
    const crossing = buildPlan((b) => {
      const p1 = b.point(400, -200);
      const p2 = b.point(400, 200);
      b.wall(p1, p2);
    });
    const s = snapPoint(crossing, 395, 6, { tolerance: 15, walls: true, lock: axis });
    expect(s).toMatchObject({ x: 400, y: 0, kind: 'wall' });
  });

  it('vetoes an oblique wall and falls through to the grid rung', () => {
    const oblique = buildPlan((b) => {
      const p1 = b.point(100, -100);
      const p2 = b.point(300, 100);
      b.wall(p1, p2);
    });
    const free = snapPoint(oblique, 198, 2, { tolerance: 15, walls: true });
    expect(free.kind).toBe('wall');
    const s = snapPoint(oblique, 198, 2, { tolerance: 15, walls: true, lock: axis });
    expect(s).toMatchObject({ x: 200, y: 0, kind: 'grid' });
  });

  it('grids the free coordinate and holds the other at the origin’s value', () => {
    const s = snapPoint(plan, 203, 118, {
      tolerance: 5,
      lock: { at: { x: 0, y: 127 }, dir: { x: 1, y: 0 } },
    });
    expect(s).toMatchObject({ x: 200, y: 127, kind: 'grid' });
  });

  it('an off-grid held coordinate does not heal under the lock', () => {
    const s = snapPoint(plan, 203, 118, {
      tolerance: 5,
      lock: { at: { x: 127, y: 0 }, dir: { x: 0, y: 1 } },
    });
    expect(s).toMatchObject({ x: 127, y: 120, kind: 'grid' });
  });

  it('composes with a free move: 1 cm on the free coordinate, held on the axis', () => {
    const s = snapPoint(plan, 203.4, 117.8, {
      tolerance: 5,
      free: true,
      lock: { at: { x: 0, y: 127 }, dir: { x: 1, y: 0 } },
    });
    expect(s).toMatchObject({ x: 203, y: 127, kind: 'free' });
  });

  // A borrowed slant crosses no intersection, so the grid has nothing to say
  // on it and the axis is followed by the centimeter.
  it('follows a slant by the centimeter, the grid having no hold on it', () => {
    const slant = { at: { x: 100, y: 100 }, dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 } };
    const s = snapPoint(plan, 260, 240, { tolerance: 5, lock: slant });
    expect(s).toMatchObject({ x: 250, y: 250, kind: 'free' });
  });
});

describe('snapPoint on wall bodies', () => {
  it('snaps to the nearest wall body when the walls option is set', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 15, walls: true });
    expect(s).toMatchObject({ x: 200, y: 0, kind: 'wall' });
    expect(s.wallId).toBe(Object.keys(plan.walls)[0]);
  });

  it('is not a snap target without the walls option', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 15 });
    expect(s.kind).toBe('grid');
  });

  it('loses to a nearby existing point', () => {
    const s = snapPoint(plan, 8, 5, { tolerance: 15, walls: true });
    expect(s.kind).toBe('point');
  });

  it('projects the cursor orthogonally onto the wall body', () => {
    const target = buildPlan((b) => {
      const p1 = b.point(400, -200);
      const p2 = b.point(400, 200);
      b.wall(p1, p2);
    });
    // the 6 cm drift off the horizontal is kept: no axis refinement straightens it
    const s = snapPoint(target, 395, 6, { tolerance: 15, walls: true });
    expect(s).toMatchObject({ x: 400, y: 6, kind: 'wall' });
    expect(s.wallId).toBe(Object.keys(target.walls)[0]);
  });

  it('stays a snap target under a free move (Alt)', () => {
    const s = snapPoint(plan, 200, 6, { tolerance: 15, walls: true, free: true });
    expect(s).toMatchObject({ x: 200, y: 0, kind: 'wall' });
    expect(s.wallId).toBe(Object.keys(plan.walls)[0]);
  });

  it('loses to a nearby existing point under a free move too', () => {
    const s = snapPoint(plan, 8, 5, { tolerance: 15, walls: true, free: true });
    expect(s.kind).toBe('point');
  });

  it('rounds the projection on a diagonal wall to integer centimeters', () => {
    const diagonal = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(300, 300);
      b.wall(p1, p2);
    });
    const s = snapPoint(diagonal, 150, 160, { tolerance: 15, walls: true });
    expect(s).toMatchObject({ x: 155, y: 155, kind: 'wall' });
  });
});

// The rung above the grid (ADR 0037). Its reach is its own — 4 cm here against
// the ladder's 15 — because a guide is a band across the sheet, not a disc.
describe('the alignment rung', () => {
  // Alone at (400, 400), way outside every other rung's reach: what it offers
  // is its row and its column, and nothing else.
  const alone = buildPlan((b) => {
    b.point(400, 400);
  });
  const sourceId = () => Object.keys(alone.points)[0];
  const REACH = { tolerance: 15, guideTolerance: 4 };

  it('holds the aim on a distant Point’s row and grids the free coordinate', () => {
    const s = snapPoint(alone, 203, 402, REACH);
    expect(s).toMatchObject({ x: 200, y: 400, kind: 'alignment' });
    expect(s.guides).toEqual([{ pointId: sourceId(), held: 'y', at: 400 }]);
  });

  // One Point lends its column, another its row, and both are far enough that
  // no other rung has anything to say.
  const crossed = buildPlan((b) => {
    b.point(400, 900);
    b.point(900, 400);
  });

  it('crosses two guides on one aim, both coordinates held', () => {
    const s = snapPoint(crossed, 403, 402, REACH);
    expect(s).toMatchObject({ x: 400, y: 400, kind: 'alignment' });
    expect(s.guides).toHaveLength(2);
  });

  // Inside a sqrt(2)-widened envelope, outside both per-coordinate tests: the
  // crossing gets no envelope of its own (ADR 0037).
  it('widens no envelope at the crossing', () => {
    const s = snapPoint(crossed, 404.5, 404.5, REACH);
    expect(s).toMatchObject({ x: 400, y: 400, kind: 'grid' });
    expect(s.guides).toBeUndefined();
  });

  it('runs without a visible grid too, on the integer centimeter', () => {
    const s = snapPoint(alone, 203.4, 402, { ...REACH, free: true });
    expect(s).toMatchObject({ x: 203, y: 400, kind: 'alignment' });
  });

  it('does not run at all without a guide tolerance', () => {
    const s = snapPoint(alone, 203, 402, { tolerance: 15 });
    expect(s).toMatchObject({ x: 200, y: 400, kind: 'grid' });
    expect(s.guides).toBeUndefined();
  });

  it('never takes the gesture’s own origin — ADR 0020 stays buried', () => {
    const s = snapPoint(alone, 203, 402, { ...REACH, origin: sourceId() });
    expect(s).toMatchObject({ x: 200, y: 400, kind: 'grid' });
  });

  it('offers nothing from a Point the viewport does not show', () => {
    const s = snapPoint(alone, 203, 402, { ...REACH, viewport: { x: 0, y: 0, w: 300, h: 300 } });
    expect(s.kind).toBe('grid');
  });

  it('loses to the wall rung, which fires with no guides at all', () => {
    // A wall to catch the aim, and an aligned Point 1 cm off its row.
    const near = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
      b.point(700, 5);
    });
    const s = snapPoint(near, 200, 6, { ...REACH, walls: true });
    expect(s.kind).toBe('wall');
    expect(s.guides).toBeUndefined();
  });

  it('loses to the point rung', () => {
    const s = snapPoint(alone, 402, 403, REACH);
    expect(s).toMatchObject({ x: 400, y: 400, kind: 'point' });
    expect(s.guides).toBeUndefined();
  });
});

describe('the alignment rung under a lock', () => {
  const REACH = { tolerance: 15, guideTolerance: 4 };
  // Holds y at 400; the aim is free on x alone.
  const horizontal = { at: { x: 0, y: 400 }, dir: { x: 1, y: 0 } } as const;

  it('skips a guide holding the locked coordinate', () => {
    const row = buildPlan((b) => {
      b.point(700, 402);
    });
    expect(snapPoint(row, 203, 400, REACH)).toMatchObject({ y: 402, kind: 'alignment' });
    const s = snapPoint(row, 203, 400, { ...REACH, lock: horizontal });
    expect(s).toMatchObject({ x: 200, y: 400, kind: 'grid' });
    expect(s.guides).toBeUndefined();
  });

  it('lets a guide take the free coordinate, above the grid', () => {
    const column = buildPlan((b) => {
      b.point(302, 700);
    });
    const s = snapPoint(column, 300, 380, { ...REACH, lock: horizontal });
    expect(s).toMatchObject({ x: 302, y: 400, kind: 'alignment' });
  });

  // Straight from here, and level with that: the drawing act a slant makes
  // possible is lengthening a wall until it meets a foreign Point's column.
  it('meets a borrowed slant at the line ∩ guide', () => {
    const column = buildPlan((b) => {
      b.point(300, 700);
    });
    const slant = { at: { x: 100, y: 100 }, dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 } };
    const s = snapPoint(column, 298, 298, { ...REACH, lock: slant });
    expect(s).toMatchObject({ x: 300, y: 300, kind: 'alignment' });
  });

  // No angle threshold: as the angle closes the crossing races away from the
  // aim and falls out of tolerance on its own.
  it('drops a guide the slant meets too far away', () => {
    const row = buildPlan((b) => {
      b.point(400, 3);
    });
    const shallow = { x: 100, y: 1 };
    const len = Math.hypot(shallow.x, shallow.y);
    const slant = { at: { x: 0, y: 0 }, dir: { x: shallow.x / len, y: shallow.y / len } };
    const s = snapPoint(row, 200, 2, { ...REACH, lock: slant });
    expect(s.kind).toBe('free');
    expect(s.guides).toBeUndefined();
  });
});
