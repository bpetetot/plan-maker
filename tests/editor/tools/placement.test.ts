// CONTEXT.md: Placement. The interface is the surface: begin, aim, click,
// finish, cancel — and the chrome the placement asks the screen to draw.
import { describe, expect, it } from 'vitest';
import { addRoomLabel } from '../../../src/model/roomLabels';
import { detectRooms } from '../../../src/model/rooms';
import { emptyPlan } from '../../../src/model/types';
import { buildPlan, squareRoomPlan } from '../../helpers';
import type { Plan } from '../../../src/model/types';
import type { Placement, PlacementResult } from '../../../src/editor/placement';
import {
  aimPlacement,
  beginPlacement,
  cancelPlacement,
  clickPlacement,
  finishPlacement,
  placementChrome,
  placementStage,
} from '../../../src/editor/placement';
import { initialToolDefaults } from '../../../src/editor/tools';

// pxPerCm 1 puts the snap tolerance at 14 cm and the mis-click reach at 1 cm.
const ENV = { pxPerCm: 1, free: false, locked: false, defaults: initialToolDefaults() };
const FREE = { ...ENV, free: true };
const at = (x: number, y: number) => ({ x, y });

const wallPlan = () =>
  buildPlan((b) => {
    b.wall(b.point(0, 0), b.point(400, 0));
  });

// Aims, then clicks the same spot — the pointer moves before it lands.
const stroke = (p: Placement, plan: Plan, x: number, y: number, env = ENV): PlacementResult =>
  clickPlacement(aimPlacement(p, plan, at(x, y), env), plan, at(x, y), env);

// Walks a whole placement: each click feeds the next its own plan and value.
function draw(tool: 'wall' | 'ruler', spots: [number, number][], plan = emptyPlan()) {
  let result: PlacementResult = { placement: beginPlacement(tool) };
  for (const [x, y] of spots) {
    result = stroke(result.placement, plan, x, y);
    plan = result.plan ?? plan;
  }
  return { ...result, plan };
}

describe('a wall chain', () => {
  it('holds its first click as a pending snap, leaving the plan alone', () => {
    const r = stroke(beginPlacement('wall'), emptyPlan(), 40, 40);
    expect(r.plan).toBeUndefined();
    expect(placementStage(r.placement)).toBe('chaining');
  });

  it('commits one wall per click past the first', () => {
    const { plan } = draw('wall', [
      [0, 0],
      [200, 0],
      [200, 200],
    ]);
    expect(Object.keys(plan.walls)).toHaveLength(2);
  });

  it('hands back to Select with the drawn walls selected when it closes on its start', () => {
    const { plan, tool, selection } = draw('wall', [
      [0, 0],
      [200, 0],
      [200, 200],
      [0, 200],
      [0, 0],
    ]);
    expect(tool).toBe('select');
    expect(selection).toHaveLength(4);
    expect(Object.keys(plan.walls)).toHaveLength(4);
  });

  it('finishes on a double-click with the walls it drew, and keeps the tool when it drew none', () => {
    const drawn = draw('wall', [
      [0, 0],
      [200, 0],
    ]);
    const stopped = finishPlacement(drawn.placement, drawn.plan);
    expect(stopped.tool).toBe('select');
    expect(stopped.selection).toHaveLength(1);
    // A chain that only ever pended drew nothing, so it is not a completion.
    const pending = stroke(beginPlacement('wall'), emptyPlan(), 0, 0);
    const nothing = finishPlacement(pending.placement, emptyPlan());
    expect(nothing.tool).toBeUndefined();
    expect(placementStage(nothing.placement)).toBe('wall');
  });

  it('rubber-bands from its live end to the aimed point, and from nothing before', () => {
    const started = beginPlacement('wall');
    const aimed = aimPlacement(started, emptyPlan(), at(40, 40), ENV);
    expect(placementChrome(aimed, emptyPlan(), ENV.defaults).rubber).toBeNull();
    const chained = aimPlacement(stroke(started, emptyPlan(), 0, 0).placement, emptyPlan(), at(200, 0), ENV);
    expect(placementChrome(chained, emptyPlan(), ENV.defaults).rubber).toMatchObject({
      from: { x: 0, y: 0 },
      to: { x: 200, y: 0 },
    });
  });

  it('drops the chain on cancel, and reports nothing to drop before it starts', () => {
    const started = beginPlacement('wall');
    expect(cancelPlacement(started)).toBeNull();
    const chained = stroke(started, emptyPlan(), 0, 0).placement;
    expect(placementStage(cancelPlacement(chained)!)).toBe('wall');
  });
});

