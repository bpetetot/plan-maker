// Shift + press on an element body is an additive grab (ticket 04): the gesture
// runs on selection ∪ {ref}, and the toggle waits for the levée.
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../../../src/model/types';
import type { Plan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, pointer } from '../../kit';
import { panel, panelTitle } from '../../panel';

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

// Two parallel walls, 2 m apart: far enough for a grab zone each, and no room
// between them for the panel to name instead.
const twoWalls = (): Plan => ({
  ...emptyPlan(),
  points: {
    a: { id: 'a', x: 0, y: 0 },
    b: { id: 'b', x: 400, y: 0 },
    c: { id: 'c', x: 0, y: 200 },
    d: { id: 'd', x: 400, y: 200 },
  },
  walls: {
    w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
    w2: { id: 'w2', startPointId: 'c', endPointId: 'd', thickness: 10 },
  },
});

const walledWindow = (): Plan => ({
  ...emptyPlan(),
  points: {
    a: { id: 'a', x: 0, y: 0 },
    b: { id: 'b', x: 400, y: 0 },
  },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  openings: { o1: { id: 'o1', wallId: 'w1', type: 'window', offset: 200, width: 120 } },
});

async function setup(plan: Plan) {
  usePlanStore.setState({ plan });
  const { container } = await render(<EditorWithHotkeys />);
  const svg = container.querySelector('svg')!;
  const zones = () => svg.querySelectorAll('line[stroke="transparent"]');
  return { container, svg, zones };
}

const points = () => usePlanStore.getState().plan.points;

// A press with no motion at all: the levée is what resolves it.
async function press(el: Element, svg: SVGSVGElement, x: number, y: number, init: PointerEventInit = {}) {
  await pointer(el, 'pointerdown', { button: 0, ...clientAt(svg, x, y), ...init });
  await pointer(svg, 'pointerup');
}

describe('a Shift press that never moves toggles at the levée', () => {
  it('puts a member of a multi-selection out of it', async () => {
    const { svg, zones } = await setup(twoWalls());
    await press(zones()[0], svg, 200, 0);
    await press(zones()[1], svg, 200, 200, { shiftKey: true });
    expect(panelTitle()).toBe('2 elements');
    await press(zones()[1], svg, 200, 200, { shiftKey: true });
    expect(panelTitle()).toBe('Wall');
  });

  it('brings an unselected element into it', async () => {
    const { svg, zones } = await setup(twoWalls());
    await press(zones()[0], svg, 200, 0);
    expect(panelTitle()).toBe('Wall');
    await press(zones()[1], svg, 200, 200, { shiftKey: true });
    expect(panelTitle()).toBe('2 elements');
  });

  it('deselects the only selected element', async () => {
    const { svg, zones } = await setup(twoWalls());
    await press(zones()[0], svg, 200, 0);
    await press(zones()[0], svg, 200, 0, { shiftKey: true });
    expect(panel()).toBeNull();
  });
});

describe('a Shift drag moves the union it lit', () => {
  it('carries the whole group when a member is the one grabbed', async () => {
    const { svg, zones } = await setup(twoWalls());
    await press(zones()[0], svg, 200, 0);
    await pointer(zones()[1], 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointermove', { ...clientAt(svg, 300, 200), shiftKey: true });
    await pointer(svg, 'pointerup');
    // both walls translated: the grabbed one did not leave the selection
    expect(points()).toMatchObject({
      a: { x: 100, y: 0 },
      b: { x: 500, y: 0 },
      c: { x: 100, y: 200 },
      d: { x: 500, y: 200 },
    });
  });

  it('takes an unselected element along with the selection it joins', async () => {
    const { svg, zones } = await setup(twoWalls());
    await press(zones()[0], svg, 200, 0);
    expect(panelTitle()).toBe('Wall');
    await pointer(zones()[1], 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 200, 200) });
    expect(panelTitle()).toBe('2 elements');
    await pointer(svg, 'pointermove', { ...clientAt(svg, 300, 200), shiftKey: true });
    await pointer(svg, 'pointerup');
    expect(points()).toMatchObject({ a: { x: 100, y: 0 }, c: { x: 100, y: 200 } });
  });

  it('leaves a lone opening on its Rail rather than making it a group of one', async () => {
    const { container, svg } = await setup(walledWindow());
    const glyph = container.querySelector('rect[width="120"][fill="transparent"]')!;
    await pointer(glyph, 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 200, 0) });
    await pointer(svg, 'pointermove', { ...clientAt(svg, 300, 0), shiftKey: true });
    await pointer(svg, 'pointerup');
    // a rigid group of one would have moved the wall and left the offset alone
    expect(usePlanStore.getState().plan.openings.o1.offset).toBe(300);
    expect(points()).toMatchObject({ a: { x: 0, y: 0 } });
  });
});
