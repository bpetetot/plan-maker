// CONTEXT.md: Room label — no orphan label: a deforming drag re-snaps it to the
// centroid, a group move carries a custom-placed one.
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Plan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { clientAt, mouse, pointer } from './testKit';

beforeEach(() => {
  usePlanStore.temporal.getState().clear();
});

// A closed square room (100,100)-(500,500) with a label near its right wall.
function labeledSquare(placed?: true): Plan {
  return {
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
    roomLabels: {
      l1: placed
        ? { id: 'l1', name: 'Kitchen', x: 480, y: 250, placed }
        : { id: 'l1', name: 'Kitchen', x: 480, y: 250 },
    },
  };
}

const label = () => usePlanStore.getState().plan.roomLabels.l1;
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length;

async function setup(placed?: true) {
  usePlanStore.setState({ plan: labeledSquare(placed), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
  const { container } = await render(<Editor />);
  const svg = container.querySelector('svg')!;
  return { container, svg };
}

async function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, a.x, a.y) });
  await pointer(svg, 'pointermove', clientAt(svg, b.x, b.y));
  await pointer(svg, 'pointerup');
}

describe('label reconciliation at the end of a wall gesture', () => {
  it('snaps the label to the room centroid when a point drag deforms the room away from it', async () => {
    const { svg } = await setup();
    await marqueeSelect(svg, { x: 450, y: 50 }, { x: 550, y: 550 });
    const handles = svg.querySelectorAll('circle');
    expect(handles).toHaveLength(2);
    // drag the corner (500,500) to (300,300): the label at (480,250) leaves the room
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 500, 500) });
    await pointer(svg, 'pointermove', clientAt(svg, 300, 300));
    expect(label()).toMatchObject({ x: 480, y: 250 });
    await pointer(svg, 'pointerup');
    // centroid of (100,100) (500,100) (300,300) (100,500), rounded
    expect(label()).toMatchObject({ name: 'Kitchen', x: 233, y: 233 });
    expect(undoDepth()).toBe(1);
  });

  it('moves a custom-placed label with the room on a select-all group move', async () => {
    const { svg } = await setup(true);
    await marqueeSelect(svg, { x: 0, y: 0 }, { x: 600, y: 600 });
    const wallHit = svg.querySelectorAll('line[stroke="transparent"]')[0];
    await pointer(wallHit, 'pointerdown', { button: 0, ...clientAt(svg, 300, 100) });
    await pointer(svg, 'pointermove', clientAt(svg, 350, 150));
    await pointer(svg, 'pointerup');
    expect(label()).toMatchObject({ name: 'Kitchen', x: 530, y: 300, placed: true });
    expect(undoDepth()).toBe(1);
  });
});

describe('default placement follows the live centroid', () => {
  async function setupUnlabeled() {
    const base = labeledSquare();
    usePlanStore.setState({ plan: { ...base, roomLabels: {} }, planEpoch: 0 });
    usePlanStore.temporal.getState().clear();
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    return { container, svg };
  }

  const blockTransform = (container: HTMLElement) =>
    container.querySelector('text.room-name')!.closest('g')!.getAttribute('transform');

  it('naming a room does not freeze its block: it tracks the centroid through a wall drag', async () => {
    const { container, svg } = await setupUnlabeled();
    await mouse(svg, 'dblclick', clientAt(svg, 300, 300));
    await userEvent.fill(page.getByRole('textbox'), 'Kitchen');
    await userEvent.keyboard('{Enter}');
    expect(usePlanStore.getState().plan.roomLabels).not.toEqual({});

    // drag the right wall inward: the room becomes (100,100)-(250,500)
    const wallHits = svg.querySelectorAll('line[stroke="transparent"]');
    await pointer(wallHits[1], 'pointerdown', { button: 0, ...clientAt(svg, 500, 300) });
    await pointer(svg, 'pointermove', clientAt(svg, 250, 300));
    expect(blockTransform(container)).toBe('translate(175,300)');
    await pointer(svg, 'pointerup');
    expect(blockTransform(container)).toBe('translate(175,300)');
    const created = Object.values(usePlanStore.getState().plan.roomLabels)[0];
    expect(created).toMatchObject({ name: 'Kitchen', x: 175, y: 300 });
    expect(created.placed).toBeUndefined();
  });
});
