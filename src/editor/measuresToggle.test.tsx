// CONTEXT.md: Measure — hides wall dimensions and room areas, nothing else.
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import { buildPlan, namedRoomPlan } from '../model/testHelpers';
import { emptyPlan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { measuresVisible, reloadPreferences } from './preferences';
import { clientAt, pointer } from './testKit';

beforeEach(() => {
  localStorage.clear();
  // the preference is session state: clearing storage alone is not a fresh device
  reloadPreferences();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup(plan = namedRoomPlan()) {
  usePlanStore.setState({ plan });
  const { container } = await render(<Editor />);
  return { container, svg: container.querySelector('svg')! };
}

const dims = (svg: SVGSVGElement) => svg.querySelectorAll('text.dim:not(.dim-live)');
const areas = (svg: SVGSVGElement) => svg.querySelectorAll('text.room-area');
const names = (svg: SVGSVGElement) => svg.querySelectorAll('text.room-name');
const toggle = () => page.getByLabelText('Measures');
const pressed = () => toggle().element().getAttribute('aria-pressed');

describe('measure visibility toggle', () => {
  it('shows measures by default, toggle pressed', async () => {
    const { svg } = await setup();
    expect(dims(svg)).toHaveLength(4);
    expect(areas(svg)).toHaveLength(1);
    expect(pressed()).toBe('true');
  });

  it('hides wall dimensions and room areas on toggle', async () => {
    const { svg } = await setup();
    await userEvent.click(toggle());
    expect(dims(svg)).toHaveLength(0);
    expect(areas(svg)).toHaveLength(0);
    expect(pressed()).toBe('false');
  });

  it('keeps the room name, which is not a measure', async () => {
    const { svg } = await setup();
    expect(names(svg)).toHaveLength(1);
    await userEvent.click(toggle());
    expect(names(svg)).toHaveLength(1);
  });

  it('leaves the grid alone', async () => {
    const { svg } = await setup();
    await userEvent.click(toggle());
    expect(svg.querySelector('[data-grid]')).not.toBeNull();
  });

  it('does not bring the measure back for a selected wall', async () => {
    const { svg } = await setup();
    await userEvent.click(toggle());
    // marquee over the top wall only
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 50));
    await pointer(svg, 'pointerup');
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(0);
    expect(dims(svg)).toHaveLength(0);
  });

  it('keeps the live length while a wall is drawn — interaction chrome', async () => {
    const { svg } = await setup(emptyPlan());
    await userEvent.click(toggle());
    await userEvent.click(page.getByTitle('Wall (2)'));
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 0, 0) });
    await pointer(svg, 'pointerup', clientAt(svg, 0, 0));
    await pointer(svg, 'pointermove', clientAt(svg, 300, 0));
    expect(svg.querySelector('text.dim-live')).not.toBeNull();
  });

  it('keeps the placement dimensions of a selected opening — interaction chrome', async () => {
    const withDoor = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const wall = b.wall(p1, p2);
      b.opening(wall, 'door', 200);
    });
    const { svg } = await setup(withDoor);
    await userEvent.click(toggle());
    // marquee over the wall and its door
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 50));
    await pointer(svg, 'pointerup');
    expect(svg.querySelectorAll('text.placement-chip').length).toBeGreaterThan(0);
    expect(dims(svg)).toHaveLength(0);
  });

  it('leaves an unlabeled room blank, with no drag target behind', async () => {
    const { svg } = await setup({ ...namedRoomPlan(), roomLabels: {} });
    expect(areas(svg)).toHaveLength(1);
    expect(svg.querySelectorAll('rect.room-area-hit')).toHaveLength(1);

    await userEvent.click(toggle());
    expect(areas(svg)).toHaveLength(0);
    expect(names(svg)).toHaveLength(0);
    expect(svg.querySelectorAll('rect.room-area-hit')).toHaveLength(0);
    expect(svg.querySelectorAll('rect.room-name-hit')).toHaveLength(0);
  });

  it('remembers the choice across sessions', async () => {
    await setup();
    await userEvent.click(toggle());
    expect(localStorage.getItem('plan-maker:measures')).toBe('hidden');
    await cleanup();

    // reload, not remount: a surviving session value would hide the storage read
    reloadPreferences();
    const { svg } = await setup();
    expect(dims(svg)).toHaveLength(0);
    expect(areas(svg)).toHaveLength(0);
  });

  it('stores nothing once measures are shown again', async () => {
    await setup();
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(localStorage.getItem('plan-maker:measures')).toBeNull();
  });

  it('still reports hidden to the export when storage is unavailable', async () => {
    const { svg } = await setup();
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('quota');
    };
    try {
      await userEvent.click(toggle());
      expect(dims(svg)).toHaveLength(0);
      expect(measuresVisible()).toBe(false);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});
