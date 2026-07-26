// CONTEXT.md: Session, and the pure transitions between two of them (ADR 0033).
// No React, no DOM, no store: every write is declared, never performed.
import type { Vec } from '../model/geometry';
import { projectOnWall } from '../model/geometry';
import { wallDimension } from '../model/dimension';
import { openingPlacement } from '../model/openings';
import { DIM_FONT_PX } from '../model/rail';
import { detectRooms, roomAt, roomKey } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import {
  allElements,
  deleteSelection,
  elementsInRect,
  isSelected,
  referencePoint,
  selectionForRoom,
  toggleRef,
} from '../model/selection';
import type { Plan, RoomLabel } from '../model/types';
import type { RoomTextBlock } from '../sheet/rooms';
import { roomTextBlocks } from '../sheet/rooms';
import { textAtPoint } from '../sheet/texts';
import type { InlineEdit } from './inlineEdit';
import { commitInlineEdit, openRoomLabel, openText, placeText } from './inlineEdit';
import type { Placement, PlacementResult } from './placement';
import { aimPlacement, beginPlacement, cancelPlacement, clickPlacement, finishPlacement } from './placement';
import type { PlanDrag, PlanDragSpec } from './planDrag';
import { aimPlanDrag, beginPlanDrag, commitPlanDrag } from './planDrag';
import type { GrabTarget, PointerInput, PointerIntent, PointerState, PointerTarget } from './pointer';
import { IDLE, routePointerCancel, routePointerDown, routePointerMove, routePointerUp } from './pointer';
import type { Tool, ToolDefaults } from './tools';
import { initialToolDefaults } from './tools';

// What the hit test found: one at a time, since a grab zone above the sheet
// takes the room's place rather than sitting beside it.
type Hover = { kind: 'wall' | 'ruler' | 'room'; id: string };

// What the live drag holds; when it begins, aims and ends is the router's call
// (ADR 0030). A Pan holds nothing: the router carries its deltas.
type Drag =
  | { kind: 'marquee'; additive: boolean; prev: ElementRef[]; a: Vec; b: Vec }
  // CONTEXT.md: Plan drag. Its whole composition — snap, grab point, settle,
  // selection — lives in planDrag.ts (ADR 0023). `click` stays out of it: the
  // Selection is editor state, so its policy is not the drag's.
  | { kind: 'plan'; g: PlanDrag; click: Click | null };

// The marquee's pair, on the element a grab pressed: the answer is known at
// pointer-down, and spent only if the drag turns out to have been a click.
type Click = { ref: ElementRef; additive: boolean; prev: ElementRef[] };

export interface Session {
  tool: Tool;
  /** CONTEXT.md: Placement (ADR 0025). Null under Select, which poses nothing. */
  placement: Placement | null;
  selection: ElementRef[];
  defaults: ToolDefaults;
  hover: Hover | null;
  drag: Drag | null;
  pointer: PointerState;
  inlineEdit: InlineEdit | null;
}

// Shared like IDLE is: a session is only ever replaced, never mutated.
export const initialSession: Session = {
  tool: 'select',
  placement: null,
  selection: [],
  defaults: initialToolDefaults(),
  hover: null,
  drag: null,
  pointer: IDLE,
  inlineEdit: null,
};

/** Everything a transition reads of the world outside the Session: the plan it
 *  acts on, the camera scale, the two Preferences a gesture consults. */
export interface SessionEnv {
  plan: Plan;
  pxPerCm: number;
  space: boolean;
  snapEnabled: boolean;
  measuresVisible: boolean;
}

/** How a plan write reaches the store (ADR 0028). `open` carries no plan: it
 *  takes the pre-drag snapshot, which is what makes a bare click free. */
export type PlanWrite = { how: 'open' } | { how: 'aim' | 'land' | 'commit'; plan: Plan };

/** What one transition asks of the outside world, declared so the reducer stays
 *  pure — the caller applies these, in the handler, synchronously. */
interface SessionResult {
  session: Session;
  edit?: PlanWrite;
  capture?: true;
  /** A pointerdown whose compatibility mouse events must not fire. */
  preventDefault?: true;
  /** ticket 03: a Ruler is measured, so drawing one reveals the measures. */
  showMeasures?: true;
  panBy?: { dxPx: number; dyPx: number };
}

/** CONTEXT.md: Intent — what one event means to the editor. The pointer stream
 *  resolves its own (ADR 0030); the rest name themselves. */
