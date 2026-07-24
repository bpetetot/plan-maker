import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { key, pointer, viewBoxOf, wheel, zoomLabel } from './testKit';

beforeEach(() => {
  localStorage.clear();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup() {
  const { container, unmount } = await render(<Editor />);
  const svg = container.querySelector('svg')!;
  // Screen px per plan unit: a pan of n px moves the viewBox by n / scale.
  const scale = svg.getBoundingClientRect().width / viewBoxOf(container)[2];
  return { container, svg, scale, unmount };
}

describe('wheel gestures', () => {
  it('pans the view and leaves the zoom alone', async () => {
    const { container, svg, scale, unmount } = await setup();
    const [x0, y0, w0, h0] = viewBoxOf(container);
    await wheel(svg, { deltaX: 40, deltaY: 100 });
    const [x, y, w, h] = viewBoxOf(container);
    expect(x).toBeCloseTo(x0 + 40 / scale, 2);
    expect(y).toBeCloseTo(y0 + 100 / scale, 2);
    expect(w).toBeCloseTo(w0, 2);
    expect(h).toBeCloseTo(h0, 2);
    expect(zoomLabel()).toBe('100%');
    await unmount();
  });

  it('pans horizontally when Shift is held', async () => {
    const { container, svg, scale, unmount } = await setup();
    const [x0, y0] = viewBoxOf(container);
    await wheel(svg, { deltaY: 100, shiftKey: true });
    const [x, y] = viewBoxOf(container);
    expect(x).toBeCloseTo(x0 + 100 / scale, 2);
    expect(y).toBeCloseTo(y0, 2);
    await unmount();
  });

  it('zooms when Ctrl is held, which is also how the pinch arrives', async () => {
    const { container, svg, unmount } = await setup();
    const [x0, y0, w0] = viewBoxOf(container);
    await wheel(svg, { deltaY: -10, ctrlKey: true });
    expect(zoomLabel()).toBe('110%');
    const [x, y, w] = viewBoxOf(container);
    expect(w).toBeCloseTo(w0 / 1.1, 2);
    // Anchored at the cursor, which sits at the plan origin here.
    expect(x).toBeCloseTo(x0, 2);
    expect(y).toBeCloseTo(y0, 2);
    await unmount();
  });

  it('zooms on Cmd too, the Mac spelling of the same modifier', async () => {
    const { svg, unmount } = await setup();
    await wheel(svg, { deltaY: -10, metaKey: true });
    expect(zoomLabel()).toBe('110%');
    await unmount();
  });

  it('scales the zoom with the delta: a burst of small ones lands where one big one does', async () => {
    const { svg, unmount } = await setup();
    for (let i = 0; i < 5; i++) await wheel(svg, { deltaY: -2, ctrlKey: true });
    expect(zoomLabel()).toBe('110%');
    await unmount();
  });

  it('caps a single event at one notch, so no gesture can run away', async () => {
    const { svg, unmount } = await setup();
    await wheel(svg, { deltaY: -1000, ctrlKey: true });
    expect(zoomLabel()).toBe('110%');
    await unmount();
  });

  it('keeps panning mid-chain, so a point off screen stays reachable', async () => {
    const { container, svg, scale, unmount } = await setup();
    await key('2'); // Wall tool
    await pointer(svg, 'pointerdown', { button: 0, clientX: 200, clientY: 200 });
    await pointer(svg, 'pointerup', { button: 0, clientX: 200, clientY: 200 });
    const [, y0] = viewBoxOf(container);
    await wheel(svg, { deltaY: 100 });
    expect(viewBoxOf(container)[1]).toBeCloseTo(y0 + 100 / scale, 2);
    await unmount();
  });

  it('stands aside while a pan drag is under way', async () => {
    const { container, svg, unmount } = await setup();
    await key(' ', { code: 'Space' });
    await pointer(svg, 'pointerdown', { button: 0, clientX: 200, clientY: 200 });
    const before = viewBoxOf(container);
    await wheel(svg, { deltaY: 100 });
    await wheel(svg, { deltaY: -100, ctrlKey: true });
    expect(viewBoxOf(container)).toEqual(before);
    await pointer(svg, 'pointerup', { button: 0, clientX: 200, clientY: 200 });
    await unmount();
  });

  it('reads a line-mode delta in pixels, as Firefox sends for a mouse wheel', async () => {
    const { container, svg, scale, unmount } = await setup();
    const [, y0] = viewBoxOf(container);
    await wheel(svg, { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE });
    expect(viewBoxOf(container)[1]).toBeCloseTo(y0 + 48 / scale, 2);
    await unmount();
  });
});
