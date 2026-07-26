// The hint line, in the static register: what a user cannot infer from the
// result. The axis lock is named on the three stages where it bites (ticket 14).
import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, pointer } from '../../kit';

beforeEach(() => {
  localStorage.clear();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

const lock = () => page.getByText('Shift locks the axis');

async function setup() {
  const { container } = await render(<EditorWithHotkeys />);
  return { svg: container.querySelector('svg')! };
}

describe('the idle hint', () => {
  it('names both readings of Shift: additive at the press, locked at the move', async () => {
    await setup();
    await expect.element(page.getByText('Shift+click adds · Shift+drag locks the axis')).toBeVisible();
  });
});

describe('the drawing hints', () => {
  // The absence of a word has no locator to wait on: the hint is one node, read
  // after an awaited keystroke.
  const hint = () => document.querySelector('.hint')!.textContent;

  it('says nothing of the axis before there is an anchor to lock to', async () => {
    await setup();
    await key('2');
    expect(hint()).not.toContain('Shift');
    await key('5');
    expect(hint()).not.toContain('Shift');
  });

  it('names the lock once the chain has an anchor', async () => {
    const { svg } = await setup();
    await key('2');
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 100, 100) });
    await expect.element(lock()).toBeVisible();
  });

  it('names the lock once a measurement has its A', async () => {
    const { svg } = await setup();
    await key('5');
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 100, 100) });
    await expect.element(lock()).toBeVisible();
  });
});
