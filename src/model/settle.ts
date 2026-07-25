// The graph surgery a Point or a Wall edit needs: planar insertion at commit
// (ADR 0002) and the settle that follows a drag (ADR 0022).
import type { Vec } from './geometry';
import { distance, nearestWall, segmentIntersection, wallLength, wallPoints } from './geometry';
import { railedOpeningOffset } from './openings';
import { dropOrphanRoomLabels, reconcileRoomLabels } from './rooms';
import type { Snap } from './snap';
import type { Opening, Plan, Wall } from './types';
import { newId, WALL_THICKNESS } from './types';

function ensurePoint(plan: Plan, snap: Snap): [Plan, string] {
  if (snap.pointId) return [plan, snap.pointId];
  const id = newId();
  const point = { id, x: Math.round(snap.x), y: Math.round(snap.y) };
  return [{ ...plan, points: { ...plan.points, [id]: point } }, id];
}

function addWall(
  plan: Plan,
  startPointId: string,
  endPointId: string,
  thickness: number = WALL_THICKNESS,
): Plan {
  if (startPointId === endPointId) return plan;
  for (const wall of Object.values(plan.walls)) {
    const same = wall.startPointId === startPointId && wall.endPointId === endPointId;
    const reversed = wall.startPointId === endPointId && wall.endPointId === startPointId;
    if (same || reversed) return plan;
  }
  const id = newId();
  const wall: Wall = { id, startPointId, endPointId, thickness };
  return { ...plan, walls: { ...plan.walls, [id]: wall } };
}

// ADR 0002. Start-side half keeps the wall's id, so its openings keep their
// wallId and offset.
function splitWall(plan: Plan, wallId: string, pointId: string): Plan {
  const wall = plan.walls[wallId];
  const point = plan.points[pointId];
  if (!wall || !point) return plan;
  if (pointId === wall.startPointId || pointId === wall.endPointId) return plan;

  const startHalf: Wall = {
    id: wall.id,
    startPointId: wall.startPointId,
    endPointId: pointId,
    thickness: wall.thickness,
  };
  const endHalf: Wall = {
    id: newId(),
    startPointId: pointId,
    endPointId: wall.endPointId,
    thickness: wall.thickness,
  };
  const walls = { ...plan.walls, [startHalf.id]: startHalf, [endHalf.id]: endHalf };
  const next = { ...plan, walls };

  const start = plan.points[wall.startPointId];
  const cut = distance(start.x, start.y, point.x, point.y);
  // Rebase all, then clamp: clamping mid-pass would bound openings against
  // offsets held on the wall that no longer exists.
  const rebased: Record<string, Opening> = {};
  const moved: string[] = [];
  for (const opening of Object.values(plan.openings)) {
    if (opening.wallId !== wallId) {
      rebased[opening.id] = opening;
      continue;
    }
    if (opening.offset - opening.width / 2 < cut && opening.offset + opening.width / 2 > cut) continue;
    const host = opening.offset < cut ? startHalf : endHalf;
    const offset = Math.round(opening.offset < cut ? opening.offset : opening.offset - cut);
    rebased[opening.id] = { ...opening, wallId: host.id, offset };
    moved.push(opening.id);
  }
  const staged = { ...next, openings: rebased };
  const openings = { ...rebased };
  for (const id of moved) {
    const opening = rebased[id];
    // An opening the clamp would shift is deleted, never silently moved.
    const host = staged.walls[opening.wallId];
    if (railedOpeningOffset(staged, host, opening.offset, opening.width, opening) !== opening.offset) {
      delete openings[id];
    }
  }
  return { ...next, openings };
}

// Under the 10 cm wall thickness, above the ~0.7 cm drift integer rounding
// can introduce.
const JUNCTION_TOLERANCE = 1;

function findPointNear(plan: Plan, x: number, y: number): string | null {
  let best: string | null = null;
  let bestDistance = JUNCTION_TOLERANCE;
  for (const point of Object.values(plan.points)) {
    const d = distance(point.x, point.y, x, y);
    if (d <= bestDistance) {
      bestDistance = d;
      best = point.id;
    }
  }
  return best;
}

