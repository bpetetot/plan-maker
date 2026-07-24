import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../model/types';
import type { Plan } from '../model/types';
import { replacePlan, usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { wheel, zoomLabel } from './testKit';

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

const zoomOut = () => page.getByLabelText('Zoom out');
const zoomIn = () => page.getByLabelText('Zoom in');
// 1.25 per click: floor 11 clicks below 100% (1.25^10 = 10.7%), ceiling 16
// above (1.25^15 = 2842%). Last click of each run is clamped.
const CLICKS_TO_FLOOR = 11;
const CLICKS_TO_CEILING = 16;

const clickTimes = async (btn: ReturnType<typeof zoomOut>, n: number) => {
  for (let i = 0; i < n; i++) await userEvent.click(btn);
};

// Far wider than the default 820×620 framing: Fit lands near 7%, below the floor.
const hugePlan = (): Plan => ({
  points: {
    a: { id: 'a', x: 0, y: 0 },
    b: { id: 'b', x: 12000, y: 9000 },
  },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  openings: {},
  roomLabels: {},
  rulers: {},
});

describe('zoom bounds', () => {
  it('floors the zoom out at 10%', async () => {
    await render(<Editor />);
    await clickTimes(zoomOut(), CLICKS_TO_FLOOR);
    expect(zoomLabel()).toBe('10%');
  });

  it('caps the zoom in at 3000%', async () => {
    await render(<Editor />);
    await clickTimes(zoomIn(), CLICKS_TO_CEILING);
    expect(zoomLabel()).toBe('3000%');
  });

  it('greys out Zoom out on the floor and revives it on the way back', async () => {
    await render(<Editor />);
    await expect.element(zoomOut()).not.toBeDisabled();
    await clickTimes(zoomOut(), CLICKS_TO_FLOOR - 1);
    await expect.element(zoomOut()).not.toBeDisabled(); // 10.7%, one step left
    await userEvent.click(zoomOut());
    await expect.element(zoomOut()).toBeDisabled();
    await expect.element(zoomIn()).not.toBeDisabled();
    await userEvent.click(zoomIn());
    await expect.element(zoomOut()).not.toBeDisabled();
  });

  it('greys out Zoom in on the ceiling and revives it on the way back', async () => {
    await render(<Editor />);
    await expect.element(zoomIn()).not.toBeDisabled();
    await clickTimes(zoomIn(), CLICKS_TO_CEILING - 1);
    await expect.element(zoomIn()).not.toBeDisabled(); // 2842%, one step left
    await userEvent.click(zoomIn());
    await expect.element(zoomIn()).toBeDisabled();
    await expect.element(zoomOut()).not.toBeDisabled();
    await userEvent.click(zoomOut());
    await expect.element(zoomIn()).not.toBeDisabled();
  });

  it('holds the floor against the wheel, which the buttons alone would not', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await clickTimes(zoomOut(), CLICKS_TO_FLOOR);
    for (let i = 0; i < 5; i++) await wheel(svg, { deltaY: 100, clientX: 400, clientY: 300, ctrlKey: true });
    expect(zoomLabel()).toBe('10%');
  });

  it('lets Fit frame a plan below the floor', async () => {
    await render(<Editor />);
    replacePlan(hugePlan());
    // Fit reframes outside any dispatched event: the read must retry.
    await expect.poll(() => zoomLabel()).toBe('7%');
    await expect.element(zoomOut()).toBeDisabled();
    await expect.element(zoomIn()).not.toBeDisabled();
  });
});
