import { describe, expect, it } from 'vitest';
import { commitPoint, commitWall, settleEdit, settlePlan } from '../../src/model/settle';
import { buildPlan, namedRoomPlan, squareRoomPlan, stackedRoomsPlan } from '../helpers';
import { setDimPlacement, setPoints } from '../../src/model/walls';

const rectPlan = () =>
  buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    b.wall(p1, p2);
  });

// ADR 0002. The split is reached through commitPoint, which looks the host up
// itself: a point landing on a wall body is what cuts it.
describe('splitting the host wall', () => {
  it('splits into two halves, the start side keeping the wall id', () => {
    const plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    const [p1, p2] = Object.keys(plan.points);
    const [next, mid] = commitPoint(plan, { x: 150, y: 0, kind: 'wall', wallId });
    expect(Object.keys(next.walls)).toHaveLength(2);
    expect(next.walls[wallId]).toMatchObject({ startPointId: p1, endPointId: mid, thickness: 10 });
    const other = Object.values(next.walls).find((w) => w.id !== wallId)!;
    expect(other).toMatchObject({ startPointId: mid, endPointId: p2, thickness: 10 });
  });

  it('reassigns each opening to the half containing its center', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'door', 60); // center on the start side
      b.opening(wall, 'window', 320); // center on the end side
    });
    const wallId = Object.keys(plan.walls)[0];
    const [doorId, windowId] = Object.keys(plan.openings);
    const [next] = commitPoint(plan, { x: 200, y: 0, kind: 'wall', wallId });
    expect(next.openings[doorId]).toMatchObject({ wallId, offset: 60 });
    // end-side opening rebased on the new half: 320 − 200 = 120
    const endHalf = Object.values(next.walls).find((w) => w.id !== wallId)!;
    expect(next.openings[windowId]).toMatchObject({ wallId: endHalf.id, offset: 120 });
  });

  it('deletes an opening straddling the cut', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'door', 200); // interval 155..245 contains the cut
    });
    const wallId = Object.keys(plan.walls)[0];
    const [next] = commitPoint(plan, { x: 210, y: 0, kind: 'wall', wallId });
    expect(Object.keys(next.openings)).toHaveLength(0);
  });

  it('keeps an opening the cut barely clears, however tight the half', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'door', 50); // interval 5..95, one centimetre clear of the cut
    });
    const wallId = Object.keys(plan.walls)[0];
    const doorId = Object.keys(plan.openings)[0];
    // its rail on the 96 cm half runs -5..96, still wider than the door
    const [next] = commitPoint(plan, { x: 96, y: 0, kind: 'wall', wallId });
    expect(next.openings[doorId]).toMatchObject({ offset: 50 });
  });

  it('deletes an opening the cut would force to shift, instead of moving it', () => {
    const plan = buildPlan((b) => {
      // interval -15..75: clear of the cut, but hanging past the start half's
      // overhang at -5 — clamping would silently move it to 40
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'door', 30);
    });
    const wallId = Object.keys(plan.walls)[0];
    const [next] = commitPoint(plan, { x: 100, y: 0, kind: 'wall', wallId });
    expect(Object.keys(next.openings)).toHaveLength(0);
  });

  it('keeps an opening that exactly fits its half at its stored offset', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'door', 50); // interval 5..95, inside the half's rail of -5..100
    });
    const wallId = Object.keys(plan.walls)[0];
    const doorId = Object.keys(plan.openings)[0];
    const [next] = commitPoint(plan, { x: 100, y: 0, kind: 'wall', wallId });
    expect(next.openings[doorId]).toMatchObject({ wallId, offset: 50 });
  });

  it('drops the dimension placement on both halves', () => {
    const plan = setDimPlacement(rectPlan(), Object.keys(rectPlan().walls)[0], 0.3, -1);
    const wallId = Object.keys(plan.walls)[0];
    const [next] = commitPoint(plan, { x: 200, y: 0, kind: 'wall', wallId });
    for (const wall of Object.values(next.walls)) expect(wall.dimPlacement).toBeUndefined();
  });
});

