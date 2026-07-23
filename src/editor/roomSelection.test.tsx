import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { namedRoomPlan, nestedRoomPlan, squareRoomPlan, twoRoomPlan } from '../model/testHelpers';
import type { Opening } from '../model/types';
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

const clickAt = async (svg: SVGSVGElement, x: number, y: number, init: PointerEventInit = {}) => {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, x, y), ...init });
  await pointer(svg, 'pointerup');
};

const walls = () => Object.values(usePlanStore.getState().plan.walls);
const panel = () => document.querySelector('.panel');

// 90 cm at the middle of a 4 m wall: clear of both ends, on every fixture here.
const doorOn = (wallId: string): Opening => ({
  id: 'o1',
  wallId,
  type: 'door',
  offset: 200,
  width: 90,
  hingeSide: 'start',
  swing: 'in',
});

// Scoped to the panel: a named room prints its name on the sheet too.
const panelTitle = () => document.querySelector('.panel-title')?.textContent;

const fieldValue = () => document.querySelector<HTMLInputElement>('.panel-number-input')!.value;

// A commit happens on blur or Enter, not per keystroke — the helper does both.
async function setField(value: string) {
  await page.getByRole('spinbutton').fill(value);
  await key('Enter');
}

// DOM query, not a locator: label and value are sibling spans, unnavigable.
function rowValue(label: string) {
  const rows = [...document.querySelectorAll('.panel-row')];
  const row = rows.find((r) => r.querySelector('.panel-row-label')?.textContent === label);
  return row?.querySelector('.panel-row-value')?.textContent;
}

describe('clicking a room', () => {
  it('selects its boundary walls', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    await key('Delete');
    expect(walls()).toHaveLength(0);
  });

  it('clears the selection when the click lands outside every room', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    expect(panel()).toBeTruthy();
    await clickAt(svg, 600, 600);
    expect(panel()).toBeNull();
  });

  it('takes the island walls with the room they hole', async () => {
    const { svg } = await setup(nestedRoomPlan());
    await clickAt(svg, 330, 330);
    await key('Delete');
    expect(walls()).toHaveLength(0);
  });

  it('reads the island alone when the click lands inside it', async () => {
    const { svg } = await setup(nestedRoomPlan());
    await clickAt(svg, 175, 150);
    await key('Delete');
    expect(walls()).toHaveLength(4);
  });

  it('adds a second room on Shift+click, never removing', async () => {
    const { svg } = await setup(twoRoomPlan());
    await clickAt(svg, 200, 200);
    await clickAt(svg, 600, 200, { shiftKey: true });
    await key('Delete');
    expect(walls()).toHaveLength(0);
  });

  it('leaves an already selected room selected on Shift+click', async () => {
    const { svg } = await setup(twoRoomPlan());
    await clickAt(svg, 200, 200);
    await clickAt(svg, 200, 200, { shiftKey: true });
    await key('Delete');
    expect(walls()).toHaveLength(3);
  });
});

describe('the tool panel reading a room', () => {
  it('titles itself with the room name and states its area', async () => {
    // 4×3 m axis-to-axis, walls 10 cm: interior faces 3,90 × 2,90 m
    const { svg } = await setup(namedRoomPlan('Kitchen'));
    await clickAt(svg, 200, 150);
    expect(panelTitle()).toBe('Kitchen');
    expect(rowValue('Area')).toBe('11,31 m²');
  });

  it('falls back to Room when the room has no name', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    expect(panelTitle()).toBe('Room');
    expect(rowValue('Area')).toBe('15,21 m²');
  });

  it('states the area a marquee over the same walls reads, however it was made', async () => {
    const { svg } = await setup();
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 450));
    await pointer(svg, 'pointerup');
    expect(panelTitle()).toBe('Room');
    expect(rowValue('Area')).toBe('15,21 m²');
  });

  it('still reads the room when a marquee sweeps up its door', async () => {
    const plan = squareRoomPlan();
    plan.openings.o1 = doorOn(Object.values(plan.walls)[0].id);
    const { svg } = await setup(plan);
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 450));
    await pointer(svg, 'pointerup');
    expect(panelTitle()).toBe('Room');
  });

  it('falls back to the element count once the selection outgrows the room', async () => {
    const { svg } = await setup(twoRoomPlan());
    await clickAt(svg, 200, 200);
    await clickAt(svg, 600, 200, { shiftKey: true });
    await expect.element(page.getByText('7 elements')).toBeInTheDocument();
    expect(rowValue('Area')).toBeUndefined();
  });
});

