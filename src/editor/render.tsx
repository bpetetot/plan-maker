// Presentational SVG pieces, shared by the editor and the PNG export (WYSIWYG).
import { faceLength, faceSpan, wallOutline } from '../model/faces'
import { wallLength, wallPoints } from '../model/geometry'
import { formatArea, formatLength } from '../model/format'
import { openingPlacement } from '../model/openings'
import type { Room } from '../model/rooms'
import { roomAt } from '../model/rooms'
import type { Door, Opening, Plan, RoomLabel, Wall } from '../model/types'
import type { Snap } from '../model/snap'

// Theme-aware paints: the values live in styles.css (light under :root, dark
// under [data-theme='dark']). The PNG export pins the light values in its own
// <style> block, so the standalone SVG resolves them without the document.
export const COLORS = {
  wall: 'var(--wall)',
  wallHover: 'var(--wall-hover)',
  wallSelected: 'var(--accent)',
  snap: 'var(--snap)',
  preview: 'var(--accent)',
  label: 'var(--label)',
}

// ISO convention: label text reads from the bottom or the right of the sheet,
// so vertical text is -90 (bottom-to-top), never +90.
export const labelAngle = (dx: number, dy: number) => {
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI
  if (angle >= 90) angle -= 180
  else if (angle < -90) angle += 180
  return angle
}

