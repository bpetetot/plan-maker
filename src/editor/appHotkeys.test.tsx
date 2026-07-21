// ADR 0012. Mod is dispatched as Ctrl: the suite runs Chromium on Linux.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Plan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import { reloadPreferences } from './preferences';
import { key, zoomLabel } from './testKit';
import { EditorWithHotkeys } from './testHarness';

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
  reloadPreferences();
  usePlanStore.setState({ plan: square(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

const pressed = (label: string) => page.getByLabelText(label).element().getAttribute('aria-pressed');

const zoomPercent = () => Number(zoomLabel()!.replace('%', ''));

describe('the view toggles', () => {
  it('G shows and hides the grid', async () => {
    const { container, unmount } = await render(<EditorWithHotkeys />);
    expect(container.querySelector('svg [data-grid]')).not.toBeNull();

    await key('g');
    expect(container.querySelector('svg [data-grid]')).toBeNull();
    expect(pressed('Grid')).toBe('false');

    await key('g');
    expect(pressed('Grid')).toBe('true');
    await unmount();
  });

  it('M shows and hides the measures', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);
    expect(pressed('Measures')).toBe('true');

    await key('m');
    expect(pressed('Measures')).toBe('false');

    await key('m');
    expect(pressed('Measures')).toBe('true');
    await unmount();
  });

  it('leaves the grid alone when the same letter arrives with Mod', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);
    await key('g', { ctrlKey: true });
    expect(pressed('Grid')).toBe('true');
    await unmount();
  });
});

describe('zoom', () => {
  it('Mod+= zooms in and Mod+- zooms out', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);
    const fitted = zoomPercent();

    await key('=', { ctrlKey: true });
    expect(zoomPercent()).toBeGreaterThan(fitted);

    await key('-', { ctrlKey: true });
    expect(zoomPercent()).toBe(fitted);
    await unmount();
  });

  // US layout sends '+' as key, '=' as code; registration is on the code.
  // Without the alias the strict Shift match drops it.
  it('zooms in on Mod+Shift+= — the way Mod++ really arrives', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);
    const fitted = zoomPercent();

    await key('+', { ctrlKey: true, shiftKey: true, code: 'Equal' });
    expect(zoomPercent()).toBeGreaterThan(fitted);
    await unmount();
  });

  it('Mod+0 goes to 100%, whatever the fit landed on', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);

    await key('0', { ctrlKey: true });
    expect(zoomPercent()).toBe(100);
    await unmount();
  });

  it('Shift+1 fits the plan back', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);
    const fitted = zoomPercent();

    await key('0', { ctrlKey: true });
    expect(zoomPercent()).not.toBe(fitted);

    await key('1', { shiftKey: true });
    expect(zoomPercent()).toBe(fitted);
    await unmount();
  });

  // US layout: Shift+1 is '!', digit only in `code`. Plain '1' above is AZERTY.
  it('fits when Shift+1 arrives as !', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);
    const fitted = zoomPercent();
    await key('0', { ctrlKey: true });

    await key('!', { shiftKey: true, code: 'Digit1' });
    expect(zoomPercent()).toBe(fitted);
    await unmount();
  });

  // Bare '1' is the Wall tool; the match is strict on Shift.
  it('does not switch tool', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);
    await key('1', { shiftKey: true });
    expect(pressed('Select')).toBe('true');
    await unmount();
  });
});

describe('the menu actions', () => {
  it.for([
    ['open', 'o', {}],
    ['saveAs', 's', {}],
    ['exportImage', 'e', { shiftKey: true }],
    ['toggleTheme', 'd', { altKey: true, shiftKey: true }],
  ] as const)('runs %s', async ([action, k, modifiers]) => {
    const spy = vi.fn();
    const ctrl = action === 'toggleTheme' ? {} : { ctrlKey: true };
    const { unmount } = await render(<EditorWithHotkeys actions={{ [action]: spy }} />);

    await key(k, { ...ctrl, ...modifiers });
    expect(spy).toHaveBeenCalledOnce();
    await unmount();
  });

  it('runs reset on Mod+Backspace', async () => {
    const spy = vi.fn();
    const { unmount } = await render(<EditorWithHotkeys actions={{ reset: spy }} />);

    await key('Backspace', { ctrlKey: true });
    expect(spy).toHaveBeenCalledOnce();
    await unmount();
  });

  // Mirrors the disabled menu item.
  it('offers no reset to run on an empty plan', async () => {
    const spy = vi.fn();
    const { unmount } = await render(<EditorWithHotkeys actions={{ reset: spy }} resetDisabled />);

    await key('Backspace', { ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
    await unmount();
  });

  it('leaves reset alone when Backspace arrives bare', async () => {
    const spy = vi.fn();
    const { unmount } = await render(<EditorWithHotkeys actions={{ reset: spy }} />);

    await key('Backspace');
    expect(spy).not.toHaveBeenCalled();
    await unmount();
  });

  // No Mod+Delete for reset: Delete is deleteSelection's primary key, so the
  // alias would sit one modifier from the commonest destructive keystroke.
  it('leaves reset alone on Mod+Delete', async () => {
    const spy = vi.fn();
    const { unmount } = await render(<EditorWithHotkeys actions={{ reset: spy }} />);

    await key('Delete', { ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
    await unmount();
  });
});

// Registry mounts above the loading early return: without the gate, Mod+O
// during boot imports a plan the pending restore then overwrites.
describe('before the app is ready', () => {
  it('answers no shortcut', async () => {
    const open = vi.fn();
    const { unmount } = await render(<EditorWithHotkeys actions={{ open }} ready={false} />);

    await key('o', { ctrlKey: true });
    await key('g');
    expect(open).not.toHaveBeenCalled();
    expect(pressed('Grid')).toBe('true');
    await unmount();
  });
});
