// Keystrokes leave from the focused element and bubble: dispatched at window
// they would bypass the typing guard under test.
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { doorOn } from '../model/testHelpers';
import type { Plan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import { EditorWithHotkeys } from './testHarness';
import { clientAt, key, mouse, pointer } from './testKit';

// A closed square room (100,100)-(500,500); centroid at (300,300).
const square = (): Plan => ({
  points: {
    a: { id: 'a', x: 100, y: 100 },
    b: { id: 'b', x: 500, y: 100 },
    c: { id: 'c', x: 500, y: 500 },
    d: { id: 'd', x: 100, y: 500 },
  },
  walls: {
    w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
    w2: { id: 'w2', startPointId: 'b', endPointId: 'c', thickness: 10 },
    w3: { id: 'w3', startPointId: 'c', endPointId: 'd', thickness: 10 },
    w4: { id: 'w4', startPointId: 'd', endPointId: 'a', thickness: 10 },
  },
  openings: {},
  roomLabels: {},
});

// The square plus a wall standing apart, so the whole plan is not exactly one
// room: a door on a room wall, a window on the loose one.
const squareAndLooseWall = (): Plan => {
  const p = square();
  p.points.e = { id: 'e', x: 700, y: 100 };
  p.points.f = { id: 'f', x: 900, y: 100 };
  p.walls.w5 = { id: 'w5', startPointId: 'e', endPointId: 'f', thickness: 10 };
  p.openings.o1 = doorOn('w1');
  p.openings.o2 = { id: 'o2', wallId: 'w5', type: 'window', offset: 100, width: 60 };
  return p;
};

beforeEach(() => {
  localStorage.clear();
  usePlanStore.setState({ plan: square(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

const plan = () => usePlanStore.getState().plan;
const wallCount = () => Object.keys(plan().walls).length;
const nameInput = () => page.getByRole('textbox');
const pressed = (name: string) => page.getByLabelText(name).element().getAttribute('aria-pressed');
// Scoped to the panel: a named room prints its name on the sheet too.
const panelTitle = () => document.querySelector('.panel-title')?.textContent;

// DOM query, not a locator: label and value are sibling spans, unnavigable.
function rowValue(label: string) {
  const rows = [...document.querySelectorAll('.panel-row')];
  const row = rows.find((r) => r.querySelector('.panel-row-label')?.textContent === label);
  return row?.querySelector('.panel-row-value')?.textContent;
}

async function setup(fixture?: Plan) {
  if (fixture) usePlanStore.setState({ plan: fixture });
  const { container, unmount } = await render(<EditorWithHotkeys />);
  return { container, svg: container.querySelector('svg')!, unmount };
}

const clickAt = async (svg: SVGSVGElement, x: number, y: number) => {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, x, y) });
  await pointer(svg, 'pointerup');
};

// Marquee, not a click: selects on geometry alone, no tolerance to get right.
async function deleteAWall(svg: SVGSVGElement) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 80, 80) });
  await pointer(svg, 'pointermove', clientAt(svg, 520, 120));
  await pointer(svg, 'pointerup');
  await key('Delete');
}

describe('history shortcuts', () => {
  it('Mod+Z undoes, Mod+Shift+Z and Mod+Y both redo', async () => {
    const { svg, unmount } = await setup();
    await deleteAWall(svg);
    expect(wallCount()).toBe(3);

    await key('z', { ctrlKey: true });
    expect(wallCount()).toBe(4);

    await key('z', { ctrlKey: true, shiftKey: true });
    expect(wallCount()).toBe(3);

    await key('z', { ctrlKey: true });
    expect(wallCount()).toBe(4);

    await key('y', { ctrlKey: true });
    expect(wallCount()).toBe(3);
    await unmount();
  });
});

describe('tool shortcuts', () => {
  it('1-4 pick the tools, and a modifier disarms them', async () => {
    const { unmount } = await setup();

    await key('2');
    expect(pressed('Wall')).toBe('true');

    // Ctrl+1 is a browser tab shortcut, not a tool switch.
    await key('1', { ctrlKey: true });
    expect(pressed('Wall')).toBe('true');

    await key('1');
    expect(pressed('Select')).toBe('true');
    await unmount();
  });
});

