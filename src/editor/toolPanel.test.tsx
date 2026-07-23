import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { buildPlan, squareRoomPlan } from '../model/testHelpers';
import { emptyPlan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import { EditorWithHotkeys } from './testHarness';
import { clientAt, key, pointer } from './testKit';

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup(plan = squareRoomPlan()) {
  usePlanStore.setState({ plan });
  const { container } = await render(<EditorWithHotkeys />);
  const svg = container.querySelector('svg')!;
  return { svg };
}

async function marqueeSelect(svg: SVGSVGElement, a: { x: number; y: number }, b: { x: number; y: number }) {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, a.x, a.y) });
  await pointer(svg, 'pointermove', clientAt(svg, b.x, b.y));
  await pointer(svg, 'pointerup');
}

const panel = () => document.querySelector('.panel');

// DOM query, not a locator: label and value are sibling spans, unnavigable.
function rowValue(label: string) {
  const rows = [...document.querySelectorAll('.panel-row')];
  const row = rows.find((r) => r.querySelector('.panel-row-label')?.textContent === label);
  return row?.querySelector('.panel-row-value')?.textContent;
}

// At most one number field: wall thickness or opening width, never both.
const field = () => page.getByRole('spinbutton');
const fieldValue = () => document.querySelector<HTMLInputElement>('.panel-number-input')!.value;

// A commit happens on blur or Enter, not per keystroke — the helper does both.
async function setField(value: string) {
  await field().fill(value);
  await key('Enter');
}

const standalonePlan = () =>
  buildPlan((b) => {
    b.wall(b.point(0, 0), b.point(400, 0));
  });

const doorPlan = () =>
  buildPlan((b) => {
    const wall = b.wall(b.point(100, 100), b.point(500, 100));
    b.opening(wall, 'door', 200);
  });

describe('tool panel on a selected wall', () => {
  it('shows Interior, Exterior and Thickness for a wall bordering one room', async () => {
    const { svg } = await setup();
    // bottom wall of the 4×4 m square only
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 });
    expect(panel()).toBeTruthy();
    await expect.element(page.getByText('Wall', { exact: true })).toBeInTheDocument();
    expect(rowValue('Interior')).toBe('3,90 m');
    expect(rowValue('Exterior')).toBe('4,10 m');
    expect(fieldValue()).toBe('10');
  });

  it('shows a single hors-tout Length when no orientation is claimed', async () => {
    const { svg } = await setup(standalonePlan());
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 });
    expect(rowValue('Length')).toBe('4,10 m');
    expect(fieldValue()).toBe('10');
    expect(rowValue('Interior')).toBeUndefined();
    expect(rowValue('Exterior')).toBeUndefined();
  });

  it('updates live while a wall point moves', async () => {
    const { svg } = await setup(standalonePlan());
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 });
    expect(rowValue('Length')).toBe('4,10 m');
    const handles = svg.querySelectorAll('circle');
    await pointer(handles[handles.length - 1], 'pointerdown', { button: 0, ...clientAt(svg, 400, 0) });
    await pointer(svg, 'pointermove', clientAt(svg, 500, 0));
    expect(rowValue('Length')).toBe('5,10 m');
    await pointer(svg, 'pointerup');
  });
});

describe('tool panel on selected openings', () => {
  it('shows Width, Hinge/Swing options and Delete for a door', async () => {
    const { svg } = await setup(doorPlan());
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 });
    await expect.element(page.getByText('Door', { exact: true })).toBeInTheDocument();
    expect(fieldValue()).toBe('90');
    await expect.element(page.getByText('Hinge')).toBeInTheDocument();
    await expect.element(page.getByText('Swing')).toBeInTheDocument();
    await setField('80');
    expect(Object.values(usePlanStore.getState().plan.openings)[0].width).toBe(80);
  });

  it('shows Width but no options for a window, and Delete removes it', async () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(100, 100), b.point(500, 100));
      b.opening(wall, 'window', 200);
    });
    const { svg } = await setup(plan);
    await marqueeSelect(svg, { x: 230, y: 60 }, { x: 370, y: 140 });
    await expect.element(page.getByText('Window', { exact: true })).toBeInTheDocument();
    expect(document.querySelector('.panel-number-input')).toBeTruthy();
    await expect.element(page.getByText('Hinge')).not.toBeInTheDocument();
    await userEvent.click(page.getByLabelText('Delete'));
    expect(Object.values(usePlanStore.getState().plan.openings)).toHaveLength(0);
    expect(panel()).toBeNull();
  });

  // A count belongs to a selection of several: one element has its title.
  it('states no count of its own', async () => {
    const { svg } = await setup(doorPlan());
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 });
    expect(rowValue('Doors')).toBeUndefined();
    expect(rowValue('Walls')).toBeUndefined();
  });
});

