// CONTEXT.md: Silenced — the batch path is the keyboard (ADR 0039). The harness
// pins the platform to linux, so Mod arrives as ctrlKey.
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { buildPlan, namedRoomPlan, squareRoomPlan, twoRoomPlan } from '../../helpers';
import { emptyPlan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { getPreference, reloadPreferences, setPreference } from '../../../src/preferences/preferences';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, pointer } from '../../kit';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup(plan = squareRoomPlan()) {
  usePlanStore.setState({ plan });
  // after the seeding, or the fixture itself counts as an undo entry
  usePlanStore.temporal.getState().clear();
  const { container } = await render(<EditorWithHotkeys />);
  return { svg: container.querySelector('svg')! };
}

const plan = () => usePlanStore.getState().plan;
const walls = () => Object.values(plan().walls);
const silencedWalls = () => walls().filter((w) => w.dimSilenced).length;
const profiles = () => Object.values(plan().roomProfiles);
const undoDepth = () => usePlanStore.temporal.getState().pastStates.length;
const dims = (svg: SVGSVGElement) => svg.querySelectorAll('text.dim:not(.dim-live)').length;

// Two free-standing walls, so no Selection of them ever reads as a Room.
const twoWalls = () =>
  buildPlan((b) => {
    b.wall(b.point(0, 0), b.point(400, 0));
    b.wall(b.point(0, 200), b.point(400, 200));
  });

const marquee = async (svg: SVGSVGElement, a: [number, number], b: [number, number]) => {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, a[0], a[1]) });
  await pointer(svg, 'pointermove', clientAt(svg, b[0], b[1]));
  await pointer(svg, 'pointerup');
};

const clickAt = async (svg: SVGSVGElement, x: number, y: number) => {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, x, y) });
  await pointer(svg, 'pointerup');
};

describe('Shift+M on a wall selection', () => {
  it('silences the Dimension of the one selected wall, and states it again', async () => {
    const { svg } = await setup(twoWalls());
    await marquee(svg, [-50, -50], [450, 50]);
    expect(dims(svg)).toBe(2);

    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(1);
    expect(dims(svg)).toBe(1);

    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(0);
    expect(dims(svg)).toBe(2);
  });

  it('takes the whole batch back in one undo', async () => {
    const { svg } = await setup(twoWalls());
    await marquee(svg, [-50, -50], [450, 250]);
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(2);
    expect(undoDepth()).toBe(1);
    usePlanStore.temporal.getState().undo();
    expect(silencedWalls()).toBe(0);
  });

  // The dominant gesture: widening a marquee must finish the batch rather than
  // undo the previous pass (ADR 0039).
  it('finishes the batch when the widened marquee holds walls already silenced', async () => {
    const { svg } = await setup(twoWalls());
    await marquee(svg, [-50, -50], [450, 50]);
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(1);

    await marquee(svg, [-50, -50], [450, 250]);
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(2);
  });

  it('brings them all back when every Measure of the Selection is already silent', async () => {
    const { svg } = await setup(twoWalls());
    await marquee(svg, [-50, -50], [450, 250]);
    await key('M', { shiftKey: true });
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(0);
  });

  it('does nothing with nothing selected: M already means all', async () => {
    await setup(twoWalls());
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(0);
    expect(undoDepth()).toBe(0);
  });
});

