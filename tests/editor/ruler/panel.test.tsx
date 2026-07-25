import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Plan } from '../../../src/model/types';
import { emptyPlan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, pointer } from '../../kit';
import { numberField, panel, rowValue } from '../../panel';

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup(plan: Plan) {
  usePlanStore.setState({ plan });
  const { container } = await render(<EditorWithHotkeys />);
  const svg = container.querySelector('svg')!;
  return { svg };
}

describe('tool panel on a selected Ruler', () => {
  // A single diagonal Ruler; midpoint (250,300), length hypot(300,400) = 500 cm.
  const rulerPlan = (): Plan => ({
    ...emptyPlan(),
    rulers: { r: { id: 'r', a: { x: 100, y: 100 }, b: { x: 400, y: 500 }, t: 0.5 } },
  });

  const selectRuler = async (svg: SVGSVGElement) => {
    const grab = svg.querySelector('.ruler-grab')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 250, 300) });
    await pointer(svg, 'pointerup');
  };

  it('titles it Ruler, shows its length read-only, and offers Delete', async () => {
    const { svg } = await setup(rulerPlan());
    await selectRuler(svg);
    await expect.element(page.getByText('Ruler', { exact: true })).toBeInTheDocument();
    expect(rowValue('Length')).toBe('5,00 m');
    expect(numberField()).toBeNull(); // no resize-by-typing
    await expect.element(page.getByLabelText('Delete')).toBeInTheDocument();
  });

  it('deletes the Ruler from the panel', async () => {
    const { svg } = await setup(rulerPlan());
    await selectRuler(svg);
    await userEvent.click(page.getByLabelText('Delete'));
    expect(Object.values(usePlanStore.getState().plan.rulers)).toHaveLength(0);
    expect(panel()).toBeNull();
  });

  // Tool defaults facet: a Ruler configures nothing pre-placement (ticket 09.4).
  it('shows nothing tool-specific for the empty-Selection Ruler tool', async () => {
    await setup(emptyPlan());
    await key('5');
    expect(panel()).toBeNull();
  });
});
