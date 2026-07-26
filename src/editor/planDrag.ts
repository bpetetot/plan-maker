// CONTEXT.md: Plan drag — a drag that edits the Plan, as a value (ADR 0023).
// Pure: no React, no store. The Editor advances it and mirrors what it renders.
import { axisLock, lockAim } from '../model/axisLock';
import type { Vec } from '../model/geometry';
import { projectOnWall, wallLength, wallSide } from '../model/geometry';
import { moveOpening } from '../model/openings';
import { settleEdit } from '../model/settle';
import type { Room } from '../model/rooms';
import { addRoomLabel, moveRoomLabel } from '../model/roomLabels';
import { clampToRoom } from '../model/rooms';
import { moveRulerEndpoint } from '../model/rulers';
import type { Snap } from '../model/snap';
import { realignDelta, snapPoint } from '../model/snap';
import type { ElementRef } from '../model/selection';
import { movedPointIds, selectionForRoom, translateElements } from '../model/selection';
import { DIM_FONT_PX, railedDimT } from '../model/rail';
import type { Plan } from '../model/types';
import { movePoint, setDimPlacement } from '../model/walls';
import { snapTolerance } from './gesture';

export type PlanDragSpec =
  // `grabDelta` fixes the grab point so the handle never recenters on the cursor;
  // `origin` is where the aim began, which is the axis a held Shift locks to.
  | { kind: 'point'; id: string; grabDelta: Vec; origin: Vec }
  | {
      kind: 'group';
      refs: ElementRef[];
      origin: Vec;
      // Fixed at pointer-down, not recomputed: the preview would jump when
      // another candidate became the nearest.
      refPoint: Vec | null;
    }
  // `room` clamps the block; null (orphan label, impossible per CONTEXT.md:
  // Room label) is defensive and moves freely.
  | {
      kind: 'label';
      id: string;
      room: Room | null;
      grabDelta: Vec;
      origin: Vec;
      additive: boolean;
      prev: ElementRef[];
    }
  // The label is created only once the gesture moved: a plain click must not
  // touch the plan.
  | {
      kind: 'newLabel';
      room: Room;
      grabDelta: Vec;
      origin: Vec;
      additive: boolean;
      prev: ElementRef[];
    }
  // `grabDelta` is along the wall here, not a Vec: both slide on a Rail.
  | { kind: 'opening'; id: string; grabDelta: number }
  | { kind: 'dim'; id: string; grabDelta: number }
  // A Ruler endpoint: snaps with the placement ladder, wall bodies included.
  | { kind: 'rulerEnd'; id: string; end: 'a' | 'b'; grabDelta: Vec; origin: Vec };

export interface PlanDrag {
  spec: PlanDragSpec;
  /** The plan the drag started from — Settle's "before" (ADR 0022). */
  orig: Plan;
  plan: Plan;
  snap: Snap | null;
  moved: boolean;
  /** A `newLabel`'s label, born on the aim that crosses the threshold. */
  labelId: string | null;
  /** What the drag leaves selected, or null to leave the Selection alone. */
  selection: ElementRef[] | null;
}

export interface AimEnv {
  pxPerCm: number;
  /** Read off the live event, never the tracked state (ADR 0007). */
  free: boolean;
  /** Shift, read the same way: the axis lock lasts as long as the finger. */
  locked: boolean;
  /** The click-vs-drag verdict, owned by the pointer router (ADR 0030). */
  moved: boolean;
}

export function beginPlanDrag(plan: Plan, spec: PlanDragSpec): PlanDrag {
  return { spec, orig: plan, plan, snap: null, moved: false, labelId: null, selection: null };
}

