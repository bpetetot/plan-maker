import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { doorOn, namedRoomPlan, nestedRoomPlan, squareRoomPlan, twoRoomPlan } from '../../helpers';
import { emptyPlan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { getPreference, reloadPreferences, setPreference } from '../../../src/preferences/preferences';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, pointer } from '../../kit';
import { numberField, panel, panelTitle, rowValue } from '../../panel';

beforeEach(() => {
  localStorage.clear();
  // the preference is session state: clearing storage alone is not a fresh device
  reloadPreferences();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup(plan = squareRoomPlan()) {
  usePlanStore.setState({ plan });
  // after the seeding, or the fixture itself counts as an undo entry
  usePlanStore.temporal.getState().clear();
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

const hatching = () => page.getByRole('switch', { name: 'Hatching' });
const areaSwitch = () => page.getByRole('switch', { name: 'Area' });
const profiles = () => Object.values(usePlanStore.getState().plan.roomProfiles);

describe('the hatching switch', () => {
  it('hatches the selected room and lifts the mark again', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    await expect.element(hatching()).toHaveAttribute('aria-checked', 'false');
    await hatching().click();
    await expect.element(hatching()).toHaveAttribute('aria-checked', 'true');
    // the sheet hatches; the panel, an inspection instrument, keeps the area
    expect(svg.querySelector('path.room-hatched')).not.toBeNull();
    expect(rowValue('Area')).toBe('15,21 m²');
    await hatching().click();
    await expect.element(hatching()).toHaveAttribute('aria-checked', 'false');
    expect(svg.querySelector('path.room-hatched')).toBeNull();
  });

  it('marks the existing profile of a named room, and undo takes one step back', async () => {
    const { svg } = await setup(namedRoomPlan('Kitchen'));
    await clickAt(svg, 200, 150);
    await hatching().click();
    expect(profiles()).toHaveLength(1);
    expect(profiles()[0]).toMatchObject({ name: 'Kitchen', hatched: true, areaSilenced: true });
    usePlanStore.temporal.getState().undo();
    expect(profiles()[0].hatched).toBeUndefined();
    expect(profiles()[0].areaSilenced).toBeUndefined();
  });

  // The coupling is legible instead of hidden: cause and effect in one section.
  it('drops the Area switch in the same gesture, and one undo takes both back', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    await expect.element(areaSwitch()).toHaveAttribute('aria-checked', 'true');
    await hatching().click();
    await expect.element(areaSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(svg.querySelectorAll('text.room-area')).toHaveLength(0);

    usePlanStore.temporal.getState().undo();
    await expect.element(hatching()).toHaveAttribute('aria-checked', 'false');
    await expect.element(areaSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  // ADR 0039: the two marks are independent once the hatching's write has landed.
  it('lets a hatched floor state its area again', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    await hatching().click();
    await areaSwitch().click();
    await expect.element(areaSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(svg.querySelector('path.room-hatched')).not.toBeNull();
    expect(svg.querySelectorAll('text.room-area')).toHaveLength(1);
  });

  it('leaves the area silenced when the hatching is lifted', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    await hatching().click();
    await hatching().click();
    await expect.element(areaSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(profiles()[0]).toMatchObject({ areaSilenced: true });
    expect(profiles()[0].hatched).toBeUndefined();
  });
});

describe('the Area switch', () => {
  it('silences a room area on its own, without hatching the floor', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    await areaSwitch().click();
    await expect.element(areaSwitch()).toHaveAttribute('aria-checked', 'false');
    await expect.element(hatching()).toHaveAttribute('aria-checked', 'false');
    expect(svg.querySelectorAll('text.room-area')).toHaveLength(0);
    expect(svg.querySelector('path.room-hatched')).toBeNull();
    // the panel keeps stating it as a fact of inspection
    expect(rowValue('Area')).toBe('15,21 m²');
  });

  it('keeps showing the room name, so the room is still identified', async () => {
    const { svg } = await setup(namedRoomPlan('Kitchen'));
    await clickAt(svg, 200, 150);
    await areaSwitch().click();
    expect(svg.querySelectorAll('text.room-area')).toHaveLength(0);
    expect(svg.querySelector('text.room-name')?.textContent).toBe('Kitchen');
  });

  // The way back to the switch for a room that now draws no text block at all:
  // its floor still selects it (ADR 0014).
  it('leaves an unnamed room selectable by its floor once it draws nothing', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    await areaSwitch().click();
    expect(svg.querySelectorAll('rect.room-area-hit')).toHaveLength(0);
    expect(svg.querySelectorAll('rect.room-name-hit')).toHaveLength(0);

    await clickAt(svg, 600, 600);
    expect(panel()).toBeNull();
    await clickAt(svg, 200, 200);
    expect(panelTitle()).toBe('Room');
    await expect.element(areaSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('states the area again, deleting the profile it alone justified', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    await areaSwitch().click();
    await areaSwitch().click();
    expect(svg.querySelectorAll('text.room-area')).toHaveLength(1);
    expect(usePlanStore.getState().plan.roomProfiles).toEqual({});
  });

  // Consistent with the panel stating nothing about retyping boundary walls: the
  // Dimensions of a room's walls are a wall matter (CONTEXT.md: Tool panel).
  it('leaves the boundary walls to the wall, offering no Dimension row', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    await expect.element(page.getByRole('switch', { name: 'Dimension' })).not.toBeInTheDocument();
  });

  // A formatting gesture shows its result (ADR 0039): turning a switch down can
  // therefore turn measures on.
  it('turns measures back on and then applies', async () => {
    setPreference('measures', false);
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    expect(svg.querySelectorAll('text.room-area')).toHaveLength(0);
    await areaSwitch().click();
    expect(getPreference('measures')).toBe(true);
    expect(profiles()[0]).toMatchObject({ areaSilenced: true });
    expect(svg.querySelectorAll('text.room-area')).toHaveLength(0);
  });
});