describe('commitPoint', () => {
  it('splits the host wall when the point lands on its body', () => {
    const plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    const [next, id] = commitPoint(plan, { x: 150, y: 0, kind: 'wall', wallId });
    expect(next.points[id]).toMatchObject({ x: 150, y: 0 });
    expect(Object.keys(next.walls)).toHaveLength(2);
    const touching = Object.values(next.walls).filter((w) => w.startPointId === id || w.endPointId === id);
    expect(touching).toHaveLength(2);
  });

  it('reuses a nearby existing point instead of splitting at a duplicate', () => {
    const plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    const endId = plan.walls[wallId].endPointId;
    const [next, id] = commitPoint(plan, { x: 400, y: 0, kind: 'wall', wallId });
    expect(id).toBe(endId);
    expect(next.walls).toEqual(plan.walls);
  });

  it('reuses a coincident existing point on a grid snap instead of duplicating it', () => {
    const plan = rectPlan();
    const endId = plan.walls[Object.keys(plan.walls)[0]].endPointId; // (400, 0)
    const [next, id] = commitPoint(plan, { x: 400, y: 0, kind: 'grid' });
    expect(id).toBe(endId);
    expect(next).toBe(plan);
  });

  it('reuses a coincident existing point on wall and free snaps too', () => {
    const plan = rectPlan();
    const endId = plan.walls[Object.keys(plan.walls)[0]].endPointId; // (400, 0)
    expect(commitPoint(plan, { x: 400, y: 0, kind: 'wall' })[1]).toBe(endId);
    // 400.4/0.4: within the 1 cm junction tolerance of the existing point
    expect(commitPoint(plan, { x: 400.4, y: 0.4, kind: 'free' })[1]).toBe(endId);
  });

  it('still splits the host when reusing a point that is not one of its ends', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      // (200, 1): a hair off the wall's body
      const stray = b.point(200, 1);
      const top = b.point(200, 300);
      b.wall(p1, p2);
      b.wall(stray, top);
    });
    const strayId = Object.keys(plan.points)[2];
    const wallId = Object.keys(plan.walls)[0];
    const [next, id] = commitPoint(plan, { x: 200, y: 0, kind: 'wall', wallId });
    expect(id).toBe(strayId);
    expect(Object.keys(next.walls)).toHaveLength(3);
    const touching = Object.values(next.walls).filter((w) => w.startPointId === id || w.endPointId === id);
    expect(touching).toHaveLength(3);
  });
});

describe('commitWall', () => {
  it('splits the host wall when an end lands on its body (T junction)', () => {
    const plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    const [next, endId] = commitWall(
      plan,
      { x: 200, y: 300, kind: 'grid' },
      { x: 200, y: 0, kind: 'wall', wallId },
    );
    expect(Object.keys(next.walls)).toHaveLength(3);
    expect(Object.keys(next.points)).toHaveLength(4);
    const junction = next.points[endId];
    expect(junction).toMatchObject({ x: 200, y: 0 });
    const touching = Object.values(next.walls).filter(
      (w) => w.startPointId === endId || w.endPointId === endId,
    );
    expect(touching).toHaveLength(3);
  });

  it('splits both walls at a crossing (X junction), including the new wall', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(200, -100);
      const p2 = b.point(200, 100);
      b.wall(p1, p2);
    });
    const [next] = commitWall(plan, { x: 0, y: 0, kind: 'grid' }, { x: 400, y: 0, kind: 'grid' });
    expect(Object.keys(next.walls)).toHaveLength(4);
    expect(Object.keys(next.points)).toHaveLength(5);
    const junction = Object.values(next.points).find((p) => p.x === 200 && p.y === 0)!;
    expect(junction).toBeDefined();
    const touching = Object.values(next.walls).filter(
      (w) => w.startPointId === junction.id || w.endPointId === junction.id,
    );
    expect(touching).toHaveLength(4);
  });

  it('gives every drawn segment the requested thickness, leaving crossed walls alone', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(200, -100);
      const p2 = b.point(200, 100);
      b.wall(p1, p2);
    });
    const [next] = commitWall(plan, { x: 0, y: 0, kind: 'grid' }, { x: 400, y: 0, kind: 'grid' }, 20);
    const drawn = Object.values(next.walls).filter(
      (w) => next.points[w.startPointId].y === 0 && next.points[w.endPointId].y === 0,
    );
    expect(drawn).toHaveLength(2);
    for (const w of drawn) expect(w.thickness).toBe(20);
    const crossed = Object.values(next.walls).filter((w) => !drawn.includes(w));
    expect(crossed).toHaveLength(2);
    for (const w of crossed) expect(w.thickness).toBe(10);
  });

  it('splits the new wall at an existing point lying on its path', () => {
    const plan = buildPlan((b) => {
      const foot = b.point(200, 0);
      const top = b.point(200, 300);
      b.wall(foot, top);
    });
    const footId = Object.keys(plan.points)[0];
    const [next] = commitWall(plan, { x: 0, y: 0, kind: 'grid' }, { x: 400, y: 0, kind: 'grid' });
    expect(Object.keys(next.walls)).toHaveLength(3);
    expect(Object.keys(next.points)).toHaveLength(4);
    const touching = Object.values(next.walls).filter(
      (w) => w.startPointId === footId || w.endPointId === footId,
    );
    expect(touching).toHaveLength(3);
  });
});