// CONTEXT.md: Axis lock. The chain's anchor is its origin, so the lock bites
// from the second click on (ticket 03).
describe('a wall chain under a held Shift', () => {
  const LOCKED = { ...ENV, locked: true };

  it('leaves the first click alone: no anchor, no axis', () => {
    const r = stroke(beginPlacement('wall'), emptyPlan(), 137, 104, LOCKED);
    const second = stroke(r.placement, emptyPlan(), 300, 300, LOCKED);
    // the pending start landed on the plain grid, unbent
    expect(Object.values(second.plan!.points).map((p) => ({ x: p.x, y: p.y }))).toContainEqual({
      x: 140,
      y: 100,
    });
  });

  it('holds the segment on the axis nearest the aim, and flips across the diagonal', () => {
    const first = stroke(beginPlacement('wall'), emptyPlan(), 100, 100);
    const flat = stroke(first.placement, emptyPlan(), 300, 130, LOCKED);
    expect(Object.values(flat.plan!.points).map((p) => ({ x: p.x, y: p.y }))).toContainEqual({
      x: 300,
      y: 100,
    });
    const upright = stroke(first.placement, emptyPlan(), 130, 300, LOCKED);
    expect(Object.values(upright.plan!.points).map((p) => ({ x: p.x, y: p.y }))).toContainEqual({
      x: 100,
      y: 300,
    });
  });

  it('commits exactly where the rubber band was drawn', () => {
    const first = stroke(beginPlacement('wall'), emptyPlan(), 100, 100).placement;
    const aimed = aimPlacement(first, emptyPlan(), at(300, 130), LOCKED);
    const band = placementChrome(aimed, emptyPlan(), ENV.defaults).rubber!;
    expect(band).toMatchObject({ from: { x: 100, y: 100 }, to: { x: 300, y: 100 } });
    const committed = clickPlacement(aimed, emptyPlan(), at(300, 130), LOCKED);
    expect(Object.values(committed.plan!.points).map((p) => ({ x: p.x, y: p.y }))).toContainEqual({
      x: band.to.x,
      y: band.to.y,
    });
  });

  // The Point rung cannot see a start Point off the axis, so the chain draws on
  // instead of closing — and the escape is the finger (ticket 06).
  it('cannot close on a start Point the axis excludes, and closes once released', () => {
    const l = draw('wall', [
      [100, 100],
      [300, 100],
      [300, 300],
    ]);
    const held = stroke(l.placement, l.plan, 100, 100, LOCKED);
    expect(Object.keys(held.plan!.walls)).toHaveLength(3);
    expect(Object.keys(held.plan!.points)).toHaveLength(4);
    expect(held.tool).toBeUndefined();

    const released = stroke(l.placement, l.plan, 100, 100);
    expect(Object.keys(released.plan!.walls)).toHaveLength(3);
    expect(Object.keys(released.plan!.points)).toHaveLength(3);
    expect(released.tool).toBe('select');
  });
});

