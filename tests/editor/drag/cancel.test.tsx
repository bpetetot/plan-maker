// A cancelled pointer is not a pointer-up: the drag never lands (CONTEXT.md:
// Plan drag), matching the cancel ladder every other gesture already follows.
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Plan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import Editor from '../../../src/editor/Editor';
import { clientAt, pointer } from '../../kit';

beforeEach(() => {
  usePlanStore.temporal.getState().clear();
});

// A single horizontal wall, so selecting it shows both endpoint handles.
function onePlan(): Plan {
  return {
    points: {
      a: { id: 'a', x: 0, y: 0 },
      b: { id: 'b', x: 400, y: 0 },
    },
    walls: {
      w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
    },
    openings: {},
    roomLabels: {},
    rulers: {},
    texts: {},
  };
}

const plan = () => usePlanStore.getState().plan;
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length;

async function marquee(svg: SVGSVGElement) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
  await pointer(svg, 'pointermove', clientAt(svg, 450, 50));
}

async function setup() {
  usePlanStore.setState({ plan: onePlan(), planEpoch: 0, editOpen: false });
  usePlanStore.temporal.getState().clear();
  const { container } = await render(<Editor />);
  const svg = container.querySelector('svg')!;
  await marquee(svg);
  await pointer(svg, 'pointerup');
  return { svg };
}

// Grabs b (400,0) and aims it at (200,60), which a pointer-up would land.
async function dragB(svg: SVGSVGElement) {
  const handles = svg.querySelectorAll('.point-handle');
  expect(handles).toHaveLength(2);
  await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 400, 0) });
  await pointer(svg, 'pointermove', clientAt(svg, 200, 60));
}

describe('a cancelled Plan drag', () => {
  it('puts the plan back where the drag started and takes no undo entry', async () => {
    const { svg } = await setup();
    const before = plan();
    await dragB(svg);
    expect(plan().points.b).toMatchObject({ x: 200, y: 60 });

    await pointer(svg, 'pointercancel');
    expect(plan()).toBe(before);
    expect(undoDepth()).toBe(0);
  });

  it('closes the Edit, so autosave is not left suspended', async () => {
    const { svg } = await setup();
    await dragB(svg);
    expect(usePlanStore.getState().editOpen).toBe(true);

    await pointer(svg, 'pointercancel');
    expect(usePlanStore.getState().editOpen).toBe(false);
  });

  it('drops a marquee without touching the Selection', async () => {
    const { svg } = await setup();
    await marquee(svg);
    expect(svg.querySelector('rect[stroke-dasharray]')).not.toBeNull();

    await pointer(svg, 'pointercancel');
    expect(svg.querySelector('rect[stroke-dasharray]')).toBeNull();
    // The wall selected before the marquee started is still the Selection.
    expect(svg.querySelectorAll('.point-handle')).toHaveLength(2);
  });
});