function ensurePointAt(plan: Plan, x: number, y: number): [Plan, string] {
  const existing = findPointNear(plan, x, y);
  if (existing) return [plan, existing];
  const id = newId();
  return [{ ...plan, points: { ...plan.points, [id]: { id, x, y } } }, id];
}

function interiorProjection(a: Vec, b: Vec, p: Vec): number | null {
  const length = distance(a.x, a.y, b.x, b.y);
  if (length < 1) return null;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length;
  if (t < JUNCTION_TOLERANCE || t > length - JUNCTION_TOLERANCE) return null;
  const off = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length;
  if (off > JUNCTION_TOLERANCE) return null;
  return t;
}

// ADR 0003. Host looked up here, not trusted from the snap: an earlier split
// may have replaced it.
export function commitPoint(plan: Plan, snap: Snap): [Plan, string] {
  if (snap.pointId) return [plan, snap.pointId];
  const x = Math.round(snap.x);
  const y = Math.round(snap.y);
  const existing = findPointNear(plan, x, y);
  if (snap.kind === 'wall') {
    const host = nearestWall(plan, x, y, JUNCTION_TOLERANCE + 1);
    // A reused point still splits the host: the contact must be a junction,
    // not a dangling overlap.
    if (existing) return [host ? splitWall(plan, host.wall.id, existing) : plan, existing];
    const [next, id] = ensurePoint(plan, snap);
    return [host ? splitWall(next, host.wall.id, id) : next, id];
  }
  if (existing) return [plan, existing];
  return ensurePoint(plan, snap);
}

// Planar insertion (ADR 0002). Returns the resolved end point id so the
// drawing chain continues from it.
export function commitWall(
  plan: Plan,
  start: Snap,
  end: Snap,
  thickness: number = WALL_THICKNESS,
): [Plan, string] {
  let next = plan;
  let startId: string;
  let endId: string;
  [next, startId] = commitPoint(next, start);
  [next, endId] = commitPoint(next, end);
  if (startId === endId) return [plan, startId];

  const a = next.points[startId];
  const b = next.points[endId];
  const length = distance(a.x, a.y, b.x, b.y);
  const along = (x: number, y: number) => ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / length;

  // Walls snapshotted: two straight walls cross at most once, so split halves
  // never need re-examination.
  const cuts = new Map<string, number>();

  for (const point of Object.values(next.points)) {
    if (point.id === startId || point.id === endId) continue;
    const t = interiorProjection(a, b, point);
    if (t !== null) cuts.set(point.id, t);
  }

  for (const wall of Object.values(next.walls)) {
    const [c, d] = wallPoints(next, wall);
    const crossing = segmentIntersection(a, b, c, d);
    if (!crossing) continue;
    const x = Math.round(crossing.x);
    const y = Math.round(crossing.y);
    let pointId: string;
    [next, pointId] = ensurePointAt(next, x, y);
    next = splitWall(next, wall.id, pointId);
    if (pointId !== startId && pointId !== endId) cuts.set(pointId, along(x, y));
  }

  const ordered = [...cuts.entries()].sort(([, t1], [, t2]) => t1 - t2).map(([id]) => id);
  const stops = [startId, ...ordered, endId];
  for (let i = 0; i < stops.length - 1; i++) next = addWall(next, stops[i], stops[i + 1], thickness);
  return [next, endId];
}

// ADR 0003. Opposed twins mirror the offset and flip hinge/swing, so the door
// stays physically identical.
function dedupeTwinWalls(plan: Plan): Plan {
  const walls: Record<string, Wall> = {};
  const twinOf = new Map<string, Wall>();
  const byEndpoints = new Map<string, Wall>();
  for (const wall of Object.values(plan.walls)) {
    const pair = JSON.stringify([wall.startPointId, wall.endPointId].sort());
    const twin = byEndpoints.get(pair);
    if (twin) {
      twinOf.set(wall.id, twin);
      continue;
    }
    byEndpoints.set(pair, wall);
    walls[wall.id] = wall;
  }
  if (twinOf.size === 0) return plan;

  const next = { ...plan, walls };
  const openings: Record<string, Opening> = {};
  for (const opening of Object.values(plan.openings)) {
    const host = twinOf.get(opening.wallId);
    if (!host) {
      openings[opening.id] = opening;
      continue;
    }
    const removed = plan.walls[opening.wallId];
    const reversed = removed.startPointId !== host.startPointId;
    const offset = reversed ? Math.round(wallLength(next, host) - opening.offset) : opening.offset;
    let moved: Opening = { ...opening, wallId: host.id, offset };
    if (reversed && moved.type === 'door') {
      moved = {
        ...moved,
        hingeSide: moved.hingeSide === 'start' ? 'end' : 'start',
        swing: moved.swing === 'in' ? 'out' : 'in',
      };
    }
    openings[opening.id] = moved;
  }
  return { ...next, openings };
}