// CONTEXT.md: Settle. A drawn wall creates one, so the chain settles like every
// other edit — the pass that can act on it is the Room label reconciliation.
describe('a wall chain that settles', () => {
  const labelled = (x: number, y: number) => {
    const [plan, id] = addRoomLabel(squareRoomPlan(), 'Kitchen', x, y);
    return { plan, id };
  };

  it('re-pins the label of the room it cuts in two', () => {
    const { plan: before, id } = labelled(200, 200);
    const { plan } = draw(
      'wall',
      [
        [300, 0],
        [300, 400],
      ],
      before,
    );

    const rooms = detectRooms(plan);
    expect(rooms).toHaveLength(2);
    const left = rooms.find((room) => room.anchor.x < 300)!;
    expect(plan.roomLabels[id]).toMatchObject({
      x: Math.round(left.anchor.x),
      y: Math.round(left.anchor.y),
    });
  });

  // A drawing only subdivides, so it can leave no label homeless: one sitting
  // on the drawn line is claimed by one of the two halves, never dropped.
  it('keeps a label the wall is drawn straight through', () => {
    const { plan: before, id } = labelled(200, 200);
    const { plan } = draw(
      'wall',
      [
        [200, 0],
        [200, 400],
      ],
      before,
    );

    const rooms = detectRooms(plan);
    expect(rooms).toHaveLength(2);
    const label = plan.roomLabels[id];
    expect(rooms.map((room) => Math.round(room.anchor.x))).toContain(label.x);
  });
});

describe('an opening', () => {
  it('previews on the wall under the pointer and places it there', () => {
    const plan = wallPlan();
    const wallId = Object.keys(plan.walls)[0];
    const aimed = aimPlacement(beginPlacement('door'), plan, at(200, 2), ENV);
    expect(placementChrome(aimed, plan, ENV.defaults).ghost).toMatchObject({
      wallId,
      type: 'door',
    });
    const placed = clickPlacement(aimed, plan, at(200, 2), ENV);
    expect(placed.tool).toBe('select');
    expect(Object.values(placed.plan!.openings)).toHaveLength(1);
  });

  it('aims at nothing far from any wall, and a click there places nothing', () => {
    const plan = wallPlan();
    const aimed = aimPlacement(beginPlacement('window'), plan, at(200, 900), ENV);
    expect(placementChrome(aimed, plan, ENV.defaults).ghost).toBeNull();
    const clicked = clickPlacement(aimed, plan, at(200, 900), ENV);
    expect(clicked.plan).toBeUndefined();
    // A refused placement is not a completion: the tool stays (ADR 0018).
    expect(clicked.tool).toBeUndefined();
    // Same value back, so aiming at nothing costs the screen no render.
    expect(aimPlacement(aimed, plan, at(300, 900), ENV)).toBe(aimed);
  });

  it('refuses a wall whose Rail is narrower than the opening', () => {
    const narrow = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(30, 0));
    });
    const aimed = aimPlacement(beginPlacement('door'), narrow, at(15, 2), ENV);
    expect(placementChrome(aimed, narrow, ENV.defaults).ghost).toBeNull();
  });
});

