// CONTEXT.md: Debug mode — the Axis lock, which the sheet itself never draws
// (ADR 0034), put on screen for the developer alone (ADR 0036).
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../../src/model/types';
import type { Plan } from '../../src/model/types';
import { usePlanStore } from '../../src/store/planStore';
import { reloadPreferences, setPreference } from '../../src/preferences/preferences';
import { EditorWithHotkeys } from '../harness';
import { clientAt, key, pointer } from '../kit';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

// A 45° wall (100,100)–(400,400): the line it lends is on neither world axis,
// so a drawn horizontal would be visibly the wrong answer.
const slantPlan = (): Plan => ({
  ...emptyPlan(),
  points: { a: { id: 'a', x: 100, y: 100 }, b: { id: 'b', x: 400, y: 400 } },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
});

// Horizontal wall (100,100)–(500,100) carrying a 120-wide window at 150: an
// opening rides a Rail, which no Shift constrains.
const openingPlan = (): Plan => ({
  ...emptyPlan(),
  points: { a: { id: 'a', x: 100, y: 100 }, b: { id: 'b', x: 500, y: 100 } },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  openings: { o1: { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 } },
});

async function setup(initial: Plan = emptyPlan()) {
  usePlanStore.setState({ plan: initial, planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
  const { container } = await render(<EditorWithHotkeys />);
  const svg = container.querySelector('svg')!;
  const zones = () => svg.querySelectorAll('line[stroke="transparent"]');
  return { container, svg, zones };
}

// The handles only exist once something is selected, so a point drag goes
// through a click on the wall body first.
async function handlesOf(svg: SVGSVGElement, zone: Element, x: number, y: number) {
  await pointer(zone, 'pointerdown', { button: 0, ...clientAt(svg, x, y) });
  await pointer(svg, 'pointerup');
  return svg.querySelectorAll('.point-handle');
}

// The drawn line read back as a direction and a distance: its endpoints are an
// arbitrary reach past the frame, so neither of them is what the test means.
function axis(svg: SVGSVGElement) {
  const el = svg.querySelector('[data-debug="axis-lock"]');
  if (!el) return null;
  const n = (name: string) => Number(el.getAttribute(name));
  const [x1, y1, dx, dy] = [n('x1'), n('y1'), n('x2') - n('x1'), n('y2') - n('y1')];
  const len = Math.hypot(dx, dy);
  return {
    // Unsigned: which way along the line it was drawn says nothing.
    dir: { x: Math.abs(dx / len), y: Math.abs(dy / len) },
    offsetTo: (p: { x: number; y: number }) => Math.abs((p.x - x1) * dy - (p.y - y1) * dx) / len,
  };
}

// A placement click: the aim arrives first, as the pointer really does.
async function click(svg: SVGSVGElement, x: number, y: number) {
  await pointer(svg, 'pointermove', clientAt(svg, x, y));
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, x, y) });
}

describe('with the mode off, which is how every device starts', () => {
  it('draws no axis, however the gesture is held', async () => {
    const { svg, zones } = await setup(slantPlan());
    const handles = await handlesOf(svg, zones()[0], 250, 250);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 400, 400) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 460, 420) });
    expect(axis(svg)).toBeNull();
    await pointer(svg, 'pointerup');
  });
});

describe('with the mode on', () => {
  beforeEach(() => setPreference('debug', true));

  it('draws the line a posed handle borrows, not a world axis', async () => {
    const { svg, zones } = await setup(slantPlan());
    const handles = await handlesOf(svg, zones()[0], 250, 250);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 400, 400) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 460, 420) });
    const drawn = axis(svg)!;
    expect(drawn.dir.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(drawn.dir.y).toBeCloseTo(Math.SQRT1_2, 6);
    // through the grab, which for a handle is the Point's own position
    expect(drawn.offsetTo({ x: 400, y: 400 })).toBeCloseTo(0, 6);
    await pointer(svg, 'pointerup');
  });

  it('draws the world axis a wall chain elected, through its anchor', async () => {
    const { svg } = await setup();
    await key('2');
    await click(svg, 100, 100);
    // 30 cm off the horizontal, 200 off the vertical
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 300, 130) });
    const drawn = axis(svg)!;
    expect(drawn.dir).toEqual({ x: 1, y: 0 });
    expect(drawn.offsetTo({ x: 100, y: 100 })).toBeCloseTo(0, 6);
  });

  it('drops the line at the next aim once Shift is up', async () => {
    const { svg, zones } = await setup(slantPlan());
    const handles = await handlesOf(svg, zones()[0], 250, 250);
    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 400, 400) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 460, 420) });
    expect(axis(svg)).not.toBeNull();
    await pointer(svg, 'pointermove', clientAt(svg, 460, 420));
    expect(axis(svg)).toBeNull();
    await pointer(svg, 'pointerup');
  });

  it('draws nothing for a gesture no Shift constrains', async () => {
    const { container, svg } = await setup(openingPlan());
    const grab = container.querySelector('rect[width="120"][fill="transparent"]')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 280, 100) });
    await pointer(svg, 'pointermove', { shiftKey: true, ...clientAt(svg, 380, 100) });
    expect(usePlanStore.getState().plan.openings.o1.offset).toBe(250);
    expect(axis(svg)).toBeNull();
    await pointer(svg, 'pointerup');
  });
});
