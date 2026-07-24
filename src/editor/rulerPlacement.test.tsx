import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Plan } from '../model/types';
import { emptyPlan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { reloadPreferences, usePreferences } from './preferences';
import { EditorWithHotkeys } from './testHarness';
import { clientAt, key, mouse, pointer } from './testKit';

const rulers = () => Object.values(usePlanStore.getState().plan.rulers);

const TOOLS = ['Select', 'Wall', 'Door', 'Window', 'Ruler'] as const;
const activeTool = () =>
  TOOLS.find((label) => page.getByLabelText(label).element().getAttribute('aria-pressed') === 'true');

// A wall frames the view at a normal zoom; its start point is the snap target.
const wallPlan = (): Plan => ({
  ...emptyPlan(),
  points: {
    a: { id: 'a', x: 100, y: 100 },
    b: { id: 'b', x: 500, y: 100 },
  },
  walls: { w: { id: 'w', startPointId: 'a', endPointId: 'b', thickness: 10 } },
});

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

describe('the Ruler tool places a measured segment', () => {
  it('commits a Ruler on the second click and returns to Select', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Ruler'));

    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 120, 120) });
    expect(rulers()).toHaveLength(0); // A is pending, nothing on the plan yet
    await pointer(svg, 'pointermove', clientAt(svg, 420, 120));
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 420, 120) });

    const placed = rulers();
    expect(placed).toHaveLength(1);
    expect(placed[0].a).toEqual({ x: 120, y: 120 });
    expect(placed[0].b).toEqual({ x: 420, y: 120 });
    expect(placed[0].t).toBe(0.5);
    expect(activeTool()).toBe('Select');
    expect(container.querySelector('text.dim')!.textContent).toBe('3,00 m');
  });

  it('shows a full live preview between A and the cursor before B', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Ruler'));

    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 120, 120) });
    await pointer(svg, 'pointermove', clientAt(svg, 420, 120));

    // The ghost reads as the final Ruler already, though nothing is committed.
    expect(rulers()).toHaveLength(0);
    expect(container.querySelector('text.dim')!.textContent).toBe('3,00 m');
  });

  it('copies a snapped wall point into the endpoint (never attached)', async () => {
    usePlanStore.setState({ plan: wallPlan() });
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Snap')); // aim the point rung
    await userEvent.click(page.getByLabelText('Ruler'));

    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 103, 102) });
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 400, 400) });

    const placed = rulers();
    expect(placed).toHaveLength(1);
    expect(placed[0].a).toEqual({ x: 100, y: 100 }); // copied from the wall point
  });

  it('ignores a B that lands on A as a mis-click', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Ruler'));

    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });

    expect(rulers()).toHaveLength(0); // no degenerate zero-length Ruler
    expect(activeTool()).toBe('Ruler'); // pending A survives, tool stays active
  });

  it('reveals the measures when the tool is activated while they are hidden', async () => {
    usePreferences.setState({ measures: false });
    await render(<Editor />);
    expect(page.getByLabelText('Measures').element().getAttribute('aria-pressed')).toBe('false');

    await userEvent.click(page.getByLabelText('Ruler'));
    expect(page.getByLabelText('Measures').element().getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the Ruler tool cancellation cascade', () => {
  it('selects the tool with the 5 shortcut', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);
    await key('5');
    expect(activeTool()).toBe('Ruler');
    await unmount();
  });

  it('Escape cancels a pending A, then a second Escape returns to Select', async () => {
    const { container, unmount } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    await key('5');
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 120, 120) });
    expect(page.getByText(/set the end point/).element()).toBeTruthy();

    await key('Escape');
    expect(activeTool()).toBe('Ruler');
    expect(rulers()).toHaveLength(0);
    expect(page.getByText(/start a measurement/).element()).toBeTruthy();

    await key('Escape');
    expect(activeTool()).toBe('Select');
    await unmount();
  });

  it('right-click cancels a pending A first, then returns to Select', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Ruler'));
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 120, 120) });

    await mouse(svg, 'contextmenu');
    expect(activeTool()).toBe('Ruler');
    expect(rulers()).toHaveLength(0);

    await mouse(svg, 'contextmenu');
    expect(activeTool()).toBe('Select');
  });
});
