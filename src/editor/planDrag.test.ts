// CONTEXT.md: Plan drag. The interface is the surface: begin, aim, commit.
import { describe, expect, it } from 'vitest';
import type { Vec } from '../model/geometry';
import { addRoomLabel } from '../model/rooms';
import { addRuler } from '../model/rulers';
import type { Room } from '../model/rooms';
import { detectRooms } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import { selectionForRoom } from '../model/selection';
import { buildPlan, squareRoomPlan } from '../model/testHelpers';
import type { Plan } from '../model/types';
import { aimPlanDrag, beginPlanDrag, commitPlanDrag } from './planDrag';

// pxPerCm 1 puts the snap tolerance at 14 cm. The click-vs-drag verdict comes
// with the env: the pointer router owns the threshold (ADR 0030).
const AIM = { pxPerCm: 1, free: false, moved: true };
const FREE = { pxPerCm: 1, free: true, moved: true };
const CLICK = { pxPerCm: 1, free: false, moved: false };

const wallPlan = () => {
  let ids = { a: '', b: '', wall: '' };
  const plan = buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    ids = { a: p1.id, b: p2.id, wall: b.wall(p1, p2).id };
  });
  return { plan, ...ids };
};

const at = (x: number, y: number) => ({ x, y });

describe('a point drag', () => {
  it('lands the Point on the aimed position, snapped to the grid', () => {
    const { plan, a } = wallPlan();
    const drag = aimPlanDrag(
      beginPlanDrag(plan, { kind: 'point', id: a, grabDelta: at(0, 0) }),
      at(37, 4),
      AIM,
    );
    expect(drag.plan.points[a]).toMatchObject({ x: 40, y: 0 });
    expect(drag.snap).toMatchObject({ kind: 'grid' });
  });

  it('keeps the aimed centimeters when the move is free', () => {
    const { plan, a } = wallPlan();
    const drag = aimPlanDrag(
      beginPlanDrag(plan, { kind: 'point', id: a, grabDelta: at(0, 0) }),
      at(37, 4),
      FREE,
    );
    expect(drag.plan.points[a]).toMatchObject({ x: 37, y: 4 });
    expect(drag.snap).toMatchObject({ kind: 'free' });
  });

  it('settles on commit: the Point dropped on its neighbour merges into one', () => {
    const { plan, a, b } = wallPlan();
    const dropped = aimPlanDrag(
      beginPlanDrag(plan, { kind: 'point', id: a, grabDelta: at(0, 0) }),
      at(400, 0),
      AIM,
    );
    // The wall is degenerate until the settle runs — the merge is the commit's job.
    expect(Object.keys(dropped.plan.points)).toHaveLength(2);
    const drag = commitPlanDrag(dropped);
    expect(Object.keys(drag.plan.points)).toHaveLength(1);
    expect(drag.plan.points[b]).toBeDefined();
    expect(drag.snap).toBeNull();
  });

  it('holds the grab point off-centre for the whole drag (CONTEXT.md: Grab zone)', () => {
    const { plan, a } = wallPlan();
    // Grabbed 30 cm to the right of the Point: the Point trails the cursor by that.
    const drag = aimPlanDrag(
      beginPlanDrag(plan, { kind: 'point', id: a, grabDelta: at(-30, 0) }),
      at(130, 2),
      AIM,
    );
    expect(drag.plan.points[a]).toMatchObject({ x: 100, y: 0 });
  });
});

