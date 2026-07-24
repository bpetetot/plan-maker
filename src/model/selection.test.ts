import { describe, expect, it } from 'vitest';
import {
  allElements,
  deleteElements,
  elementsInRect,
  isSelected,
  refKey,
  referencePoint,
  roomContents,
  roomDeletion,
  roomSelection,
  selectedRoom,
  selectionContents,
  selectionDeletion,
  toggleRef,
  translateElements,
} from './selection';
import { detectRooms, roomAt, roomWallIds } from './rooms';
import { buildPlan, doorOn, nestedRoomPlan, squareRoomPlan, twoRoomPlan } from './testHelpers';
import { emptyPlan } from './types';
import type { ElementRef } from './selection';

const wallRef = (id: string): ElementRef => ({ type: 'wall', id });
const openingRef = (id: string): ElementRef => ({ type: 'opening', id });
const rulerRef = (id: string): ElementRef => ({ type: 'ruler', id });

describe('toggleRef', () => {
  it('adds a ref that is not in the selection', () => {
    const sel = toggleRef([wallRef('w1')], openingRef('o1'));
    expect(sel).toHaveLength(2);
    expect(isSelected(sel, openingRef('o1'))).toBe(true);
  });

  it('removes a ref already in the selection, matching on type and id', () => {
    const sel = toggleRef([wallRef('x'), openingRef('x')], wallRef('x'));
    expect(sel).toEqual([openingRef('x')]);
  });
});

describe('elementsInRect', () => {
  it('selects a wall only when both endpoints are inside (containment)', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(200, 0);
      const d = b.point(200, 500);
      b.wall(a, c);
      b.wall(c, d);
    });
    const [inside, crossing] = Object.values(plan.walls);
    const refs = elementsInRect(plan, { x: -10, y: -10 }, { x: 300, y: 100 });
    expect(isSelected(refs, wallRef(inside.id))).toBe(true);
    expect(isSelected(refs, wallRef(crossing.id))).toBe(false);
  });

  it('normalizes the corners (any drag direction)', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(100, 0));
    });
    const wall = Object.values(plan.walls)[0];
    const refs = elementsInRect(plan, { x: 150, y: 50 }, { x: -50, y: -50 });
    expect(isSelected(refs, wallRef(wall.id))).toBe(true);
  });

  it('selects an opening whose span is inside even when its wall is not', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(1000, 0));
      b.opening(wall, 'door', 500, 90);
    });
    const wall = Object.values(plan.walls)[0];
    const opening = Object.values(plan.openings)[0];
    // opening span [455, 545] fits the rect; the wall does not
    const refs = elementsInRect(plan, { x: 400, y: -50 }, { x: 600, y: 50 });
    expect(isSelected(refs, openingRef(opening.id))).toBe(true);
    expect(isSelected(refs, wallRef(wall.id))).toBe(false);
  });

  it('leaves out an opening whose span sticks out of the rect', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(1000, 0));
      b.opening(wall, 'window', 500, 120);
    });
    const opening = Object.values(plan.openings)[0];
    // span is [440, 560]; the rect stops at 550
    const refs = elementsInRect(plan, { x: 400, y: -50 }, { x: 550, y: 50 });
    expect(isSelected(refs, openingRef(opening.id))).toBe(false);
  });

  it('never captures room labels (they are not selectable)', () => {
    const plan = buildPlan((b) => {
      b.label('Kitchen', 50, 50);
    });
    const refs = elementsInRect(plan, { x: 0, y: 0 }, { x: 100, y: 100 });
    expect(refs).toEqual([]);
  });

  it('captures a Ruler only when both endpoints are inside, and only when asked', () => {
    const plan = {
      ...emptyPlan(),
      rulers: {
        in: { id: 'in', a: { x: 10, y: 10 }, b: { x: 90, y: 90 }, t: 0.5 },
        out: { id: 'out', a: { x: 10, y: 10 }, b: { x: 300, y: 90 }, t: 0.5 },
      },
    };
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 100 };
    expect(elementsInRect(plan, a, b)).toEqual([]); // rulers stay out by default
    const refs = elementsInRect(plan, a, b, true);
    expect(isSelected(refs, rulerRef('in'))).toBe(true);
    expect(isSelected(refs, rulerRef('out'))).toBe(false); // B sticks out of the rect
  });
});

