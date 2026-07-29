// CONTEXT.md: Axis lock — a held Shift confines a move to a world axis running
// through where its aim began (tickets 01–03).
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { buildPlan } from '../../helpers';
import { emptyPlan } from '../../../src/model/types';
import type { Plan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { reloadPreferences } from '../../../src/preferences/preferences';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, pointer } from '../../kit';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

const plan = () => usePlanStore.getState().plan;

// Horizontal wall a(100,100)–b(500,100): both endpoints on the grid, so only
// the lock can move a coordinate off its own value.
const wallPlan = (): Plan => ({
  ...emptyPlan(),
  points: { a: { id: 'a', x: 100, y: 100 }, b: { id: 'b', x: 500, y: 100 } },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
});

// Square room (100,100)–(500,500), its profile placed at the centre.
const roomPlan = (named: boolean): Plan => ({
  ...emptyPlan(),
  points: {
    a: { id: 'a', x: 100, y: 100 },
    b: { id: 'b', x: 500, y: 100 },
    c: { id: 'c', x: 500, y: 500 },
    d: { id: 'd', x: 100, y: 500 },
  },
  walls: {
    w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
    w2: { id: 'w2', startPointId: 'b', endPointId: 'c', thickness: 10 },
    w3: { id: 'w3', startPointId: 'c', endPointId: 'd', thickness: 10 },
    w4: { id: 'w4', startPointId: 'd', endPointId: 'a', thickness: 10 },
  },
  roomProfiles: named ? { l1: { id: 'l1', name: 'Kitchen', x: 300, y: 300, placed: true } } : {},
});

// An L: the band y ∈ [0,300] over x ∈ [0,600], plus x ∈ [0,300] down to y = 600.
// Its re-entrant corner sits at (300,300); the block starts in the leg below it.
const lShapedRoom = (): Plan =>
  buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(600, 0);
    const p3 = b.point(600, 300);
    const p4 = b.point(300, 300);
    const p5 = b.point(300, 600);
    const p6 = b.point(0, 600);
    b.wall(p1, p2);
    b.wall(p2, p3);
    b.wall(p3, p4);
    b.wall(p4, p5);
    b.wall(p5, p6);
    b.wall(p6, p1);
    b.profile('Corner', 150, 400, true);
  });

async function setup(initial: Plan) {
  usePlanStore.setState({ plan: initial, planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
  const { container } = await render(<EditorWithHotkeys />);
  const svg = container.querySelector('svg')!;
  const zones = () => svg.querySelectorAll('line[stroke="transparent"]');
  return { container, svg, zones };
}

// The handles only exist once something is selected, so the point drags go
// through a click on the wall body first.
async function handlesOf(svg: SVGSVGElement, zone: Element, x: number, y: number) {
  await pointer(zone, 'pointerdown', { button: 0, ...clientAt(svg, x, y) });
  await pointer(svg, 'pointerup');
  return svg.querySelectorAll('.point-handle');
}

describe('a wall point under a held Shift', () => {
  it('slides along the wall that holds it', async () => {
    const { svg, zones } = await setup(wallPlan());
    const handles = await handlesOf(svg, zones()[0], 300, 100);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 500, 100) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 600, 130) });
    await pointer(svg, 'pointerup');
    expect(plan().points.b).toMatchObject({ x: 600, y: 100 });
  });

  // One wall lends one line, so there is no other axis to flip to: pulling
  // across it shortens the wall instead of bending it.
  it('does not leave that line, however far across it the pointer goes', async () => {
    const { svg, zones } = await setup(wallPlan());
    const handles = await handlesOf(svg, zones()[0], 300, 100);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 500, 100) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 600, 130) });
    expect(plan().points.b).toMatchObject({ x: 600, y: 100 });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 530, 300) });
    expect(plan().points.b).toMatchObject({ x: 530, y: 100 });
    await pointer(svg, 'pointerup');
  });

  it('returns the same line on a Shift down → up → down round trip', async () => {
    const { svg, zones } = await setup(wallPlan());
    const handles = await handlesOf(svg, zones()[0], 300, 100);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 500, 100) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 600, 130) });
    expect(plan().points.b).toMatchObject({ x: 600, y: 100 });
    await pointer(svg, 'pointermove', clientAt(svg, 600, 130));
    expect(plan().points.b).toMatchObject({ x: 600, y: 130 });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 600, 130) });
    expect(plan().points.b).toMatchObject({ x: 600, y: 100 });
    await pointer(svg, 'pointerup');
  });

  // The origin is the grab, not where Shift went down: pressing it mid-drag is
  // "this whole move was straight", jump included (03 point 5).
  it('pulls the result back through the origin when Shift joins mid-drag', async () => {
    const { svg, zones } = await setup(wallPlan());
    const handles = await handlesOf(svg, zones()[0], 300, 100);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 500, 100) });
    await pointer(svg, 'pointermove', clientAt(svg, 600, 300));
    expect(plan().points.b).toMatchObject({ x: 600, y: 300 });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 600, 300) });
    expect(plan().points.b).toMatchObject({ x: 600, y: 100 });
    await pointer(svg, 'pointerup');
  });

  it('keeps the 1 cm resolution of a free move under Shift+Alt', async () => {
    const { svg, zones } = await setup(wallPlan());
    const handles = await handlesOf(svg, zones()[0], 300, 100);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 500, 100) });
    await pointer(svg, 'pointermove', { shiftKey: true, altKey: true, ...clientAt(svg, 603, 130) });
    await pointer(svg, 'pointerup');
    // the grid would have read 600: Alt drops it, the lock holds the y all the same
    expect(plan().points.b).toMatchObject({ x: 603, y: 100 });
  });

  it('locks just as well with Snap switched off', async () => {
    const { svg, zones } = await setup(wallPlan());
    await key('s');
    const handles = await handlesOf(svg, zones()[0], 300, 100);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 500, 100) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 603, 130) });
    await pointer(svg, 'pointerup');
    expect(plan().points.b).toMatchObject({ x: 603, y: 100 });
  });
});