export function aimPlanDrag(drag: PlanDrag, at: Vec, env: AimEnv): PlanDrag {
  const spec = drag.spec;
  const tolerance = snapTolerance(env.pxPerCm);
  const grabbed = (d: Vec) => ({ x: at.x + d.x, y: at.y + d.y });
  // A block's aim, brought onto its axis: the two label arms share it.
  const aimed = (s: { grabDelta: Vec; origin: Vec }) => {
    const target = grabbed(s.grabDelta);
    return lockAim(axisLock(s.origin, target, env.locked), target);
  };
  const moved = env.moved;

  switch (spec.kind) {
    // A Point drag aims at Points and the grid, never at a wall body: it would
    // snap onto the very walls it carries.
    case 'point': {
      const p = grabbed(spec.grabDelta);
      const snap = snapPoint(drag.plan, p.x, p.y, {
        tolerance,
        exclude: new Set([spec.id]),
        free: env.free,
        // Resolved per arm, on the arm's own aimed position: the raw pointer
        // would offset it by `grabDelta` and could flip the axis near 45°.
        lock: axisLock(spec.origin, p, env.locked),
      });
      return { ...drag, plan: movePoint(drag.plan, spec.id, snap.x, snap.y), snap, moved };
    }
    // Rigid, and rebuilt from `orig` each aim rather than accumulated: a wobble
    // would otherwise compound into the translation.
    case 'group': {
      if (!moved) return { ...drag, moved };
      const delta = realignDelta(spec.refPoint, at.x - spec.origin.x, at.y - spec.origin.y, {
        free: env.free,
        lock: axisLock(spec.origin, at, env.locked),
      });
      return { ...drag, plan: translateElements(drag.orig, spec.refs, delta.dx, delta.dy), moved };
    }
    case 'label': {
      if (!moved) return { ...drag, moved };
      // The Room clamps last: an invariant does not propose a position, it
      // defines which ones exist, so the lock chooses inside what it allows.
      const target = aimed(spec);
      const t = spec.room ? clampToRoom(target, spec.room) : target;
      return { ...drag, plan: moveRoomLabel(drag.plan, spec.id, t.x, t.y), moved };
    }
    case 'newLabel': {
      const t = clampToRoom(aimed(spec), spec.room);
      if (drag.labelId) {
        return { ...drag, plan: moveRoomLabel(drag.plan, drag.labelId, t.x, t.y), moved };
      }
      if (!moved) return { ...drag, moved };
      // Born of a placement gesture, so born placed: nothing else would keep
      // it alive (CONTEXT.md: Room label).
      const [plan, labelId] = addRoomLabel(drag.plan, '', t.x, t.y, true);
      return { ...drag, plan, labelId, moved };
    }
    case 'opening': {
      const opening = drag.plan.openings[spec.id];
      // An element that vanished mid-drag freezes it, threshold included.
      if (!opening) return drag;
      if (!moved) return { ...drag, moved };
      const { t } = projectOnWall(drag.plan, drag.plan.walls[opening.wallId], at.x, at.y);
      return { ...drag, plan: moveOpening(drag.plan, spec.id, t + spec.grabDelta), moved };
    }
    case 'dim': {
      const wall = drag.plan.walls[spec.id];
      if (!wall) return drag;
      if (!moved) return { ...drag, moved };
      const length = wallLength(drag.plan, wall);
      const { t } = projectOnWall(drag.plan, wall, at.x, at.y);
      const side = wallSide(drag.plan, wall, at.x, at.y);
      const ratio = length < 1 ? 0.5 : (t + spec.grabDelta) / length;
      // The editor's size: the Rail the gesture rides is the one it is drawn on.
      const railed = railedDimT(drag.plan, wall, side, ratio, DIM_FONT_PX);
      return { ...drag, plan: setDimPlacement(drag.plan, spec.id, railed, side), moved };
    }
    case 'rulerEnd': {
      if (!drag.plan.rulers[spec.id]) return drag;
      const p = grabbed(spec.grabDelta);
      const snap = snapPoint(drag.plan, p.x, p.y, {
        tolerance,
        walls: true,
        free: env.free,
        lock: axisLock(spec.origin, p, env.locked),
      });
      const plan = moveRulerEndpoint(drag.plan, spec.id, spec.end, snap.x, snap.y);
      return { ...drag, plan, snap, moved };
    }
  }
}

export function commitPlanDrag(drag: PlanDrag): PlanDrag {
  const spec = drag.spec;
  // CONTEXT.md: Settle. Only a drag that moved a Point or a Wall has anything
  // to settle — the other five can violate no invariant (ADR 0022).
  const settled = (moving: Set<string>) => settleEdit(drag.orig, drag.plan, moving);
  const landed = (plan: Plan, selection: ElementRef[] | null = null): PlanDrag => ({
    ...drag,
    plan,
    snap: null,
    selection,
  });
  const room = (s: Extract<PlanDragSpec, { additive: boolean }>) =>
    selectionForRoom(drag.plan, s.room, s.additive, s.prev);

  // A drag that never crossed the threshold was a click, and a click selects:
  // the element itself, the wall a dim label handles, the Room a block names.
  switch (spec.kind) {
    case 'point':
      return landed(settled(new Set([spec.id])));
    case 'group':
      return landed(settled(movedPointIds(drag.plan, spec.refs)));
    case 'dim':
      return landed(drag.plan, drag.moved ? null : [{ type: 'wall', id: spec.id }]);
    case 'label':
      return landed(drag.plan, drag.moved ? null : room(spec));
    case 'newLabel':
      return landed(drag.plan, drag.labelId ? null : room(spec));
    case 'opening':
    case 'rulerEnd':
      return landed(drag.plan);
  }
}