describe('allElements', () => {
  it('takes every wall and every opening the plan holds', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const w1 = b.wall(a, c);
      const w2 = b.wall(c, b.point(400, 400));
      b.opening(w1, 'door', 200);
      b.opening(w2, 'window', 200);
    });
    const expected = [
      ...Object.keys(plan.walls).map((id) => `wall:${id}`),
      ...Object.keys(plan.openings).map((id) => `opening:${id}`),
    ];
    expect(allElements(plan).map(refKey).sort()).toEqual(expected.sort());
  });

  it('holds nothing on an empty plan', () => {
    expect(allElements(emptyPlan())).toEqual([]);
  });

  it('includes Rulers only when asked', () => {
    const plan = {
      ...emptyPlan(),
      rulers: { r: { id: 'r', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 0.5 } },
    };
    expect(allElements(plan)).toEqual([]); // omitted by default
    expect(allElements(plan, true)).toEqual([rulerRef('r')]);
  });
});

describe('deleteElements', () => {
  it('deletes walls with their openings and orphan points, plus openings', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 300);
      const w1 = b.wall(a, c);
      const w2 = b.wall(c, d);
      b.opening(w1, 'door', 200);
      b.opening(w2, 'window', 150);
    });
    const [w1, w2] = Object.values(plan.walls);
    const [, onW2] = Object.values(plan.openings);

    const next = deleteElements(plan, [wallRef(w1.id), openingRef(onW2.id)]);

    expect(next.walls[w1.id]).toBeUndefined();
    expect(next.walls[w2.id]).toBeDefined();
    expect(Object.keys(next.openings)).toHaveLength(0);
    // a was only used by w1 → gone; c is still used by w2
    expect(next.points[w1.startPointId]).toBeUndefined();
    expect(next.points[w2.startPointId]).toBeDefined();
  });

  it('tolerates an opening ref whose wall is deleted in the same call', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'door', 200);
    });
    const wall = Object.values(plan.walls)[0];
    const opening = Object.values(plan.openings)[0];
    const next = deleteElements(plan, [wallRef(wall.id), openingRef(opening.id)]);
    expect(Object.keys(next.walls)).toHaveLength(0);
    expect(Object.keys(next.openings)).toHaveLength(0);
  });

  it('deletes a Ruler, leaving the others', () => {
    const plan = {
      ...emptyPlan(),
      rulers: {
        r: { id: 'r', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 0.5 },
        keep: { id: 'keep', a: { x: 0, y: 50 }, b: { x: 100, y: 50 }, t: 0.5 },
      },
    };
    const next = deleteElements(plan, [rulerRef('r')]);
    expect(next.rulers.r).toBeUndefined();
    expect(next.rulers.keep).toBeDefined();
  });
});