describe('a wall point that borrows a slant', () => {
  // A 45° wall (100,100)–(400,400): its line crosses no grid intersection.
  const slantPlan = (): Plan => ({
    ...emptyPlan(),
    points: { a: { id: 'a', x: 100, y: 100 }, b: { id: 'b', x: 400, y: 400 } },
    walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  });

  it('slides along the slant rather than onto a world axis', async () => {
    const { svg, zones } = await setup(slantPlan());
    const handles = await handlesOf(svg, zones()[0], 250, 250);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 400, 400) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 460, 420) });
    await pointer(svg, 'pointerup');
    // the horizontal would have read (460,400): the wall would have bent
    expect(plan().points.b).toMatchObject({ x: 440, y: 440 });
  });

  it('follows it by the centimeter, the grid having no hold on a slant', async () => {
    const { svg, zones } = await setup(slantPlan());
    const handles = await handlesOf(svg, zones()[0], 250, 250);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 400, 400) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 463, 421) });
    await pointer(svg, 'pointerup');
    expect(plan().points.b).toMatchObject({ x: 442, y: 442 });
  });
});

describe('a wall point two walls hold', () => {
  // An L whose second leg is a 45° slant: the junction b lends two lines.
  const junctionPlan = (): Plan => ({
    ...emptyPlan(),
    points: {
      a: { id: 'a', x: 100, y: 100 },
      b: { id: 'b', x: 500, y: 100 },
      c: { id: 'c', x: 700, y: 300 },
    },
    walls: {
      w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
      w2: { id: 'w2', startPointId: 'b', endPointId: 'c', thickness: 10 },
    },
  });

  it('takes the line of whichever wall passes nearest the aim', async () => {
    const { svg, zones } = await setup(junctionPlan());
    // select w1, whose far handle is the junction
    const handles = await handlesOf(svg, zones()[0], 300, 100);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 500, 100) });
    // 30 cm off w1's line, 120 off w2's
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 620, 130) });
    expect(plan().points.b).toMatchObject({ x: 620, y: 100 });
    // 80 off w1's line, 14 off w2's
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 600, 180) });
    expect(plan().points.b).toMatchObject({ x: 590, y: 190 });
    await pointer(svg, 'pointerup');
  });
});

describe('a group drag under a held Shift', () => {
  it('translates along one axis only, the other delta held at zero', async () => {
    const { svg, zones } = await setup(wallPlan());
    await pointer(zones()[0], 'pointerdown', { button: 0, ...clientAt(svg, 300, 100) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 400, 160) });
    await pointer(svg, 'pointerup');
    expect(plan().points).toMatchObject({ a: { x: 200, y: 100 }, b: { x: 600, y: 100 } });
  });

  it('takes the vertical axis past the diagonal', async () => {
    const { svg, zones } = await setup(wallPlan());
    await pointer(zones()[0], 'pointerdown', { button: 0, ...clientAt(svg, 300, 100) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 360, 300) });
    await pointer(svg, 'pointerup');
    expect(plan().points).toMatchObject({ a: { x: 100, y: 300 }, b: { x: 500, y: 300 } });
  });
});

