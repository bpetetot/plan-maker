import type { Room } from './rooms';
import { detectRooms, roomAt, roomContains, roomWallIds } from './rooms';
import type { Plan, RoomProfile } from './types';
import { newId } from './types';

// What a room carries of its own (CONTEXT.md: Room profile): a profile
// belongs to its room, not to a position.

// Reconciliation keeps at most one profile per room (CONTEXT.md: Room profile);
// profiles iterate in creation order, so the oldest wins if state ever slipped.
export const roomProfileAt = (plan: Plan, room: Room): RoomProfile | null =>
  Object.values(plan.roomProfiles).find((profile) => roomContains(room, profile.x, profile.y)) ?? null;

const sameLoop = (a: Room, b: Room) => {
  if (a.pointIds.length !== b.pointIds.length) return false;
  const ids = new Set(b.pointIds);
  return a.pointIds.every((id) => ids.has(id));
};

// A profile carries a name, a custom placement, or a condemned mark; one
// carrying none of them does not exist (CONTEXT.md: Room profile).
const carries = (profile: RoomProfile): boolean =>
  Boolean(profile.name || profile.placed || profile.condemned);

// Creates the profile at the anchor when the room has none; lifting the mark
// deletes a profile it leaves carrying nothing (CONTEXT.md: Condemned).
export function setRoomCondemned(plan: Plan, room: Room, condemned: boolean): Plan {
  const existing = roomProfileAt(plan, room);
  if (condemned) {
    if (existing?.condemned) return plan;
    const profile: RoomProfile = existing
      ? { ...existing, condemned: true }
      : {
          id: newId(),
          name: '',
          x: Math.round(room.anchor.x),
          y: Math.round(room.anchor.y),
          condemned: true,
        };
    return { ...plan, roomProfiles: { ...plan.roomProfiles, [profile.id]: profile } };
  }
  if (!existing?.condemned) return plan;
  const stripped = { ...existing };
  delete stripped.condemned;
  const roomProfiles = { ...plan.roomProfiles };
  if (carries(stripped)) roomProfiles[stripped.id] = stripped;
  else delete roomProfiles[stripped.id];
  return { ...plan, roomProfiles };
}

/** The rooms among `rooms` marked condemned by a profile they contain
 *  (CONTEXT.md: Condemned). */
export function condemnedRooms(rooms: Room[], profiles: RoomProfile[]): Set<Room> {
  const condemned = new Set<Room>();
  for (const profile of profiles) {
    if (!profile.condemned) continue;
    const room = roomAt(rooms, profile.x, profile.y);
    if (room) condemned.add(room);
  }
  return condemned;
}

// A profile belongs to its room, not a position (CONTEXT.md: Room profile): home
// room matched by loop, not containment, so a passing wall cannot steal it.
export function reconcileRoomProfiles(before: Plan, after: Plan): Plan {
  const profiles = Object.values(after.roomProfiles);
  if (profiles.length === 0) return after;
  const roomsAfter = detectRooms(after);
  const roomsBefore = before === after ? roomsAfter : detectRooms(before);
  let changed = false;
  const kept: { profile: RoomProfile; room: Room }[] = [];
  for (const profile of profiles) {
    // a rigid group move may already have moved the profile: home room comes
    // from its pre-change position
    const pos = before.roomProfiles[profile.id] ?? profile;
    const homeBefore = roomAt(roomsBefore, pos.x, pos.y);
    const home = homeBefore ? (roomsAfter.find((room) => sameLoop(room, homeBefore)) ?? null) : null;
    const room = home ?? roomAt(roomsAfter, profile.x, profile.y);
    if (!room) {
      changed = true;
      continue;
    }
    if (profile.placed && roomContains(room, profile.x, profile.y)) {
      kept.push({ profile, room });
      continue;
    }
    const x = Math.round(room.anchor.x);
    const y = Math.round(room.anchor.y);
    if (profile.placed || profile.x !== x || profile.y !== y) {
      changed = true;
      const pinned = { ...profile, x, y };
      delete pinned.placed;
      kept.push({ profile: pinned, room });
    } else {
      kept.push({ profile, room });
    }
  }
  // one profile per room: profiles iterate in creation order, the first claim wins
  // — and a profile that carries nothing claims none, or it would evict a name.
  const next: Plan['roomProfiles'] = {};
  const claimed = new Set<Room>();
  for (const { profile, room } of kept) {
    if (!carries(profile) || claimed.has(room)) {
      changed = true;
      continue;
    }
    claimed.add(room);
    next[profile.id] = profile;
  }
  return changed ? { ...after, roomProfiles: next } : after;
}

// Self-reconcile on load: drops orphans, re-pins stray default placements
// (CONTEXT.md: Room profile).
export const dropOrphanRoomProfiles = (plan: Plan): Plan => reconcileRoomProfiles(plan, plan);

export function addRoomProfile(
  plan: Plan,
  name: string,
  x: number,
  y: number,
  placed?: true,
): [Plan, string] {
  const id = newId();
  const rounded = { id, name, x: Math.round(x), y: Math.round(y) };
  const profile: RoomProfile = placed ? { ...rounded, placed } : rounded;
  return [{ ...plan, roomProfiles: { ...plan.roomProfiles, [id]: profile } }, id];
}

export function renameRoomProfile(plan: Plan, id: string, name: string): Plan {
  const profile = plan.roomProfiles[id];
  if (!profile) return plan;
  if (!carries({ ...profile, name })) {
    const roomProfiles = { ...plan.roomProfiles };
    delete roomProfiles[id];
    return { ...plan, roomProfiles };
  }
  return { ...plan, roomProfiles: { ...plan.roomProfiles, [id]: { ...profile, name } } };
}

// A move is the user's placement gesture (CONTEXT.md: Room profile).
export function moveRoomProfile(plan: Plan, id: string, x: number, y: number): Plan {
  const profile = plan.roomProfiles[id];
  if (!profile) return plan;
  return {
    ...plan,
    roomProfiles: {
      ...plan.roomProfiles,
      [id]: { ...profile, x: Math.round(x), y: Math.round(y), placed: true },
    },
  };
}

// Not moveRoomProfile: the room carries its profile along, so `placed` stays put.
function translateRoomProfile(plan: Plan, id: string, dx: number, dy: number): Plan {
  const profile = plan.roomProfiles[id];
  if (!profile) return plan;
  return {
    ...plan,
    roomProfiles: {
      ...plan.roomProfiles,
      [id]: { ...profile, x: Math.round(profile.x + dx), y: Math.round(profile.y + dy) },
    },
  };
}

/** A room whose every boundary wall moved translates rigidly, profile included
 *  (CONTEXT.md: Room profile). The rooms are read off `before`, where the profiles
 *  still sit at their pre-move positions. */
export function translateRoomProfilesWithRooms(
  before: Plan,
  next: Plan,
  movedWallIds: Set<string>,
  dx: number,
  dy: number,
): Plan {
  const profiles = Object.values(before.roomProfiles);
  if (profiles.length === 0) return next;
  const rooms = detectRooms(before);
  let plan = next;
  for (const profile of profiles) {
    const room = roomAt(rooms, profile.x, profile.y);
    if (!room) continue;
    const wallIds = roomWallIds(before, room);
    if (wallIds !== null && wallIds.every((id) => movedWallIds.has(id))) {
      plan = translateRoomProfile(plan, profile.id, dx, dy);
    }
  }
  return plan;
}