export type Intent =
  | { type: 'pointerDown'; input: PointerInput; target: PointerTarget }
  // `onSheet`: the hit test says the sheet itself is under the pointer, not
  // chrome above it. Declared by the source, never re-derived (ADR 0030).
  | { type: 'pointerMove'; input: PointerInput; onSheet: boolean }
  | { type: 'pointerUp'; input: PointerInput }
  | { type: 'pointerCancel'; input: PointerInput }
  | { type: 'selectTool'; tool: Tool }
  | { type: 'cancel' }
  | { type: 'selectAll' }
  | { type: 'deleteSelection' }
  | { type: 'setDefaults'; update: (defaults: ToolDefaults) => ToolDefaults }
  | { type: 'hoverElement'; kind: 'wall' | 'ruler'; id: string }
  | { type: 'leaveElement'; kind: 'wall' | 'ruler'; id: string }
  | { type: 'leaveSheet' }
  | { type: 'contextMenu' }
  | { type: 'doubleClick'; at: Vec }
  | { type: 'editText'; id: string }
  | { type: 'editRoomLabel'; block: RoomTextBlock; label: RoomLabel | null }
  | { type: 'closeInlineEdit'; value: string | null };

// A transition that declares nothing: the session alone.
const just = (session: Session): SessionResult => ({ session });

const placementEnv = (s: Session, env: SessionEnv, free: boolean) => ({
  pxPerCm: env.pxPerCm,
  free,
  defaults: s.defaults,
});

// The room tint is the pointermove's business and the grab zones' hover is
// theirs: a gesture that drops the room hover must not drop a wall's.
const withoutRoomHover = (s: Session): Session => (s.hover?.kind === 'room' ? { ...s, hover: null } : s);

// A Selection only exists under Select, and a Text box belongs to the tool that
// opened it — a Room label box outlives a tool change (CONTEXT.md: Tool).
function withTool(s: Session, next: Tool): SessionResult {
  const session: Session = {
    ...s,
    tool: next,
    placement: next === 'select' ? null : beginPlacement(next),
    inlineEdit: s.inlineEdit?.kind === 'text' ? null : s.inlineEdit,
    selection: next === 'select' ? s.selection : [],
  };
  return next === 'ruler' ? { session, showMeasures: true } : { session };
}

// Everything a placement can ask of the session, in one place. A completion
// names the Tool it hands back to, which reseeds the placement itself.
function withPlacementResult(s: Session, r: PlacementResult): SessionResult {
  const base = r.tool ? withTool(s, r.tool) : just({ ...s, placement: r.placement });
  let session = base.session;
  if (r.selection) session = { ...session, selection: r.selection };
  if (r.editor) session = { ...session, inlineEdit: placeText(r.editor) };
  return {
    ...base,
    session,
    ...(r.plan ? { edit: { how: 'commit', plan: r.plan } as const } : {}),
    // The box just mounted with autoFocus; the fixup on this down's
    // compatibility mousedown would blur it shut.
    ...(r.editor ? { preventDefault: true as const } : {}),
  };
}

// What a grab moves: the union under Shift, the whole multi-selection a member
// was grabbed in, else the element alone — and that becomes the Selection.
function grabRefs(selection: ElementRef[], ref: ElementRef, additive: boolean): ElementRef[] {
  if (additive) return isSelected(selection, ref) ? selection : [...selection, ref];
  return selection.length > 1 && isSelected(selection, ref) ? selection : [ref];
}

