import { formatArea } from '../model/format';
import type { Vec } from '../model/geometry';
import { condemnedRooms } from '../model/roomProfiles';
import type { Room } from '../model/rooms';
import { roomAt, roomKey } from '../model/rooms';
import type { RoomProfile } from '../model/types';

// Lines only, no ground: the editor's tints lie under the sheet and must keep
// showing through the hatching.
export function CondemnedHatching({ rooms, profiles }: { rooms: Room[]; profiles: RoomProfile[] }) {
  const condemned = [...condemnedRooms(rooms, profiles)];
  if (condemned.length === 0) return null;
  const loop = (points: Vec[]) => `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')} Z`;
  return (
    <g>
      <defs>
        <pattern
          id="condemned-hatch"
          patternUnits="userSpaceOnUse"
          width="14"
          height="14"
          patternTransform="rotate(45)"
        >
          <line className="condemned-hatch-line" x1="7" y1="0" x2="7" y2="14" />
        </pattern>
      </defs>
      {condemned.map((room) => (
        <path
          key={roomKey(room)}
          className="room-condemned"
          d={[room.polygon, ...room.holes].map(loop).join(' ')}
          fill="url(#condemned-hatch)"
          fillRule="evenodd"
          pointerEvents="none"
        />
      ))}
    </g>
  );
}

// CONTEXT.md: Room profile. Reconciliation keeps one profile per room and none
// outside a room; the extra cases here only guard injected state.
export interface RoomTextBlock {
  key: string;
  x: number;
  y: number;
  // oldest first
  profiles: RoomProfile[];
  // unset for an orphan profile
  room?: Room;
  // the block that speaks for its room: a floor double-click opens this one
  own: boolean;
  // set only on the own block, and never on a condemned room's
  area?: number;
}

export function roomTextBlocks(rooms: Room[], profiles: RoomProfile[]): RoomTextBlock[] {
  const blocks: RoomTextBlock[] = [];
  const silenced = condemnedRooms(rooms, profiles);
  const defaultsByRoom = new Map<Room, RoomProfile[]>();
  const oldestByRoom = new Map<Room, RoomProfile>();
  for (const profile of profiles) {
    const room = roomAt(rooms, profile.x, profile.y);
    if (room && !oldestByRoom.has(room)) oldestByRoom.set(room, profile);
    if (room && !profile.placed) {
      const defaults = defaultsByRoom.get(room);
      if (defaults) defaults.push(profile);
      else defaultsByRoom.set(room, [profile]);
    } else {
      const own = Boolean(room && oldestByRoom.get(room) === profile);
      blocks.push({
        key: profile.id,
        x: profile.x,
        y: profile.y,
        profiles: [profile],
        room: room ?? undefined,
        own,
        area: room && own && !silenced.has(room) ? room.areaCm2 : undefined,
      });
    }
  }
  for (const room of rooms) {
    const defaults = defaultsByRoom.get(room) ?? [];
    const oldest = oldestByRoom.get(room);
    if (defaults.length === 0 && oldest) continue;
    const own = !oldest || defaults.includes(oldest);
    blocks.push({
      key: defaults[0]?.id ?? `room-${roomKey(room)}`,
      x: room.anchor.x,
      y: room.anchor.y,
      profiles: defaults,
      room,
      own,
      area: own && !silenced.has(room) ? room.areaCm2 : undefined,
    });
  }
  return blocks;
}

// The editor positions its inline name input on this same grid.
export const BLOCK_LINE_HEIGHT = 13;

// A profile being edited keeps its slot: the editor's input overlays it and must
// land on that line.
export const blockNameSlots = (block: RoomTextBlock, editingKey?: string) =>
  block.profiles.filter((profile) => profile.name || profile.id === editingKey);

/** Marks the blocks a click selects the room by, so the room tint can tell
 *  them from the grab zones that outrank the room (ADR 0014). */
export const ROOM_TEXT_HIT = 'room-text-hit';

// Room profiles are never selected; lines are dragged and edited directly
// (CONTEXT.md: Selection). Only the area line is a Measure (CONTEXT.md).
export function RoomOverlay({
  rooms,
  profiles,
  measuresVisible,
  editingKey,
  onLinePointerDown,
  onLineDoubleClick,
}: {
  rooms: Room[];
  profiles: RoomProfile[];
  measuresVisible: boolean;
  editingKey?: string;
  onLinePointerDown?: (block: RoomTextBlock, profile: RoomProfile | null, e: React.PointerEvent) => void;
  onLineDoubleClick?: (block: RoomTextBlock, profile: RoomProfile | null, e: React.MouseEvent) => void;
}) {
  const interactive = Boolean(onLinePointerDown || onLineDoubleClick);
  const hitRect = (
    key: string,
    y: number,
    className: string,
    profile: RoomProfile | null,
    block: RoomTextBlock,
  ) => (
    <rect
      key={key}
      className={`${ROOM_TEXT_HIT} ${className}`}
      x={-50}
      y={y - 10}
      width={100}
      height={13}
      fill="transparent"
      style={{ cursor: 'move' }}
      onPointerDown={onLinePointerDown ? (e) => onLinePointerDown(block, profile, e) : undefined}
      onDoubleClick={onLineDoubleClick ? (e) => onLineDoubleClick(block, profile, e) : undefined}
    />
  );
  return (
    <g>
      {roomTextBlocks(rooms, profiles).map((block) => {
        const named = blockNameSlots(block, editingKey);
        const area = measuresVisible ? block.area : undefined;
        // creating a profile on an unlabeled room also reserves a name slot
        const slots = named.length > 0 ? named.length : block.key === editingKey ? 1 : 0;
        const areaY = slots > 0 ? slots * BLOCK_LINE_HEIGHT : 5;
        // a block that renders nothing must not linger as an invisible drag
        // target
        if (named.length === 0 && area === undefined) return null;
        return (
          <g key={block.key} transform={`translate(${block.x},${block.y})`}>
            {named.map(
              (profile, i) =>
                profile.id !== editingKey && (
                  <text key={profile.id} y={i * BLOCK_LINE_HEIGHT} textAnchor="middle" className="room-name">
                    {profile.name}
                  </text>
                ),
            )}
            {area !== undefined && (
              <text y={areaY} textAnchor="middle" className="room-area">
                {formatArea(area)}
              </text>
            )}
            {interactive &&
              named.map((profile, i) =>
                hitRect(`hit-${profile.id}`, i * BLOCK_LINE_HEIGHT, 'room-name-hit', profile, block),
              )}
            {interactive &&
              area !== undefined &&
              hitRect('hit-area', areaY, 'room-area-hit', block.profiles[0] ?? null, block)}
          </g>
        );
      })}
    </g>
  );
}
