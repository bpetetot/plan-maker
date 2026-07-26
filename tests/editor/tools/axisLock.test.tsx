// The Shift held while drawing reaches the placement: the same key, the same
// axis, through the pointer seam (ticket 12).
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../../../src/model/types';
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
const spots = () => Object.values(plan().points).map((p) => ({ x: p.x, y: p.y }));

async function setup(tool: string) {
  const { container } = await render(<EditorWithHotkeys />);
  const svg = container.querySelector('svg')!;
  await key(tool);
  return { svg };
}

// A placement click: the aim arrives first, as the pointer really does.
async function click(svg: SVGSVGElement, x: number, y: number, init: PointerEventInit = {}) {
  await pointer(svg, 'pointermove', { ...clientAt(svg, x, y), ...init });
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, x, y), ...init });
}

describe('drawing a wall chain with Shift held', () => {
  it('holds the second segment on the axis of its anchor', async () => {
    const { svg } = await setup('2');
    await click(svg, 100, 100);
    await click(svg, 300, 130, { shiftKey: true });
    expect(spots()).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ]);
  });

  it('leaves the first click alone, which has no anchor to lock to', async () => {
    const { svg } = await setup('2');
    await click(svg, 137, 104, { shiftKey: true });
    await click(svg, 300, 300, { shiftKey: true });
    expect(spots()).toContainEqual({ x: 140, y: 100 });
  });
});

describe('measuring with Shift held', () => {
  it('holds B on the axis of the Ruler’s own A', async () => {
    const { svg } = await setup('5');
    await click(svg, 100, 100);
    await click(svg, 400, 130, { shiftKey: true });
    expect(Object.values(plan().rulers)[0]).toMatchObject({
      a: { x: 100, y: 100 },
      b: { x: 400, y: 100 },
    });
  });
});
