// CONTEXT.md: Intent. The policy of the whole pointer stream — button, Space,
// Alt, threshold, capture — asserted here without a DOM.
import { describe, expect, it } from 'vitest';
import { IDLE, routePointerCancel, routePointerDown, routePointerMove, routePointerUp } from './pointer';
import type { PointerCtx, PointerInput, PointerTarget } from './pointer';
import type { RoomTextBlock } from '../sheet/rooms';

const input = (over: Partial<PointerInput> = {}): PointerInput => {
  const clientX = over.clientX ?? 0;
  const clientY = over.clientY ?? 0;
  return {
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    clientX,
    clientY,
    at: { x: clientX, y: clientY },
    ...over,
  };
};

const ctx = (over: Partial<PointerCtx> = {}): PointerCtx => ({
  space: false,
  snapEnabled: true,
  placementOpen: false,
  textEditing: false,
  ...over,
});

const SHEET: PointerTarget = { kind: 'sheet' };
const ELEMENT: PointerTarget = { kind: 'element', ref: { type: 'wall', id: 'w1' } };
const HANDLE: PointerTarget = { kind: 'handle', handle: { type: 'point', id: 'p1' } };
const RULER_HANDLE: PointerTarget = { kind: 'handle', handle: { type: 'rulerEnd', id: 'r1', end: 'a' } };
const DIM: PointerTarget = { kind: 'dim', wallId: 'w1' };
const LABEL: PointerTarget = { kind: 'label', block: { x: 0, y: 0 } as RoomTextBlock, label: null };

const down = (target: PointerTarget, over: Partial<PointerInput> = {}, c = ctx()) =>
  routePointerDown(IDLE, input(over), target, c);

// Walks a gesture from the down through the given client positions.
const track = (target: PointerTarget, over: Partial<PointerInput> = {}, c = ctx()) => {
  let [state] = down(target, over, c);
  return {
    get state() {
      return state;
    },
    move(x: number, y: number, moveOver: Partial<PointerInput> = {}) {
      const [next, intent] = routePointerMove(state, input({ clientX: x, clientY: y, ...moveOver }), c);
      state = next;
      return intent;
    },
    up(over2: Partial<PointerInput> = {}) {
      const [next, intent] = routePointerUp(state, input(over2));
      state = next;
      return intent;
    },
    cancel() {
      const [next, intent] = routePointerCancel(state, input());
      state = next;
      return intent;
    },
  };
};

describe('the button and Space policy', () => {
  it('starts a Pan on Space + drag from every target — the sheet, an element, a handle', () => {
    // CONTEXT.md: Pan — "Space + drag" has no exception for what sits under it.
    for (const target of [SHEET, ELEMENT, HANDLE, RULER_HANDLE, DIM, LABEL]) {
      const [state, intent] = down(target, {}, ctx({ space: true }));
      expect(intent).toEqual({ type: 'beginPan', capture: true });
      expect(state.phase).toBe('pan');
    }
  });

  it('starts a Pan on middle-click from every target', () => {
    for (const target of [SHEET, ELEMENT, HANDLE, RULER_HANDLE, DIM, LABEL]) {
      const [, intent] = down(target, { button: 1 });
      expect(intent).toEqual({ type: 'beginPan', capture: true });
    }
  });

  it('ignores a right-button down', () => {
    const [state, intent] = down(SHEET, { button: 2 });
    expect(intent).toEqual({ type: 'none' });
    expect(state).toBe(IDLE);
  });

  it('starts a Marquee on a bare left down on the sheet', () => {
    const [state, intent] = down(SHEET, { clientX: 5, clientY: 6 });
    expect(intent).toEqual({
      type: 'beginMarquee',
      at: { x: 5, y: 6 },
      additive: false,
      capture: true,
    });
    expect(state.phase).toBe('marquee');
  });

  it('makes the Marquee additive under Shift', () => {
    const [, intent] = down(SHEET, { shiftKey: true });
    expect(intent).toMatchObject({ type: 'beginMarquee', additive: true });
  });

  it('grabs an element on a bare left down', () => {
    const [state, intent] = down(ELEMENT, { clientX: 3, clientY: 4 });
    expect(intent).toEqual({
      type: 'beginGrab',
      target: ELEMENT,
      at: { x: 3, y: 4 },
      additive: false,
      capture: true,
    });
    expect(state.phase).toBe('grab');
  });

  it('toggles the selection instead of grabbing on Shift + element', () => {
    const [state, intent] = down(ELEMENT, { shiftKey: true });
    expect(intent).toEqual({ type: 'toggleSelection', ref: { type: 'wall', id: 'w1' } });
    expect(state).toBe(IDLE);
  });

  it('still grabs a non-element target under Shift, carrying the modifier', () => {
    const [, intent] = down(DIM, { shiftKey: true });
    expect(intent).toMatchObject({ type: 'beginGrab', additive: true });
  });
});

