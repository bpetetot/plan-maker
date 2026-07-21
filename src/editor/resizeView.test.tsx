import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { usePlanStore } from '../store/planStore';
import { emptyPlan } from '../model/types';
import Editor from './Editor';
import { viewBoxOf, zoomLabel } from './testKit';

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan() });
  usePlanStore.temporal.getState().clear();
});

// These tests really resize the viewport; restore it for the files that follow.
afterEach(() => page.viewport(800, 600));

// Default frame 820×620 at -80,-80 fitted to the 800×600 screen: min ratio
// 600/620, centered horizontally.
const S0 = 600 / 620;

describe('window resize never pans or zooms the view', () => {
  it('opens with the default framing filling the screen exactly', async () => {
    const { container } = await render(<Editor />);
    const [x, y, w, h] = viewBoxOf(container);
    expect(x).toBeCloseTo(-80 - (800 / S0 - 820) / 2, 2);
    expect(y).toBeCloseTo(-80, 5);
    expect(w).toBeCloseTo(800 / S0, 2);
    expect(h).toBeCloseTo(620, 5);
  });

  it('growing the window reveals plan to the right and bottom, top-left anchored', async () => {
    const { container } = await render(<Editor />);
    const [x0, y0] = viewBoxOf(container);
    await page.viewport(1000, 800);
    const [x, y, w, h] = viewBoxOf(container);
    expect(x).toBeCloseTo(x0, 5);
    expect(y).toBeCloseTo(y0, 5);
    expect(w).toBeCloseTo(1000 / S0, 2);
    expect(h).toBeCloseTo(800 / S0, 2);
    expect(zoomLabel()).toBe('100%');
  });

  it('shrinking the window never rescales the plan', async () => {
    const { container } = await render(<Editor />);
    const [x0, y0] = viewBoxOf(container);
    await page.viewport(400, 300);
    const [x, y, w, h] = viewBoxOf(container);
    expect(x).toBeCloseTo(x0, 5);
    expect(y).toBeCloseTo(y0, 5);
    expect(w).toBeCloseTo(400 / S0, 2);
    expect(h).toBeCloseTo(300 / S0, 2);
    expect(zoomLabel()).toBe('100%');
  });

  it('a zoomed view keeps its scale and origin through a resize', async () => {
    const { container } = await render(<Editor />);
    await userEvent.click(page.getByLabelText('Zoom in')); // scale ×1.25
    const [x0, y0] = viewBoxOf(container);
    await page.viewport(1000, 600);
    const [x, y, w, h] = viewBoxOf(container);
    expect(x).toBeCloseTo(x0, 5);
    expect(y).toBeCloseTo(y0, 5);
    expect(w).toBeCloseTo(1000 / (S0 * 1.25), 2);
    expect(h).toBeCloseTo(600 / (S0 * 1.25), 2);
    expect(zoomLabel()).toBe('125%');
  });
});
