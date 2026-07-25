import { describe, expect, it } from 'vitest';
import { placeOpening } from './openings';
import {
  addWall,
  commitPoint,
  commitWall,
  deleteWall,
  ensurePoint,
  mergeCoincidentPoints,
  movePoint,
  setDimPlacement,
  setPoints,
  settleEdit,
  setWallThickness,
  splitWall,
} from './operations';
import { buildPlan, namedRoomPlan, squareRoomPlan, stackedRoomsPlan } from './testHelpers';

const rectPlan = () =>
  buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    b.wall(p1, p2);
  });

describe('ensurePoint', () => {
  it('reuses an existing point when the snap carries a pointId', () => {
    const plan = rectPlan();
    const existingId = Object.keys(plan.points)[0];
    const [next, id] = ensurePoint(plan, { x: 0, y: 0, kind: 'point', pointId: existingId });
    expect(id).toBe(existingId);
    expect(next).toBe(plan);
  });

  it('creates a new rounded integer point otherwise', () => {
    const plan = rectPlan();
    const [next, id] = ensurePoint(plan, { x: 10.4, y: 19.6, kind: 'free' });
    expect(next.points[id]).toMatchObject({ x: 10, y: 20 });
  });
});

describe('splitWall', () => {
  it('splits a wall into two halves sharing the split point', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const mid = b.point(150, 0);
      b.wall(p1, p2);
      void mid;
    });
    const [p1, p2, mid] = Object.keys(plan.points);
    const wallId = Object.keys(plan.walls)[0];
    const next = splitWall(plan, wallId, mid);
    expect(Object.keys(next.walls)).toHaveLength(2);
    expect(next.walls[wallId]).toMatchObject({ startPointId: p1, endPointId: mid, thickness: 10 });
    const other = Object.values(next.walls).find((w) => w.id !== wallId)!;
    expect(other).toMatchObject({ startPointId: mid, endPointId: p2, thickness: 10 });
  });

  it('is a no-op when the point is one of the wall ends', () => {
    const plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    const endId = plan.walls[wallId].endPointId;
    expect(splitWall(plan, wallId, endId)).toBe(plan);
  });

  it('reassigns each opening to the half containing its center', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const mid = b.point(200, 0);
      const wall = b.wall(p1, p2);
      b.opening(wall, 'door', 60); // center on the start side
      b.opening(wall, 'window', 320); // center on the end side
      void mid;
    });
    const mid = Object.keys(plan.points)[2];
    const wallId = Object.keys(plan.walls)[0];
    const [doorId, windowId] = Object.keys(plan.openings);
    const next = splitWall(plan, wallId, mid);
    expect(next.openings[doorId]).toMatchObject({ wallId, offset: 60 });
    // end-side opening rebased on the new half: 320 − 200 = 120
    const endHalf = Object.values(next.walls).find((w) => w.id !== wallId)!;
    expect(next.openings[windowId]).toMatchObject({ wallId: endHalf.id, offset: 120 });
  });

  it('deletes an opening straddling the cut', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const cut = b.point(210, 0);
      const wall = b.wall(p1, p2);
      b.opening(wall, 'door', 200); // interval 155..245 contains the cut
      void cut;
    });
    const cut = Object.keys(plan.points)[2];
    const wallId = Object.keys(plan.walls)[0];
    const next = splitWall(plan, wallId, cut);
    expect(Object.keys(next.openings)).toHaveLength(0);
  });

  it('keeps an opening the cut barely clears, however tight the half', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const cut = b.point(96, 0);
      const wall = b.wall(p1, p2);
      b.opening(wall, 'door', 50); // interval 5..95, one centimetre clear of the cut
      void cut;
    });
    const cut = Object.keys(plan.points)[2];
    const wallId = Object.keys(plan.walls)[0];
    const doorId = Object.keys(plan.openings)[0];
    // its rail on the 96 cm half runs -5..96, still wider than the door
    expect(splitWall(plan, wallId, cut).openings[doorId]).toMatchObject({ offset: 50 });
  });

  it('deletes an opening the cut would force to shift, instead of moving it', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const cut = b.point(100, 0);
      const wall = b.wall(p1, p2);
      // interval -15..75: clear of the cut, but hanging past the start half's
      // overhang at -5 — clamping would silently move it to 40
      b.opening(wall, 'door', 30);
      void cut;
    });
    const cut = Object.keys(plan.points)[2];
    const wallId = Object.keys(plan.walls)[0];
    const next = splitWall(plan, wallId, cut);
    expect(Object.keys(next.openings)).toHaveLength(0);
  });

  it('keeps an opening that exactly fits its half at its stored offset', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const cut = b.point(100, 0);
      const wall = b.wall(p1, p2);
      b.opening(wall, 'door', 50); // interval 5..95, inside the half's rail of -5..100
      void cut;
    });
    const cut = Object.keys(plan.points)[2];
    const wallId = Object.keys(plan.walls)[0];
    const doorId = Object.keys(plan.openings)[0];
    const next = splitWall(plan, wallId, cut);
    expect(next.openings[doorId]).toMatchObject({ wallId, offset: 50 });
  });

  it('drops the dimension placement on both halves', () => {
    let plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const mid = b.point(200, 0);
      b.wall(p1, p2);
      void mid;
    });
    const mid = Object.keys(plan.points)[2];
    const wallId = Object.keys(plan.walls)[0];
    plan = setDimPlacement(plan, wallId, 0.3, -1);
    const next = splitWall(plan, wallId, mid);
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

describe('addWall', () => {
  it('adds a wall with default thickness', () => {
    const plan = rectPlan();
    const [p1, p2] = Object.keys(plan.points);
    const withPoint = ensurePoint(plan, { x: 400, y: 300, kind: 'free' });
    const next = addWall(withPoint[0], p2, withPoint[1]);
    expect(Object.keys(next.walls)).toHaveLength(2);
    const added = Object.values(next.walls).find((w) => w.startPointId === p2)!;
    expect(added.thickness).toBe(10);
    expect(added.endPointId).toBe(withPoint[1]);
    expect(p1).toBeTruthy();
  });

  it('adds a wall with the requested thickness', () => {
    const plan = rectPlan();
    const [, p2] = Object.keys(plan.points);
    const [withPoint, p3] = ensurePoint(plan, { x: 400, y: 300, kind: 'free' });
    const next = addWall(withPoint, p2, p3, 25);
    const added = Object.values(next.walls).find((w) => w.startPointId === p2)!;
    expect(added.thickness).toBe(25);
  });

  it('rejects self-loops and duplicate walls (either direction)', () => {
    const plan = rectPlan();
    const [p1, p2] = Object.keys(plan.points);
    expect(addWall(plan, p1, p1)).toBe(plan);
    expect(addWall(plan, p1, p2)).toBe(plan);
    expect(addWall(plan, p2, p1)).toBe(plan);
  });
});

describe('mergeCoincidentPoints', () => {
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
    const next = mergeCoincidentPoints(plan);
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
    const next = mergeCoincidentPoints(plan, new Set([dragged]));
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
    const next = mergeCoincidentPoints(plan);
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
    const next = mergeCoincidentPoints(plan);
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

  it('returns the same plan when no points coincide', () => {
    const plan = squareRoomPlan();
    expect(mergeCoincidentPoints(plan)).toBe(plan);
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