describe('merging coincident points', () => {
  it('merges coincident points, rewiring walls to the first-seen survivor', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const twin = b.point(400, 0);
      const p4 = b.point(400, 300);
      b.wall(p1, p2);
      b.wall(twin, p4);
    });
    const [p1, p2, twin, p4] = Object.keys(plan.points);
    const [w1, w2] = Object.keys(plan.walls);
    const next = settlePlan(plan);
    expect(Object.keys(next.points).sort()).toEqual([p1, p2, p4].sort());
    expect(next.points[twin]).toBeUndefined();
    expect(next.walls[w1]).toMatchObject({ startPointId: p1, endPointId: p2 });
    expect(next.walls[w2]).toMatchObject({ startPointId: p2, endPointId: p4 });
  });

  it('prefers a stationary survivor over a moved point', () => {
    const plan = buildPlan((b) => {
      const dragged = b.point(400, 0);
      const still = b.point(400, 0);
      b.wall(b.point(0, 0), dragged);
      b.wall(still, b.point(400, 300));
    });
    const [dragged, still] = Object.keys(plan.points);
    // the drag landed `dragged` on `still`: the plan it started from had them apart
    const points = { ...plan.points, [dragged]: { ...plan.points[dragged], x: 200 } };
    const next = settleEdit({ ...plan, points }, plan, new Set([dragged]));
    expect(next.points[still]).toBeDefined();
    expect(next.points[dragged]).toBeUndefined();
  });

  it('deletes a wall whose two ends merge, along with its openings', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(1, 0); // within the 1 cm junction tolerance of p1
      const shrunk = b.wall(p1, p2);
      b.wall(p2, b.point(300, 0));
      b.opening(shrunk, 'door', 0);
    });
    const next = settlePlan(plan);
    expect(next.walls[Object.keys(plan.walls)[0]]).toBeUndefined();
    expect(Object.keys(next.openings)).toHaveLength(0);
  });

  it('dedupes twin walls, transposing the removed twin openings onto the survivor', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const twin = b.point(400, 0);
      b.wall(p1, p2);
      const reversedTwin = b.wall(twin, p1); // same span, opposite direction
      b.opening(reversedTwin, 'door', 100);
    });
    const [w1, w2] = Object.keys(plan.walls);
    const doorId = Object.keys(plan.openings)[0];
    const next = settlePlan(plan);
    expect(next.walls[w2]).toBeUndefined();
    // 100 from the twin's start = 300 from the survivor's end; hinge and swing
    // are wall-relative, so the reversed frame flips both
    expect(next.openings[doorId]).toMatchObject({
      wallId: w1,
      offset: 300,
      hingeSide: 'end',
      swing: 'out',
    });
  });

  it('returns the same plan when there is nothing to settle', () => {
    const plan = squareRoomPlan();
    expect(settlePlan(plan)).toBe(plan);
  });
});

