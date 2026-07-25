import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../../src/model/types';
import { usePlanStore } from '../../src/store/planStore';
import Editor from '../../src/editor/Editor';
import { blur, clientAt, key, keyUp, pointer, viewBoxOf } from '../kit';

beforeEach(() => {
  localStorage.clear();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup() {
  const { container, unmount } = await render(<Editor />);
  return { svg: container.querySelector('svg')!, unmount };
}

describe('space held', () => {
  it('offers the grab cursor while held, and takes it back on release', async () => {
    const { svg, unmount } = await setup();
    await key(' ', { code: 'Space' });
    expect(svg.style.cursor).toBe('grab');
    await keyUp(' ', { code: 'Space' });
    expect(svg.style.cursor).toBe('default');
    await unmount();
  });

  it('drops the pan mode when the window goes away mid-hold', async () => {
    const { svg, unmount } = await setup();
    await key(' ', { code: 'Space' });
    expect(svg.style.cursor).toBe('grab');
    // Alt+Tab away: the keyup lands in the other window and never arrives here
    await blur(window);
    expect(svg.style.cursor).toBe('default');
    await unmount();
  });

  // CONTEXT.md: Pan — "Space + drag" has no exception for what sits under the
  // pointer. A Point handle used to win over the held Space (ADR 0030).
  it('pans from a Point handle, leaving the plan alone', async () => {
    usePlanStore.setState({
      plan: {
        points: { a: { id: 'a', x: 0, y: 0 }, b: { id: 'b', x: 400, y: 0 } },
        walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
        openings: {},
        roomLabels: {},
        rulers: {},
        texts: {},
      },
      planEpoch: 0,
    });
    const { container, unmount } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    // Select the wall by marquee, so its endpoint handles show.
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 50));
    await pointer(svg, 'pointerup');
    const handle = svg.querySelectorAll('.point-handle')[1];
    const before = viewBoxOf(container);
    await key(' ', { code: 'Space' });
    await pointer(handle, 'pointerdown', { button: 0, ...clientAt(svg, 400, 0) });
    await pointer(svg, 'pointermove', clientAt(svg, 300, 50));
    await pointer(svg, 'pointerup');
    await keyUp(' ', { code: 'Space' });
    expect(usePlanStore.getState().plan.points.b).toMatchObject({ x: 400, y: 0 });
    expect(viewBoxOf(container)).not.toEqual(before);
    await unmount();
  });
});