describe('tool defaults facet', () => {
  it('shows the active tool defaults on an empty selection, nothing in Select', async () => {
    await setup();
    expect(panel()).toBeNull();
    await key('2');
    expect(panel()).toBeTruthy();
    await expect.element(page.getByText('Wall', { exact: true })).toBeInTheDocument();
    expect(fieldValue()).toBe('10');
    await expect.element(page.getByLabelText('Delete')).not.toBeInTheDocument();
    await key('3');
    await expect.element(page.getByText('Door', { exact: true })).toBeInTheDocument();
    expect(fieldValue()).toBe('90');
    await expect.element(page.getByText('Hinge')).toBeInTheDocument();
    await key('4');
    await expect.element(page.getByText('Window', { exact: true })).toBeInTheDocument();
    expect(fieldValue()).toBe('120');
    await expect.element(page.getByText('Hinge')).not.toBeInTheDocument();
    await key('1');
    expect(panel()).toBeNull();
  });

  it('draws walls with the preconfigured thickness', async () => {
    const { svg } = await setup(emptyPlan());
    await key('2');
    await setField('20');
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 0, 0) });
    await pointer(svg, 'pointerup');
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 0) });
    await pointer(svg, 'pointerup');
    const walls = Object.values(usePlanStore.getState().plan.walls);
    expect(walls).toHaveLength(1);
    expect(walls[0].thickness).toBe(20);
  });

  it('places doors with the preconfigured width, hinge and swing', async () => {
    const { svg } = await setup(standalonePlan());
    await key('3');
    await setField('80');
    await userEvent.click(page.getByText('Hinge'));
    await userEvent.click(page.getByText('Swing'));
    await pointer(svg, 'pointermove', clientAt(svg, 200, 0));
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 200, 0) });
    await pointer(svg, 'pointerup');
    const door = Object.values(usePlanStore.getState().plan.openings)[0];
    expect(door).toMatchObject({ type: 'door', width: 80, hingeSide: 'end', swing: 'out' });
  });

  it('adopts the width of an edited selected opening as the tool default (sticky)', async () => {
    const { svg } = await setup(doorPlan());
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 });
    await setField('100');
    await key('3');
    expect(fieldValue()).toBe('100');
  });

  it('edits a selected wall thickness and makes it the tool default (sticky)', async () => {
    const { svg } = await setup(standalonePlan());
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 });
    await setField('25');
    const wall = Object.values(usePlanStore.getState().plan.walls)[0];
    expect(wall.thickness).toBe(25);
    // hors-tout follows the new thickness
    expect(rowValue('Length')).toBe('4,25 m');
    await key('2');
    expect(fieldValue()).toBe('25');
  });
});

