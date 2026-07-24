import type { Vec } from './geometry';
import { wallPoints } from './geometry';
import { openingPlacement } from './openings';
import { deleteOpening, deleteRuler, deleteWall, setPoints, translateRoomLabel } from './operations';
import type { Room } from './rooms';
import {
  detectRooms,
  openingsOnWalls,
  reconcileRoomLabels,
  roomAt,
  roomKey,
  roomOpenings,
  roomOutlineWallIds,
  roomWallIds,
} from './rooms';
import type { Opening, Plan, Point } from './types';

// CONTEXT.md: Selection. Editor state, never the plan; room labels are never
// selected.

export interface ElementRef {
  type: 'wall' | 'opening' | 'ruler';
  id: string;
}

export const sameRef = (a: ElementRef, b: ElementRef) => a.type === b.type && a.id === b.id;

export const refKey = (ref: ElementRef) => `${ref.type}:${ref.id}`;

export const isSelected = (selection: ElementRef[], ref: ElementRef) =>
  selection.some((r) => sameRef(r, ref));

export function toggleRef(selection: ElementRef[], ref: ElementRef): ElementRef[] {
  return isSelected(selection, ref) ? selection.filter((r) => !sameRef(r, ref)) : [...selection, ref];
}

/** Everything a Selection can hold: every Wall, Opening, and Ruler the plan has
 *  (CONTEXT.md: Selection). Rulers join only while measures are shown, so the
 *  caller passes `includeRulers` — you can only select what is drawn. */
export function allElements(plan: Plan, includeRulers = false): ElementRef[] {
  return [
    ...Object.keys(plan.walls).map((id): ElementRef => ({ type: 'wall', id })),
    ...Object.keys(plan.openings).map((id): ElementRef => ({ type: 'opening', id })),
    ...(includeRulers ? Object.keys(plan.rulers).map((id): ElementRef => ({ type: 'ruler', id })) : []),
  ];
}

// Marquee capture: containment, not intersection. Wall thickness ignored.
// Rulers join only while measures are shown, so the caller passes `includeRulers`.
export function elementsInRect(plan: Plan, a: Vec, b: Vec, includeRulers = false): ElementRef[] {
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
  // Both endpoints inside, like a wall — one marquee, one capture semantic.
  if (includeRulers) {
    for (const ruler of Object.values(plan.rulers)) {
      if (inside(ruler.a.x, ruler.a.y) && inside(ruler.b.x, ruler.b.y)) {
        refs.push({ type: 'ruler', id: ruler.id });
      }
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
    else if (ref.type === 'opening') next = deleteOpening(next, ref.id);
    else next = deleteRuler(next, ref.id);
  }
  return reconcileRoomLabels(plan, next);
}

/** The walls Delete takes for a Room: its boundary minus every wall that is
 *  another room's outer-loop outline, so no neighbour is broken (ADR 0015).
 *  Openings ride along with their walls, so only walls are listed. */
export function roomDeletion(plan: Plan, rooms: Room[], room: Room): ElementRef[] {
  const wallIds = roomWallIds(plan, room);
  if (!wallIds) return [];
  const key = roomKey(room);
  const foreignOutline = new Set<string>();
  for (const other of rooms) {
    if (roomKey(other) === key) continue;
    for (const id of roomOutlineWallIds(plan, other)) foreignOutline.add(id);
  }
  return wallIds.filter((id) => !foreignOutline.has(id)).map((id): ElementRef => ({ type: 'wall', id }));
}

/** What Delete removes for a Selection: a Room keeps other rooms' walls
 *  (ADR 0015); any other Selection deletes exactly what it holds. */
export function selectionDeletion(plan: Plan, rooms: Room[], refs: ElementRef[]): ElementRef[] {
  const room = selectedRoom(plan, rooms, refs);
  return room ? roomDeletion(plan, rooms, room) : refs;
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
  // Rulers ride along rigidly: free coordinates, so both endpoints just shift
  // and `t` (a ratio) is untouched; they never anchor grid realignment.
  const rulerRefs = refs.filter((ref) => ref.type === 'ruler' && plan.rulers[ref.id]);
  const movesWalls = Object.keys(updates).length > 0;
  if (!movesWalls && rulerRefs.length === 0) return plan;

  let next = movesWalls ? setPoints(plan, updates) : plan;
  if (rulerRefs.length > 0) {
    const rulers = { ...next.rulers };
    for (const ref of rulerRefs) {
      const r = next.rulers[ref.id];
      rulers[ref.id] = {
        ...r,
        a: { x: Math.round(r.a.x + dx), y: Math.round(r.a.y + dy) },
        b: { x: Math.round(r.b.x + dx), y: Math.round(r.b.y + dy) },
      };
    }
    next = { ...next, rulers };
  }

  const labels = Object.values(plan.roomLabels);
  if (movesWalls && labels.length > 0) {
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