// A room takes the openings its walls carry (ADR 0014): a click lands on the
// set a marquee already produced.
describe('a room and its openings', () => {
  const roomWithOpenings = (withWindow = true) => {
    const plan = squareRoomPlan();
    const [top, right] = Object.values(plan.walls);
    plan.openings.o1 = doorOn(top.id);
    if (withWindow) {
      plan.openings.o2 = { id: 'o2', wallId: right.id, type: 'window', offset: 200, width: 120 };
    }
    return plan;
  };

  const chips = (svg: SVGSVGElement) => svg.querySelectorAll('text.placement-chip');

  it('gives every opening of the room its placement dimensions', async () => {
    const { svg } = await setup(roomWithOpenings());
    expect(chips(svg)).toHaveLength(0);
    await clickAt(svg, 200, 200);
    // two clearances per opening, none of them nil
    expect(chips(svg)).toHaveLength(4);
  });

  it('counts the doors and the windows it holds', async () => {
    const { svg } = await setup(roomWithOpenings());
    await clickAt(svg, 200, 200);
    expect(rowValue('Doors')).toBe('1');
    expect(rowValue('Windows')).toBe('1');
  });

  it('states a bare room as zero, never as silence', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    expect(rowValue('Doors')).toBe('0');
    expect(rowValue('Windows')).toBe('0');
  });

  it('counts a party wall door for both rooms it separates', async () => {
    const plan = twoRoomPlan();
    plan.openings.o1 = doorOn(Object.values(plan.walls)[1].id);
    const { svg } = await setup(plan);
    await clickAt(svg, 200, 200);
    expect(rowValue('Doors')).toBe('1');
    await clickAt(svg, 600, 200);
    expect(rowValue('Doors')).toBe('1');
  });

  // The Delete button below the count takes every opening of the boundary, so
  // the count states the room, not what happens to be lit.
  it('keeps counting a door a Shift+click put out of the selection', async () => {
    const { svg } = await setup(roomWithOpenings(false));
    await clickAt(svg, 200, 200);
    const grab = svg.querySelector('rect[width="90"][fill="transparent"]')!;
    await pointer(grab, 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 200, 0) });
    await pointer(svg, 'pointerup');
    expect(panelTitle()).toBe('Room');
    expect(rowValue('Doors')).toBe('1');
    expect(chips(svg)).toHaveLength(0);
  });

  it('states nothing about openings once the selection is no longer a room', async () => {
    const { svg } = await setup(roomWithOpenings());
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 450));
    await pointer(svg, 'pointerup');
    expect(rowValue('Doors')).toBe('1');
    await clickAt(svg, 600, 600);
    const wall = svg.querySelectorAll('line[stroke="transparent"]')[0];
    await pointer(wall, 'pointerdown', { button: 0, ...clientAt(svg, 100, 0) });
    await pointer(svg, 'pointerup');
    expect(rowValue('Doors')).toBeUndefined();
  });
});