// A grabbed member of a multi-selection drags the group; anything else alone,
// and a lone grab becomes the Selection.
function grabbed(
  s: Session,
  env: SessionEnv,
  target: GrabTarget,
  c: Vec,
  additive: boolean,
): { spec: PlanDragSpec; selection?: ElementRef[] } | null {
  const plan = env.plan;
  switch (target.kind) {
    case 'element': {
      const ref = target.ref;
      // The union decides the branch, exactly as the selection's size does
      // without Shift — so a lone opening still slides on its Rail (ticket 04).
      const selection = grabRefs(s.selection, ref, additive);
      if (selection.length === 1 && ref.type === 'opening') {
        const opening = plan.openings[ref.id];
        return {
          selection,
          spec: {
            kind: 'opening',
            id: ref.id,
            // Drawn, not stored: on a shrunk wall the glyph sits on its Rail
            // while the offset still holds the wish.
            grabDelta:
              (openingPlacement(plan, opening)?.offset ?? opening.offset) -
              projectOnWall(plan, plan.walls[opening.wallId], c.x, c.y).t,
          },
        };
      }
      // A single ref-shaped element dragged alone is a group of one: same rigid
      // translation, same grid realignment.
      return {
        selection,
        spec: {
          kind: 'group',
          refs: selection,
          origin: c,
          refPoint: referencePoint(plan, selection, c),
        },
      };
    }
    case 'handle': {
      const h = target.handle;
      // The origin is the element's own position at the grab, which `grabDelta`
      // makes the same value as the aim at pointer-down (ticket 03).
      if (h.type === 'point') {
        const p = plan.points[h.id];
        const grabDelta = p && { x: p.x - c.x, y: p.y - c.y };
        return p ? { spec: { kind: 'point', id: p.id, grabDelta, origin: { x: p.x, y: p.y } } } : null;
      }
      const p = plan.rulers[h.id]?.[h.end];
      const grabDelta = p && { x: p.x - c.x, y: p.y - c.y };
      return p
        ? { spec: { kind: 'rulerEnd', id: h.id, end: h.end, grabDelta, origin: { x: p.x, y: p.y } } }
        : null;
    }
    case 'dim': {
      const wall = plan.walls[target.wallId];
      if (!wall) return null;
      // The drawn position, not the stored wish: a wall shortened since the last
      // drag rails the plate elsewhere, and the grab must start there.
      const dim = wallDimension(plan, wall, DIM_FONT_PX);
      if (!dim) return null;
      return {
        spec: { kind: 'dim', id: wall.id, grabDelta: dim.plateAt - projectOnWall(plan, wall, c.x, c.y).t },
      };
    }
    case 'label': {
      const { block, label } = target;
      const grabDelta = { x: block.x - c.x, y: block.y - c.y };
      // The block's own position, drawn: a label that is not placed sits on the
      // room anchor, which the plan does not hold for it.
      const origin = { x: block.x, y: block.y };
      const prev = s.selection;
      if (label) {
        return {
          spec: { kind: 'label', id: label.id, room: block.room ?? null, grabDelta, origin, additive, prev },
        };
      }
      return block.room
        ? { spec: { kind: 'newLabel', room: block.room, grabDelta, origin, additive, prev } }
        : null;
    }
  }
}

