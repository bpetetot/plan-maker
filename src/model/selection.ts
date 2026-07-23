import type { Vec } from './geometry';
import { wallPoints } from './geometry';
import { openingPlacement } from './openings';
import { deleteOpening, deleteWall, setPoints, translateRoomLabel } from './operations';
import type { Room } from './rooms';
import {
  detectRooms,
  openingsOnWalls,
  reconcileRoomLabels,
  roomAt,
  roomOpenings,
  roomWallIds,
} from './rooms';
import type { Opening, Plan, Point } from './types';

// CONTEXT.md: Selection. Editor state, never the plan; room labels are never
// selected.

export interface ElementRef {
  type: 'wall' | 'opening';
  id: string;
}

export const sameRef = (a: ElementRef, b: ElementRef) => a.type === b.type && a.id === b.id;

export const refKey = (ref: ElementRef) => `${ref.type}:${ref.id}`;

export const isSelected = (selection: ElementRef[], ref: ElementRef) =>
  selection.some((r) => sameRef(r, ref));

export function toggleRef(selection: ElementRef[], ref: ElementRef): ElementRef[] {
  return isSelected(selection, ref) ? selection.filter((r) => !sameRef(r, ref)) : [...selection, ref];
}

/** Everything a Selection can hold: every Wall and every Opening the plan has
 *  (CONTEXT.md: Selection). */
export function allElements(plan: Plan): ElementRef[] {
  return [
    ...Object.keys(plan.walls).map((id): ElementRef => ({ type: 'wall', id })),
    ...Object.keys(plan.openings).map((id): ElementRef => ({ type: 'opening', id })),
  ];
}

// Marquee capture: containment, not intersection. Wall thickness ignored.
export function elementsInRect(plan: Plan, a: Vec, b: Vec): ElementRef[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;

  const refs: ElementRef[] = [];
  for (const wall of Object.values(plan.walls)) {
    const [s, e] = wallPoints(plan, wall);
    if (inside(s.x, s.y) && inside(e.x, e.y)) refs.push({ type: 'wall', id: wall.id });
  }
  for (const opening of Object.values(plan.openings)) {
    const wall = plan.walls[opening.wallId];
    const placement = openingPlacement(plan, opening);
    if (!wall || !placement) continue;
    const angle = (placement.angleDeg * Math.PI) / 180;
    const hx = (Math.cos(angle) * opening.width) / 2;
    const hy = (Math.sin(angle) * opening.width) / 2;
    if (inside(placement.cx - hx, placement.cy - hy) && inside(placement.cx + hx, placement.cy + hy)) {
      refs.push({ type: 'opening', id: opening.id });
    }
  }
  return refs;
}

/** The refs a Room is: its boundary walls and the openings they carry, so a
 *  click lands on the set a marquee already produced (ADR 0014). */
export function roomSelection(plan: Plan, room: Room): ElementRef[] | null {
  const wallIds = roomWallIds(plan, room);
  if (!wallIds) return null;
  return [
    ...wallIds.map((id): ElementRef => ({ type: 'wall', id })),
    ...openingsOnWalls(plan, wallIds).map((o): ElementRef => ({ type: 'opening', id: o.id })),
  ];
}

export interface Contents {
  walls: number;
  doors: number;
  windows: number;
}

const tally = (walls: number, openings: Opening[]): Contents => ({
  walls,
  doors: openings.filter((o) => o.type === 'door').length,
  windows: openings.filter((o) => o.type === 'window').length,
});

// CONTEXT.md: Tool panel. What is lit and nothing more — a ref the plan no
// longer holds counts for nothing.
export function selectionContents(plan: Plan, refs: ElementRef[]): Contents {
  const openings = refs
    .filter((ref) => ref.type === 'opening')
    .map((ref) => plan.openings[ref.id])
    .filter((o) => o !== undefined);
  return tally(refs.filter((ref) => ref.type === 'wall' && plan.walls[ref.id]).length, openings);
}

/** What a Room's boundary holds, islands included — read from the room and
 *  never from the refs, so it states what a Delete takes (ADR 0014). */
export function roomContents(plan: Plan, room: Room): Contents {
  return tally((roomWallIds(plan, room) ?? []).length, roomOpenings(plan, room));
}

/** A Room is read from the Selection, never held in it (ADR 0014). Openings
 *  carried by its walls ride along, and none of them votes: the reading
 *  survives a Shift-click that puts one out. */
export function selectedRoom(plan: Plan, rooms: Room[], refs: ElementRef[]): Room | null {
  const wallIds = new Set(refs.filter((ref) => ref.type === 'wall').map((ref) => ref.id));
  return (
    rooms.find((room) => {
      const boundary = roomWallIds(plan, room);
      if (boundary === null || boundary.length !== wallIds.size) return null;
      if (!boundary.every((id) => wallIds.has(id))) return null;
      return refs.every((ref) => ref.type === 'wall' || wallIds.has(plan.openings[ref.id]?.wallId));
    }) ?? null
  );
}

export function deleteElements(plan: Plan, refs: ElementRef[]): Plan {
  let next = plan;
  for (const ref of refs) {
    if (ref.type === 'wall') next = deleteWall(next, ref.id);
    else next = deleteOpening(next, ref.id);
  }
  return reconcileRoomLabels(plan, next);
}

// Ties break on endpoint `a` then lowest id: selection order is an
// implementation detail and must not decide the grid realignment point.
export function referencePoint(plan: Plan, refs: ElementRef[], grab: Vec): Point | null {
  let best: { point: Point; reach: number; isStart: boolean } | null = null;
  for (const ref of refs) {
    if (ref.type !== 'wall') continue;
    const wall = plan.walls[ref.id];
    if (!wall) continue;
    for (const point of wallPoints(plan, wall)) {
      // squared distance: points are whole centimeters, so ties are exact
      const reach = (point.x - grab.x) ** 2 + (point.y - grab.y) ** 2;
      const isStart = point.id === wall.startPointId;
      const wins =
        best === null ||
        reach < best.reach ||
        (reach === best.reach && (isStart !== best.isStart ? isStart : point.id < best.point.id));
      if (wins) best = { point, reach, isStart };
    }
  }
  return best?.point ?? null;
}

// CONTEXT.md: Room label. A room with every boundary wall selected translates
// rigidly, label included.
export function translateElements(plan: Plan, refs: ElementRef[], dx: number, dy: number): Plan {
  if (dx === 0 && dy === 0) return plan;
  const updates: Record<string, Vec> = {};
  for (const ref of refs) {
    if (ref.type !== 'wall') continue;
    const wall = plan.walls[ref.id];
    if (!wall) continue;
    for (const point of wallPoints(plan, wall)) {
      updates[point.id] = { x: point.x + dx, y: point.y + dy };
    }
  }
  if (Object.keys(updates).length === 0) return plan;
  let next = setPoints(plan, updates);

  const labels = Object.values(plan.roomLabels);
  if (labels.length > 0) {
    const selected = new Set(refs.filter((r) => r.type === 'wall').map((r) => r.id));
    const rigid = (room: Room) => {
      const wallIds = roomWallIds(plan, room);
      return wallIds !== null && wallIds.every((id) => selected.has(id));
    };
    const rooms = detectRooms(plan);
    for (const label of labels) {
      const room = roomAt(rooms, label.x, label.y);
      if (room && rigid(room)) next = translateRoomLabel(next, label.id, dx, dy);
    }
  }
  return next;
}
