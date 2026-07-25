import { beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { buildPlan } from '../../helpers';
import type { Plan } from '../../../src/model/types';
import { emptyPlan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, pointer } from '../../kit';
import { field, fieldValue, setField } from '../../panel';

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

async function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, a.x, a.y) });
  await pointer(svg, 'pointermove', clientAt(svg, b.x, b.y));
  await pointer(svg, 'pointerup');
}

const standalonePlan = () =>
  buildPlan((b) => {
    b.wall(b.point(0, 0), b.point(400, 0));
  });

const doorPlan = () =>
  buildPlan((b) => {
    const wall = b.wall(b.point(100, 100), b.point(500, 100));
    b.opening(wall, 'door', 200);
  });

describe('the dimension number field', () => {
  const wallThickness = () => Object.values(usePlanStore.getState().plan.walls)[0].thickness;
  const openingWidth = () => Object.values(usePlanStore.getState().plan.openings)[0].width;

  async function selectStandaloneWall() {
    const { svg } = await setup(standalonePlan());
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 });
    return svg;
  }

  it('commits on blur, not per keystroke', async () => {
    const { svg } = await setup(doorPlan());
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 });
    await field().fill('75');
    expect(openingWidth()).toBe(90); // untouched until the field is committed
    await userEvent.tab(); // focus leaves the field, no Enter
    expect(openingWidth()).toBe(75);
  });

  it('reverts the draft and the plan on Escape', async () => {
    await selectStandaloneWall();
    await field().fill('55');
    await key('Escape');
    expect(fieldValue()).toBe('10');
    expect(wallThickness()).toBe(10);
  });

  it('reverts an emptied field to the live value', async () => {
    await selectStandaloneWall();
    await field().fill('');
    await key('Enter');
    expect(fieldValue()).toBe('10');
    expect(wallThickness()).toBe(10);
  });

  it('rounds a decimal entry to the nearest centimetre', async () => {
    await selectStandaloneWall();
    await setField('12.4');
    expect(wallThickness()).toBe(12);
  });

  it('clamps a below-minimum entry up to 1', async () => {
    await selectStandaloneWall();
    await setField('0');
    expect(wallThickness()).toBe(1);
  });

  it('clamps a wall thickness above the maximum down to it', async () => {
    await selectStandaloneWall();
    await setField('500');
    expect(wallThickness()).toBe(100);
  });

  it('reverts an opening width that will not fit the wall', async () => {
    const { svg } = await setup(doorPlan());
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 });
    await setField('9000');
    expect(fieldValue()).toBe('90');
    expect(openingWidth()).toBe(90);
    // the rejected width must not leak into the sticky tool default either
    await key('Escape');
    await key('3');
    expect(fieldValue()).toBe('90');
  });
});
