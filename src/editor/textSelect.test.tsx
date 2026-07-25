import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Plan, TextNote } from '../model/types';
import { emptyPlan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { reloadPreferences, usePreferences } from '../preferences/preferences';
import { EditorWithHotkeys } from './testHarness';
import { clientAt, key, pointer } from './testKit';

const plan = () => usePlanStore.getState().plan;
const texts = () => Object.values(plan().texts) as TextNote[];
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length;

// Selection shows as the `selected` class on the glyphs (ticket 07's look); a
// Text has no endpoint handles, so this is what "is selected" reads from.
const selectedText = (svg: SVGSVGElement) => svg.querySelector('text.text-note.selected');
const grab = (svg: SVGSVGElement) => svg.querySelector('.text-grab');
const box = (svg: SVGSVGElement) => svg.querySelector('.text-note-box');

// A lone Text framed on mount; content long enough for a clickable block.
const oneTextPlan = (): Plan => ({
  ...emptyPlan(),
  texts: { t: { id: 't', x: 200, y: 200, content: 'Kitchen', size: 'M' } },
});

// A wall to co-select with the Text for a group move.
const wallAndTextPlan = (): Plan => ({
  ...emptyPlan(),
  points: { a: { id: 'a', x: 100, y: 400 }, b: { id: 'b', x: 500, y: 400 } },
  walls: { w: { id: 'w', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  texts: { t: { id: 't', x: 200, y: 200, content: 'Kitchen', size: 'M' } },
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

describe('placing a Text leaves it selected', () => {
  it('lights the freshly committed Text (auto-select, the 06 deferral)', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Text'));
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    const editor = document.querySelector('textarea.text-note-input') as HTMLTextAreaElement;
    await userEvent.type(editor, 'Kitchen');
    await key('Enter', { ctrlKey: true });

    expect(texts()).toHaveLength(1);
    await expect.poll(() => selectedText(svg)).toBeTruthy();
  });
});

describe('selecting a persisted Text', () => {
  it('lights it when its block is clicked — measures on or off', async () => {
    load(oneTextPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    expect(selectedText(svg)).toBeNull();

    await pointer(grab(svg)!, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerup');
    expect(selectedText(svg)).toBeTruthy();
  });

  it('stays selectable while measures are hidden (unlike a Ruler)', async () => {
    usePreferences.setState({ measures: false });
    load(oneTextPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    // The grab zone is always drawn — a Text is content, never measure-gated.
    expect(grab(svg)).toBeTruthy();
    await pointer(grab(svg)!, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerup');
    expect(selectedText(svg)).toBeTruthy();
  });

  it('shows no box on hover — only the move cursor of the grab zone', async () => {
    load(oneTextPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    expect(box(svg)).toBeNull();
    await userEvent.hover(grab(svg)!);
    // Hover no longer draws an outline (ticket: only the cursor changes).
    expect(box(svg)).toBeNull();
  });

  it('shows the outline box only once selected', async () => {
    load(oneTextPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    expect(box(svg)).toBeNull();
    await pointer(grab(svg)!, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerup');
    await expect.poll(() => box(svg)).toBeTruthy();
  });
});

describe('editing a selected Text', () => {
  it('deletes it on Delete', async () => {
    load(oneTextPlan());
    const { container, unmount } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    await pointer(grab(svg)!, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerup');
    expect(texts()).toHaveLength(1);

    await key('Delete');
    expect(texts()).toHaveLength(0);
    await unmount();
  });

  it('drags the selected Text to the pointer, one undo entry', async () => {
    load(oneTextPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Snap')); // off: land on the raw delta

    await pointer(grab(svg)!, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointermove', clientAt(svg, 260, 240));
    await pointer(svg, 'pointerup');

    expect(plan().texts.t).toMatchObject({ x: 260, y: 240 });
    expect(undoDepth()).toBe(1);
  });
});

describe('a Text joins the whole-plan selection paths', () => {
  it('is captured by a marquee enclosing its anchor', async () => {
    load(oneTextPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 50, 50) });
    await pointer(svg, 'pointermove', clientAt(svg, 350, 350));
    await pointer(svg, 'pointerup');
    expect(selectedText(svg)).toBeTruthy();
  });

  it('joins a marquee even while measures are hidden', async () => {
    usePreferences.setState({ measures: false });
    load(oneTextPlan());
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 50, 50) });
    await pointer(svg, 'pointermove', clientAt(svg, 350, 350));
    await pointer(svg, 'pointerup');
    expect(selectedText(svg)).toBeTruthy();
  });

  it('joins Mod+A even while measures are hidden', async () => {
    usePreferences.setState({ measures: false });
    load(oneTextPlan());
    const { container, unmount } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    await key('a', { ctrlKey: true });
    expect(selectedText(svg)).toBeTruthy();
    await unmount();
  });
});

describe('group move', () => {
  it('rides a co-selected Text rigidly', async () => {
    load(wallAndTextPlan());
    const { container, unmount } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Snap')); // free: the shift is the raw delta
    await key('a', { ctrlKey: true }); // wall + text

    const before = plan().texts.t;
    await pointer(grab(svg)!, 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointermove', clientAt(svg, 250, 230));
    await pointer(svg, 'pointerup');

    const after = plan().texts.t;
    expect(after.x).toBe(before.x + 50);
    expect(after.y).toBe(before.y + 30);
    await unmount();
  });
});
