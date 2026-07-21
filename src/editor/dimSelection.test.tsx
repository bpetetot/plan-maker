import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { buildPlan } from '../model/testHelpers';
import { emptyPlan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { clientAt, pointer } from './testKit';

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup() {
  usePlanStore.setState({
    plan: buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
      b.wall(b.point(0, 200), b.point(400, 200));
    }),
  });
  const { container } = await render(<Editor />);
  return { svg: container.querySelector('svg')! };
}

async function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, a.x, a.y) });
  await pointer(svg, 'pointermove', clientAt(svg, b.x, b.y));
  await pointer(svg, 'pointerup');
}

describe('dimension of a selected wall', () => {
  it('turns accent on selection, and back to gray when cleared', async () => {
    const { svg } = await setup();
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(0);
    // marquee spans the y=0 wall only
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 });
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(1);
    // degenerate marquee off-plan: a click on empty canvas
    await marqueeSelect(svg, { x: 600, y: -100 }, { x: 600, y: -100 });
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(0);
  });

  it('colors every selected wall dimension in a multi-selection', async () => {
    const { svg } = await setup();
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 250 });
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(2);
  });
});