describe('a ruler-endpoint drag', () => {
  const rulerPlan = () => {
    const { plan, a, wall } = wallPlan();
    const [withRuler, id] = addRuler(plan, at(100, 100), at(300, 100));
    return { plan: withRuler, id, a, wall };
  };

  it('snaps the endpoint onto an existing Point', () => {
    const { plan, id, a } = rulerPlan();
    const drag = aimPlanDrag(
      beginPlanDrag(plan, { kind: 'rulerEnd', id, end: 'a', grabDelta: at(0, 0) }),
      at(6, 5),
      AIM,
    );
    expect(drag.plan.rulers[id].a).toEqual({ x: 0, y: 0 });
    expect(drag.snap).toMatchObject({ kind: 'point', pointId: a });
  });

  it('snaps onto a wall body, which a Point drag never does', () => {
    const { plan, id, wall } = rulerPlan();
    const drag = aimPlanDrag(
      beginPlanDrag(plan, { kind: 'rulerEnd', id, end: 'b', grabDelta: at(0, 0) }),
      at(203, 7),
      AIM,
    );
    expect(drag.plan.rulers[id].b).toEqual({ x: 203, y: 0 });
    expect(drag.snap).toMatchObject({ kind: 'wall', wallId: wall });
  });

  it('leaves the drag untouched once its Ruler is gone', () => {
    const { plan, id } = rulerPlan();
    const drag = beginPlanDrag(plan, { kind: 'rulerEnd', id, end: 'a', grabDelta: at(0, 0) });
    const orphaned = { ...drag, plan: { ...plan, rulers: {} } };
    expect(aimPlanDrag(orphaned, at(6, 5), AIM)).toBe(orphaned);
  });

  it('does not settle on commit: a Ruler moves no Point and no Wall', () => {
    const { plan, id } = rulerPlan();
    const aimed = aimPlanDrag(
      beginPlanDrag(plan, { kind: 'rulerEnd', id, end: 'a', grabDelta: at(0, 0) }),
      at(6, 5),
      AIM,
    );
    const drag = commitPlanDrag(aimed);
    expect(drag.plan).toBe(aimed.plan);
    expect(drag.selection).toBeNull();
  });
});

describe('a group drag', () => {
  const groupDrag = (plan: Plan, wall: string, refPoint: Vec | null, clickRef?: ElementRef) =>
    beginPlanDrag(plan, {
      kind: 'group',
      refs: [{ type: 'wall', id: wall }],
      start: at(100, 0),
      refPoint,
      clickRef,
    });

  it('stays put below the click threshold', () => {
    const { plan, wall, a } = wallPlan();
    const drag = aimPlanDrag(groupDrag(plan, wall, at(0, 0)), at(103, 2), CLICK);
    expect(drag.moved).toBe(false);
    expect(drag.plan).toBe(plan);
    expect(drag.plan.points[a]).toMatchObject({ x: 0, y: 0 });
  });

  it('translates rigidly past it, landing the reference point on the grid', () => {
    const { plan, wall, a, b } = wallPlan();
    const drag = aimPlanDrag(groupDrag(plan, wall, at(0, 0)), at(107, 0), AIM);
    expect(drag.moved).toBe(true);
    expect(drag.plan.points[a]).toMatchObject({ x: 10, y: 0 });
    expect(drag.plan.points[b]).toMatchObject({ x: 410, y: 0 });
  });

  it('carries the raw delta when the move is free', () => {
    const { plan, wall, a } = wallPlan();
    const drag = aimPlanDrag(groupDrag(plan, wall, at(0, 0)), at(107, 0), FREE);
    expect(drag.plan.points[a]).toMatchObject({ x: 7, y: 0 });
  });

  it('stays anchored to the drag start, so a wobble cannot compound', () => {
    const { plan, wall, a } = wallPlan();
    const once = aimPlanDrag(groupDrag(plan, wall, at(0, 0)), at(107, 0), AIM);
    const twice = aimPlanDrag(once, at(107, 0), AIM);
    expect(twice.plan.points[a]).toMatchObject({ x: 10, y: 0 });
  });

  it('falls back to the clicked element when the drag was really a click', () => {
    const { plan, wall } = wallPlan();
    const clickRef: ElementRef = { type: 'wall', id: wall };
    const drag = commitPlanDrag(aimPlanDrag(groupDrag(plan, wall, at(0, 0), clickRef), at(103, 2), CLICK));
    expect(drag.selection).toEqual([clickRef]);
  });

  it('keeps the selection once it actually moved', () => {
    const { plan, wall } = wallPlan();
    const clickRef: ElementRef = { type: 'wall', id: wall };
    const drag = commitPlanDrag(aimPlanDrag(groupDrag(plan, wall, at(0, 0), clickRef), at(107, 0), AIM));
    expect(drag.selection).toBeNull();
  });
});

