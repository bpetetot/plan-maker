import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../../../src/model/types';
import type { Plan, TextNote } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import Editor from '../../../src/editor/Editor';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, mouse, pointer } from '../../kit';
import { setPreference } from '../../../src/preferences/preferences';

beforeEach(() => {
  localStorage.clear();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

const plan = () => usePlanStore.getState().plan;
const texts = () => Object.values(plan().texts) as TextNote[];
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length;
const pressed = (name: string) => page.getByLabelText(name).element().getAttribute('aria-pressed');

// Role, not label: the inline editor carries no accessible name.
const editor = () => document.querySelector('textarea.text-note-input') as HTMLTextAreaElement | null;
const isEditing = () => editor() !== null;

// Commit by clicking away: real focus loss (focusout) is what React's onBlur
// fires on — the testKit `blur` helper is for window-level focus, not this.
const clickAway = async () => {
  editor()?.blur();
  await expect.poll(isEditing).toBe(false);
};

async function setup() {
  const { container } = await render(<Editor />);
  return { container, svg: container.querySelector('svg')! };
}

// The svg pointerdown that places a Text; snap is off by default (free coords).
const placeAt = async (svg: SVGSVGElement, x: number, y: number, init: PointerEventInit = {}) => {
  await userEvent.click(page.getByLabelText('Text'));
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, x, y), ...init });
};

describe('the Text tool', () => {
  it('is offered in the toolbar and activated by clicking its button', async () => {
    await setup();
    await userEvent.click(page.getByLabelText('Text'));
    expect(pressed('Text')).toBe('true');
  });

  it('is picked by pressing 6', async () => {
    const { unmount } = await render(<EditorWithHotkeys />);
    await key('6');
    expect(pressed('Text')).toBe('true');
    await unmount();
  });
});

describe('placing a Text', () => {
  it('a click opens the inline editor; typing then Mod+Enter commits and returns to Select', async () => {
    const { svg } = await setup();
    await placeAt(svg, 200, 200);
    expect(isEditing()).toBe(true);
    await userEvent.type(editor()!, 'Kitchen');
    await key('Enter', { ctrlKey: true });
    expect(isEditing()).toBe(false);
    expect(texts()).toHaveLength(1);
    expect(texts()[0]).toMatchObject({ content: 'Kitchen', size: 'M', x: 200, y: 200 });
    expect(undoDepth()).toBe(1);
    // One-shot: the tool hands back to Select (ADR 0018).
    expect(pressed('Select')).toBe('true');
  });

  it('clicking away commits the text', async () => {
    const { svg } = await setup();
    await placeAt(svg, 200, 200);
    await userEvent.type(editor()!, 'Hall');
    await clickAway();
    expect(isEditing()).toBe(false);
    expect(texts()).toHaveLength(1);
    expect(texts()[0]).toMatchObject({ content: 'Hall' });
  });

  it('committing empty content discards the node, leaving no undo entry', async () => {
    const { svg } = await setup();
    await placeAt(svg, 200, 200);
    await clickAway();
    expect(texts()).toHaveLength(0);
    expect(undoDepth()).toBe(0);
    expect(pressed('Select')).toBe('true');
  });

  it('Escape cancels without placing anything', async () => {
    const { svg } = await setup();
    await placeAt(svg, 200, 200);
    await userEvent.type(editor()!, 'Never');
    await key('Escape');
    expect(isEditing()).toBe(false);
    expect(texts()).toHaveLength(0);
    expect(undoDepth()).toBe(0);
    // The one shot was spent opening the box, so a cancel hands back too
    // (CONTEXT.md: Tool).
    expect(pressed('Select')).toBe('true');
  });

  it('a plain Enter inserts a newline instead of committing; the multi-line content is kept', async () => {
    const { svg } = await setup();
    await placeAt(svg, 200, 200);
    await userEvent.type(editor()!, 'a{Enter}');
    // Still editing: plain Enter is a newline, not a commit.
    expect(isEditing()).toBe(true);
    await userEvent.type(editor()!, 'b');
    await clickAway();
    expect(texts()[0].content).toBe('a\nb');
  });

  it('snaps the placement to the grid once the grid is shown', async () => {
    setPreference('grid', true);
    const { svg } = await setup();
    await placeAt(svg, 137, 143);
    await userEvent.type(editor()!, 'x');
    await clickAway();
    expect(texts()[0]).toMatchObject({ x: 140, y: 140 });
  });

  it('places freely off the grid, which is the default', async () => {
    const { svg } = await setup();
    await placeAt(svg, 137, 143);
    await userEvent.type(editor()!, 'x');
    await clickAway();
    expect(texts()[0]).toMatchObject({ x: 137, y: 143 });
  });
});

// A closed square room fixture is unnecessary — a lone Text renders on the bare
// sheet and is re-editable directly.
const oneText = (content = 'Old', size: TextNote['size'] = 'M'): Plan => ({
  ...emptyPlan(),
  texts: { t1: { id: 't1', x: 200, y: 200, content, size } },
});

describe('re-editing a placed Text', () => {
  it('double-clicking a Text reopens the editor with its content and updates it', async () => {
    usePlanStore.setState({ plan: oneText('Old'), planEpoch: 0 });
    usePlanStore.temporal.getState().clear();
    const { container } = await render(<Editor />);
    const note = container.querySelector('text.text-note')!;
    await mouse(note, 'dblclick', clientAt(container.querySelector('svg')!, 200, 200));
    expect(editor()!.value).toBe('Old');
    await userEvent.clear(editor()!);
    await userEvent.type(editor()!, 'New');
    await clickAway();
    expect(plan().texts.t1.content).toBe('New');
    // Same node, not a second one.
    expect(texts()).toHaveLength(1);
  });

  it('a re-edit that changes nothing writes no undo entry', async () => {
    usePlanStore.setState({ plan: oneText('Old'), planEpoch: 0 });
    usePlanStore.temporal.getState().clear();
    const { container } = await render(<Editor />);
    const note = container.querySelector('text.text-note')!;
    await mouse(note, 'dblclick', clientAt(container.querySelector('svg')!, 200, 200));
    await clickAway();
    expect(plan().texts.t1.content).toBe('Old');
    expect(undoDepth()).toBe(0);
  });

  it('emptying an existing Text then committing deletes it', async () => {
    usePlanStore.setState({ plan: oneText('Old'), planEpoch: 0 });
    usePlanStore.temporal.getState().clear();
    const { container } = await render(<Editor />);
    const note = container.querySelector('text.text-note')!;
    await mouse(note, 'dblclick', clientAt(container.querySelector('svg')!, 200, 200));
    await userEvent.clear(editor()!);
    await clickAway();
    expect(texts()).toHaveLength(0);
  });
});
