import { describe, expect, it } from 'vitest';
import {
  deleteOpening,
  moveOpening,
  openingRail,
  placeOpening,
  railedOpeningOffset,
  setOpeningWidth,
  toggleHingeSide,
  toggleSwing,
} from './openings';
import { buildPlan, squareRoomPlan } from './testHelpers';
import { DOOR_WIDTH } from './types';

const rectPlan = () =>
  buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    b.wall(p1, p2);
  });

describe('openingRail', () => {
  it('runs the full-thickness stretch of the wall when nothing else is on it', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 200)).toEqual({ from: -5, to: 405 });
  });

  it('stops at the mitered corners of a room wall', () => {
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    expect(openingRail(plan, bottom, 200)).toEqual({ from: 5, to: 395 });
  });

  it('cuts back to the near edge of the openings flanking the reference position', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'window', 60, 60); // edges 30 / 90
      b.opening(wall, 'door', 300, 80); // edges 260 / 340
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 200)).toEqual({ from: 90, to: 260 });
  });

  it('excludes the opening being placed from its own bounds', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'window', 200, 80);
    });
    const wall = Object.values(plan.walls)[0];
    const opening = Object.values(plan.openings)[0];
    expect(openingRail(plan, wall, 200, opening.id)).toEqual({ from: -5, to: 405 });
  });

  it('sides a neighbour by the reference position, so a rail never spans one', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'window', 200, 80); // edges 160 / 240
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 300)).toEqual({ from: 240, to: 405 });
    expect(openingRail(plan, wall, 100)).toEqual({ from: -5, to: 160 });
  });

  it('reads a neighbour where it is drawn, not where it is stored', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(200, 0));
      b.opening(wall, 'window', 380, 80);
    });
    const wall = Object.values(plan.walls)[0];
    // full-thickness span -5 → 205, so the neighbour renders centred on 165
    expect(openingRail(plan, wall, 50)).toEqual({ from: -5, to: 125 });
  });

  it('ignores the openings of other walls', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
      const other = b.wall(b.point(0, 200), b.point(400, 200));
      b.opening(other, 'door', 200, 80);
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 200)).toEqual({ from: -5, to: 405 });
  });
});

describe('railedOpeningOffset', () => {
  it('lands the offset flush against each end of the rail', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
    });
    const wall = Object.values(plan.walls)[0];
    // rail -5 → 405: a 90 opening centres between 40 and 360
    expect(railedOpeningOffset(plan, wall, 10, 90)).toBe(40);
    expect(railedOpeningOffset(plan, wall, 395, 90)).toBe(360);
    expect(railedOpeningOffset(plan, wall, 200, 90)).toBe(200);
  });

  it('lands exactly on a rail end that is not a whole centimetre', () => {
    // a 45° corner miters the rail end to an irrational offset: rounding to
    // whole centimetres must not push the opening off its bound
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const corner = b.point(400, 0);
      b.wall(a, corner);
      b.wall(corner, b.point(700, 300));
    });
    const wall = Object.values(plan.walls)[0];
    const rail = openingRail(plan, wall, 200);
    expect(Number.isInteger(rail.to)).toBe(false);
    expect(railedOpeningOffset(plan, wall, 400, 90)).toBe(rail.to - 45);
  });

  // Unlike the Dimension's, this Rail binds the plan (CONTEXT.md: Rail).
  it('refuses a rail shorter than the opening', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(60, 0));
    });
    const wall = Object.values(plan.walls)[0];
    expect(railedOpeningOffset(plan, wall, 30, 90)).toBe(null);
  });

  it('refuses a wall that is not there', () => {
    const plan = buildPlan(() => {});
    expect(railedOpeningOffset(plan, undefined, 30, 90)).toBe(null);
  });
});