describe('a Ruler endpoint under a held Shift', () => {
  const rulerPlan = (): Plan => ({
    ...emptyPlan(),
    rulers: { r1: { id: 'r1', a: { x: 100, y: 100 }, b: { x: 300, y: 300 }, t: 0.5 } },
  });

  // Selecting the Ruler is what puts its endpoint handles on the sheet.
  async function endpoints(svg: SVGSVGElement) {
    const grab = svg.querySelector('.ruler-grab')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerup');
    return svg.querySelectorAll('.point-handle');
  }

  it('slides B along the measurement’s own line, which keeps its angle', async () => {
    const { svg } = await setup(rulerPlan());
    const [, b] = await endpoints(svg);
    await pointer(b, 'pointerdown', { button: 0, ...clientAt(svg, 300, 300) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 400, 330) });
    await pointer(svg, 'pointerup');
    // a world axis would have read (400,300) — the measurement would have bent
    expect(plan().rulers.r1.b).toMatchObject({ x: 365, y: 365 });
  });

  it('does not leave that line, however far across it the pointer goes', async () => {
    const { svg } = await setup(rulerPlan());
    const [, b] = await endpoints(svg);
    await pointer(b, 'pointerdown', { button: 0, ...clientAt(svg, 300, 300) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 330, 500) });
    await pointer(svg, 'pointerup');
    expect(plan().rulers.r1.b).toMatchObject({ x: 415, y: 415 });
  });

  it('holds A on the same line, from the other end', async () => {
    const { svg } = await setup(rulerPlan());
    const [a] = await endpoints(svg);
    await pointer(a, 'pointerdown', { button: 0, ...clientAt(svg, 100, 100) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 40, 20) });
    await pointer(svg, 'pointerup');
    expect(plan().rulers.r1.a).toMatchObject({ x: 30, y: 30 });
  });
});

describe('a room profile under a held Shift', () => {
  it('slides a placed label along the axis of its own block', async () => {
    const { container, svg } = await setup(roomPlan(true));
    const hit = container.querySelector('rect.room-name-hit')!;
    await pointer(hit, 'pointerdown', { button: 0, ...clientAt(svg, 300, 300) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 400, 350) });
    await pointer(svg, 'pointerup');
    expect(plan().roomProfiles.l1).toMatchObject({ x: 400, y: 300 });
  });

  it('holds the block’s x on the other axis', async () => {
    const { container, svg } = await setup(roomPlan(true));
    const hit = container.querySelector('rect.room-name-hit')!;
    await pointer(hit, 'pointerdown', { button: 0, ...clientAt(svg, 300, 300) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 350, 400) });
    await pointer(svg, 'pointerup');
    expect(plan().roomProfiles.l1).toMatchObject({ x: 300, y: 400 });
  });

  it('locks a label born of the gesture too, on either axis', async () => {
    const { container, svg } = await setup(roomPlan(false));
    const hit = container.querySelector('rect.room-area-hit')!;
    await pointer(hit, 'pointerdown', { button: 0, ...clientAt(svg, 300, 300) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 400, 350) });
    const born = () => Object.values(plan().roomProfiles)[0];
    expect(born()).toMatchObject({ x: 400, y: 300 });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 350, 400) });
    await pointer(svg, 'pointerup');
    expect(born()).toMatchObject({ x: 300, y: 400 });
  });

  // The Room is an invariant, and an invariant outranks the lock: it does not
  // propose a position, it defines which ones exist (ticket 05).
  it('leaves the axis when the Room’s notch pushes it off', async () => {
    const { container, svg } = await setup(lShapedRoom());
    const hit = container.querySelector('rect.room-name-hit')!;
    const label = () => Object.values(plan().roomProfiles)[0];
    // held on y = 400, dragged right — first within the leg, then into the
    // notch the L has no floor in
    await pointer(hit, 'pointerdown', { button: 0, ...clientAt(svg, 150, 400) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 250, 420) });
    expect(label()).toMatchObject({ x: 250, y: 400 });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 500, 420) });
    await pointer(svg, 'pointerup');
    expect(label().x).toBeGreaterThan(300);
    expect(label().y).toBeLessThan(300);
  });
});
