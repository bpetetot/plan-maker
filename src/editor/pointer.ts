// CONTEXT.md: Intent — what one pointer event means, resolved once (ADR 0030).
// Pure, no DOM: capture is an instruction in the intent, applied by the Editor.
import type { Vec } from '../model/geometry';
import type { ElementRef } from '../model/selection';
import type { RoomLabel } from '../model/types';
import type { RoomTextBlock } from '../sheet/rooms';
import { CLICK_PX } from './gesture';

/** What the browser's hit test found under the down — declared by the JSX
 *  source, never re-derived here: the SVG order stays the one authority. */
export type PointerTarget =
  | { kind: 'sheet' }
  | { kind: 'element'; ref: ElementRef }
  | {
      kind: 'handle';
      handle: { type: 'point'; id: string } | { type: 'rulerEnd'; id: string; end: 'a' | 'b' };
    }
  | { kind: 'dim'; wallId: string }
  | { kind: 'label'; block: RoomTextBlock; label: RoomLabel | null };

export type GrabTarget = Exclude<PointerTarget, { kind: 'sheet' }>;

export interface PointerInput {
  pointerId: number;
  button: number;
  shiftKey: boolean;
  /** Off the live event, never a tracked state (ADR 0007). */
  altKey: boolean;
  clientX: number;
  clientY: number;
  /** The same position in plan coordinates — converted once, by the caller. */
  at: Vec;
}

export interface PointerCtx {
  space: boolean;
  snapEnabled: boolean;
  placementOpen: boolean;
  textEditing: boolean;
}

type DragKind = 'pan' | 'marquee' | 'grab';

export type PointerState =
  | { phase: 'idle' }
  | { phase: 'pan'; pointerId: number; last: { x: number; y: number } }
  | { phase: 'marquee'; pointerId: number; start: { x: number; y: number }; moved: boolean }
  // `handle` marks the targets that have no click to tell a drag from: they
  // read as moved from their first aim.
  | { phase: 'grab'; pointerId: number; start: { x: number; y: number }; moved: boolean; handle: boolean };

export const IDLE: PointerState = { phase: 'idle' };

/** The session's Intent for the pointer stream (CONTEXT.md: Intent) — one of
 *  its shapes, resolved here because only this module holds the policy. */
export type PointerIntent =
  | { type: 'none' }
  | { type: 'beginPan'; capture: true }
  | { type: 'beginMarquee'; at: Vec; additive: boolean; capture: true }
  | { type: 'beginGrab'; target: GrabTarget; at: Vec; additive: boolean; capture: true }
  | { type: 'placementClick'; at: Vec; free: boolean }
  | { type: 'panBy'; dxPx: number; dyPx: number }
  | { type: 'aimMarquee'; at: Vec }
  | { type: 'aimGrab'; at: Vec; free: boolean; locked: boolean; moved: boolean }
  | { type: 'aimPlacement'; at: Vec; free: boolean }
  | { type: 'hover'; at: Vec }
  | { type: 'end'; kind: DragKind; moved: boolean }
  | { type: 'cancel'; kind: DragKind };

const NONE: PointerIntent = { type: 'none' };

// Alt inverts the current snap state for the gesture (ADR 0007). Shift needs no
// such helper, but it is read twice over one gesture and the two never meet:
// additive at the press, the axis lock at every aim after it.
const isFree = (input: PointerInput, ctx: PointerCtx) => !ctx.snapEnabled !== input.altKey;

// The click threshold, owned here and nowhere else: euclidean, in screen px,
// against the down position — a drag never un-moves.
const crossed = (start: { x: number; y: number }, input: PointerInput) =>
  Math.hypot(input.clientX - start.x, input.clientY - start.y) >= CLICK_PX;

export function routePointerDown(
  state: PointerState,
  input: PointerInput,
  target: PointerTarget,
  ctx: PointerCtx,
): [PointerState, PointerIntent] {
  if (state.phase !== 'idle') return [state, NONE];
  const startPx = { x: input.clientX, y: input.clientY };
  // CONTEXT.md: Pan — Space + drag and middle-click + drag, whatever sits
  // under the pointer; a handle is no exception.
  if (ctx.space || input.button === 1) {
    return [
      { phase: 'pan', pointerId: input.pointerId, last: startPx },
      { type: 'beginPan', capture: true },
    ];
  }
  if (input.button !== 0) return [state, NONE];
  // An open text editor swallows the click: it commits on blur, and the sheet
  // must not place anything or start a marquee underneath it.
  if (ctx.placementOpen) {
    if (ctx.textEditing) return [state, NONE];
    return [state, { type: 'placementClick', at: input.at, free: isFree(input, ctx) }];
  }
  if (target.kind === 'sheet') {
    if (ctx.textEditing) return [state, NONE];
    return [
      { phase: 'marquee', pointerId: input.pointerId, start: startPx, moved: false },
      { type: 'beginMarquee', at: input.at, additive: input.shiftKey, capture: true },
    ];
  }
  return [
    {
      phase: 'grab',
      pointerId: input.pointerId,
      start: startPx,
      moved: false,
      handle: target.kind === 'handle',
    },
    { type: 'beginGrab', target, at: input.at, additive: input.shiftKey, capture: true },
  ];
}

export function routePointerMove(
  state: PointerState,
  input: PointerInput,
  ctx: PointerCtx,
): [PointerState, PointerIntent] {
  if (state.phase === 'idle') {
    if (ctx.placementOpen) return [state, { type: 'aimPlacement', at: input.at, free: isFree(input, ctx) }];
    return [state, { type: 'hover', at: input.at }];
  }
  if (input.pointerId !== state.pointerId) return [state, NONE];
  switch (state.phase) {
    case 'pan': {
      const last = { x: input.clientX, y: input.clientY };
      return [
        { ...state, last },
        { type: 'panBy', dxPx: last.x - state.last.x, dyPx: last.y - state.last.y },
      ];
    }
    case 'marquee': {
      const moved = state.moved || crossed(state.start, input);
      return [
        { ...state, moved },
        { type: 'aimMarquee', at: input.at },
      ];
    }
    case 'grab': {
      const moved = state.handle || state.moved || crossed(state.start, input);
      return [
        { ...state, moved },
        { type: 'aimGrab', at: input.at, free: isFree(input, ctx), locked: input.shiftKey, moved },
      ];
    }
  }
}

export function routePointerUp(state: PointerState, input: PointerInput): [PointerState, PointerIntent] {
  if (state.phase === 'idle' || input.pointerId !== state.pointerId) return [state, NONE];
  return [IDLE, { type: 'end', kind: state.phase, moved: 'moved' in state ? state.moved : true }];
}

export function routePointerCancel(state: PointerState, input: PointerInput): [PointerState, PointerIntent] {
  if (state.phase === 'idle' || input.pointerId !== state.pointerId) return [state, NONE];
  return [IDLE, { type: 'cancel', kind: state.phase }];
}
