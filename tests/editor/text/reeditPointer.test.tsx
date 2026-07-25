// Real-pointer regression for re-editing a placed Text by double-click. The
// synthetic dblclick used elsewhere reaches the glyphs directly; a real double
// click's dblclick lands on the svg (the selecting mousedown re-renders the
// grab rect's subtree, so Chromium resolves the click to the common ancestor).
// Re-edit must survive that — see onCanvasDoubleClick's textAtPoint branch.
import { beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../../../src/model/types';
import type { Plan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import Editor from '../../../src/editor/Editor';

beforeEach(() => {
  localStorage.clear();
  usePlanStore.temporal.getState().clear();
});

const oneText = (): Plan => ({
  ...emptyPlan(),
  texts: { t1: { id: 't1', x: 200, y: 200, content: 'Old', size: 'M' } },
});
const editor = () => document.querySelector('textarea.text-note-input') as HTMLTextAreaElement | null;
const plan = () => usePlanStore.getState().plan;

describe('re-editing a placed Text with a real double-click', () => {
  it('reopens the editor with the content, focused, and commits an edit', async () => {
    usePlanStore.setState({ plan: oneText(), planEpoch: 0 });
    usePlanStore.temporal.getState().clear();
    const { container } = await render(<Editor />);
    const grab = container.querySelector('rect.text-grab')!;
    await userEvent.dblClick(grab);
    await new Promise((r) => setTimeout(r, 10));
    expect(editor()).not.toBeNull();
    expect(editor()!.value).toBe('Old');
    expect(document.activeElement).toBe(editor());
    // Same node re-edited, not a second one, and not moved by the two clicks.
    await userEvent.clear(editor()!);
    await userEvent.type(editor()!, 'New');
    editor()!.blur();
    await new Promise((r) => setTimeout(r, 10));
    expect(Object.values(plan().texts)).toHaveLength(1);
    expect(plan().texts.t1).toMatchObject({ content: 'New', x: 200, y: 200 });
  });
});