describe('an opening drag', () => {
  const openingPlan = () => {
    let ids = { wall: '', opening: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const w = b.wall(p1, p2);
      ids = { wall: w.id, opening: b.opening(w, 'door', 200, 90).id };
    });
    return { plan, ...ids };
  };

  const openingDrag = (plan: Plan, opening: string, grabDelta: number) =>
    beginPlanDrag(plan, { kind: 'opening', id: opening, grabDelta });

  it('stays put below the click threshold', () => {
    const { plan, opening } = openingPlan();
    const drag = aimPlanDrag(openingDrag(plan, opening, 0), at(203, 0), CLICK);
    expect(drag.moved).toBe(false);
    expect(drag.plan.openings[opening].offset).toBe(200);
  });

  it('slides along its Rail past the threshold', () => {
    const { plan, opening } = openingPlan();
    const drag = aimPlanDrag(openingDrag(plan, opening, 0), at(250, 30), AIM);
    expect(drag.moved).toBe(true);
    // Purely along the wall: the 30 cm off the axis do not count.
    expect(drag.plan.openings[opening].offset).toBe(250);
  });

  it('holds the grab point, so the opening never recenters on the cursor', () => {
    const { plan, opening } = openingPlan();
    // Grabbed 20 cm before its centre: the centre keeps trailing by 20 cm.
    const drag = aimPlanDrag(openingDrag(plan, opening, 20), at(250, 0), AIM);
    expect(drag.plan.openings[opening].offset).toBe(270);
  });

  it('does not settle on commit and takes no selection', () => {
    const { plan, opening } = openingPlan();
    const aimed = aimPlanDrag(openingDrag(plan, opening, 0), at(250, 0), AIM);
    const drag = commitPlanDrag(aimed);
    expect(drag.plan).toBe(aimed.plan);
    expect(drag.selection).toBeNull();
  });
});

describe('a dimension-placement drag', () => {
  const dimDrag = (plan: Plan, wall: string) => beginPlanDrag(plan, { kind: 'dim', id: wall, grabDelta: 0 });

  it('selects the wall when the drag was really a click', () => {
    const { plan, wall } = wallPlan();
    const drag = commitPlanDrag(aimPlanDrag(dimDrag(plan, wall), at(202, 11), CLICK));
    expect(drag.moved).toBe(false);
    expect(drag.plan.walls[wall].dimPlacement).toBeUndefined();
    expect(drag.selection).toEqual([{ type: 'wall', id: wall }]);
  });

  it('travels along the wall, further aim putting the label further along', () => {
    const { plan, wall } = wallPlan();
    const near = aimPlanDrag(dimDrag(plan, wall), at(120, 10), AIM);
    const far = aimPlanDrag(dimDrag(plan, wall), at(300, 10), AIM);
    expect(near.moved).toBe(true);
    expect(far.plan.walls[wall].dimPlacement!.t).toBeGreaterThan(near.plan.walls[wall].dimPlacement!.t);
  });

  it('switches side when the aim crosses the wall (CONTEXT.md: Dimension)', () => {
    const { plan, wall } = wallPlan();
    const above = aimPlanDrag(dimDrag(plan, wall), at(300, 40), AIM);
    const below = aimPlanDrag(dimDrag(plan, wall), at(300, -40), AIM);
    expect(above.plan.walls[wall].dimPlacement!.side).toBe(-below.plan.walls[wall].dimPlacement!.side);
  });

  it('takes no selection once it actually moved', () => {
    const { plan, wall } = wallPlan();
    const drag = commitPlanDrag(aimPlanDrag(dimDrag(plan, wall), at(300, 10), AIM));
    expect(drag.selection).toBeNull();
  });
});

