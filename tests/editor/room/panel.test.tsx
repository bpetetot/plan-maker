import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { doorOn, namedRoomPlan, nestedRoomPlan, squareRoomPlan, twoRoomPlan } from '../../helpers';
import { emptyPlan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, pointer } from '../../kit';
import { numberField, panelTitle, rowValue } from '../../panel';

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

  it('counts the walls that bound it', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    expect(rowValue('Walls')).toBe('4');
  });

  // The boundary is the outline and the islands it holes: the count states the
  // room, not what Delete takes (ADR 0015).
  it('counts the island walls it is bound to move with', async () => {
    const { svg } = await setup(nestedRoomPlan());
    await clickAt(svg, 330, 330);
    expect(rowValue('Walls')).toBe('8');
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
    expect(rowValue('Walls')).toBe('4');
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

describe('thickness beyond a single wall', () => {
  // Retyping every boundary wall is a wall action; a Room facet states what
  // the room is. A marquee that reads as the room is bare for the same reason.
  it('is absent from a room, however the room was selected', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    expect(numberField()).toBeNull();
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 450));
    await pointer(svg, 'pointerup');
    expect(numberField()).toBeNull();
  });

  // Two paths to one Selection cannot offer different powers (ADR 0014):
  // neither has this one.
  it('is absent from a marquee that closes no room either', async () => {
    const { svg } = await setup(twoRoomPlan());
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 850, 450));
    await pointer(svg, 'pointerup');
    await expect.element(page.getByText('7 elements')).toBeInTheDocument();
    expect(numberField()).toBeNull();
  });
});
