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
  const horizontal = { held: 'y', at: 96 } as const;

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
    expect(realignDelta({ x: 103, y: 96 }, 147.2, -63.8, { lock: { held: 'x', at: 103 } })).toEqual({
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
  const axis = { held: 'y', at: 0 } as const;

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
    const s = snapPoint(plan, 203, 118, { tolerance: 5, lock: { held: 'y', at: 127 } });
    expect(s).toMatchObject({ x: 200, y: 127, kind: 'grid' });
  });

  it('an off-grid held coordinate does not heal under the lock', () => {
    const s = snapPoint(plan, 203, 118, { tolerance: 5, lock: { held: 'x', at: 127 } });
    expect(s).toMatchObject({ x: 127, y: 120, kind: 'grid' });
  });

  it('composes with a free move: 1 cm on the free coordinate, held on the axis', () => {
    const s = snapPoint(plan, 203.4, 117.8, { tolerance: 5, free: true, lock: { held: 'y', at: 127 } });
    expect(s).toMatchObject({ x: 203, y: 127, kind: 'free' });
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
