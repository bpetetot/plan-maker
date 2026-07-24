import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Plan } from '../model/types';
import { emptyPlan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { reloadPreferences, usePreferences } from './preferences';
import { EditorWithHotkeys } from './testHarness';
import { clientAt, key, pointer } from './testKit';

const plan = () => usePlanStore.getState().plan;
const rulers = () => Object.values(plan().rulers);
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length;
const handles = (svg: SVGSVGElement) => svg.querySelectorAll('.point-handle');

// A single diagonal Ruler, its bbox framed at a normal zoom on mount.
const rulerPlan = (): Plan => ({
  ...emptyPlan(),
  rulers: { r: { id: 'r', a: { x: 100, y: 100 }, b: { x: 400, y: 200 }, t: 0.5 } },
});

// A wall to co-select with the Ruler for group moves.
const wallAndRulerPlan = (): Plan => ({
  ...emptyPlan(),
  points: { a: { id: 'a', x: 100, y: 400 }, b: { id: 'b', x: 500, y: 400 } },
  walls: { w: { id: 'w', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  rulers: { r: { id: 'r', a: { x: 100, y: 100 }, b: { x: 400, y: 100 }, t: 0.5 } },
});

const load = (p: Plan) => {
  usePlanStore.setState({ plan: p, planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
};

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

describe('placing a Ruler leaves it selected', () => {
  it('shows the placed Ruler’s endpoint handles once B commits', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Ruler'));

    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 120, 120) });
    await pointer(svg, 'pointermove', clientAt(svg, 420, 120));
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 420, 120) });

    expect(rulers()).toHaveLength(1);
    expect(handles(svg)).toHaveLength(2); // selected → both endpoints show
  });
});

describe('selecting a persisted Ruler', () => {
  it('lights it when its segment is clicked', async () => {
    load(rulerPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    expect(handles(svg)).toHaveLength(0);

    const grab = svg.querySelector('.ruler-grab')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 250, 150) });
    await pointer(svg, 'pointerup');

    expect(handles(svg)).toHaveLength(2);
    expect(svg.querySelector('text.dim-selected')).toBeTruthy();
  });

  it('stays inert while measures are hidden (no grab zone to click)', async () => {
    usePreferences.setState({ measures: false });
    load(rulerPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('.ruler-grab')).toBeNull();
  });

  it('tints on hover, like a wall body', async () => {
    load(rulerPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('polygon[fill="var(--wall-hover)"]')).toBeNull();

    await userEvent.hover(svg.querySelector('.ruler-grab')!);
    await expect.poll(() => svg.querySelector('polygon[fill="var(--wall-hover)"]')).toBeTruthy();
  });
});

describe('editing a selected Ruler', () => {
  it('drags an endpoint to the aimed point, one undo entry', async () => {
    load(rulerPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Snap')); // off: land exactly on the aim

    const grab = svg.querySelector('.ruler-grab')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 250, 150) });
    await pointer(svg, 'pointerup');

    const [, b] = handles(svg); // ['a', 'b'] order
    await pointer(b, 'pointerdown', { button: 0, ...clientAt(svg, 400, 200) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 260));
    await pointer(svg, 'pointerup');

    expect(plan().rulers.r.b).toEqual({ x: 450, y: 260 });
    expect(plan().rulers.r.a).toEqual({ x: 100, y: 100 }); // the far end holds
    expect(undoDepth()).toBe(1);
  });

  it('deletes it on Delete', async () => {
    load(rulerPlan());
    const { container, unmount } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    const grab = svg.querySelector('.ruler-grab')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 250, 150) });
    await pointer(svg, 'pointerup');
    expect(rulers()).toHaveLength(1);

    await key('Delete');
    expect(rulers()).toHaveLength(0);
    await unmount();
  });
});

describe('a Ruler joins the whole-plan selection paths', () => {
  it('is captured by a marquee enclosing both endpoints', async () => {
    load(rulerPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 50, 50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 250));
    await pointer(svg, 'pointerup');
    expect(handles(svg)).toHaveLength(2);
  });

  it('is left out of a marquee while measures are hidden', async () => {
    usePreferences.setState({ measures: false });
    load(rulerPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 50, 50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 250));
    await pointer(svg, 'pointerup');
    expect(handles(svg)).toHaveLength(0);
  });

  it('joins Mod+A while measures are shown', async () => {
    load(rulerPlan());
    const { container, unmount } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    await key('a', { ctrlKey: true });
    expect(handles(svg)).toHaveLength(2);
    await unmount();
  });

  it('is excluded from Mod+A while measures are hidden', async () => {
    usePreferences.setState({ measures: false });
    load(rulerPlan());
    const { container, unmount } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    await key('a', { ctrlKey: true });
    expect(handles(svg)).toHaveLength(0);
    await unmount();
  });
});

describe('group move', () => {
  it('rides a co-selected Ruler rigidly', async () => {
    load(wallAndRulerPlan());
    const { container, unmount } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Snap')); // free: the shift is the raw delta
    await key('a', { ctrlKey: true }); // wall + ruler

    const before = plan().rulers.r;
    const grab = svg.querySelector('.ruler-grab')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 250, 100) });
    await pointer(svg, 'pointermove', clientAt(svg, 300, 130));
    await pointer(svg, 'pointerup');

    const after = plan().rulers.r;
    expect(after.a).toEqual({ x: before.a.x + 50, y: before.a.y + 30 });
    expect(after.b).toEqual({ x: before.b.x + 50, y: before.b.y + 30 });
    await unmount();
  });
});