describe('a Placement takes the click, second only to the Pan', () => {
  it('turns a left down into a placement click, whatever was under the pointer', () => {
    for (const target of [SHEET, DIM]) {
      const [state, intent] = down(target, { clientX: 7, clientY: 8 }, ctx({ placementOpen: true }));
      expect(intent).toEqual({ type: 'placementClick', at: { x: 7, y: 8 }, free: false });
      expect(state).toBe(IDLE);
    }
  });

  it('yields to Space, which pans over any open placement', () => {
    const [, intent] = down(SHEET, {}, ctx({ placementOpen: true, space: true }));
    expect(intent).toEqual({ type: 'beginPan', capture: true });
  });

  it('resolves free once, off the event: Alt inverts the snap preference (ADR 0007)', () => {
    const free = (altKey: boolean, snapEnabled: boolean) => {
      const [, intent] = down(SHEET, { altKey }, ctx({ placementOpen: true, snapEnabled }));
      return intent.type === 'placementClick' && intent.free;
    };
    expect(free(false, true)).toBe(false);
    expect(free(true, true)).toBe(true);
    expect(free(false, false)).toBe(true);
    expect(free(true, false)).toBe(false);
  });

  it('swallows the sheet click while a text editor is open', () => {
    expect(down(SHEET, {}, ctx({ textEditing: true }))[1]).toEqual({ type: 'none' });
    expect(down(SHEET, {}, ctx({ textEditing: true, placementOpen: true }))[1]).toEqual({
      type: 'none',
    });
  });

  it('still grabs an element while a text editor is open', () => {
    expect(down(ELEMENT, {}, ctx({ textEditing: true }))[1]).toMatchObject({ type: 'beginGrab' });
  });
});

describe('the click threshold — one euclidean predicate', () => {
  it('reads a small wobble as a click, not a drag', () => {
    const g = track(SHEET);
    expect(g.move(2, 2)).toMatchObject({ type: 'aimMarquee' });
    expect(g.up()).toEqual({ type: 'end', kind: 'marquee', moved: false });
  });

  it('reads a diagonal past CLICK_PX of travel as a drag, whatever the axes say', () => {
    // hypot(3, 3) ≈ 4.24 ≥ 4 — a per-axis box would still call this a click.
    const g = track(ELEMENT);
    expect(g.move(3, 3)).toMatchObject({ type: 'aimGrab', moved: true });
  });

  it('sits exactly on the bound along an axis', () => {
    const g = track(ELEMENT);
    expect(g.move(3.9, 0)).toMatchObject({ type: 'aimGrab', moved: false });
    expect(g.move(4, 0)).toMatchObject({ type: 'aimGrab', moved: true });
  });

  it('never un-moves: a drag that returns to its start is still a drag', () => {
    const g = track(SHEET);
    g.move(10, 0);
    g.move(0, 0);
    expect(g.up()).toEqual({ type: 'end', kind: 'marquee', moved: true });
  });

  it('reads a handle as moved from its first aim: a handle has no click to tell from', () => {
    const g = track(HANDLE);
    expect(g.move(1, 0)).toMatchObject({ type: 'aimGrab', moved: true });
  });

  it('resolves free on every aim, off the event', () => {
    const g = track(ELEMENT);
    expect(g.move(10, 0, { altKey: true })).toMatchObject({ type: 'aimGrab', free: true });
    expect(g.move(12, 0)).toMatchObject({ type: 'aimGrab', free: false });
  });
});

describe('the pan stream', () => {
  it('yields the pixel delta since the previous move', () => {
    const g = track(SHEET, { clientX: 100, clientY: 100 }, ctx({ space: true }));
    expect(g.move(105, 107)).toEqual({ type: 'panBy', dxPx: 5, dyPx: 7 });
    expect(g.move(108, 110)).toEqual({ type: 'panBy', dxPx: 3, dyPx: 3 });
    expect(g.up()).toMatchObject({ type: 'end', kind: 'pan' });
  });
});

describe('the idle stream', () => {
  it('hovers on a bare move', () => {
    const [state, intent] = routePointerMove(IDLE, input({ clientX: 9, clientY: 9 }), ctx());
    expect(intent).toEqual({ type: 'hover', at: { x: 9, y: 9 } });
    expect(state).toBe(IDLE);
  });

  it('aims the open placement instead, free resolved off the event', () => {
    const [, intent] = routePointerMove(IDLE, input({ altKey: true }), ctx({ placementOpen: true }));
    expect(intent).toMatchObject({ type: 'aimPlacement', free: true });
  });

  it('ignores an up or a cancel that ends nothing', () => {
    expect(routePointerUp(IDLE, input())[1]).toEqual({ type: 'none' });
    expect(routePointerCancel(IDLE, input())[1]).toEqual({ type: 'none' });
  });
});

describe('one gesture, one pointer', () => {
  it('ignores every event from another pointer while a gesture runs', () => {
    const g = track(ELEMENT);
    expect(g.move(50, 0, { pointerId: 2 })).toEqual({ type: 'none' });
    expect(g.up({ pointerId: 2 })).toEqual({ type: 'none' });
    // The gesture is still live for its own pointer.
    expect(g.move(50, 0)).toMatchObject({ type: 'aimGrab', moved: true });
  });

  it('ignores a second down while a gesture runs', () => {
    const g = track(SHEET);
    const [state, intent] = routePointerDown(g.state, input({ pointerId: 2 }), SHEET, ctx());
    expect(intent).toEqual({ type: 'none' });
    expect(state).toBe(g.state);
  });

  it('ends on up and is idle again: the next move hovers', () => {
    const g = track(ELEMENT);
    g.up();
    expect(routePointerMove(g.state, input(), ctx())[1]).toMatchObject({ type: 'hover' });
  });

  it('drops the gesture on cancel, naming what it was', () => {
    const g = track(ELEMENT);
    g.move(50, 0);
    expect(g.cancel()).toEqual({ type: 'cancel', kind: 'grab' });
    expect(routePointerMove(g.state, input(), ctx())[1]).toMatchObject({ type: 'hover' });
  });
});