// CONTEXT.md: Room label. Never selected — dragged and edited directly; the
// click that does not drag selects the Room the block names.
describe('a room-label drag', () => {
  const labelPlan = () => {
    const square = squareRoomPlan();
    const room = detectRooms(square)[0];
    const [plan, id] = addRoomLabel(square, 'Kitchen', 200, 200);
    return { plan, room, id };
  };

  const labelDrag = (plan: Plan, id: string, room: Room, additive = false, prev: ElementRef[] = []) =>
    beginPlanDrag(plan, {
      kind: 'label',
      id,
      room,
      grabDelta: at(0, 0),
      additive,
      prev,
    });

  it('stays put below the click threshold and selects the Room it names', () => {
    const { plan, room, id } = labelPlan();
    const drag = commitPlanDrag(aimPlanDrag(labelDrag(plan, id, room), at(202, 201), CLICK));
    expect(drag.plan.roomLabels[id]).toMatchObject({ x: 200, y: 200 });
    expect(drag.selection).toEqual(selectionForRoom(plan, room, false, []));
    expect(drag.selection).toHaveLength(4);
  });

  it('moves past the threshold and then takes no selection', () => {
    const { plan, room, id } = labelPlan();
    const drag = commitPlanDrag(aimPlanDrag(labelDrag(plan, id, room), at(250, 260), AIM));
    expect(drag.plan.roomLabels[id]).toMatchObject({ x: 250, y: 260 });
    expect(drag.selection).toBeNull();
  });

  it('clamps the block inside its room', () => {
    const { plan, room, id } = labelPlan();
    const drag = aimPlanDrag(labelDrag(plan, id, room), at(9000, 200), AIM);
    expect(drag.plan.roomLabels[id].x).toBeLessThan(400);
  });

  it('unions rather than replaces when the click is additive', () => {
    const { plan, room, id } = labelPlan();
    const prev: ElementRef[] = [{ type: 'text', id: 'keep-me' }];
    const drag = commitPlanDrag(aimPlanDrag(labelDrag(plan, id, room, true, prev), at(201, 200), CLICK));
    expect(drag.selection).toContainEqual(prev[0]);
    expect(drag.selection).toHaveLength(5);
  });
});

describe('a new-label drag', () => {
  const newLabelDrag = (plan: Plan, room: Room) =>
    beginPlanDrag(plan, {
      kind: 'newLabel',
      room,
      grabDelta: at(0, 0),
      additive: false,
      prev: [],
    });

  it('creates nothing below the threshold: a plain click must not touch the plan', () => {
    const plan = squareRoomPlan();
    const room = detectRooms(plan)[0];
    const drag = commitPlanDrag(aimPlanDrag(newLabelDrag(plan, room), at(202, 201), CLICK));
    expect(Object.keys(drag.plan.roomLabels)).toHaveLength(0);
    expect(drag.selection).toHaveLength(4);
  });

  it('is born unnamed past the threshold, then follows the cursor', () => {
    const plan = squareRoomPlan();
    const room = detectRooms(plan)[0];
    const born = aimPlanDrag(newLabelDrag(plan, room), at(250, 260), AIM);
    expect(born.labelId).not.toBeNull();
    expect(Object.values(born.plan.roomLabels)).toEqual([
      expect.objectContaining({ name: '', x: 250, y: 260 }),
    ]);

    const drag = commitPlanDrag(aimPlanDrag(born, at(270, 280), AIM));
    expect(Object.values(drag.plan.roomLabels)).toEqual([expect.objectContaining({ x: 270, y: 280 })]);
    expect(drag.selection).toBeNull();
  });

  it('is born already placed, on the aim that crosses the threshold', () => {
    const plan = squareRoomPlan();
    const room = detectRooms(plan)[0];
    const drag = commitPlanDrag(aimPlanDrag(newLabelDrag(plan, room), at(250, 260), AIM));
    expect(Object.values(drag.plan.roomLabels)).toEqual([
      expect.objectContaining({ name: '', x: 250, y: 260, placed: true }),
    ]);
  });
});
