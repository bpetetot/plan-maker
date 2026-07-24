// Real-pointer regression for the Text placement focus fixup. The other Text
// suites drive placement with a synthetic `pointerdown`, which runs no native
// default action — so the browser's mousedown focus fixup (which blurred the
// just-mounted editor and committed it empty) never fired there. userEvent
// dispatches real events, reproducing what a user's click actually does.
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../model/types';
import type { TextNote } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';

beforeEach(() => {
  localStorage.clear();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

const plan = () => usePlanStore.getState().plan;
const texts = () => Object.values(plan().texts) as TextNote[];
const editor = () => document.querySelector('textarea.text-note-input') as HTMLTextAreaElement | null;
const pressed = (name: string) => page.getByLabelText(name).element().getAttribute('aria-pressed');
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('placing a Text with a real pointer', () => {
  it('a real click opens the editor and keeps it focused, ready to type', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Text'));
    await userEvent.click(svg, { position: { x: 200, y: 200 } } as never);
    await settle();
    // The editor survives the placement mousedown instead of blurring shut.
    expect(editor()).not.toBeNull();
    expect(document.activeElement).toBe(editor());
    // Still the Text tool — the empty-commit-to-Select never fired.
    expect(pressed('Text')).toBe('true');
  });

  it('typing then clicking away still commits — the click-away blur is untouched', async () => {
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Text'));
    await userEvent.click(svg, { position: { x: 200, y: 200 } } as never);
    await settle();
    await userEvent.type(editor()!, 'Kitchen');
    // A second real click on the sheet must blur-commit, not be swallowed.
    await userEvent.click(svg, { position: { x: 40, y: 40 } } as never);
    await settle();
    expect(editor()).toBeNull();
    expect(texts()).toHaveLength(1);
    expect(texts()[0]).toMatchObject({ content: 'Kitchen' });
    expect(pressed('Select')).toBe('true');
  });
});
