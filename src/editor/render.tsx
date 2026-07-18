// Presentational SVG pieces, shared by the editor and the PNG export (WYSIWYG).
import { wallLength, wallPoints } from '../model/geometry'
import { formatArea, formatLength } from '../model/format'
import { openingPlacement } from '../model/openings'
import type { Room } from '../model/rooms'
import { roomAt } from '../model/rooms'
import type { Opening, Plan, RoomLabel, Wall } from '../model/types'
import type { Snap } from '../model/snap'

export const COLORS = {
  wall: '#2f2f2f',
  wallHover: '#7aa5f8',
  wallSelected: '#2563eb',
  snap: '#16a34a',
  preview: '#2563eb',
  label: '#374151',
}

const labelAngle = (dx: number, dy: number) => {
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI
  if (angle > 90) angle -= 180
  else if (angle <= -90) angle += 180
  return angle
}

export function WallLine({ plan, wall, color }: { plan: Plan; wall: Wall; color?: string }) {
  const [a, b] = wallPoints(plan, wall)
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={color ?? COLORS.wall}
      strokeWidth={wall.thickness}
      strokeLinecap="round"
      pointerEvents="none"
    />
  )
}

// Invisible fat hit target for a wall; render above visible geometry.
export function WallHit({
  plan,
  wall,
  cursor,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: {
  plan: Plan
  wall: Wall
  cursor?: string
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
}) {
  const [a, b] = wallPoints(plan, wall)
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke="transparent"
      strokeWidth={wall.thickness * 2.6}
      strokeLinecap="round"
      style={{ cursor: cursor ?? 'pointer' }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    />
  )
}

export function OpeningGlyph({
  plan,
  opening,
  ghost,
  selected,
}: {
  plan: Plan
  opening: Opening
  ghost?: boolean
  selected?: boolean
}) {
  const wall = plan.walls[opening.wallId]
  const placement = openingPlacement(plan, opening)
  if (!wall || !placement) return null
  const halfWidth = opening.width / 2
  const thickness = wall.thickness
  const stroke = selected ? COLORS.wallSelected : ghost ? COLORS.preview : COLORS.wall
  return (
    <g
      transform={`translate(${placement.cx},${placement.cy}) rotate(${placement.angleDeg})`}
      opacity={ghost ? 0.55 : 1}
      pointerEvents="none"
    >
      {/* gap in the wall */}
      <rect
        x={-halfWidth}
        y={-thickness / 2 - 1}
        width={opening.width}
        height={thickness + 2}
        fill="#ffffff"
      />
      {opening.type === 'door' ? (
        <g transform={`scale(${opening.hingeSide === 'end' ? -1 : 1},${opening.swing === 'out' ? -1 : 1})`}>
          <line x1={-halfWidth} y1={0} x2={-halfWidth} y2={-opening.width} stroke={stroke} strokeWidth={3} />
          <path
            d={`M ${halfWidth} 0 A ${opening.width} ${opening.width} 0 0 0 ${-halfWidth} ${-opening.width}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        </g>
      ) : (
        <>
          <line x1={-halfWidth} y1={-3} x2={halfWidth} y2={-3} stroke={stroke} strokeWidth={2} />
          <line x1={-halfWidth} y1={3} x2={halfWidth} y2={3} stroke={stroke} strokeWidth={2} />
          <line
            x1={-halfWidth}
            y1={-thickness / 2}
            x2={-halfWidth}
            y2={thickness / 2}
            stroke={stroke}
            strokeWidth={2}
          />
          <line
            x1={halfWidth}
            y1={-thickness / 2}
            x2={halfWidth}
            y2={thickness / 2}
            stroke={stroke}
            strokeWidth={2}
          />
        </>
      )}
    </g>
  )
}

// Invisible fat hit target for an opening (its full span on the wall).
// Render AFTER wall hit targets so clicking the opening's span wins (spec §4).
export function OpeningHit({
  plan,
  opening,
  onPointerDown,
}: {
  plan: Plan
  opening: Opening
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  const wall = plan.walls[opening.wallId]
  const placement = openingPlacement(plan, opening)
  if (!wall || !placement) return null
  const halfWidth = opening.width / 2
  return (
    <g
      transform={`translate(${placement.cx},${placement.cy}) rotate(${placement.angleDeg})`}
      style={{ cursor: 'move' }}
      onPointerDown={onPointerDown}
    >
      <rect
        x={-halfWidth}
        y={-wall.thickness * 1.6}
        width={opening.width}
        height={wall.thickness * 3.2}
        fill="transparent"
      />
    </g>
  )
}

// Automatic dimension on every wall, always visible (spec §4).
export function DimLabel({ plan, wall }: { plan: Plan; wall: Wall }) {
  const [a, b] = wallPoints(plan, wall)
  const length = wallLength(plan, wall)
  if (length < 20) return null
  const angle = labelAngle(b.x - a.x, b.y - a.y)
  return (
    <g transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2}) rotate(${angle})`} pointerEvents="none">
      <text y={-wall.thickness - 4} textAnchor="middle" className="dim">
        {formatLength(length)}
      </text>
    </g>
  )
}

// Room area at the room's label when it has one, else at its centroid; labels
// outside any room still render their name (spec §2: label association is
// positional).
export function RoomOverlay({
  rooms,
  labels,
  onLabelPointerDown,
  selectedLabelId,
}: {
  rooms: Room[]
  labels: RoomLabel[]
  onLabelPointerDown?: (label: RoomLabel, e: React.PointerEvent) => void
  selectedLabelId?: string | null
}) {
  const labeledRooms = new Set<Room>()
  const entries: { key: string; x: number; y: number; name?: string; area?: number; label?: RoomLabel }[] = []
  for (const label of labels) {
    const room = roomAt(rooms, label.x, label.y)
    if (room && !labeledRooms.has(room)) {
      labeledRooms.add(room)
      entries.push({ key: label.id, x: label.x, y: label.y, name: label.name, area: room.areaCm2, label })
    } else {
      entries.push({ key: label.id, x: label.x, y: label.y, name: label.name, label })
    }
  }
  for (const room of rooms) {
    if (!labeledRooms.has(room)) {
      entries.push({
        key: `room-${room.pointIds.join(':')}`,
        x: room.centroid.x,
        y: room.centroid.y,
        area: room.areaCm2,
      })
    }
  }
  return (
    <g>
      {entries.map((entry) => (
        <g
          key={entry.key}
          transform={`translate(${entry.x},${entry.y})`}
          style={entry.label && onLabelPointerDown ? { cursor: 'move' } : undefined}
          onPointerDown={
            entry.label && onLabelPointerDown ? (e) => onLabelPointerDown(entry.label!, e) : undefined
          }
          pointerEvents={entry.label && onLabelPointerDown ? 'auto' : 'none'}
        >
          {entry.name && (
            <text
              textAnchor="middle"
              className={
                entry.label && selectedLabelId === entry.label.id ? 'room-name selected' : 'room-name'
              }
            >
              {entry.name}
            </text>
          )}
          {entry.area !== undefined && (
            <text y={entry.name ? 16 : 5} textAnchor="middle" className="room-area">
              {formatArea(entry.area)}
            </text>
          )}
          {entry.label && onLabelPointerDown && (
            <rect x={-50} y={-16} width={100} height={36} fill="transparent" />
          )}
        </g>
      ))}
    </g>
  )
}

export function SnapMarker({ snap }: { snap: Snap | null }) {
  if (!snap) return null
  return (
    <g pointerEvents="none">
      {snap.kind === 'axis' && snap.axisFrom && (
        <line
          x1={snap.axisFrom.x}
          y1={snap.axisFrom.y}
          x2={snap.x}
          y2={snap.y}
          stroke={COLORS.snap}
          strokeWidth={1.5}
          strokeDasharray="6 6"
        />
      )}
      {snap.kind === 'point' ? (
        <circle cx={snap.x} cy={snap.y} r={10} fill="none" stroke={COLORS.snap} strokeWidth={2.5} />
      ) : (
        <circle cx={snap.x} cy={snap.y} r={3.5} fill={COLORS.snap} />
      )}
    </g>
  )
}

export function Handle({
  x,
  y,
  onPointerDown,
}: {
  x: number
  y: number
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  return (
    <circle
      cx={x}
      cy={y}
      r={8}
      fill="#fff"
      stroke={COLORS.wallSelected}
      strokeWidth={2.5}
      style={{ cursor: 'grab' }}
      onPointerDown={onPointerDown}
    />
  )
}

// Rubber-band wall while drawing, with a live length label (spec §4).
export function RubberWall({
  from,
  to,
  thickness = 10,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  thickness?: number
}) {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const angle = labelAngle(to.x - from.x, to.y - from.y)
  return (
    <g pointerEvents="none">
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={COLORS.preview}
        strokeWidth={thickness}
        strokeLinecap="round"
        opacity={0.5}
      />
      {length > 20 && (
        <g transform={`translate(${(from.x + to.x) / 2},${(from.y + to.y) / 2}) rotate(${angle})`}>
          <text y={-thickness - 4} textAnchor="middle" className="dim dim-live">
            {formatLength(length)}
          </text>
        </g>
      )}
    </g>
  )
}

// The full plan as it should appear in a PNG export: walls, openings, room
// labels/areas, dimensions — no selection, no UI chrome (spec §7).
export function PlanScene({ plan, rooms }: { plan: Plan; rooms: Room[] }) {
  return (
    <>
      {Object.values(plan.walls).map((wall) => (
        <WallLine key={wall.id} plan={plan} wall={wall} />
      ))}
      {Object.values(plan.openings).map((opening) => (
        <OpeningGlyph key={opening.id} plan={plan} opening={opening} />
      ))}
      <RoomOverlay rooms={rooms} labels={Object.values(plan.roomLabels)} />
      {Object.values(plan.walls).map((wall) => (
        <DimLabel key={wall.id} plan={plan} wall={wall} />
      ))}
    </>
  )
}