describe('settleEdit', () => {
  it('restores both invariants in one pass: the twin merges, the crossing splits', () => {
    // b and dragged coincide at (300,0); the dragged wall runs up to (300,-200)
    // and crosses the bar at y=-100
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const still = b.point(300, 0);
      const dragged = b.point(300, 0);
      const top = b.point(300, -200);
      const barLeft = b.point(250, -100);
      const barRight = b.point(350, -100);
      b.wall(a, still);
      b.wall(dragged, top);
      b.wall(barLeft, barRight);
    });
    const [, still, dragged] = Object.keys(plan.points);
    const next = settleEdit(plan, plan, new Set([dragged]));
    expect(next.points[dragged]).toBeUndefined();
    expect(next.points[still]).toBeDefined();
    // the vertical wall and the bar each split at the crossing
    expect(Object.keys(next.walls)).toHaveLength(5);
    expect(Object.values(next.points).find((p) => p.x === 300 && p.y === -100)).toBeDefined();
  });

  it('lets a stationary point outlive a moved one, whatever the creation order', () => {
    const plan = buildPlan((b) => {
      const dragged = b.point(400, 0);
      const still = b.point(400, 0);
      b.wall(b.point(0, 0), dragged);
      b.wall(still, b.point(400, 300));
    });
    const [dragged, still] = Object.keys(plan.points);
    const next = settleEdit(plan, plan, new Set([dragged]));
    expect(next.points[still]).toBeDefined();
    expect(next.points[dragged]).toBeUndefined();
  });

  it('reads each label home room from `before`, not from the settled plan', () => {
    const { plan, shared, top, bottom } = stackedRoomsPlan();
    // the shared wall sweeps down past BBB, which must stay with its own room
    const moved = { [shared[0]]: { x: 250, y: 250 }, [shared[1]]: { x: 450, y: 250 } };
    const next = settleEdit(plan, setPoints(plan, moved), new Set(shared));
    expect(next.roomLabels[top]).toMatchObject({ name: 'AAA', x: 350, y: 80 });
    expect(next.roomLabels[bottom]).toMatchObject({ name: 'BBB', x: 350, y: 275 });
  });

  it('returns the same plan when the edit settled nothing, labels included', () => {
    const plan = namedRoomPlan();
    expect(settleEdit(plan, plan)).toBe(plan);
  });
});

describe('settleEdit — planar insertion', () => {
  it('splits a wall under a point lying on its body (T junction)', () => {
    // w1 spans (0,0)→(400,0); the free end of w2 sits on its body at (150,0)
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const t = b.point(150, 0);
      const below = b.point(150, 200);
      b.wall(p1, p2);
      b.wall(t, below);
    });
    const [p1, p2, t] = Object.keys(plan.points);
    const w1 = Object.keys(plan.walls)[0];
    const next = settleEdit(plan, plan);
    expect(Object.keys(next.walls)).toHaveLength(3);
    expect(next.walls[w1]).toMatchObject({ startPointId: p1, endPointId: t });
    const endHalf = Object.values(next.walls).find((w) => w.startPointId === t && w.endPointId === p2);
    expect(endHalf).toBeDefined();
  });

  it('splits both walls at a crossing (X junction)', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(200, -100);
      const p4 = b.point(200, 100);
      b.wall(p1, p2);
      b.wall(p3, p4);
    });
    const next = settleEdit(plan, plan);
    expect(Object.keys(next.walls)).toHaveLength(4);
    const cross = Object.values(next.points).find((p) => p.x === 200 && p.y === 0)!;
    expect(cross).toBeDefined();
    const atCross = Object.values(next.walls).filter(
      (w) => w.startPointId === cross.id || w.endPointId === cross.id,
    );
    expect(atCross).toHaveLength(4);
  });

  it('resolves every crossing of a wall spanning two others', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, -100);
      const p2 = b.point(0, 100);
      const p3 = b.point(300, -100);
      const p4 = b.point(300, 100);
      const p5 = b.point(-100, 0);
      const p6 = b.point(400, 0);
      b.wall(p1, p2);
      b.wall(p3, p4);
      b.wall(p5, p6);
    });
    const next = settleEdit(plan, plan);
    // each vertical wall splits in two, the long wall in three
    expect(Object.keys(next.walls)).toHaveLength(7);
  });

  it('returns the same plan when the invariant already holds', () => {
    const plan = squareRoomPlan();
    expect(settleEdit(plan, plan)).toBe(plan);
  });

  it('collapses a wall dropped along another into shared pieces, never twins', () => {
    // w2 (100,0)→(300,0) lies on w1's body: the T splits carve w1 at both
    // ends of w2, and the middle piece would span the same pair as w2
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(100, 0);
      const p4 = b.point(300, 0);
      b.wall(p1, p2);
      b.wall(p3, p4);
    });
    const next = settleEdit(plan, plan);
    expect(Object.keys(next.walls)).toHaveLength(3);
    const pairs = Object.values(next.walls).map((w) => [w.startPointId, w.endPointId].sort().join('-'));
    expect(new Set(pairs).size).toBe(3);
  });
});
