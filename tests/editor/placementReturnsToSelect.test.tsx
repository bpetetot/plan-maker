import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Plan } from '../../src/model/types';
import { emptyPlan } from '../../src/model/types';
import { usePlanStore } from '../../src/store/planStore';
import Editor from '../../src/editor/Editor';
import { EditorWithHotkeys } from '../harness';
import { clientAt, key, mouse, pointer } from '../kit';

const TOOLS = ['Select', 'Wall', 'Door', 'Window', 'Ruler'] as const;
const activeTool = () =>
  TOOLS.find((label) => page.getByLabelText(label).element().getAttribute('aria-pressed') === 'true');

const wallPlan = (): Plan => ({
  ...emptyPlan(),
  points: { a: { id: 'a', x: 100, y: 100 }, b: { id: 'b', x: 500, y: 100 } },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
});

beforeEach(() => {
  localStorage.clear();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

// Snap off so clicks land on the exact plan coordinates; point-snapping stays
// active, so a click on the start vertex still closes the loop.
const drawWith = async () => {
  await userEvent.click(page.getByLabelText('Wall'));
  await userEvent.click(page.getByLabelText('Snap'));
};

describe('a completed wall chain returns to Select', () => {
  it('selects the whole triangle as a Room when the loop is closed', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await drawWith();

    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 500, 200) });
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 350, 450) });
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) }); // close on start

    expect(activeTool()).toBe('Select');
    // Its three walls read as a Room (ADR 0014), so the floor tints selected.
    expect(svg.querySelector('.room-fill-selected')).toBeTruthy();
  });

  it('selects the walls it drew when a double-click ends an open chain', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await drawWith();

    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 500, 200) });
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 500, 450) });
    await mouse(svg, 'dblclick', clientAt(svg, 500, 450));

    expect(activeTool()).toBe('Select');
    expect(svg.querySelectorAll('polygon[fill="var(--accent)"]').length).toBeGreaterThan(0);
  });
});

describe('an aborted wall chain stays on the tool', () => {
  it('keeps the Wall tool on Escape, selecting nothing', async () => {
    const { container, unmount } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    await drawWith();

    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 500, 200) }); // one wall committed
    await key('Escape');

    expect(activeTool()).toBe('Wall');
    expect(svg.querySelector('.room-fill-selected')).toBeNull();
    await unmount();
  });
});

describe('placing an opening returns to Select', () => {
  it('switches to Select with the placed Door selected', async () => {
    usePlanStore.setState({ plan: wallPlan() });
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Door'));
    await pointer(svg, 'pointermove', clientAt(svg, 300, 100));
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 300, 100) });

    expect(activeTool()).toBe('Select');
    expect(page.getByText('Door', { exact: true }).element()).toBeTruthy();
  });

  it('switches to Select with the placed Window selected', async () => {
    usePlanStore.setState({ plan: wallPlan() });
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Window'));
    await pointer(svg, 'pointermove', clientAt(svg, 300, 100));
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 300, 100) });

    expect(activeTool()).toBe('Select');
    expect(page.getByText('Window', { exact: true }).element()).toBeTruthy();
  });
});