describe('Shift+M on a room', () => {
  it('silences its wall Dimensions and its area together', async () => {
    const { svg } = await setup(namedRoomPlan('Kitchen'));
    await clickAt(svg, 200, 150);
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(4);
    expect(profiles()[0]).toMatchObject({ name: 'Kitchen', areaSilenced: true });
    // nothing but the name left on the sheet
    expect(dims(svg)).toBe(0);
    expect(svg.querySelectorAll('text.room-area')).toHaveLength(0);
    expect(svg.querySelectorAll('text.room-name')).toHaveLength(1);
    expect(undoDepth()).toBe(1);
  });

  it('states them all again on a second press', async () => {
    const { svg } = await setup(namedRoomPlan('Kitchen'));
    await clickAt(svg, 200, 150);
    await key('M', { shiftKey: true });
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(0);
    expect(profiles()[0].areaSilenced).toBeUndefined();
    expect(dims(svg)).toBe(4);
  });

  // The way out of a heavily silenced sheet, at the price of two presses: the
  // first pass silences whatever was still stated (ADR 0039).
  it('states every Measure in the plan after Mod+A and two presses', async () => {
    const { svg } = await setup(squareRoomPlan());
    await marquee(svg, [-50, -50], [450, 50]);
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(1);

    await key('a', { ctrlKey: true });
    await key('M', { shiftKey: true });
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(0);
    expect(dims(svg)).toBe(4);
  });

  // Taking everything reads as a Room only on a plan that is one closed Room
  // (CONTEXT.md: Selection), so on two rooms the areas are a per-room matter.
  it('states every Dimension but no area on a plan of several rooms', async () => {
    const seed = twoRoomPlan();
    seed.roomProfiles.l = { id: 'l', name: 'Kitchen', x: 200, y: 200, areaSilenced: true };
    const { svg } = await setup(seed);
    await key('a', { ctrlKey: true });
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(7);
    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(0);
    expect(dims(svg)).toBe(7);
    expect(profiles()[0]).toMatchObject({ areaSilenced: true });
  });
});

describe('Shift+M on a mixed Selection', () => {
  // A Ruler is stored content, deleted rather than muted, and a Text is content
  // the user wrote: neither carries a Measure (CONTEXT.md: Silenced).
  it('silences the walls it holds and leaves the Ruler and the Text alone', async () => {
    const seed = twoWalls();
    seed.rulers.r1 = { id: 'r1', a: { x: 0, y: 100 }, b: { x: 300, y: 100 }, t: 0.5 };
    seed.texts.t1 = { id: 't1', x: 50, y: 150, content: 'Note', size: 'M' };
    const { svg } = await setup(seed);
    await marquee(svg, [-50, -50], [450, 250]);

    await key('M', { shiftKey: true });
    expect(silencedWalls()).toBe(2);
    expect(plan().rulers.r1).toEqual({ id: 'r1', a: { x: 0, y: 100 }, b: { x: 300, y: 100 }, t: 0.5 });
    expect(plan().texts.t1).toMatchObject({ content: 'Note', size: 'M' });
    // the Ruler still states its own value, being no Measure of the plan
    expect(svg.querySelectorAll('text.dim:not(.dim-live)')).toHaveLength(1);
  });
});

// A formatting gesture shows its result, so it never writes into the void
// (ADR 0039). Turning a Measure off can therefore turn measures on.
describe('Shift+M with measures globally hidden', () => {
  it('turns measures back on and then applies', async () => {
    setPreference('measures', false);
    const { svg } = await setup(twoWalls());
    await marquee(svg, [-50, -50], [450, 50]);
    expect(dims(svg)).toBe(0);

    await key('M', { shiftKey: true });
    expect(getPreference('measures')).toBe(true);
    expect(silencedWalls()).toBe(1);
    expect(dims(svg)).toBe(1);
  });
});

describe('a wall whose Dimension is silenced', () => {
  it('offers no drag handle, and stays selectable by its body', async () => {
    const { svg } = await setup(twoWalls());
    await marquee(svg, [-50, -50], [450, 50]);
    expect(svg.querySelectorAll('rect.dim-grab')).toHaveLength(2);
    await key('M', { shiftKey: true });
    expect(svg.querySelectorAll('rect.dim-grab')).toHaveLength(1);

    // its body's grab zone still selects it: the Selection survives a click away
    await clickAt(svg, 600, 600);
    const [body] = svg.querySelectorAll('line[stroke="transparent"]');
    await pointer(body, 'pointerdown', { button: 0, ...clientAt(svg, 200, 0) });
    await pointer(svg, 'pointerup');
    expect(svg.querySelectorAll('text.dim-selected')).toHaveLength(0);
    // the panel names it, which is the only tell a silenced wall gets
    expect(document.querySelector('.panel-title')?.textContent).toBe('Wall');
  });
});