describe('the dimension number field', () => {
  const wallThickness = () => Object.values(usePlanStore.getState().plan.walls)[0].thickness;
  const openingWidth = () => Object.values(usePlanStore.getState().plan.openings)[0].width;

  async function selectStandaloneWall() {
    const { svg } = await setup(standalonePlan());
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 });
    return svg;
  }

  it('commits on blur, not per keystroke', async () => {
    const { svg } = await setup(doorPlan());
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 });
    await field().fill('75');
    expect(openingWidth()).toBe(90); // untouched until the field is committed
    await userEvent.tab(); // focus leaves the field, no Enter
    expect(openingWidth()).toBe(75);
  });

  it('reverts the draft and the plan on Escape', async () => {
    await selectStandaloneWall();
    await field().fill('55');
    await key('Escape');
    expect(fieldValue()).toBe('10');
    expect(wallThickness()).toBe(10);
  });

  it('reverts an emptied field to the live value', async () => {
    await selectStandaloneWall();
    await field().fill('');
    await key('Enter');
    expect(fieldValue()).toBe('10');
    expect(wallThickness()).toBe(10);
  });

  it('rounds a decimal entry to the nearest centimetre', async () => {
    await selectStandaloneWall();
    await setField('12.4');
    expect(wallThickness()).toBe(12);
  });

  it('clamps a below-minimum entry up to 1', async () => {
    await selectStandaloneWall();
    await setField('0');
    expect(wallThickness()).toBe(1);
  });

  it('clamps a wall thickness above the maximum down to it', async () => {
    await selectStandaloneWall();
    await setField('500');
    expect(wallThickness()).toBe(100);
  });

  it('reverts an opening width that will not fit the wall', async () => {
    const { svg } = await setup(doorPlan());
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 });
    await setField('9000');
    expect(fieldValue()).toBe('90');
    expect(openingWidth()).toBe(90);
    // the rejected width must not leak into the sticky tool default either
    await key('Escape');
    await key('3');
    expect(fieldValue()).toBe('90');
  });
});

describe('tool panel visibility', () => {
  it('is hidden on an empty selection and after Escape clears it', async () => {
    const { svg } = await setup();
    expect(panel()).toBeNull();
    await marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 50 });
    expect(panel()).toBeTruthy();
    await key('Escape');
    expect(panel()).toBeNull();
  });

  it('never steals focus when a selection is made', async () => {
    const { svg } = await setup(doorPlan());
    await marqueeSelect(svg, { x: 240, y: 60 }, { x: 360, y: 140 });
    expect(panel()).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('tool panel on a multi-selection', () => {
  // Two parallel walls: closing a loop would make the selection read as a room.
  const twoWallPlan = () =>
    buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
      b.wall(b.point(0, 200), b.point(400, 200));
    });

  // A door and a window on the same wall: every row has something to count.
  const mixedPlan = () =>
    buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.wall(b.point(0, 200), b.point(400, 200));
      b.opening(wall, 'door', 100);
      b.opening(wall, 'window', 300);
    });

  const marqueeAll = (svg: SVGSVGElement) => marqueeSelect(svg, { x: -50, y: -50 }, { x: 450, y: 450 });

  it('shows the element count and Delete removes everything', async () => {
    const { svg } = await setup(twoWallPlan());
    await marqueeAll(svg);
    await expect.element(page.getByText('2 elements')).toBeInTheDocument();
    await userEvent.click(page.getByLabelText('Delete'));
    expect(Object.values(usePlanStore.getState().plan.walls)).toHaveLength(0);
    expect(panel()).toBeNull();
  });

  it('counts the walls, doors and windows it holds', async () => {
    const { svg } = await setup(mixedPlan());
    await marqueeAll(svg);
    expect(rowValue('Walls')).toBe('2');
    expect(rowValue('Doors')).toBe('1');
    expect(rowValue('Windows')).toBe('1');
  });

  // A heap enumerates what it holds, where a room inventories its boundary.
  it('omits a row it has nothing to count for', async () => {
    const { svg } = await setup(twoWallPlan());
    await marqueeAll(svg);
    expect(rowValue('Walls')).toBe('2');
    expect(rowValue('Doors')).toBeUndefined();
    expect(rowValue('Windows')).toBeUndefined();
  });

  it('follows what is lit when a Shift+click puts the door out', async () => {
    const { svg } = await setup(mixedPlan());
    await marqueeAll(svg);
    const door = svg.querySelector('rect[width="90"][fill="transparent"]')!;
    await pointer(door, 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 100, 0) });
    await pointer(svg, 'pointerup');
    expect(rowValue('Doors')).toBeUndefined();
    expect(rowValue('Windows')).toBe('1');
  });

  // Retyping walls is a wall action: no Selection retypes several at once.
  it('offers no thickness field', async () => {
    const { svg } = await setup(mixedPlan());
    await marqueeAll(svg);
    expect(document.querySelector('.panel-number-input')).toBeNull();
  });
});