function mergePoints(plan: Plan, survivorId: string, absorbedId: string): Plan {
  const points = { ...plan.points };
  delete points[absorbedId];

  const walls: Record<string, Wall> = {};
  for (const wall of Object.values(plan.walls)) {
    const startPointId = wall.startPointId === absorbedId ? survivorId : wall.startPointId;
    const endPointId = wall.endPointId === absorbedId ? survivorId : wall.endPointId;
    if (startPointId === endPointId) continue;
    walls[wall.id] = { ...wall, startPointId, endPointId };
  }

  const openings: Record<string, Opening> = {};
  for (const opening of Object.values(plan.openings)) {
    if (walls[opening.wallId]) openings[opening.id] = opening;
  }
  return dedupeTwinWalls({ ...plan, points, walls, openings });
}

// Invariant "two Points never coincide" (ADR 0003). `moving` lists gesture-
// displaced points: a stationary point survives over a moved one.
function mergeCoincidentPoints(plan: Plan, moving?: Set<string>): Plan {
  let next = plan;
  for (let merged = true; merged;) {
    merged = false;
    const points = Object.values(next.points);
    outer: for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        if (distance(a.x, a.y, b.x, b.y) > JUNCTION_TOLERANCE) continue;
        const aMoved = moving ? moving.has(a.id) && !moving.has(b.id) : false;
        const [survivor, absorbed] = aMoved ? [b, a] : [a, b];
        next = mergePoints(next, survivor.id, absorbed.id);
        merged = true;
        break outer;
      }
    }
  }
  return next;
}

// Invariant "walls only meet at shared Points" (ADR 0002), drag-end
// counterpart of commitWall's planar insertion. Runs to a fixpoint.
function planarize(plan: Plan): Plan {
  let next = plan;
  for (let changed = true; changed;) {
    changed = false;
    // Splits along a collinear overlap leave two walls on the same pair.
    next = dedupeTwinWalls(next);
    outer: for (const point of Object.values(next.points)) {
      for (const wall of Object.values(next.walls)) {
        if (wall.startPointId === point.id || wall.endPointId === point.id) continue;
        const [a, b] = wallPoints(next, wall);
        if (interiorProjection(a, b, point) === null) continue;
        next = splitWall(next, wall.id, point.id);
        changed = true;
        break outer;
      }
    }
    if (changed) continue;
    // T junctions first: once no point sits on a wall body, remaining
    // contacts are proper crossings.
    const walls = Object.values(next.walls);
    crossings: for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const [a, b] = wallPoints(next, walls[i]);
        const [c, d] = wallPoints(next, walls[j]);
        const crossing = segmentIntersection(a, b, c, d);
        if (!crossing) continue;
        let pointId: string;
        [next, pointId] = ensurePointAt(next, Math.round(crossing.x), Math.round(crossing.y));
        next = splitWall(next, walls[i].id, pointId);
        next = splitWall(next, walls[j].id, pointId);
        changed = true;
        break crossings;
      }
    }
  }
  return next;
}

/** CONTEXT.md: Settle. `before` is the plan the edit started from — the caller
 *  holds it; `moving` lists the Points it displaced (ADR 0022). */
export function settleEdit(before: Plan, after: Plan, moving?: Set<string>): Plan {
  return reconcileRoomLabels(before, planarize(mergeCoincidentPoints(after, moving)));
}

/** CONTEXT.md: Settle, the form with no `before`: nothing to reconcile labels
 *  against. Orphans drop last — a split can close a loop and give one its room. */
export function settlePlan(plan: Plan): Plan {
  return dropOrphanRoomLabels(planarize(mergeCoincidentPoints(plan)));
}