export function WallLine({ plan, wall, color }: { plan: Plan; wall: Wall; color?: string }) {
  const outline = wallOutline(plan, wall)
  return (
    <polygon
      points={outline.map((p) => `${p.x},${p.y}`).join(' ')}
      fill={color ?? COLORS.wall}
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

// Door geometry in the door's local frame (center of the wall gap, wall along
// x) — single source shared by the visible glyph and the invisible hit target.
const doorMirror = (door: Door) =>
  `scale(${door.hingeSide === 'end' ? -1 : 1},${door.swing === 'out' ? -1 : 1})`
const doorLeaf = (door: Door) => ({
  x1: -door.width / 2,
  y1: 0,
  x2: -door.width / 2,
  y2: -door.width,
})
const doorArc = (door: Door) =>
  `M ${door.width / 2} 0 A ${door.width} ${door.width} 0 0 0 ${-door.width / 2} ${-door.width}`

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
        fill="var(--sheet)"
      />
      {opening.type === 'door' ? (
        <g transform={doorMirror(opening)}>
          <line {...doorLeaf(opening)} stroke={stroke} strokeWidth={3} />
          <path d={doorArc(opening)} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="4 4" />
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

// Grabbable stroke width for the door leaf/arc hit shapes, in screen px
// (non-scaling-stroke keeps it constant at every zoom level).
const DOOR_HIT_STROKE = 12

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
      {/* the door leaf and swing arc are grabbable too */}
      {opening.type === 'door' && (
        <g transform={doorMirror(opening)}>
          <line
            {...doorLeaf(opening)}
            stroke="transparent"
            strokeWidth={DOOR_HIT_STROKE}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={doorArc(opening)}
            fill="none"
            stroke="transparent"
            strokeWidth={DOOR_HIT_STROKE}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </g>
  )
}

// Distance from the wall centerline to the line the dimension text is
// vertically centered on — the same line the rails materialise (4px gap from
// the wall face + half the 11px text height).
const dimLineOffset = (wall: Wall) => wall.thickness + 8

// Frame of a wall's dimension line, shared by everything that draws on it:
// unit axis, ISO reading angle (and whether it flipped the wall's own frame),
// and the side the line sits on — the stored placement, else the default look
// (upper side for horizontal walls, left side for vertical ones), as a sign
// along the start→end left normal.
function dimLineFrame(plan: Plan, wall: Wall) {
  const [a, b] = wallPoints(plan, wall)
  const length = wallLength(plan, wall)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const raw = (Math.atan2(dy, dx) * 180) / Math.PI
  const angle = labelAngle(dx, dy)
  const flipped = angle !== raw
  const side = wall.dimPlacement ? wall.dimPlacement.side : flipped ? 1 : -1
  return { a, b, length, ux: dx / length, uy: dy / length, angle, flipped, side, off: dimLineOffset(wall) }
}

// Automatic dimension on every wall, always visible (spec §4). Sits at
// wall.dimPlacement when set (ratio along the axis, side across it), else at
// the midpoint, above the text's reading line (upper side for horizontal
// walls, left side for vertical ones). With onPointerDown it becomes a drag handle
// (Select tool); it is never part of the selection.
export function DimLabel({
  plan,
  wall,
  onPointerDown,
}: {
  plan: Plan
  wall: Wall
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  const { a, length, ux, uy, angle, flipped, side, off } = dimLineFrame(plan, wall)
  if (length < 20) return null
  // a dimension measures what it runs along: the face on the side it sits on
  const value = faceLength(plan, wall, side)
  // labelAngle keeps the text readable; when it flips the frame, local +y
  // points along -n (n = left normal of start→end), so map the side back
  // into the rotated frame.
  const t = wall.dimPlacement?.t ?? 0.5
  const y = side * (flipped ? -1 : 1) * off
  return (
    <g
      transform={`translate(${a.x + ux * length * t},${a.y + uy * length * t}) rotate(${angle})`}
      pointerEvents={onPointerDown ? 'auto' : 'none'}
      style={onPointerDown ? { cursor: 'move' } : undefined}
      onPointerDown={onPointerDown}
    >
      {onPointerDown && <rect x={-30} y={y - 8} width={60} height={16} fill="transparent" />}
      <text y={y} textAnchor="middle" dominantBaseline="central" className="dim">
        {formatLength(value)}
      </text>
    </g>
  )
}

// Rails: the two lines the dimension text is centered on while dragged, shown
// on the dragged wall only, from drag threshold to pointer release. They span
// the label's actual travel — one wall thickness of padding at each end, the
// same bound setDimPlacement enforces. Editor feedback — deliberately absent
// from PlanScene (never printed).
export function DimRails({ plan, wall }: { plan: Plan; wall: Wall }) {
  const [a, b] = wallPoints(plan, wall)
  const length = wallLength(plan, wall)
  const pad = wall.thickness
  if (length <= 2 * pad) return null
  const ux = (b.x - a.x) / length
  const uy = (b.y - a.y) / length
  const off = dimLineOffset(wall)
  return (
    <g pointerEvents="none">
      {[1, -1].map((side) => (
        <line
          key={side}
          x1={a.x + ux * pad - uy * side * off}
          y1={a.y + uy * pad + ux * side * off}
          x2={b.x - ux * pad - uy * side * off}
          y2={b.y - uy * pad + ux * side * off}
          stroke="var(--rail)"
          strokeWidth={1}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

// Placement dimensions: the pair of temporary dimensions flanking an opening
// while it is being placed or moved — each runs from a wall end to the near
// edge of the opening, ignoring neighbouring openings, on the same line the
// wall's (temporarily hidden) Dimension sits on. A side whose segment rounds
// to 0 cm shows nothing; a segment too short for its text keeps the text and
// drops the line. Editor feedback — deliberately absent from PlanScene.
export function PlacementDims({ plan, opening }: { plan: Plan; opening: Opening }) {
  const wall = plan.walls[opening.wallId]
  const placement = openingPlacement(plan, opening)
  if (!wall || !placement) return null
  const { a, ux, uy, angle, side, off } = dimLineFrame(plan, wall)
  // point on the dimension line at distance t along the wall axis
  const at = (t: number) => ({ x: a.x + ux * t - uy * side * off, y: a.y + uy * t + ux * side * off })
  const half = opening.width / 2
  // like any dimension, each side measures what it runs along: the face on
  // the side the dims sit on (the Point when the wall end is free)
  const span = faceSpan(plan, wall, side as 1 | -1)
  const segments = [
    { key: 'start', from: span.from, to: placement.offset - half },
    { key: 'end', from: placement.offset + half, to: span.to },
  ]
  return (
    <g pointerEvents="none">
      {segments.map(({ key, from, to }) => {
        const len = to - from
        if (Math.round(len) < 1) return null
        const label = formatLength(len)
        const mid = at((from + to) / 2)
        // 9px text ≈ 5 units per character; the line breaks around it
        const gapHalf = label.length * 2.5 + 4
        const withLine = len / 2 > gapHalf + 4
        const p1 = at(from)
        const p2 = at(to)
        const g1 = at((from + to) / 2 - gapHalf)
        const g2 = at((from + to) / 2 + gapHalf)
        return (
          <g key={key}>
            {withLine && (
              <>
                {/* the dimension line, broken around the text */}
                <line x1={p1.x} y1={p1.y} x2={g1.x} y2={g1.y} stroke="var(--rail)" strokeWidth={1} />
                <line x1={g2.x} y1={g2.y} x2={p2.x} y2={p2.y} stroke="var(--rail)" strokeWidth={1} />
                {/* perpendicular ticks at both ends */}
                {[p1, p2].map((p, i) => (
                  <line
                    key={i}
                    x1={p.x + uy * 4}
                    y1={p.y - ux * 4}
                    x2={p.x - uy * 4}
                    y2={p.y + ux * 4}
                    stroke="var(--rail)"
                    strokeWidth={1}
                  />
                ))}
              </>
            )}
            <g transform={`translate(${mid.x},${mid.y}) rotate(${angle})`}>
              <text textAnchor="middle" dominantBaseline="central" className="dim dim-placement">
                {label}
              </text>
            </g>
          </g>
        )
      })}
    </g>
  )
}

// One text block per room — the optional name above the area — anchored at
// the room's label when it has one, else at its centroid. Labels outside any
// room still render their name (spec §2: label association is positional).
export interface RoomTextBlock {
  key: string
  x: number
  y: number
  label?: RoomLabel
  // the detected room this block belongs to; unset for a label outside any
  // room, or shadowed by an earlier label of the same room
  room?: Room
  name?: string
  area?: number
}

export function roomTextBlocks(rooms: Room[], labels: RoomLabel[]): RoomTextBlock[] {
  const labeledRooms = new Set<Room>()
  const blocks: RoomTextBlock[] = []
  for (const label of labels) {
    const room = roomAt(rooms, label.x, label.y)
    if (room && !labeledRooms.has(room)) {
      labeledRooms.add(room)
      blocks.push({
        key: label.id,
        x: label.x,
        y: label.y,
        name: label.name,
        area: room.areaCm2,
        label,
        room,
      })
    } else {
      blocks.push({ key: label.id, x: label.x, y: label.y, name: label.name, label })
    }
  }
  for (const room of rooms) {
    if (!labeledRooms.has(room)) {
      blocks.push({
        key: `room-${room.pointIds.join(':')}`,
        x: room.centroid.x,
        y: room.centroid.y,
        area: room.areaCm2,
        room,
      })
    }
  }
  return blocks
}

// Room labels are never selected — the block is dragged and double-click-edited
// directly (CONTEXT.md: Selection). While the block named by editingKey is
// edited the editor overlays an input on its name line, so the name text hides
// but the area keeps its two-line offset.
export function RoomOverlay({
  rooms,
  labels,
  editingKey,
  onBlockPointerDown,
  onBlockDoubleClick,
}: {
  rooms: Room[]
  labels: RoomLabel[]
  editingKey?: string
  onBlockPointerDown?: (block: RoomTextBlock, e: React.PointerEvent) => void
  onBlockDoubleClick?: (block: RoomTextBlock, e: React.MouseEvent) => void
}) {
  return (
    <g>
      {roomTextBlocks(rooms, labels).map((block) => {
        const editing = block.key === editingKey
        const nameLine = Boolean(block.name) || editing
        // a block that renders nothing (nameless label whose room is gone)
        // must not linger as an invisible drag target
        const interactive =
          Boolean(onBlockPointerDown || onBlockDoubleClick) && (nameLine || block.area !== undefined)
        return (
          <g
            key={block.key}
            transform={`translate(${block.x},${block.y})`}
            style={interactive ? { cursor: 'move' } : undefined}
            onPointerDown={
              interactive && onBlockPointerDown ? (e) => onBlockPointerDown(block, e) : undefined
            }
            onDoubleClick={
              interactive && onBlockDoubleClick ? (e) => onBlockDoubleClick(block, e) : undefined
            }
            pointerEvents={interactive ? 'auto' : 'none'}
          >
            {block.name && !editing && (
              <text textAnchor="middle" className="room-name">
                {block.name}
              </text>
            )}
            {block.area !== undefined && (
              <text y={nameLine ? 14 : 5} textAnchor="middle" className="room-area">
                {formatArea(block.area)}
              </text>
            )}
            {interactive && <rect x={-50} y={-16} width={100} height={36} fill="transparent" />}
          </g>
        )
      })}
    </g>
  )
}

export function SnapMarker({ snap }: { snap: Snap | null }) {
  if (!snap) return null
  return (
    <g pointerEvents="none">
      {/* the dashed guide shows whenever a locked axis produced the position —
          including a wall snap corrected to the axis ∩ wall intersection */}
      {snap.axisFrom && (
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
      ) : snap.kind === 'wall' ? (
        // hollow marker: the click will join (and split) this wall
        <circle cx={snap.x} cy={snap.y} r={6.5} fill="none" stroke={COLORS.snap} strokeWidth={2.5} />
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
      fill="var(--sheet)"
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
  thickness,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  thickness: number
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