describe('a ruler', () => {
  it('holds A, previews A→cursor, then commits on B', () => {
    const first = stroke(beginPlacement('ruler'), emptyPlan(), 0, 0);
    expect(first.plan).toBeUndefined();
    expect(placementStage(first.placement)).toBe('measuring');
    const aimed = aimPlacement(first.placement, emptyPlan(), at(200, 0), ENV);
    expect(placementChrome(aimed, emptyPlan(), ENV.defaults).rulerGhost).toMatchObject({
      a: { x: 0, y: 0 },
      b: { x: 200, y: 0 },
    });
    const { plan, tool, selection } = draw('ruler', [
      [0, 0],
      [200, 0],
    ]);
    expect(Object.values(plan.rulers)).toHaveLength(1);
    expect(tool).toBe('select');
    expect(selection).toEqual([{ type: 'ruler', id: Object.keys(plan.rulers)[0] }]);
  });

  it('ignores B landing on A: a mis-click leaves the pending A rubber-banding', () => {
    const first = stroke(beginPlacement('ruler'), emptyPlan(), 0, 0);
    const again = stroke(first.placement, emptyPlan(), 0, 0);
    expect(again.plan).toBeUndefined();
    expect(placementStage(again.placement)).toBe('measuring');
  });

  it('drops the pending A on cancel', () => {
    const first = stroke(beginPlacement('ruler'), emptyPlan(), 0, 0);
    expect(placementStage(cancelPlacement(first.placement)!)).toBe('ruler');
    expect(cancelPlacement(beginPlacement('ruler'))).toBeNull();
  });

  it('aims through the full ladder, which Alt filters rather than short-circuits', () => {
    const plan = squareRoomPlan();
    const aimedSnap = (p: Plan, x: number, y: number, env = ENV) =>
      placementChrome(aimPlacement(beginPlacement('ruler'), p, at(x, y), env), p, ENV.defaults).snap;
    expect(aimedSnap(plan, 6, 3)).toMatchObject({ x: 0, y: 0, kind: 'point' });
    expect(aimedSnap(plan, 200, 4)).toMatchObject({ kind: 'wall' });
    // Alt turns the alignment rung off and leaves the connection rungs on.
    expect(aimedSnap(plan, 6, 3, FREE)).toMatchObject({ x: 0, y: 0, kind: 'point' });
    expect(aimedSnap(plan, 137, 143)).toMatchObject({ x: 140, y: 140, kind: 'grid' });
    expect(aimedSnap(plan, 137, 143, FREE)).toMatchObject({ x: 137, y: 143, kind: 'free' });
  });

  // A Ruler's B locks against its own A, which is the pending anchor here — the
  // ghost and the commit read the one origin (tickets 03, 12).
  it('holds B on the axis of its A, and commits where the ghost was drawn', () => {
    const LOCKED = { ...ENV, locked: true };
    const first = stroke(beginPlacement('ruler'), emptyPlan(), 100, 100).placement;
    const aimed = aimPlacement(first, emptyPlan(), at(400, 130), LOCKED);
    const ghost = placementChrome(aimed, emptyPlan(), ENV.defaults).rulerGhost!;
    expect(ghost).toMatchObject({ a: { x: 100, y: 100 }, b: { x: 400, y: 100 } });
    const committed = clickPlacement(aimed, emptyPlan(), at(400, 130), LOCKED);
    expect(Object.values(committed.plan!.rulers)[0]).toMatchObject({
      a: { x: 100, y: 100 },
      b: { x: ghost.b.x, y: ghost.b.y },
    });
  });
});

describe('a text', () => {
  it('aims on the grid, and off it under Alt', () => {
    const aimed = aimPlacement(beginPlacement('text'), emptyPlan(), at(137, 143), ENV);
    expect(placementChrome(aimed, emptyPlan(), ENV.defaults).snap).toMatchObject({
      x: 140,
      y: 140,
      kind: 'grid',
    });
    const free = aimPlacement(beginPlacement('text'), emptyPlan(), at(137, 143), FREE);
    expect(placementChrome(free, emptyPlan(), ENV.defaults).snap).toMatchObject({
      x: 137,
      y: 143,
      kind: 'free',
    });
  });

  it('asks for an editor at the snapped spot rather than writing to the plan', () => {
    const r = stroke(beginPlacement('text'), emptyPlan(), 137, 143);
    expect(r.plan).toBeUndefined();
    expect(r.editor).toEqual({ x: 140, y: 140, size: ENV.defaults.textSize });
    expect(placementStage(r.placement)).toBe('typing');
  });

  it('marks nothing while the editor holds the spot', () => {
    const typing = stroke(beginPlacement('text'), emptyPlan(), 137, 143).placement;
    const still = aimPlacement(typing, emptyPlan(), at(300, 300), ENV);
    expect(placementChrome(still, emptyPlan(), ENV.defaults).snap).toBeNull();
  });
});
