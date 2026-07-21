// Keystrokes leave from the focused element and bubble: dispatched at window
// they would bypass the typing guard under test.
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
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

beforeEach(() => {
  localStorage.clear();
  usePlanStore.setState({ plan: square(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

const plan = () => usePlanStore.getState().plan;
const wallCount = () => Object.keys(plan().walls).length;
const nameInput = () => page.getByRole('textbox');

async function setup() {
  const { container, unmount } = await render(<EditorWithHotkeys />);
  return { container, svg: container.querySelector('svg')!, unmount };
}

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
    const pressed = (name: string) => page.getByLabelText(name).element().getAttribute('aria-pressed');

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
});
