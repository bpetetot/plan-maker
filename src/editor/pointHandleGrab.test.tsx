// A point handle fixes its grab point (CONTEXT.md: Grab zone): grabbing the
// ring off-centre keeps the offset, then Snap decides — the Point never jumps
// under the cursor.
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Plan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { clientAt, pointer } from './testKit';

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
  };
}

const plan = () => usePlanStore.getState().plan;
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length;

async function setup() {
  usePlanStore.setState({ plan: onePlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
  const { container } = await render(<Editor />);
  const svg = container.querySelector('svg')!;
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
  await pointer(svg, 'pointermove', clientAt(svg, 450, 50));
  await pointer(svg, 'pointerup');
  return { svg };
}

describe('point handle grab offset', () => {
  it('keeps the offset instead of recentering on the cursor', async () => {
    const { svg } = await setup();
    const handles = svg.querySelectorAll('.point-handle');
    expect(handles).toHaveLength(2);
    // grab b (400,0) 10 px off its centre, then drop at (200,60)
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 390, 10) });
    await pointer(svg, 'pointermove', clientAt(svg, 200, 60));
    await pointer(svg, 'pointerup');
    // aim = cursor + grab offset (210,50), landing there — not on the cursor
    expect(plan().points.b).toMatchObject({ x: 210, y: 50 });
    expect(undoDepth()).toBe(1);
  });
});