describe('translateElements', () => {
  it('translates each shared point once', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 300);
      b.wall(a, c);
      b.wall(c, d);
    });
    const [w1, w2] = Object.values(plan.walls);
    const next = translateElements(plan, [wallRef(w1.id), wallRef(w2.id)], 50, -20);
    expect(next.points[w1.startPointId]).toMatchObject({ x: 50, y: -20 });
    expect(next.points[w1.endPointId]).toMatchObject({ x: 450, y: -20 });
    expect(next.points[w2.endPointId]).toMatchObject({ x: 450, y: 280 });
  });

  it('stretches an unselected neighbor: the shared point moves, its far point stays', () => {
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 300);
      b.wall(a, c);
      b.wall(c, d);
    });
    const [w1, w2] = Object.values(plan.walls);
    const next = translateElements(plan, [wallRef(w1.id)], 100, 0);
    expect(next.points[w2.startPointId]).toMatchObject({ x: 500, y: 0 });
    expect(next.points[w2.endPointId]).toMatchObject({ x: 400, y: 300 });
  });

  it('leaves a selected opening in place when its wall is not selected', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'door', 200);
    });
    const wall = Object.values(plan.walls)[0];
    const opening = Object.values(plan.openings)[0];
    const next = translateElements(plan, [openingRef(opening.id)], 100, 100);
    expect(next.openings[opening.id].offset).toBe(200);
    expect(next.points[wall.startPointId]).toMatchObject({ x: 0, y: 0 });
  });

  it('ignores refs to elements that no longer exist', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(100, 0));
    });
    const next = translateElements(plan, [wallRef('gone'), openingRef('gone')], 10, 10);
    expect(next).toBe(plan);
  });

  it('returns the same plan for a zero translation', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(100, 0));
    });
    const wall = Object.values(plan.walls)[0];
    expect(translateElements(plan, [wallRef(wall.id)], 0, 0)).toBe(plan);
  });

  it('rides a selected Ruler rigidly, shifting both endpoints', () => {
    const base = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
    });
    const wall = Object.values(base.walls)[0];
    const plan = { ...base, rulers: { r: { id: 'r', a: { x: 10, y: 20 }, b: { x: 110, y: 20 }, t: 0.5 } } };
    const next = translateElements(plan, [wallRef(wall.id), rulerRef('r')], 50, -20);
    expect(next.rulers.r.a).toEqual({ x: 60, y: 0 });
    expect(next.rulers.r.b).toEqual({ x: 160, y: 0 });
    expect(next.rulers.r.t).toBe(0.5); // a ratio, untouched by the shift
  });

  it('translates a Ruler-only selection (no walls to move)', () => {
    const plan = {
      ...emptyPlan(),
      rulers: { r: { id: 'r', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 0.5 } },
    };
    const next = translateElements(plan, [rulerRef('r')], 30, 40);
    expect(next.rulers.r.a).toEqual({ x: 30, y: 40 });
    expect(next.rulers.r.b).toEqual({ x: 130, y: 40 });
  });
});

describe('refKey', () => {
  it('distinguishes same id across types', () => {
    expect(refKey(wallRef('x'))).not.toBe(refKey(openingRef('x')));
  });
});

describe('deleteElements — room label cascade', () => {
  // two 3×3 m rooms side by side sharing a divider, one label in each
  const twoLabeledRooms = () => {
    let ids = { leftWalls: [] as string[], divider: '', leftLabel: '', rightLabel: '' };
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const m1 = b.point(300, 0);
      const c = b.point(600, 0);
      const d = b.point(600, 300);
      const m2 = b.point(300, 300);
      const e = b.point(0, 300);
      const w1 = b.wall(a, m1);
      b.wall(m1, c);
      b.wall(c, d);
      b.wall(d, m2);
      const w5 = b.wall(m2, e);
      const w6 = b.wall(e, a);
      const divider = b.wall(m1, m2);
      ids = {
        leftWalls: [w1.id, w5.id, w6.id, divider.id],
        divider: divider.id,
        leftLabel: b.label('Kitchen', 150, 150).id,
        rightLabel: b.label('Living room', 450, 150).id,
      };
    });
    return { plan, ...ids };
  };

  it('deletes the label of a room whose wall is deleted', () => {
    const { plan, leftWalls, rightLabel } = twoLabeledRooms();
    const next = deleteElements(plan, [wallRef(leftWalls[0])]);
    expect(Object.keys(next.roomLabels)).toEqual([rightLabel]);
  });

  it('keeps only the oldest label when deleting the divider merges the rooms', () => {
    const { plan, divider, leftLabel } = twoLabeledRooms();
    const next = deleteElements(plan, [wallRef(divider)]);
    expect(Object.keys(next.roomLabels)).toEqual([leftLabel]);
  });

  it('deletes every label when the whole plan is deleted', () => {
    const { plan } = twoLabeledRooms();
    const refs = Object.keys(plan.walls).map(wallRef);
    expect(deleteElements(plan, refs).roomLabels).toEqual({});
  });
});

