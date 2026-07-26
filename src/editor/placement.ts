// CONTEXT.md: Placement, as a value (ADR 0025). Pure — no React, no store —
// and carrying no plan, unlike a Plan drag: the plan is an argument each call.
import type { Rect, Vec } from '../model/geometry';
import type { AxisLock } from '../model/axisLock';
import { axisLock, WORLD_AXES } from '../model/axisLock';
import { nearestWall } from '../model/geometry';
import { placeOpening, railedOpeningOffset } from '../model/openings';
import { commitPoint, commitWall, settleEdit } from '../model/settle';
import { addRuler } from '../model/rulers';
import type { ElementRef } from '../model/selection';
import type { Snap } from '../model/snap';
import { snapPoint } from '../model/snap';
import type { Cm, Opening, Plan, TextSize } from '../model/types';
import { GRID, WALL_THICKNESS } from '../model/types';
import { wallsAlongPath } from '../model/walls';
import { guideTolerance, snapTolerance } from './gesture';
import type { Tool, ToolDefaults } from './tools';

// Every Tool but Select, which poses nothing.
type PlacementTool = Exclude<Tool, 'select'>;

// The first click is held as a pending Snap, not committed: aborting the chain
// must not touch the plan. Past it the chain names Points, which commits churn.
type Chain = { pending: Snap } | { start: string; last: string };

type OpeningPreview = { wallId: string; offset: Cm };

export type Placement =
  // `anchors` are the chain's Points in draw order — what it drew, robust to
  // the splits and merges each commit performs (ADR 0018).
  // `lock`: the line the last aim resolved, for the Debug mode to draw (ADR 0036).
  | { tool: 'wall'; chain: Chain | null; anchors: string[]; snap: Snap | null; lock: AxisLock | null }
  | { tool: 'door' | 'window'; preview: OpeningPreview | null }
  | { tool: 'ruler'; a: Snap | null; snap: Snap | null; lock: AxisLock | null }
  | { tool: 'text'; typing: boolean; snap: Snap | null };

/** The machine's state, flat: one word the screen can index a hint by. */
export type PlacementStage = 'wall' | 'chaining' | 'opening' | 'ruler' | 'measuring' | 'text' | 'typing';

interface PlacementEnv {
  pxPerCm: number;
  // Alt inverts the snap state for the gesture (ADR 0007).
  free: boolean;
  // Shift, read the same way. The three tools with no anchor ignore it.
  locked: boolean;
  // What the viewport shows: a guide whose source Point is off screen cannot
  // be explained (ADR 0037).
  view: Rect;
  defaults: ToolDefaults;
}

export interface PlacementResult {
  placement: Placement;
  /** The plan the click produced, when it edited it. */
  plan?: Plan;
  /** The Tool a completed placement hands back to (ADR 0018). */
  tool?: Tool;
  selection?: ElementRef[];
  /** Where to open an inline editor, when the click asks for one. */
  editor?: { x: number; y: number; size: TextSize };
}

// Everything the placement puts on screen, folded by the caller into chrome.
interface PlacementChrome {
  snap: Snap | null;
  rubber: { from: Vec; to: Vec; thickness: Cm } | null;
  ghost: Opening | null;
  rulerGhost: { a: Vec; b: Vec } | null;
}

// Screen px: how far from a wall the Opening tools still find it.
const OPENING_REACH_PX = 40;
// Screen px, and not the click threshold: two aimed positions this close are
// the same point, so a Ruler's B on its own A is a mis-click, not a Ruler.
const SAME_POINT_PX = 1;

const pointSnap = (plan: Plan, id: string): Snap => ({
  x: plan.points[id].x,
  y: plan.points[id].y,
  kind: 'point',
  pointId: id,
});

// A Text attaches to nothing, so it runs the grid rung only — never Points or
// wall body. Alt / Snap-off give free 1 cm coordinates.
const snapText = (at: Vec, free: boolean): Snap =>
  free
    ? { x: Math.round(at.x), y: Math.round(at.y), kind: 'free' }
    : { x: Math.round(at.x / GRID) * GRID, y: Math.round(at.y / GRID) * GRID, kind: 'grid' };

// The anchor the rubber band runs from, and the origin a held Shift locks to.
// Null before there is one: no origin, no lock.
const anchorOf = (p: Placement, plan: Plan): Vec | null => {
  if (p.tool === 'wall') {
    if (!p.chain) return null;
    return 'pending' in p.chain ? p.chain.pending : plan.points[p.chain.last];
  }
  return p.tool === 'ruler' ? p.a : null;
};