describe('moving a selected room', () => {
  it('translates the island with it, rigidly', async () => {
    const { svg } = await setup(nestedRoomPlan());
    await clickAt(svg, 330, 330);
    const before = usePlanStore.getState().plan.points;
    // grab the outer bottom wall, which the selection already holds
    const zones = svg.querySelectorAll('line[stroke="transparent"]');
    await pointer(zones[2], 'pointerdown', { button: 0, ...clientAt(svg, 200, 400) });
    await pointer(svg, 'pointermove', clientAt(svg, 250, 450));
    await pointer(svg, 'pointerup');
    const after = usePlanStore.getState().plan.points;
    const moves = Object.keys(before).map(
      (id) => `${after[id].x - before[id].x},${after[id].y - before[id].y}`,
    );
    expect(new Set(moves).size).toBe(1);
    expect(moves[0]).toBe('50,50');
  });

  // The group grab is blind to type: what is highlighted travels together,
  // and an opening of the room is a handle on the room like any wall.
  it('travels whole when the drag starts on one of its doors', async () => {
    const plan = squareRoomPlan();
    plan.openings.o1 = doorOn(Object.values(plan.walls)[0].id);
    const { svg } = await setup(plan);
    await clickAt(svg, 200, 200);
    const before = usePlanStore.getState().plan.points;
    const grab = svg.querySelector('rect[width="90"][fill="transparent"]')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 200, 0) });
    await pointer(svg, 'pointermove', clientAt(svg, 250, 50));
    await pointer(svg, 'pointerup');
    const after = usePlanStore.getState().plan;
    const moves = Object.keys(before).map(
      (id) => `${after.points[id].x - before[id].x},${after.points[id].y - before[id].y}`,
    );
    expect(new Set(moves)).toEqual(new Set(['50,50']));
    expect(after.openings.o1.offset).toBe(200);
  });
});

describe('the room tint', () => {
  const hovered = (svg: SVGSVGElement) => svg.querySelectorAll('.room-fill-hover');
  const tinted = (svg: SVGSVGElement) => svg.querySelectorAll('.room-fill-selected');

  it('follows the pointer over a room and drops outside', async () => {
    const { svg } = await setup();
    await pointer(svg, 'pointermove', clientAt(svg, 200, 200));
    expect(hovered(svg)).toHaveLength(1);
    await pointer(svg, 'pointermove', clientAt(svg, 600, 600));
    expect(hovered(svg)).toHaveLength(0);
  });

  it('marks the selected room, however the selection was made', async () => {
    const { svg } = await setup();
    expect(tinted(svg)).toHaveLength(0);
    await clickAt(svg, 200, 200);
    expect(tinted(svg)).toHaveLength(1);
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 450));
    await pointer(svg, 'pointerup');
    expect(tinted(svg)).toHaveLength(1);
  });

  // The tint promises what a click would take, so anything above the sheet
  // outranks the room.
  it('drops over a wall, where a click would take the wall instead', async () => {
    const { svg } = await setup();
    await pointer(svg, 'pointermove', clientAt(svg, 200, 200));
    expect(hovered(svg)).toHaveLength(1);
    const zone = svg.querySelectorAll('line[stroke="transparent"]')[0];
    await pointer(zone, 'pointermove', clientAt(svg, 200, 0));
    expect(hovered(svg)).toHaveLength(0);
  });

  it('drops over an opening, which a click would take instead', async () => {
    const plan = squareRoomPlan();
    plan.openings.o1 = doorOn(Object.values(plan.walls)[0].id);
    const { svg } = await setup(plan);
    // the grab zone spans the door's 90 cm width
    const zone = svg.querySelector('rect[width="90"]')!;
    await pointer(zone, 'pointermove', clientAt(svg, 200, 0));
    expect(hovered(svg)).toHaveLength(0);
  });

  it('holds over the room text, which a click would take the room by', async () => {
    const { svg } = await setup(namedRoomPlan('Kitchen'));
    await pointer(document.querySelector('.room-name-hit')!, 'pointermove', clientAt(svg, 200, 148));
    expect(hovered(svg)).toHaveLength(1);
  });

  it('stays away while a tool other than Select is active', async () => {
    const { svg } = await setup();
    await key('2');
    await pointer(svg, 'pointermove', clientAt(svg, 200, 200));
    expect(hovered(svg)).toHaveLength(0);
  });

  it('leaves an island bare, its footprint punched out of the room', async () => {
    const { svg } = await setup(nestedRoomPlan());
    await clickAt(svg, 330, 330);
    const fill = tinted(svg)[0];
    expect(fill.getAttribute('fill-rule')).toBe('evenodd');
    // outer loop plus the island loop: two subpaths, so the hole is a hole
    expect(fill.getAttribute('d')!.match(/M/g)).toHaveLength(2);
  });

  it('never reaches the export, which is the plan and nothing else', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    expect(tinted(svg)).toHaveLength(1);
    const { buildExportSvg } = await import('../transfer/png');
    const exported = buildExportSvg(usePlanStore.getState().plan, { measuresVisible: true })!;
    expect(exported).not.toContain('room-fill');
  });
});