describe('translateElements — room label rigid move', () => {
  const labeledSquare = () => {
    let ids = { walls: [] as string[], label: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      const walls = [b.wall(p1, p2), b.wall(p2, p3), b.wall(p3, p4), b.wall(p4, p1)];
      ids = { walls: walls.map((w) => w.id), label: b.label('Kitchen', 350, 120).id };
    });
    return { plan, ...ids };
  };

  it('moves the label with the room when every boundary wall is selected', () => {
    const { plan, walls, label } = labeledSquare();
    const next = translateElements(plan, walls.map(wallRef), 50, -30);
    expect(next.roomLabels[label]).toMatchObject({ x: 400, y: 90 });
  });

  it('leaves the label in place when the room only deforms (partial selection)', () => {
    const { plan, walls, label } = labeledSquare();
    const next = translateElements(plan, [wallRef(walls[0])], 50, -30);
    expect(next.roomLabels[label]).toMatchObject({ x: 350, y: 120 });
  });

  it('does not move the label of an unselected room', () => {
    let ids = { leftWalls: [] as string[], rightLabel: '' };
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(300, 0);
      const d = b.point(300, 300);
      const e = b.point(0, 300);
      const f = b.point(500, 0);
      const g = b.point(800, 0);
      const h = b.point(800, 300);
      const i = b.point(500, 300);
      const left = [b.wall(a, c), b.wall(c, d), b.wall(d, e), b.wall(e, a)];
      b.wall(f, g);
      b.wall(g, h);
      b.wall(h, i);
      b.wall(i, f);
      b.label('Kitchen', 150, 150);
      ids = { leftWalls: left.map((w) => w.id), rightLabel: b.label('Living room', 650, 150).id };
    });
    const next = translateElements(plan, ids.leftWalls.map(wallRef), 20, 20);
    expect(next.roomLabels[ids.rightLabel]).toMatchObject({ x: 650, y: 150 });
  });
});

describe('translateElements — placement state', () => {
  it('translates the anchor without changing the placement state', () => {
    let ids = { walls: [] as string[], byDefault: '', custom: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      const walls = [b.wall(p1, p2), b.wall(p2, p3), b.wall(p3, p4), b.wall(p4, p1)];
      ids = {
        walls: walls.map((w) => w.id),
        byDefault: b.label('Kitchen', 200, 200).id,
        custom: b.label('Nook', 350, 120, true).id,
      };
    });
    const next = translateElements(plan, ids.walls.map(wallRef), 50, -30);
    expect(next.roomLabels[ids.byDefault]).toMatchObject({ x: 250, y: 170 });
    expect(next.roomLabels[ids.byDefault].placed).toBeUndefined();
    expect(next.roomLabels[ids.custom]).toMatchObject({ x: 400, y: 90, placed: true });
  });
});

describe('referencePoint', () => {
  it('picks the wall endpoint nearest the grab, not always the start point', () => {
    let ids = { wall: '', a: '', b: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      ids = { wall: b.wall(p1, p2).id, a: p1.id, b: p2.id };
    });
    expect(referencePoint(plan, [wallRef(ids.wall)], { x: 350, y: 20 })).toMatchObject({
      id: ids.b,
      x: 400,
      y: 0,
    });
  });

  it('searches every selected wall, whatever element the pointer went down on', () => {
    let ids = { far: '', near: '', nearPoint: '', opening: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(1000, 0);
      const p4 = b.point(1000, 400);
      const far = b.wall(p1, p2);
      ids = {
        far: far.id,
        near: b.wall(p3, p4).id,
        nearPoint: p3.id,
        opening: b.opening(far, 'door', 100).id,
      };
    });
    const refs = [wallRef(ids.far), wallRef(ids.near), openingRef(ids.opening)];
    expect(referencePoint(plan, refs, { x: 950, y: 30 })).toMatchObject({ id: ids.nearPoint });
  });

  it('breaks a distance tie on endpoint a, even when b has the lower id', () => {
    let ids = { wall: '', a: '' };
    const plan = buildPlan((b) => {
      const end = b.point(400, 0);
      const start = b.point(0, 0);
      ids = { wall: b.wall(start, end).id, a: start.id };
    });
    // equidistant from both endpoints
    expect(referencePoint(plan, [wallRef(ids.wall)], { x: 200, y: 100 })).toMatchObject({ id: ids.a });
  });

  it('breaks a distance tie across walls independently of the selection order', () => {
    let walls: string[] = [];
    const plan = buildPlan((b) => {
      walls = [b.wall(b.point(0, 0), b.point(-400, 0)).id, b.wall(b.point(0, 400), b.point(-400, 400)).id];
    });
    // equidistant from (0,0) and (0,400), each an `a` endpoint of its wall
    const grab = { x: 100, y: 200 };
    const forward = referencePoint(plan, walls.map(wallRef), grab);
    const reversed = referencePoint(plan, [...walls].reverse().map(wallRef), grab);
    expect(forward).toEqual(reversed);
  });

  it('returns null for a selection holding no wall point', () => {
    let opening = '';
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      opening = b.opening(wall, 'door', 100).id;
    });
    expect(referencePoint(plan, [openingRef(opening)], { x: 100, y: 0 })).toBeNull();
  });
});