// What the resolved pointer intent does to the session, the router's next phase
// already decided (ADR 0030).
function applyPointer(
  s: Session,
  env: SessionEnv,
  phase: PointerState,
  intent: PointerIntent,
  // What the hit test found, for the one intent that asks: `hover`.
  onSheet = false,
): SessionResult {
  // Same phase object back means nothing moved in the machine: keep the very
  // session we were handed, or every idle pointermove costs a render.
  const base = phase === s.pointer ? s : { ...s, pointer: phase };
  switch (intent.type) {
    case 'none':
      return just(base);
    case 'beginPan':
      return { session: base, capture: true };
    case 'beginMarquee':
      return {
        session: {
          ...withoutRoomHover(base),
          drag: {
            kind: 'marquee',
            additive: intent.additive,
            prev: base.selection,
            a: intent.at,
            b: intent.at,
          },
        },
        capture: true,
      };
    case 'beginGrab': {
      const got = grabbed(base, env, intent.target, intent.at, intent.additive);
      // A target with nothing to edit starts no gesture: the session we were
      // handed is already the idle one, down to the phase.
      if (!got) return just(s);
      const selection = got.selection ?? base.selection;
      const target = intent.target;
      return {
        // Or the tint flashes back onto the pre-drag room at pointer-up, and
        // stays there until the next pointermove.
        session: {
          ...withoutRoomHover(base),
          selection,
          drag: {
            kind: 'plan',
            g: beginPlanDrag(env.plan, got.spec),
            click:
              target.kind === 'element'
                ? { ref: target.ref, additive: intent.additive, prev: base.selection }
                : null,
          },
        },
        // A Plan drag always opens an Edit — there is no variant that does not,
        // and the handle ends with the drag (ADR 0028).
        edit: { how: 'open' },
        capture: true,
      };
    }
    case 'placementClick': {
      if (!base.placement) return just(base);
      const posing = placementEnv(base, env, intent.free);
      return withPlacementResult(base, clickPlacement(base.placement, env.plan, intent.at, posing));
    }
    case 'panBy':
      return { session: base, panBy: { dxPx: intent.dxPx, dyPx: intent.dyPx } };
    case 'aimMarquee': {
      const g = base.drag;
      if (g?.kind !== 'marquee') return just(base);
      return just({ ...base, drag: { ...g, b: intent.at } });
    }
    case 'aimGrab': {
      const g = base.drag;
      if (g?.kind !== 'plan') return just(base);
      const next = aimPlanDrag(g.g, intent.at, {
        pxPerCm: env.pxPerCm,
        free: intent.free,
        locked: intent.locked,
        moved: intent.moved,
      });
      return {
        session: { ...base, drag: { ...g, g: next } },
        edit: { how: 'aim', plan: next.plan },
      };
    }
    case 'aimPlacement': {
      if (!base.placement) return just(base);
      const next = aimPlacement(base.placement, env.plan, intent.at, placementEnv(base, env, intent.free));
      // The same value back bails React out: aiming at nothing must not render.
      return just(next === base.placement ? base : { ...base, placement: next });
    }
    case 'hover': {
      const room = onSheet ? roomAt(detectRooms(env.plan), intent.at.x, intent.at.y) : null;
      if (!room) return just(withoutRoomHover(base));
      const id = roomKey(room);
      // Same value bails React out: tracking costs a render only on a change.
      if (base.hover?.kind === 'room' && base.hover.id === id) return just(base);
      return just({ ...base, hover: { kind: 'room', id } });
    }
    case 'end': {
      const g = base.drag;
      const dropped = { ...base, drag: null };
      if (g?.kind === 'marquee') {
        if (intent.moved) {
          const captured = elementsInRect(env.plan, g.a, g.b, env.measuresVisible);
          const selection = g.additive
            ? [...g.prev, ...captured.filter((r) => !isSelected(g.prev, r))]
            : captured;
          return just({ ...dropped, selection });
        }
        const room = roomAt(detectRooms(env.plan), g.a.x, g.a.y);
        return just({ ...dropped, selection: selectionForRoom(env.plan, room, g.additive, g.prev) });
      }
      if (g?.kind === 'plan') {
        // Settle included (CONTEXT.md: Settle) — inside the same Edit.
        const landed = commitPlanDrag(g.g);
        // A drag that never crossed the threshold was a click, and under Shift
        // a click toggles: what the press deferred, the levée spends.
        const clicked =
          !intent.moved && g.click
            ? g.click.additive
              ? toggleRef(g.click.prev, g.click.ref)
              : [g.click.ref]
            : null;
        return {
          session: { ...dropped, selection: clicked ?? landed.selection ?? dropped.selection },
          edit: { how: 'land', plan: landed.plan },
        };
      }
      return just(dropped);
    }
    case 'cancel': {
      // The browser took the pointer — a scroll gesture, a palm, a rotation.
      // The drag never lands: it drops what it holds (ADR 0018).
      const g = base.drag;
      const dropped = { ...base, drag: null };
      // Landing on the pre-drag plan closes the Edit and records nothing: it is
      // the snapshot the Edit opened on.
      return g?.kind === 'plan' ? { session: dropped, edit: { how: 'land', plan: g.g.orig } } : just(dropped);
    }
  }
}

const pointerCtx = (s: Session, env: SessionEnv) => ({
  space: env.space,
  snapEnabled: env.snapEnabled,
  placementOpen: s.placement !== null,
  // Only a Text box swallows the click: a Room label box coexists with a
  // marquee, which its own blur-commit does not disturb.
  textEditing: s.inlineEdit?.kind === 'text',
});

// A Text is content on top of any room, so a double-click re-edits it before
// naming the room underneath.
function doubleClicked(s: Session, env: SessionEnv, at: Vec): SessionResult {
  if (s.placement) return withPlacementResult(s, finishPlacement(s.placement, env.plan));
  if (s.tool !== 'select') return just(s);
  const hitText = textAtPoint(Object.values(env.plan.texts), at.x, at.y, env.pxPerCm);
  if (hitText) return just({ ...s, inlineEdit: openText(hitText) });
  const rooms = detectRooms(env.plan);
  const room = roomAt(rooms, at.x, at.y);
  // Off the plan's own labels, not the drag overlay's: a double-click never
  // lands mid-drag, so there is nothing to reconcile here.
  const blocks = roomTextBlocks(rooms, Object.values(env.plan.roomLabels));
  const block = room ? blocks.find((b) => b.room === room && b.area !== undefined) : undefined;
  if (!block) return just(s);
  return just({ ...s, inlineEdit: openRoomLabel(block, block.labels[0] ?? null) });
}

