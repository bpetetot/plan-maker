import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Plan, TextNote } from '../../../src/model/types';
import { emptyPlan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, pointer } from '../../kit';

const plan = () => usePlanStore.getState().plan;
const texts = () => Object.values(plan().texts) as TextNote[];

// A lone Text framed on mount; content long enough for a clickable block.
const oneTextPlan = (): Plan => ({
  ...emptyPlan(),
  texts: { t: { id: 't', x: 200, y: 200, content: 'Kitchen', size: 'M' } },
});

// A wall to co-select with the Text for a mixed selection.
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
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup(p: Plan = oneTextPlan()) {
  load(p);
  const { container } = await render(<EditorWithHotkeys />);
  return { svg: container.querySelector('svg')! };
}

const panel = () => document.querySelector('.panel');
const grab = (svg: SVGSVGElement) => svg.querySelector('.text-grab')!;

const selectText = async (svg: SVGSVGElement) => {
  await pointer(grab(svg), 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
  await pointer(svg, 'pointerup');
};

// The three S/M/L preset buttons; the pressed one names the active size.
const sizeButton = (s: string) => page.getByRole('button', { name: s, exact: true });
const activeSize = () => document.querySelector('.panel-sizes .size[aria-pressed="true"]')?.textContent;

const rowValue = (label: string) => {
  const rows = [...document.querySelectorAll('.panel-row')];
  const row = rows.find((r) => r.querySelector('.panel-row-label')?.textContent === label);
  return row?.querySelector('.panel-row-value')?.textContent;
};

describe('tool panel on a selected Text', () => {
  it('titles it Text and shows the S/M/L size control with the live size active', async () => {
    const { svg } = await setup();
    await selectText(svg);
    await expect.element(page.getByText('Text', { exact: true })).toBeInTheDocument();
    await expect.element(sizeButton('S')).toBeInTheDocument();
    await expect.element(sizeButton('M')).toBeInTheDocument();
    await expect.element(sizeButton('L')).toBeInTheDocument();
    expect(activeSize()).toBe('M');
  });

  it('never offers a content field — text is edited inline, not in the panel', async () => {
    const { svg } = await setup();
    await selectText(svg);
    expect(document.querySelector('.panel textarea')).toBeNull();
    expect(document.querySelector('.panel input')).toBeNull();
  });

  it('changes the size via the preset control', async () => {
    const { svg } = await setup();
    await selectText(svg);
    await userEvent.click(sizeButton('L'));
    expect(texts()[0].size).toBe('L');
    expect(activeSize()).toBe('L');
  });

  it('adopts the chosen size as the tool default (sticky, last-used wins)', async () => {
    const { svg } = await setup();
    await selectText(svg);
    await userEvent.click(sizeButton('S'));
    // Clear the selection, then the empty-selection Text tool shows the default.
    await key('Escape');
    expect(panel()).toBeNull();
    await key('6');
    expect(activeSize()).toBe('S');
  });

  it('deletes the Text from the shared Delete button', async () => {
    const { svg } = await setup();
    await selectText(svg);
    await userEvent.click(page.getByLabelText('Delete'));
    expect(texts()).toHaveLength(0);
    expect(panel()).toBeNull();
  });
});

describe('empty-selection Text tool defaults', () => {
  it('shows the S/M/L default the next Text will get, and no Delete', async () => {
    await setup(emptyPlan());
    expect(panel()).toBeNull();
    await key('6');
    await expect.element(page.getByText('Text', { exact: true })).toBeInTheDocument();
    expect(activeSize()).toBe('M');
    await expect.element(page.getByLabelText('Delete')).not.toBeInTheDocument();
  });

  it('changes the default size without touching any Text', async () => {
    await setup(emptyPlan());
    await key('6');
    await userEvent.click(sizeButton('L'));
    expect(activeSize()).toBe('L');
    expect(texts()).toHaveLength(0);
  });
});

describe('tool panel on a mixed selection holding a Text', () => {
  it('shows the element count and omits the Text from Contents', async () => {
    const { svg } = await setup(wallAndTextPlan());
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, 100) });
    await pointer(svg, 'pointermove', clientAt(svg, 600, 500));
    await pointer(svg, 'pointerup');
    await expect.element(page.getByText('2 elements')).toBeInTheDocument();
    expect(rowValue('Walls')).toBe('1');
    // A Text is content, not tallied — no row claims it.
    expect(rowValue('Texts')).toBeUndefined();
  });
});