// A room is read from the selection, never held in it (ADR 0014).
describe('selectedRoom', () => {
  it('reads the room whose boundary the selection is exactly', () => {
    const plan = twoRoomPlan();
    const rooms = detectRooms(plan);
    const left = roomAt(rooms, 200, 200)!;
    const sel = roomWallIds(plan, left)!.map(wallRef);
    expect(selectedRoom(plan, rooms, sel)).toBe(left);
  });

  it('reads nothing from a selection missing one of the room walls', () => {
    const plan = twoRoomPlan();
    const rooms = detectRooms(plan);
    const left = roomAt(rooms, 200, 200)!;
    const sel = roomWallIds(plan, left)!.slice(1).map(wallRef);
    expect(selectedRoom(plan, rooms, sel)).toBeNull();
  });

  it('reads nothing once a wall outside the room joins the selection', () => {
    const plan = twoRoomPlan();
    const rooms = detectRooms(plan);
    const left = roomAt(rooms, 200, 200)!;
    const right = roomAt(rooms, 600, 200)!;
    const outside = roomWallIds(plan, right)!.find((id) => !roomWallIds(plan, left)!.includes(id))!;
    const sel = [...roomWallIds(plan, left)!, outside].map(wallRef);
    expect(selectedRoom(plan, rooms, sel)).toBeNull();
  });

  // A marquee over a room captures its doors too, and an opening follows its
  // wall through every action — so the two selections are the same room.
  it('still reads the room when its own openings ride along', () => {
    let openingId = '';
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 400);
      const e = b.point(0, 400);
      const top = b.wall(a, c);
      b.wall(c, d);
      b.wall(d, e);
      b.wall(e, a);
      openingId = b.opening(top, 'door', 200).id;
    });
    const rooms = detectRooms(plan);
    const sel = [...roomWallIds(plan, rooms[0])!.map(wallRef), openingRef(openingId)];
    expect(selectedRoom(plan, rooms, sel)).toBe(rooms[0]);
  });

  it('reads nothing when an opening comes from a wall outside the room', () => {
    let openingId = '';
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 400);
      const e = b.point(0, 400);
      b.wall(a, c);
      b.wall(c, d);
      b.wall(d, e);
      b.wall(e, a);
      const stray = b.wall(b.point(0, 900), b.point(400, 900));
      openingId = b.opening(stray, 'door', 200).id;
    });
    const rooms = detectRooms(plan);
    const sel = [...roomWallIds(plan, rooms[0])!.map(wallRef), openingRef(openingId)];
    expect(selectedRoom(plan, rooms, sel)).toBeNull();
  });
});

// The refs a room reads as: clicking it and marqueeing it must land on the
// same set, or "indistinguishable afterwards" (ADR 0014) is a promise on paper.
describe('roomSelection', () => {
  const roomWithDoorPlan = () => {
    let ids = { door: '', outside: '' };
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const c = b.point(400, 0);
      const d = b.point(400, 400);
      const e = b.point(0, 400);
      const top = b.wall(a, c);
      b.wall(c, d);
      b.wall(d, e);
      b.wall(e, a);
      const away = b.wall(b.point(0, 900), b.point(400, 900));
      ids = { door: b.opening(top, 'door', 200).id, outside: b.opening(away, 'window', 200).id };
    });
    return { plan, ...ids };
  };

  it('takes the boundary walls and the openings they carry', () => {
    const { plan, door, outside } = roomWithDoorPlan();
    const room = detectRooms(plan)[0];
    const refs = roomSelection(plan, room)!;
    for (const id of roomWallIds(plan, room)!) expect(isSelected(refs, wallRef(id))).toBe(true);
    expect(isSelected(refs, openingRef(door))).toBe(true);
    expect(isSelected(refs, openingRef(outside))).toBe(false);
  });

  it('reads back as the room it came from', () => {
    const { plan } = roomWithDoorPlan();
    const rooms = detectRooms(plan);
    expect(selectedRoom(plan, rooms, roomSelection(plan, rooms[0])!)).toBe(rooms[0]);
  });

  it('gives nothing when the boundary does not resolve to walls', () => {
    const { plan } = roomWithDoorPlan();
    const room = detectRooms(plan)[0];
    // a diagonal loop: no wall spans that pair of points
    const diagonal = { ...room, pointIds: [room.pointIds[0], room.pointIds[2]] };
    expect(roomSelection(plan, diagonal)).toBeNull();
  });
});

