// CONTEXT.md: Alignment guide — the line an existing Point offers a gesture.
import { describe, expect, it } from 'vitest';
import { alignmentGuides, guideCrossing } from '../../src/model/alignment';
import { emptyPlan } from '../../src/model/types';
import type { Plan, Point } from '../../src/model/types';

const point = (id: string, x: number, y: number): Point => ({ id, x, y });

const planOf = (...points: Point[]): Plan => ({
  ...emptyPlan(),
  points: Object.fromEntries(points.map((p) => [p.id, p])),
});

// Far enough from every Point that the search is the only thing under test.
const REACH = 4;

describe('alignmentGuides', () => {
  it('offers a Point its row and its column at once', () => {
    const plan = planOf(point('a', 100, 100));
    // 2 cm off the column, 3 off the row: both inside the reach
    expect(alignmentGuides(plan, { x: 102, y: 103 }, { tolerance: REACH })).toEqual([
      { pointId: 'a', held: 'x', at: 100 },
      { pointId: 'a', held: 'y', at: 100 },
    ]);
  });

  it('offers the row alone when the column is out of reach', () => {
    const plan = planOf(point('a', 100, 100));
    expect(alignmentGuides(plan, { x: 300, y: 102 }, { tolerance: REACH })).toEqual([
      { pointId: 'a', held: 'y', at: 100 },
    ]);
  });

  it('offers nothing when neither coordinate is in reach', () => {
    const plan = planOf(point('a', 100, 100));
    expect(alignmentGuides(plan, { x: 300, y: 300 }, { tolerance: REACH })).toEqual([]);
  });

  it('reaches exactly as far as the tolerance, and no further', () => {
    const plan = planOf(point('a', 100, 100));
    expect(alignmentGuides(plan, { x: 300, y: 104 }, { tolerance: REACH })).toHaveLength(1);
    expect(alignmentGuides(plan, { x: 300, y: 104.5 }, { tolerance: REACH })).toEqual([]);
  });

  it('crosses two Points: one lends its column, the other its row', () => {
    const plan = planOf(point('a', 100, 500), point('b', 500, 100));
    expect(alignmentGuides(plan, { x: 101, y: 102 }, { tolerance: REACH })).toEqual([
      { pointId: 'a', held: 'x', at: 100 },
      { pointId: 'b', held: 'y', at: 100 },
    ]);
  });

  it('never offers more than one guide per coordinate', () => {
    const plan = planOf(point('a', 100, 100), point('b', 102, 300), point('c', 500, 101));
    const guides = alignmentGuides(plan, { x: 101, y: 102 }, { tolerance: REACH });
    expect(guides.map((g) => g.held)).toEqual(['x', 'y']);
  });

  it('skips an excluded Point — the gesture’s own origin', () => {
    const plan = planOf(point('a', 100, 100));
    expect(alignmentGuides(plan, { x: 102, y: 103 }, { tolerance: REACH, exclude: new Set(['a']) })).toEqual(
      [],
    );
  });

  it('offers nothing from a Point the viewport does not show', () => {
    const plan = planOf(point('a', 100, 100));
    const within = { x: 200, y: 0, w: 400, h: 400 };
    expect(alignmentGuides(plan, { x: 102, y: 103 }, { tolerance: REACH, within })).toEqual([]);
  });

  it('keeps a Point on the viewport edge', () => {
    const plan = planOf(point('a', 100, 100));
    const within = { x: 100, y: 100, w: 400, h: 400 };
    expect(alignmentGuides(plan, { x: 102, y: 103 }, { tolerance: REACH, within })).toHaveLength(2);
  });
});

describe('who wins a coordinate', () => {
  it('takes the nearest line', () => {
    const plan = planOf(point('far', 300, 97), point('near', 500, 101));
    expect(alignmentGuides(plan, { x: 0, y: 100 }, { tolerance: REACH })).toEqual([
      { pointId: 'near', held: 'y', at: 101 },
    ]);
  });

  it('on the same line, takes the nearest source Point', () => {
    const plan = planOf(point('far', 900, 101), point('near', 300, 101));
    expect(alignmentGuides(plan, { x: 100, y: 100 }, { tolerance: REACH })).toEqual([
      { pointId: 'near', held: 'y', at: 101 },
    ]);
  });

  // Stability, not pedantry: two Points at an exact tie must not swap the
  // winner between consecutive aims, or the chrome flickers.
  it('on an exact tie, takes the lowest Point id', () => {
    const plan = planOf(point('b', 300, 101), point('a', 300, 101));
    expect(alignmentGuides(plan, { x: 100, y: 100 }, { tolerance: REACH })).toEqual([
      { pointId: 'a', held: 'y', at: 101 },
    ]);
  });
});

describe('guideCrossing', () => {
  const slant = { at: { x: 100, y: 100 }, dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 } };

  it('meets a slanted line at one point', () => {
    const crossing = guideCrossing({ pointId: 'a', held: 'x', at: 300 }, slant)!;
    expect(crossing.x).toBeCloseTo(300, 6);
    expect(crossing.y).toBeCloseTo(300, 6);
  });

  it('meets a row on the same line', () => {
    const crossing = guideCrossing({ pointId: 'a', held: 'y', at: 250 }, slant)!;
    expect(crossing.x).toBeCloseTo(250, 6);
    expect(crossing.y).toBeCloseTo(250, 6);
  });

  it('never meets a line parallel to it', () => {
    const horizontal = { at: { x: 0, y: 0 }, dir: { x: 1, y: 0 } };
    expect(guideCrossing({ pointId: 'a', held: 'y', at: 250 }, horizontal)).toBeNull();
  });
});
