import type { Room } from './rooms';
import { detectRooms, roomAt, roomContains, roomWallIds } from './rooms';
import type { Plan, RoomLabel } from './types';
import { newId } from './types';

// What a room carries of its own text block (CONTEXT.md: Room label): a label
// belongs to its room, not to a position.

// Reconciliation keeps at most one label per room (CONTEXT.md: Room label);
// labels iterate in creation order, so the oldest wins if state ever slipped.
export const roomLabelAt = (plan: Plan, room: Room): RoomLabel | null =>
  Object.values(plan.roomLabels).find((label) => roomContains(room, label.x, label.y)) ?? null;

const sameLoop = (a: Room, b: Room) => {
  if (a.pointIds.length !== b.pointIds.length) return false;
  const ids = new Set(b.pointIds);
  return a.pointIds.every((id) => ids.has(id));
};

// A label carries a name, a custom placement, or both; one carrying neither
// does not exist (CONTEXT.md: Room label).
const carries = (label: RoomLabel): boolean => Boolean(label.name || label.placed);

// A label belongs to its room, not a position (CONTEXT.md: Room label): home
// room matched by loop, not containment, so a passing wall cannot steal it.
export function reconcileRoomLabels(before: Plan, after: Plan): Plan {
  const labels = Object.values(after.roomLabels);
  if (labels.length === 0) return after;
  const roomsAfter = detectRooms(after);
  const roomsBefore = before === after ? roomsAfter : detectRooms(before);
  let changed = false;
  const kept: { label: RoomLabel; room: Room }[] = [];
  for (const label of labels) {
    // a rigid group move may already have moved the label: home room comes
    // from its pre-change position
    const pos = before.roomLabels[label.id] ?? label;
    const homeBefore = roomAt(roomsBefore, pos.x, pos.y);
    const home = homeBefore ? (roomsAfter.find((room) => sameLoop(room, homeBefore)) ?? null) : null;
    const room = home ?? roomAt(roomsAfter, label.x, label.y);
    if (!room) {
      changed = true;
      continue;
    }
    if (label.placed && roomContains(room, label.x, label.y)) {
      kept.push({ label, room });
      continue;
    }
    const x = Math.round(room.anchor.x);
    const y = Math.round(room.anchor.y);
    if (label.placed || label.x !== x || label.y !== y) {
      changed = true;
      const pinned = { ...label, x, y };
      delete pinned.placed;
      kept.push({ label: pinned, room });
    } else {
      kept.push({ label, room });
    }
  }
  // one label per room: labels iterate in creation order, the first claim wins
  // — and a label that carries nothing claims none, or it would evict a name.
  const next: Plan['roomLabels'] = {};
  const claimed = new Set<Room>();
  for (const { label, room } of kept) {
    if (!carries(label) || claimed.has(room)) {
      changed = true;
      continue;
    }
    claimed.add(room);
    next[label.id] = label;
  }
  return changed ? { ...after, roomLabels: next } : after;
}

// Self-reconcile on load: drops orphans, re-pins stray default placements
// (CONTEXT.md: Room label).
export const dropOrphanRoomLabels = (plan: Plan): Plan => reconcileRoomLabels(plan, plan);

export function addRoomLabel(plan: Plan, name: string, x: number, y: number, placed?: true): [Plan, string] {
  const id = newId();
  const rounded = { id, name, x: Math.round(x), y: Math.round(y) };
  const label: RoomLabel = placed ? { ...rounded, placed } : rounded;
  return [{ ...plan, roomLabels: { ...plan.roomLabels, [id]: label } }, id];
}

export function renameRoomLabel(plan: Plan, id: string, name: string): Plan {
  const label = plan.roomLabels[id];
  if (!label) return plan;
  if (!carries({ ...label, name })) {
    const roomLabels = { ...plan.roomLabels };
    delete roomLabels[id];
    return { ...plan, roomLabels };
  }
  return { ...plan, roomLabels: { ...plan.roomLabels, [id]: { ...label, name } } };
}

// A move is the user's placement gesture (CONTEXT.md: Room label).
export function moveRoomLabel(plan: Plan, id: string, x: number, y: number): Plan {
  const label = plan.roomLabels[id];
  if (!label) return plan;
  return {
    ...plan,
    roomLabels: {
      ...plan.roomLabels,
      [id]: { ...label, x: Math.round(x), y: Math.round(y), placed: true },
    },
  };
}

// Not moveRoomLabel: the room carries its label along, so `placed` stays put.
function translateRoomLabel(plan: Plan, id: string, dx: number, dy: number): Plan {
  const label = plan.roomLabels[id];
  if (!label) return plan;
  return {
    ...plan,
    roomLabels: {
      ...plan.roomLabels,
      [id]: { ...label, x: Math.round(label.x + dx), y: Math.round(label.y + dy) },
    },
  };
}

/** A room whose every boundary wall moved translates rigidly, label included
 *  (CONTEXT.md: Room label). The rooms are read off `before`, where the labels
 *  still sit at their pre-move positions. */
export function translateRoomLabelsWithRooms(
  before: Plan,
  next: Plan,
  movedWallIds: Set<string>,
  dx: number,
  dy: number,
): Plan {
  const labels = Object.values(before.roomLabels);
  if (labels.length === 0) return next;
  const rooms = detectRooms(before);
  let plan = next;
  for (const label of labels) {
    const room = roomAt(rooms, label.x, label.y);
    if (!room) continue;
    const wallIds = roomWallIds(before, room);
    if (wallIds !== null && wallIds.every((id) => movedWallIds.has(id))) {
      plan = translateRoomLabel(plan, label.id, dx, dy);
    }
  }
  return plan;
}