// The anchor's Point, when the anchor has one: the Axis lock owns the
// gesture's own origin, the Alignment guide owns every other Point (ADR 0037).
const originOf = (p: Placement): string | undefined => {
  if (p.tool === 'wall') {
    if (!p.chain) return undefined;
    return 'pending' in p.chain ? p.chain.pending.pointId : p.chain.last;
  }
  return p.tool === 'ruler' ? p.a?.pointId : undefined;
};

// The aimed position and the line that constrained it, together: re-deriving
// the second at the render is the one way it could disagree (ADR 0036).
const aimPoint = (
  p: Placement,
  plan: Plan,
  at: Vec,
  env: PlacementEnv,
): { snap: Snap; lock: AxisLock | null } => {
  const lock = axisLock(anchorOf(p, plan), at, WORLD_AXES, env.locked);
  return {
    snap: snapPoint(plan, at.x, at.y, {
      tolerance: snapTolerance(env.pxPerCm),
      guideTolerance: guideTolerance(env.pxPerCm),
      origin: originOf(p),
      viewport: env.view,
      walls: true,
      free: env.free,
      lock,
    }),
    lock,
  };
};

export function beginPlacement(tool: PlacementTool): Placement {
  switch (tool) {
    case 'wall':
      return { tool, chain: null, anchors: [], snap: null, lock: null };
    case 'door':
    case 'window':
      return { tool, preview: null };
    case 'ruler':
      return { tool, a: null, snap: null, lock: null };
    case 'text':
      return { tool, typing: false, snap: null };
  }
}

export function placementStage(p: Placement): PlacementStage {
  switch (p.tool) {
    case 'wall':
      return p.chain ? 'chaining' : 'wall';
    case 'door':
    case 'window':
      return 'opening';
    case 'ruler':
      return p.a ? 'measuring' : 'ruler';
    case 'text':
      return p.typing ? 'typing' : 'text';
  }
}

export function aimPlacement(p: Placement, plan: Plan, at: Vec, env: PlacementEnv): Placement {
  switch (p.tool) {
    case 'wall':
    case 'ruler': {
      const { snap, lock } = aimPoint(p, plan, at, env);
      return { ...p, snap, lock };
    }
    // The open editor holds the spot: nothing chases the pointer under it.
    case 'text':
      return p.typing ? p : { ...p, snap: snapText(at, env.free) };
    case 'door':
    case 'window': {
      const near = nearestWall(plan, at.x, at.y, OPENING_REACH_PX / env.pxPerCm + WALL_THICKNESS);
      // The same value back, not a fresh one: aiming at no wall must not cost a
      // render on every pointermove.
      if (!near) return p.preview ? { ...p, preview: null } : p;
      const width = p.tool === 'door' ? env.defaults.doorWidth : env.defaults.windowWidth;
      const offset = railedOpeningOffset(plan, near.wall, near.t, width);
      return { ...p, preview: offset === null ? null : { wallId: near.wall.id, offset } };
    }
  }
}

export function clickPlacement(p: Placement, plan: Plan, at: Vec, env: PlacementEnv): PlacementResult {
  switch (p.tool) {
    case 'wall':
      return clickWall(p, plan, at, env);
    case 'door':
    case 'window':
      return clickOpening(p, plan, env);
    case 'ruler':
      return clickRuler(p, plan, at, env);
    case 'text': {
      const s = snapText(at, env.free);
      return {
        placement: { ...p, typing: true, snap: null },
        editor: { x: s.x, y: s.y, size: env.defaults.textSize },
      };
    }
  }
}

type WallPlacement = Extract<Placement, { tool: 'wall' }>;

function clickWall(p: WallPlacement, plan: Plan, at: Vec, env: PlacementEnv): PlacementResult {
  // The same origin the aim used, so the click lands where the rubber band did.
  const { snap: s } = aimPoint(p, plan, at, env);
  const chain = p.chain;
  // CONTEXT.md: Settle. No `moving` set — a drawing displaces no Point, it
  // creates one; the Room label pass is what commitWall lacked (ADR 0022).
  const settled = (after: Plan) => settleEdit(plan, after);
  if (chain && 'start' in chain && s.pointId === chain.start && chain.last !== chain.start) {
    const closed = settled(
      commitWall(
        plan,
        pointSnap(plan, chain.last),
        pointSnap(plan, chain.start),
        env.defaults.wallThickness,
      )[0],
    );
    // The closing segment runs last→start, so the path loops back to start.
    return { plan: closed, ...finishChain(p, closed, [...p.anchors, chain.start]) };
  }
  // `lock: null` here and below: the click moved the anchor, so the line the
  // aim resolved ran through the previous one. The next aim resolves the new.
  if (!chain) return { placement: { ...p, chain: { pending: s }, lock: null } };
  // One commit per drawn wall: the pending start and the wall land in a single
  // history entry (ADR 0002).
  const startSnap = 'pending' in chain ? chain.pending : pointSnap(plan, chain.last);
  const [withStart, startId] = commitPoint(plan, startSnap);
  const [next, pointId] = commitWall(withStart, pointSnap(withStart, startId), s, env.defaults.wallThickness);
  return {
    plan: settled(next),
    placement: {
      ...p,
      chain: { start: 'pending' in chain ? startId : chain.start, last: pointId },
      anchors: 'pending' in chain ? [startId, pointId] : [...p.anchors, pointId],
      lock: null,
    },
  };
}