describe('openings', () => {
  it('places a door with defaults at a clamped integer offset, returning its id', () => {
    const base = rectPlan();
    const [plan, id] = placeOpening(base, Object.keys(base.walls)[0], 'door', 200.4);
    expect(id).not.toBeNull();
    const door = plan.openings[id!];
    expect(door).toMatchObject({ type: 'door', offset: 200, width: DOOR_WIDTH });
    if (door.type === 'door') {
      expect(door.hingeSide).toBe('start');
      expect(door.swing).toBe('in');
    }
  });

  it('places a door with the given width, hinge side and swing', () => {
    const base = rectPlan();
    const [plan, id] = placeOpening(base, Object.keys(base.walls)[0], 'door', 200, {
      width: 80,
      hingeSide: 'end',
      swing: 'out',
    });
    expect(plan.openings[id!]).toMatchObject({ width: 80, hingeSide: 'end', swing: 'out' });
  });

  it('places a window with the given width, clamped to fit', () => {
    const base = rectPlan();
    const [plan, id] = placeOpening(base, Object.keys(base.walls)[0], 'window', 390, { width: 60 });
    // free wall: the rail reaches the overhang at 405, so the window sits flush
    expect(plan.openings[id!]).toMatchObject({ type: 'window', width: 60, offset: 375 });
  });

  it('refuses to place an opening on a wall narrower than it', () => {
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(60, 0);
      b.wall(p1, p2);
    });
    const wallId = Object.keys(plan.walls)[0];
    const [next, id] = placeOpening(plan, wallId, 'door', 30);
    expect(next).toBe(plan);
    expect(id).toBeNull();
  });

  it('moves an opening along its wall, clamped', () => {
    let plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    let id: string | null;
    [plan, id] = placeOpening(plan, wallId, 'window', 200);
    expect(moveOpening(plan, id!, 390).openings[id!].offset).toBe(345);
  });

  it('stops a move at the near edge of a neighbouring opening', () => {
    let plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    let id: string | null;
    [plan, id] = placeOpening(plan, wallId, 'window', 100, { width: 80 });
    // a door (90) at 300 occupies 255 → 345; the window can reach 215 at most
    [plan] = placeOpening(plan, wallId, 'door', 300, { width: 90 });
    expect(moveOpening(plan, id!, 400).openings[id!].offset).toBe(215);
  });

  it('places a new opening beside the one already under the pointer', () => {
    let plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    [plan] = placeOpening(plan, wallId, 'door', 200, { width: 90 }); // 155 → 245
    const [next, id] = placeOpening(plan, wallId, 'window', 220, { width: 60 });
    // 220 sits past the door's centre, so the new window takes the far side
    expect(next.openings[id!].offset).toBe(275);
  });

  it('changes width, re-clamping the offset', () => {
    let plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    let id: string | null;
    [plan, id] = placeOpening(plan, wallId, 'door', 55);
    const next = setOpeningWidth(plan, id!, 160);
    expect(next.openings[id!].width).toBe(160);
    expect(next.openings[id!].offset).toBe(75);
  });

  it('slides an opening to make room for its new width, and refuses when it cannot', () => {
    let plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    let id: string | null;
    [plan, id] = placeOpening(plan, wallId, 'window', 100, { width: 60 }); // 70 → 130
    [plan] = placeOpening(plan, wallId, 'door', 200, { width: 90 }); // 155 → 245
    // rail for the window: -5 → 155. Widening to 120 slides it up against the
    // door, where it spans 35 → 155
    const wider = setOpeningWidth(plan, id!, 120);
    expect(wider.openings[id!]).toMatchObject({ width: 120, offset: 95 });
    // 200 cannot fit in a 160-wide rail at all
    expect(setOpeningWidth(plan, id!, 200)).toBe(plan);
  });

  it('toggles door hinge side and swing', () => {
    let plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    let id: string | null;
    [plan, id] = placeOpening(plan, wallId, 'door', 200);
    let next = toggleHingeSide(plan, id!);
    let door = next.openings[id!];
    expect(door.type === 'door' && door.hingeSide).toBe('end');
    next = toggleSwing(next, id!);
    door = next.openings[id!];
    expect(door.type === 'door' && door.swing).toBe('out');
  });

  it('deletes an opening', () => {
    let plan = rectPlan();
    const wallId = Object.keys(plan.walls)[0];
    let id: string | null;
    [plan, id] = placeOpening(plan, wallId, 'door', 200);
    expect(Object.keys(deleteOpening(plan, id!).openings)).toHaveLength(0);
  });
});