// Null is Escape: the box closes and the tool hands back, but nothing is
// written (CONTEXT.md: Interaction chrome).
function closedInlineEdit(s: Session, env: SessionEnv, value: string | null): SessionResult {
  const ed = s.inlineEdit;
  const closed = { ...s, inlineEdit: null };
  // One-shot: a Text placement hands back to Select whatever the box returns
  // (ADR 0021). Only that box spends the shot — a label box outlives the tool.
  const base = s.tool === 'text' && ed?.kind === 'text' ? withTool(closed, 'select') : just(closed);
  if (!ed) return base;
  const done = commitInlineEdit(env.plan, ed, value);
  if (!done) return base;
  return {
    ...base,
    session: { ...base.session, selection: done.selection ?? base.session.selection },
    edit: { how: 'commit', plan: done.plan },
  };
}

export function reduce(s: Session, intent: Intent, env: SessionEnv): SessionResult {
  switch (intent.type) {
    case 'pointerDown': {
      const [phase, resolved] = routePointerDown(s.pointer, intent.input, intent.target, pointerCtx(s, env));
      return applyPointer(s, env, phase, resolved);
    }
    case 'pointerMove': {
      const [phase, resolved] = routePointerMove(s.pointer, intent.input, pointerCtx(s, env));
      return applyPointer(s, env, phase, resolved, intent.onSheet);
    }
    case 'pointerUp': {
      const [phase, resolved] = routePointerUp(s.pointer, intent.input);
      return applyPointer(s, env, phase, resolved);
    }
    case 'pointerCancel': {
      const [phase, resolved] = routePointerCancel(s.pointer, intent.input);
      return applyPointer(s, env, phase, resolved);
    }
    case 'selectTool':
      return withTool(s, intent.tool);
    // The cancel ladder: the placement drops what it has pending, then the
    // Selection empties, then the tool falls back to Select (ADR 0018).
    case 'cancel': {
      const dropped = s.placement && cancelPlacement(s.placement);
      if (dropped) return just({ ...s, placement: dropped });
      if (s.selection.length > 0) return just({ ...s, selection: [] });
      return withTool(s, 'select');
    }
    // Through withTool: a Selection only exists under the Select tool.
    case 'selectAll': {
      const base = withTool(s, 'select');
      return {
        ...base,
        // Rulers join only while measures are shown (ticket 02).
        session: { ...base.session, selection: allElements(env.plan, env.measuresVisible) },
      };
    }
    case 'deleteSelection': {
      if (s.selection.length === 0) return just(s);
      return {
        session: { ...s, selection: [] },
        edit: { how: 'commit', plan: deleteSelection(env.plan, s.selection) },
      };
    }
    case 'setDefaults':
      return just({ ...s, defaults: intent.update(s.defaults) });
    case 'hoverElement':
      return just({ ...s, hover: { kind: intent.kind, id: intent.id } });
    case 'leaveElement':
      // Only if it is still me: the enter of the next zone can land first.
      return just(s.hover?.kind === intent.kind && s.hover.id === intent.id ? { ...s, hover: null } : s);
    // A pointer that left the sheet hovers no room; only pointermove would ever
    // clear the tint otherwise, and it stops arriving.
    case 'leaveSheet':
      return just(withoutRoomHover(s));
    case 'contextMenu': {
      if (s.pointer.phase !== 'idle') return just(s);
      const dropped = s.placement && cancelPlacement(s.placement);
      if (dropped) return just({ ...s, placement: dropped });
      return s.tool === 'select' ? just(s) : withTool(s, 'select');
    }
    case 'doubleClick':
      return doubleClicked(s, env, intent.at);
    case 'editText': {
      if (s.tool !== 'select') return just(s);
      const text = env.plan.texts[intent.id];
      return text ? just({ ...s, inlineEdit: openText(text) }) : just(s);
    }
    case 'editRoomLabel':
      if (s.tool !== 'select') return just(s);
      return just({ ...s, inlineEdit: openRoomLabel(intent.block, intent.label) });
    case 'closeInlineEdit':
      return closedInlineEdit(s, env, intent.value);
  }
}

/** The Opening a slide is moving, read from the drag: the placement dims track
 *  a slide under way, not one that landed. */
export function movingOpeningId(s: Session): string | null {
  const g = s.drag;
  if (g?.kind !== 'plan') return null;
  return g.g.spec.kind === 'opening' && g.g.moved ? g.g.spec.id : null;
}

/** The drag that displaces Points, so the room loops move under it — the plan
 *  it started from, for the label overlay to reconcile against. */
export function reshapingDrag(s: Session): PlanDrag | null {
  const g = s.drag;
  if (g?.kind !== 'plan') return null;
  const kind = g.g.spec.kind;
  return kind === 'point' || kind === 'group' ? g.g : null;
}
