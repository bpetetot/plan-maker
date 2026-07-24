import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Plan } from '../model/types';
import { emptyPlan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { reloadPreferences, usePreferences } from './preferences';

const planWithRuler = (): Plan => ({
  ...emptyPlan(),
  rulers: { r: { id: 'r', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 0.5 } },
});

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
  usePlanStore.setState({ plan: planWithRuler(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

describe('a persisted Ruler in the editor scene', () => {
  it('draws its measured value when measures are shown', async () => {
    const { container } = await render(<Editor />);
    expect(container.querySelectorAll('text.dim')).toHaveLength(1);
    expect(container.querySelector('text.dim')!.textContent).toBe('4,00 m');
  });

  it('follows the Measures toggle: hidden when measures are off', async () => {
    usePreferences.setState({ measures: false });
    const { container } = await render(<Editor />);
    expect(container.querySelectorAll('text.dim')).toHaveLength(0);
  });
});
