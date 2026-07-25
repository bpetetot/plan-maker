import { formatArea } from '../model/format';
import type { Room } from '../model/rooms';
import { roomAt, roomKey } from '../model/rooms';
import type { RoomLabel } from '../model/types';

// CONTEXT.md: Room label. Reconciliation keeps one label per room and none
// outside a room; the extra cases here only guard injected state.
export interface RoomTextBlock {
  key: string;
  x: number;
  y: number;
  // oldest first
  labels: RoomLabel[];
  // unset for an orphan label
  room?: Room;
  // set only on the block carrying the room's area
  area?: number;
}

export function roomTextBlocks(rooms: Room[], labels: RoomLabel[]): RoomTextBlock[] {
  const blocks: RoomTextBlock[] = [];
  const defaultsByRoom = new Map<Room, RoomLabel[]>();
  const oldestByRoom = new Map<Room, RoomLabel>();
  for (const label of labels) {
    const room = roomAt(rooms, label.x, label.y);
    if (room && !oldestByRoom.has(room)) oldestByRoom.set(room, label);
    if (room && !label.placed) {
      const defaults = defaultsByRoom.get(room);
      if (defaults) defaults.push(label);
      else defaultsByRoom.set(room, [label]);
    } else {
      blocks.push({
        key: label.id,
        x: label.x,
        y: label.y,
        labels: [label],
        room: room ?? undefined,
        area: room && oldestByRoom.get(room) === label ? room.areaCm2 : undefined,
      });
    }
  }
  for (const room of rooms) {
    const defaults = defaultsByRoom.get(room) ?? [];
    const oldest = oldestByRoom.get(room);
    if (defaults.length === 0 && oldest) continue;
    blocks.push({
      key: defaults[0]?.id ?? `room-${roomKey(room)}`,
      x: room.anchor.x,
      y: room.anchor.y,
      labels: defaults,
      room,
      area: !oldest || defaults.includes(oldest) ? room.areaCm2 : undefined,
    });
  }
  return blocks;
}

// The editor positions its inline name input on this same grid.
export const BLOCK_LINE_HEIGHT = 13;

// A label being edited keeps its slot: the editor's input overlays it and must
// land on that line.
export const blockNameSlots = (block: RoomTextBlock, editingKey?: string) =>
  block.labels.filter((label) => label.name || label.id === editingKey);

/** Marks the blocks a click selects the room by, so the room tint can tell
 *  them from the grab zones that outrank the room (ADR 0014). */
export const ROOM_TEXT_HIT = 'room-text-hit';

// Room labels are never selected; lines are dragged and edited directly
// (CONTEXT.md: Selection). Only the area line is a Measure (CONTEXT.md).
export function RoomOverlay({
  rooms,
  labels,
  measuresVisible,
  editingKey,
  onLinePointerDown,
  onLineDoubleClick,
}: {
  rooms: Room[];
  labels: RoomLabel[];
  measuresVisible: boolean;
  editingKey?: string;
  onLinePointerDown?: (block: RoomTextBlock, label: RoomLabel | null, e: React.PointerEvent) => void;
  onLineDoubleClick?: (block: RoomTextBlock, label: RoomLabel | null, e: React.MouseEvent) => void;
}) {
  const interactive = Boolean(onLinePointerDown || onLineDoubleClick);
  const hitRect = (
    key: string,
    y: number,
    className: string,
    label: RoomLabel | null,
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
      onPointerDown={onLinePointerDown ? (e) => onLinePointerDown(block, label, e) : undefined}
      onDoubleClick={onLineDoubleClick ? (e) => onLineDoubleClick(block, label, e) : undefined}
    />
  );
  return (
    <g>
      {roomTextBlocks(rooms, labels).map((block) => {
        const named = blockNameSlots(block, editingKey);
        const area = measuresVisible ? block.area : undefined;
        // creating a label on an unlabeled room also reserves a name slot
        const slots = named.length > 0 ? named.length : block.key === editingKey ? 1 : 0;
        const areaY = slots > 0 ? slots * BLOCK_LINE_HEIGHT : 5;
        // a block that renders nothing must not linger as an invisible drag
        // target
        if (named.length === 0 && area === undefined) return null;
        return (
          <g key={block.key} transform={`translate(${block.x},${block.y})`}>
            {named.map(
              (label, i) =>
                label.id !== editingKey && (
                  <text key={label.id} y={i * BLOCK_LINE_HEIGHT} textAnchor="middle" className="room-name">
                    {label.name}
                  </text>
                ),
            )}
            {area !== undefined && (
              <text y={areaY} textAnchor="middle" className="room-area">
                {formatArea(area)}
              </text>
            )}
            {interactive &&
              named.map((label, i) =>
                hitRect(`hit-${label.id}`, i * BLOCK_LINE_HEIGHT, 'room-name-hit', label, block),
              )}
            {interactive &&
              area !== undefined &&
              hitRect('hit-area', areaY, 'room-area-hit', block.labels[0] ?? null, block)}
          </g>
        );
      })}
    </g>
  );
}