describe('contents', () => {
  it('counts a selection from its refs, type by type', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.wall(b.point(0, 200), b.point(400, 200));
      b.opening(wall, 'door', 100);
      b.opening(wall, 'window', 300);
    });
    const refs = [...Object.keys(plan.walls).map(wallRef), ...Object.keys(plan.openings).map(openingRef)];
    expect(selectionContents(plan, refs)).toEqual({ walls: 2, doors: 1, windows: 1 });
  });

  it('counts nothing for refs pointing at elements the plan no longer holds', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
    });
    expect(selectionContents(plan, [wallRef('gone'), openingRef('gone')])).toEqual({
      walls: 0,
      doors: 0,
      windows: 0,
    });
  });

  it('counts a room from its boundary, island walls included', () => {
    const plan = nestedRoomPlan();
    const room = roomAt(detectRooms(plan), 330, 330)!;
    expect(roomContents(plan, room).walls).toBe(8);
  });

  it('counts the openings the room boundary carries, wherever they sit on it', () => {
    const plan = nestedRoomPlan();
    const walls = Object.values(plan.walls);
    plan.openings.d1 = doorOn(walls[0].id, 'd1');
    plan.openings.w1 = { id: 'w1', wallId: walls[4].id, type: 'window', offset: 75, width: 60 };
    const room = roomAt(detectRooms(plan), 330, 330)!;
    expect(roomContents(plan, room)).toEqual({ walls: 8, doors: 1, windows: 1 });
  });

  // The panel counts what is lit — a room excepted, which states itself.
  it('parts ways when a ref is dropped: the room holds, the selection follows', () => {
    const plan = squareRoomPlan();
    plan.openings.d1 = doorOn(Object.values(plan.walls)[0].id, 'd1');
    const room = detectRooms(plan)[0];
    const refs = toggleRef(roomSelection(plan, room)!, openingRef('d1'));
    expect(roomContents(plan, room).doors).toBe(1);
    expect(selectionContents(plan, refs).doors).toBe(0);
  });
});

// Center cell (400,400)-(800,800) ringed by four rooms, one per edge: every
// center wall is a neighbour's outline, so the center has nothing of its own.
function gridCenterPlan() {
  return buildPlan((b) => {
    const a = b.point(400, 400);
    const c = b.point(800, 400);
    const d = b.point(800, 800);
    const e = b.point(400, 800);
    b.wall(a, c);
    b.wall(c, d);
    b.wall(d, e);
    b.wall(e, a);
    const n1 = b.point(400, 0);
    const n2 = b.point(800, 0);
    b.wall(a, n1);
    b.wall(n1, n2);
    b.wall(n2, c);
    const e1 = b.point(1200, 400);
    const e2 = b.point(1200, 800);
    b.wall(c, e1);
    b.wall(e1, e2);
    b.wall(e2, d);
    const s1 = b.point(800, 1200);
    const s2 = b.point(400, 1200);
    b.wall(d, s1);
    b.wall(s1, s2);
    b.wall(s2, e);
    const w1 = b.point(0, 800);
    const w2 = b.point(0, 400);
    b.wall(e, w1);
    b.wall(w1, w2);
    b.wall(w2, a);
  });
}

