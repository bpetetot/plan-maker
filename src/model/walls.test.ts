import { describe, expect, it } from 'vitest';
import { placeOpening } from './openings';
import { buildPlan } from './testHelpers';
import { deleteWall, movePoint, setDimPlacement, setPoints, setWallThickness } from './walls';

const rectPlan = () =>
  buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    b.wall(p1, p2);
  });

describe('movePoint / setPoints', () => {
  it('moves a shared point (all attached walls follow implicitly)', () => {
    const plan = rectPlan();
    const id = Object.keys(plan.points)[0];
    const next = movePoint(plan, id, 50.4, 60.5);
    expect(next.points[id]).toMatchObject({ x: 50, y: 61 });
  });

  it('setPoints updates several points at once', () => {
    const plan = rectPlan();
    const [a, b] = Object.keys(plan.points);
    const next = setPoints(plan, { [a]: { x: 1, y: 2 }, [b]: { x: 3, y: 4 } });
    expect(next.points[a]).toMatchObject({ x: 1, y: 2 });
    expect(next.points[b]).toMatchObject({ x: 3, y: 4 });
  });
});

describe('deleteWall', () => {
  it('deletes the wall, its openings, and now-orphan points', () => {
    let plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 300);
      b.wall(p1, p2);
      b.wall(p2, p3);
    });
    const wall = Object.values(plan.walls).find((w) => {
      return plan.points[w.startPointId].y === 0 && plan.points[w.endPointId].y === 0;
    })!;
    plan = placeOpening(plan, wall.id, 'door', 200)[0];
    expect(Object.keys(plan.openings)).toHaveLength(1);

    const next = deleteWall(plan, wall.id);
    expect(next.walls[wall.id]).toBeUndefined();
    expect(Object.keys(next.openings)).toHaveLength(0);
    // p1 became orphan, p2 still used by the second wall
    expect(Object.keys(next.points)).toHaveLength(2);
  });
});

describe('setWallThickness', () => {
  it('sets the thickness of a wall', () => {
    const plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    expect(setWallThickness(plan, wallId, 20).walls[wallId].thickness).toBe(20);
  });

  it('is a no-op for an unknown wall', () => {
    const plan = rectPlan();
    expect(setWallThickness(plan, 'nope', 20)).toBe(plan);
  });
});

describe('setDimPlacement', () => {
  it('stores the placement on the wall, rounded to 3 decimals', () => {
    const plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    expect(setDimPlacement(plan, wallId, 0.75, -1).walls[wallId].dimPlacement).toEqual({
      t: 0.75,
      side: -1,
    });
    expect(setDimPlacement(plan, wallId, 1 / 3, 1).walls[wallId].dimPlacement).toEqual({
      t: 0.333,
      side: 1,
    });
  });

  // Bounding is the Rail's business, upstream (ADR 0027): this stores what the
  // gesture already railed.
  it('stores the ratio it is handed, without a bound of its own', () => {
    const plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    expect(setDimPlacement(plan, wallId, 0.88, 1).walls[wallId].dimPlacement).toEqual({
      t: 0.88,
      side: 1,
    });
  });

  it('is a no-op for an unknown wall', () => {
    const plan = rectPlan();
    expect(setDimPlacement(plan, 'missing', 0.5, 1)).toBe(plan);
  });
});