// Press the on-screen hint, not the registry value: comparing the label to the
// registry would be the registry compared to itself.
describe('the advertised key is the working key', () => {
  it('activates each tool by pressing the hint printed on its button', async () => {
    const { container, unmount } = await setup();
    for (const label of ['Wall', 'Door', 'Window', 'Select']) {
      const button = container.querySelector(`button[aria-label="${label}"]`)!;
      const hint = button.querySelector('.key-hint')!.textContent!;
      await key(hint);
      expect(button.getAttribute('aria-pressed')).toBe('true');
    }
    await unmount();
  });

  it('toggles snap by pressing the key named in the toggle title', async () => {
    const { container, unmount } = await setup();
    const snap = container.querySelector('button[aria-label="Snap"]')!;
    // title reads "Disable snap (S)"
    const hint = snap.getAttribute('title')!.match(/\(([^)]+)\)/)![1];
    expect(snap.getAttribute('aria-pressed')).toBe('true');
    await key(hint);
    expect(snap.getAttribute('aria-pressed')).toBe('false');
    await unmount();
  });
});

describe('select all', () => {
  it('takes every wall and every opening the plan holds', async () => {
    const { unmount } = await setup(squareAndLooseWall());

    await key('a', { ctrlKey: true });
    expect(panelTitle()).toBe('7 elements');
    expect(rowValue('Walls')).toBe('5');
    expect(rowValue('Doors')).toBe('1');
    expect(rowValue('Windows')).toBe('1');
    await unmount();
  });

  it('returns to the Select tool from a half-drawn chain, committing nothing', async () => {
    const { svg, unmount } = await setup();
    await key('2');
    // Clear of every wall: the chain's first click is held pending, uncommitted.
    await clickAt(svg, 250, 250);

    await key('a', { ctrlKey: true });
    expect(pressed('Select')).toBe('true');
    expect(wallCount()).toBe(4);
    // The square is the whole plan, so the selection reads as its room (ADR 0014).
    // 400 cm axis-to-axis, walls 10 thick: 3,90 m interior each way.
    expect(panelTitle()).toBe('Room');
    expect(rowValue('Area')).toBe('15,21 m²');
    await unmount();
  });
});

describe('the typing guard', () => {
  it('leaves the plan alone when Mod+Z is pressed while naming a room', async () => {
    const { svg, unmount } = await setup();
    await mouse(svg, 'dblclick', clientAt(svg, 300, 300));
    await userEvent.fill(nameInput(), 'Kitchen');
    await userEvent.keyboard('{Enter}');
    expect(Object.values(plan().roomLabels)[0]).toMatchObject({ name: 'Kitchen' });

    await mouse(svg, 'dblclick', clientAt(svg, 300, 300));
    await userEvent.fill(nameInput(), 'Kitchenette');
    await key('z', { ctrlKey: true });
    expect(Object.values(plan().roomLabels)[0]).toMatchObject({ name: 'Kitchen' });
    await unmount();
  });

  it('does not toggle snap when S is typed into a room name', async () => {
    const { svg, unmount } = await setup();
    const snapPressed = () => page.getByLabelText('Snap').element().getAttribute('aria-pressed');
    expect(snapPressed()).toBe('true');

    await mouse(svg, 'dblclick', clientAt(svg, 300, 300));
    expect(document.activeElement).toBe(nameInput().element());
    await key('s');
    expect(snapPressed()).toBe('true');
    await unmount();
  });

  // The loose wall is what tells the two readings apart: selecting all would
  // retitle the panel '7 elements'.
  it('leaves the selection alone when Mod+A is pressed while naming a room', async () => {
    const { svg, unmount } = await setup(squareAndLooseWall());
    await clickAt(svg, 300, 300);
    expect(panelTitle()).toBe('Room');

    await mouse(svg, 'dblclick', clientAt(svg, 300, 300));
    expect(document.activeElement).toBe(nameInput().element());
    await key('a', { ctrlKey: true });
    expect(panelTitle()).toBe('Room');
    await unmount();
  });
});