// Deleting a room keeps every wall that is another room's outline, so no
// neighbour is broken (ADR 0015).
describe('roomDeletion', () => {
  it('takes the whole boundary of a standalone room', () => {
    const plan = squareRoomPlan();
    const rooms = detectRooms(plan);
    const del = new Set(roomDeletion(plan, rooms, rooms[0]).map((r) => r.id));
    expect(del).toEqual(new Set(Object.keys(plan.walls)));
  });

  it('keeps the party wall shared with a neighbour', () => {
    const plan = twoRoomPlan();
    const rooms = detectRooms(plan);
    const left = roomAt(rooms, 200, 200)!;
    const right = roomAt(rooms, 600, 200)!;
    const shared = roomWallIds(plan, left)!.find((id) => roomWallIds(plan, right)!.includes(id))!;
    const del = roomDeletion(plan, rooms, left).map((r) => r.id);
    expect(del).not.toContain(shared);
    expect(del).toHaveLength(3);
  });

  it('leaves the neighbour standing after the delete', () => {
    const plan = twoRoomPlan();
    const rooms = detectRooms(plan);
    const left = roomAt(rooms, 200, 200)!;
    const next = deleteElements(plan, roomDeletion(plan, rooms, left));
    const after = detectRooms(next);
    expect(roomAt(after, 600, 200)).not.toBeNull();
    expect(roomAt(after, 200, 200)).toBeNull();
  });

  it('keeps the island walls when the container is deleted', () => {
    const plan = nestedRoomPlan();
    const rooms = detectRooms(plan);
    const container = roomAt(rooms, 350, 350)!;
    const next = deleteElements(plan, roomDeletion(plan, rooms, container));
    const after = detectRooms(next);
    expect(roomAt(after, 175, 150)).not.toBeNull();
    expect(roomAt(after, 350, 350)).toBeNull();
  });

  it('removes the island walls when the island is deleted, and the room reclaims its floor', () => {
    const plan = nestedRoomPlan();
    const rooms = detectRooms(plan);
    const island = roomAt(rooms, 175, 150)!;
    const before = roomAt(rooms, 350, 350)!;
    const next = deleteElements(plan, roomDeletion(plan, rooms, island));
    const after = detectRooms(next);
    expect(after).toHaveLength(1);
    expect(roomAt(after, 175, 150)!.areaCm2).toBeGreaterThan(before.areaCm2);
  });

  it('deletes nothing from a room whose every wall is a neighbour outline', () => {
    const plan = gridCenterPlan();
    const rooms = detectRooms(plan);
    const center = roomAt(rooms, 600, 600)!;
    expect(roomDeletion(plan, rooms, center)).toEqual([]);
  });
});

describe('selectionDeletion', () => {
  it('reduces a room selection to the walls the room may delete', () => {
    const plan = twoRoomPlan();
    const rooms = detectRooms(plan);
    const left = roomAt(rooms, 200, 200)!;
    const sel = roomSelection(plan, left)!;
    expect(selectionDeletion(plan, rooms, sel)).toEqual(roomDeletion(plan, rooms, left));
  });

  // Scope: only a room reading is narrowed — a lone party wall stays deletable.
  it('deletes any other selection exactly as it holds', () => {
    const plan = twoRoomPlan();
    const rooms = detectRooms(plan);
    const left = roomAt(rooms, 200, 200)!;
    const right = roomAt(rooms, 600, 200)!;
    const shared = roomWallIds(plan, left)!.find((id) => roomWallIds(plan, right)!.includes(id))!;
    const sel = [wallRef(shared)];
    expect(selectionDeletion(plan, rooms, sel)).toBe(sel);
  });

  // Openings need no rule of their own: they die with a removed wall and live
  // with a kept one (ADR 0015).
  it('keeps a door on a kept party wall and drops a window on a removed wall', () => {
    const plan = twoRoomPlan();
    const rooms = detectRooms(plan);
    const left = roomAt(rooms, 200, 200)!;
    const right = roomAt(rooms, 600, 200)!;
    const shared = roomWallIds(plan, left)!.find((id) => roomWallIds(plan, right)!.includes(id))!;
    const own = roomWallIds(plan, left)!.find((id) => id !== shared)!;
    plan.openings.od = {
      id: 'od',
      wallId: shared,
      type: 'door',
      offset: 200,
      width: 90,
      hingeSide: 'start',
      swing: 'in',
    };
    plan.openings.ow = { id: 'ow', wallId: own, type: 'window', offset: 200, width: 90 };
    const next = deleteElements(plan, selectionDeletion(plan, detectRooms(plan), roomSelection(plan, left)!));
    expect(next.openings.od).toBeDefined();
    expect(next.openings.ow).toBeUndefined();
  });
});
