import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../model/types';
import type { Plan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { clientAt, pointer } from './testKit';

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

// Horizontal wall (100,100)–(500,100), thickness 10; one window width 120 at offset 150.
const openingPlan = (): Plan => ({
  points: {
    a: { id: 'a', x: 100, y: 100 },
    b: { id: 'b', x: 500, y: 100 },
  },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  openings: { o1: { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 } },
  roomLabels: {},
  rulers: {},
});

const renderEditor = async (plan: Plan) => {
  usePlanStore.setState({ plan });
  const { container } = await render(<Editor />);
  const svg = container.querySelector('svg')!;
  return { container, svg };
};

// Grab zones: the opening rect spans its width (120), the dim text a fixed 60×16.
const openingGrab = (container: HTMLElement) =>
  container.querySelector('rect[width="120"][fill="transparent"]')!;
const dimTextGrab = (container: HTMLElement) =>
  container.querySelector('rect[width="60"][fill="transparent"]')!;

describe('dragging an opening keeps the grab point under the cursor', () => {
  it('moves by the cursor travel, not to the cursor — no jump on an off-center grab', async () => {
    const { container, svg } = await renderEditor(openingPlan());
    // 280: 30 cm right of center (edges 90–210)
    const grab = openingGrab(container);
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 280, 100) });
    await pointer(svg, 'pointermove', clientAt(svg, 380, 100));
    // cursor +100 → center +100; recentering on the cursor would read 280
    expect(usePlanStore.getState().plan.openings.o1.offset).toBe(250);
  });

  it('keeps the delta absolute across a clamp — no ratchet after hitting the wall end', async () => {
    const { container, svg } = await renderEditor(openingPlan());
    // 280: 30 cm right of center, delta −30 for the whole gesture
    const grab = openingGrab(container);
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 280, 100) });
    // 345: rail's far end (overhang 405) less half the 120 width
    await pointer(svg, 'pointermove', clientAt(svg, 600, 100));
    expect(usePlanStore.getState().plan.openings.o1.offset).toBe(345);
    await pointer(svg, 'pointermove', clientAt(svg, 430, 100));
    expect(usePlanStore.getState().plan.openings.o1.offset).toBe(300);
  });

  it('leaves the plan intact below the click threshold — a click is a click', async () => {
    const { container, svg } = await renderEditor(openingPlan());
    const grab = openingGrab(container);
    const at = clientAt(svg, 280, 100);
    await pointer(grab, 'pointerdown', { button: 0, ...at });
    // a 2 px on-screen wiggle, below CLICK_PX
    await pointer(svg, 'pointermove', { clientX: at.clientX + 2, clientY: at.clientY });
    await pointer(svg, 'pointerup');
    expect(usePlanStore.getState().plan.openings.o1.offset).toBe(150);
  });
});

// Closed square room (100,100)–(500,500), placed label at its center.
const labeledRoomPlan = (): Plan => ({
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
  openings: {},
  roomLabels: { l1: { id: 'l1', name: 'Kitchen', x: 300, y: 300, placed: true } },
  rulers: {},
});

describe('dragging a room label keeps the grab point under the cursor', () => {
  it('moves the block by the cursor travel, not onto the cursor', async () => {
    const { container, svg } = await renderEditor(labeledRoomPlan());
    // (320,295): 20 right, 5 above the block position
    const hit = container.querySelector('rect.room-name-hit')!;
    await pointer(hit, 'pointerdown', { button: 0, ...clientAt(svg, 320, 295) });
    await pointer(svg, 'pointermove', clientAt(svg, 400, 400));
    // cursor +80,+105 → block 380,405
    expect(usePlanStore.getState().plan.roomLabels.l1).toMatchObject({ x: 380, y: 405 });
  });
});

describe('dragging an unlabeled room block keeps the grab point under the cursor', () => {
  it('creates the label at block position + cursor travel, not at the cursor', async () => {
    const plan = labeledRoomPlan();
    plan.roomLabels = {};
    const { container, svg } = await renderEditor(plan);
    // bare area block at the room anchor (300,300); 280 grabs it 20 left
    const hit = container.querySelector('rect.room-area-hit')!;
    await pointer(hit, 'pointerdown', { button: 0, ...clientAt(svg, 280, 300) });
    await pointer(svg, 'pointermove', clientAt(svg, 400, 350));
    // cursor +120,+50 from the anchor → 420,350
    const created = Object.values(usePlanStore.getState().plan.roomLabels)[0];
    expect(created).toMatchObject({ x: 420, y: 350 });
  });
});

describe('dragging a dimension text keeps the grab point under the cursor', () => {
  it('slides along the rail by the cursor travel, not onto the cursor projection', async () => {
    const plan = openingPlan();
    plan.openings = {};
    const { container, svg } = await renderEditor(plan);
    // default placement t=0.5 (200 cm, plan x=300); 320 grabs it 20 cm right
    const hit = dimTextGrab(container);
    await pointer(hit, 'pointerdown', { button: 0, ...clientAt(svg, 320, 80) });
    await pointer(svg, 'pointermove', clientAt(svg, 420, 80));
    // cursor +100: 200 → 300 cm, t=0.75; the raw projection would read 0.8
    expect(usePlanStore.getState().plan.walls.w1.dimPlacement?.t).toBe(0.75);
  });

  it('decides the side from the actual cursor, not the offset grab point', async () => {
    const plan = openingPlan();
    plan.openings = {};
    const { container, svg } = await renderEditor(plan);
    const hit = dimTextGrab(container);
    await pointer(hit, 'pointerdown', { button: 0, ...clientAt(svg, 320, 80) });
    // y 130 crosses under the wall (y=100) → side flips
    await pointer(svg, 'pointermove', clientAt(svg, 420, 130));
    expect(usePlanStore.getState().plan.walls.w1.dimPlacement).toMatchObject({ t: 0.75, side: 1 });
  });
});