// A completed chain hands back to Select with the walls it drew selected; a
// path that drew no wall is not a completion, so the tool simply stays.
function finishChain(p: WallPlacement, plan: Plan, path: string[]): PlacementResult {
  const drawn = wallsAlongPath(plan, path);
  if (drawn.length === 0) return { placement: beginPlacement(p.tool) };
  return {
    placement: beginPlacement(p.tool),
    tool: 'select',
    selection: drawn.map((id) => ({ type: 'wall', id })),
  };
}

/** A chain's other ending: a double-click stops it where it stands. */
export function finishPlacement(p: Placement, plan: Plan): PlacementResult {
  // Only an active chain finishes; without one the anchors are stale.
  if (p.tool !== 'wall' || !p.chain) return { placement: p };
  return finishChain(p, plan, p.anchors);
}

function clickOpening(
  p: Extract<Placement, { tool: 'door' | 'window' }>,
  plan: Plan,
  env: PlacementEnv,
): PlacementResult {
  if (!p.preview) return { placement: p };
  const [next, id] = placeOpening(plan, p.preview.wallId, p.tool, p.preview.offset, {
    width: p.tool === 'door' ? env.defaults.doorWidth : env.defaults.windowWidth,
    hingeSide: env.defaults.doorHinge,
    swing: env.defaults.doorSwing,
  });
  // A refused offset placed nothing, so it is not a completion (ADR 0018).
  if (!id) return { placement: p };
  return {
    placement: beginPlacement(p.tool),
    plan: next,
    tool: 'select',
    selection: [{ type: 'opening', id }],
  };
}

function clickRuler(
  p: Extract<Placement, { tool: 'ruler' }>,
  plan: Plan,
  at: Vec,
  env: PlacementEnv,
): PlacementResult {
  const { snap: s } = aimPoint(p, plan, at, env);
  if (!p.a) return { placement: { ...p, a: s, snap: s, lock: null } };
  // B on A is a mis-click: ignore it, the pending A keeps rubber-banding.
  if (Math.hypot(s.x - p.a.x, s.y - p.a.y) * env.pxPerCm < SAME_POINT_PX) return { placement: p };
  const [next, id] = addRuler(plan, { x: p.a.x, y: p.a.y }, { x: s.x, y: s.y });
  return {
    placement: beginPlacement(p.tool),
    plan: next,
    tool: 'select',
    selection: [{ type: 'ruler', id }],
  };
}

/** null when nothing was pending: the caller steps down its own cancel ladder. */
export function cancelPlacement(p: Placement): Placement | null {
  switch (p.tool) {
    case 'wall':
      return p.chain ? beginPlacement(p.tool) : null;
    case 'ruler':
      return p.a ? beginPlacement(p.tool) : null;
    case 'door':
    case 'window':
    case 'text':
      return null;
  }
}

export function placementChrome(p: Placement, plan: Plan, defaults: ToolDefaults): PlacementChrome {
  const none: PlacementChrome = { snap: null, rubber: null, ghost: null, rulerGhost: null };
  switch (p.tool) {
    case 'wall': {
      const from = anchorOf(p, plan);
      const rubber = from && p.snap ? { from, to: p.snap, thickness: defaults.wallThickness } : null;
      return { ...none, snap: p.snap, rubber };
    }
    case 'door':
    case 'window':
      return { ...none, ghost: p.preview ? ghostOpening(p.tool, p.preview, defaults) : null };
    // The A→cursor segment already reads as the Ruler: ISO arrows, live length.
    case 'ruler':
      return { ...none, snap: p.snap, rulerGhost: p.a && p.snap ? { a: p.a, b: p.snap } : null };
    case 'text':
      return { ...none, snap: p.snap };
  }
}

function ghostOpening(tool: 'door' | 'window', preview: OpeningPreview, defaults: ToolDefaults): Opening {
  const base = { id: '__ghost', wallId: preview.wallId, offset: preview.offset };
  return tool === 'door'
    ? {
        ...base,
        type: 'door',
        width: defaults.doorWidth,
        hingeSide: defaults.doorHinge,
        swing: defaults.doorSwing,
      }
    : { ...base, type: 'window', width: defaults.windowWidth };
}
