// ADR 0035: the Grid and its snapping are one toggle — hidden by default, and
// showing it is what puts the alignment target back under a placement.
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { usePlanStore } from '../../../src/store/planStore';
import { emptyPlan } from '../../../src/model/types';
import Editor from '../../../src/editor/Editor';
import { reloadPreferences } from '../../../src/preferences/preferences';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, pointer } from '../../kit';

beforeEach(() => {
  localStorage.clear();
  // preference is session state: clearing storage alone leaves it stale
  reloadPreferences();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

const gridOnSheet = (container: HTMLElement) => container.querySelector('svg [data-grid]');
const toggle = () => page.getByLabelText('Grid');
const pressed = () => toggle().element().getAttribute('aria-pressed');

describe('grid visibility toggle', () => {
  it('hides the grid by default, toggle unpressed', async () => {
    const { container } = await render(<Editor />);
    expect(gridOnSheet(container)).toBeNull();
    expect(pressed()).toBe('false');
  });

  it('shows the grid on toggle', async () => {
    const { container } = await render(<Editor />);
    await userEvent.click(toggle());
    expect(gridOnSheet(container)).not.toBeNull();
    expect(pressed()).toBe('true');
  });

  it('covers the whole screen, not just the viewBox', async () => {
    // screen 800×600 vs viewBox 820×620: "meet" letterboxes horizontally, so the
    // grid starts left of the viewBox's x = -80
    const { container } = await render(<Editor />);
    await userEvent.click(toggle());
    const horizontals = [...container.querySelectorAll('svg [data-grid="major"] line')].filter(
      (l) => l.getAttribute('y1') === l.getAttribute('y2'),
    );
    expect(horizontals.length).toBeGreaterThan(0);
    for (const l of horizontals) expect(Number(l.getAttribute('x1'))).toBeLessThan(-80);
  });

  it('remembers the choice across sessions', async () => {
    const first = await render(<Editor />);
    await userEvent.click(toggle());
    await first.unmount();

    // reload, not remount: a surviving session value would hide the storage read
    reloadPreferences();
    const second = await render(<Editor />);
    expect(gridOnSheet(second.container)).not.toBeNull();
  });
});

// Off-grid, so the grid is the only alignment target that moves the points.
const A = { x: 203, y: 187 };
const B = { x: 400, y: 273 };
const SNAPPED = [
  { x: 200, y: 190 },
  { x: 400, y: 270 },
];
const FREE = [A, B];

async function setup() {
  const { container, unmount } = await render(<EditorWithHotkeys />);
  const svg = container.querySelector('svg')!;
  await key('2'); // Wall tool
  return { svg, unmount };
}

async function drawWall(svg: SVGSVGElement) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, A.x, A.y) });
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, B.x, B.y) });
  return Object.values(usePlanStore.getState().plan.points).map((p) => ({ x: p.x, y: p.y }));
}

describe('the grid is the alignment target', () => {
  it('places freely while the grid is hidden, which is the default', async () => {
    const { svg } = await setup();
    expect(await drawWall(svg)).toEqual(FREE);
  });

  it('aligns to the grid once it is shown', async () => {
    const { svg } = await setup();
    await userEvent.click(toggle());
    expect(await drawWall(svg)).toEqual(SNAPPED);
  });

  it('follows the G key, which is the same one concept', async () => {
    const { svg } = await setup();
    await key('g');
    expect(pressed()).toBe('true');
    expect(await drawWall(svg)).toEqual(SNAPPED);
  });

  it('carries the alignment across sessions with the visibility', async () => {
    const first = await setup();
    await userEvent.click(toggle());
    await first.unmount();

    reloadPreferences();
    const second = await setup();
    expect(await drawWall(second.svg)).toEqual(SNAPPED);
  });
});
