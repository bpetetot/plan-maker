import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../model/types';
import type { Plan } from '../model/types';
import { replacePlan, usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { viewBoxOf } from './testKit';

// Bounding box x 2000, y 3000, w 600, h 400 — outside the default view.
const farPlan = (): Plan => ({
  points: {
    a: { id: 'a', x: 2000, y: 3000 },
    b: { id: 'b', x: 2600, y: 3400 },
  },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  openings: {},
  roomLabels: {},
  rulers: {},
});

// Fit = bbox + 120 cm margin per side, grown to screen aspect, centered.
const FAR_PLAN_FIT = { x: 1880, y: 2880, w: 840, h: 640 };
const DEFAULT_FRAME = { x: -80, y: -80, w: 820, h: 620 };

// replacePlan fires outside any event: the reframe commits on React's
// scheduler, so poll (CLAUDE.md: no act() in browser mode).
const expectFraming = async (
  container: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
) => {
  const screen = container.querySelector('svg')!.getBoundingClientRect();
  const scale = Math.min(screen.width / rect.w, screen.height / rect.h);
  await expect.poll(() => viewBoxOf(container)[2]).toBeCloseTo(screen.width / scale, 2);
  const [x, y, , h] = viewBoxOf(container);
  expect(h).toBeCloseTo(screen.height / scale, 2);
  expect(x).toBeCloseTo(rect.x + (rect.w - screen.width / scale) / 2, 2);
  expect(y).toBeCloseTo(rect.y + (rect.h - screen.height / scale) / 2, 2);
};

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

describe('Fit after plan replacement', () => {
  it('reframes the view when a file is opened while the editor is up', async () => {
    const { container } = await render(<Editor />);
    await expectFraming(container, DEFAULT_FRAME);
    replacePlan(farPlan());
    await expectFraming(container, FAR_PLAN_FIT);
  });

  it('opens framing the plan restored before the editor mounted (startup)', async () => {
    replacePlan(farPlan());
    const { container } = await render(<Editor />);
    await expectFraming(container, FAR_PLAN_FIT);
  });

  it('returns to the default view when the plan is reset', async () => {
    replacePlan(farPlan());
    const { container } = await render(<Editor />);
    replacePlan(emptyPlan());
    await expectFraming(container, DEFAULT_FRAME);
  });
});