// The block is a handle, not an element: the same contract DimLabel already
// has — drag moves it, a click selects what it belongs to.
describe('clicking the room text block', () => {
  const nameHit = () => document.querySelector('.room-name-hit')!;
  const areaHit = () => document.querySelector('.room-area-hit')!;
  const label = () => Object.values(usePlanStore.getState().plan.roomLabels)[0];

  it('selects the room carrying the name', async () => {
    const { svg } = await setup(namedRoomPlan('Kitchen'));
    await pointer(nameHit(), 'pointerdown', { button: 0, ...clientAt(svg, 200, 148) });
    await pointer(svg, 'pointerup');
    expect(panelTitle()).toBe('Kitchen');
  });

  it('selects an unnamed room from its area line', async () => {
    const { svg } = await setup();
    await pointer(areaHit(), 'pointerdown', { button: 0, ...clientAt(svg, 200, 200) });
    await pointer(svg, 'pointerup');
    expect(panelTitle()).toBe('Room');
  });

  it('moves the label without selecting when the block travels', async () => {
    const { svg } = await setup(namedRoomPlan('Kitchen'));
    await pointer(nameHit(), 'pointerdown', { button: 0, ...clientAt(svg, 200, 148) });
    await pointer(svg, 'pointermove', clientAt(svg, 120, 100));
    await pointer(svg, 'pointerup');
    expect(label()).toMatchObject({ x: 120, y: 102, placed: true });
    expect(panel()).toBeNull();
  });
});

describe('thickness across a multi-selection', () => {
  // Retyping every boundary wall is a wall action; a Room facet states what
  // the room is. A marquee that reads as the room is bare for the same reason.
  it('is absent from a room, however the room was selected', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    expect(document.querySelector('.panel-number-input')).toBeNull();
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 450));
    await pointer(svg, 'pointerup');
    expect(document.querySelector('.panel-number-input')).toBeNull();
  });

  it('retypes every wall a marquee took when they close no room', async () => {
    const { svg } = await setup(twoRoomPlan());
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 850, 450));
    await pointer(svg, 'pointerup');
    expect(fieldValue()).toBe('10');
    await setField('16');
    expect(walls().every((w) => w.thickness === 16)).toBe(true);
  });

  it('stays blank while the selected walls disagree, then levels them', async () => {
    const plan = twoRoomPlan();
    Object.values(plan.walls)[0].thickness = 30;
    const { svg } = await setup(plan);
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 850, 450));
    await pointer(svg, 'pointerup');
    expect(fieldValue()).toBe('');
    await setField('12');
    expect(walls().every((w) => w.thickness === 12)).toBe(true);
  });

  it('makes the retyped thickness the wall tool default (sticky)', async () => {
    const { svg } = await setup(twoRoomPlan());
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 850, 450));
    await pointer(svg, 'pointerup');
    await setField('22');
    // Enter blurs the field: the shortcuts below only reach the registry
    // because the typing guard no longer silences them.
    expect(document.activeElement).toBe(document.body);
    await key('Escape');
    await key('2');
    expect(fieldValue()).toBe('22');
  });
});
