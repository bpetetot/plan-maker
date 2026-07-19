// Presentational SVG pieces, shared by the editor and the PNG export (WYSIWYG).
import { faceSpan, junctionPatches, wallOutline } from '../model/faces'
import { wallLength, wallPoints } from '../model/geometry'
import { formatArea, formatLength } from '../model/format'
import { openingPlacement } from '../model/openings'
import type { Room } from '../model/rooms'
import type { ElementRef } from '../model/selection'
import { interiorSide, roomAt } from '../model/rooms'
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

// Junction patches: the polygons filling the central gaps wall outlines leave
// at T and angled crossings (CONTEXT.md: Face). A patch belongs to every wall
// at its Point, so it never takes a single wall's hover tint; it reads as
// selected — never selectable itself — once the junction is between selected
// walls: at least two of its walls in the Selection (CONTEXT.md: Selection).
export function JunctionPatches({ plan, selection }: { plan: Plan; selection?: ElementRef[] }) {
  const selected = new Set((selection ?? []).filter((r) => r.type === 'wall').map((r) => r.id))
  return (
    <g pointerEvents="none">
      {junctionPatches(plan).map(({ pointId, wallIds, corners }) => (
        <polygon
          key={pointId}
          points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
          fill={wallIds.filter((id) => selected.has(id)).length >= 2 ? COLORS.wallSelected : COLORS.wall}
        />
      ))}
    </g>
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
  const side: 1 | -1 = wall.dimPlacement ? wall.dimPlacement.side : flipped ? 1 : -1
  return { a, b, length, ux: dx / length, uy: dy / length, angle, flipped, side, off: dimLineOffset(wall) }
}

// The broken dimension line shared by DimLabel and PlacementDims: a piece on
// each side of the text gap (only where it has room) and a perpendicular tick
// at each end of the measured extent.
function ExtentLine({
  at,
  ux,
  uy,
  from,
  to,
  gapFrom,
  gapTo,
}: {
  at: (t: number) => { x: number; y: number }
  ux: number
  uy: number
  from: number
  to: number
  gapFrom: number
  gapTo: number
}) {
  const p1 = at(from)
  const p2 = at(to)
  const g1 = at(Math.max(from, Math.min(gapFrom, to)))
  const g2 = at(Math.min(to, Math.max(gapTo, from)))
  return (
    <g pointerEvents="none">
      {gapFrom - from > 2 && (
        <line x1={p1.x} y1={p1.y} x2={g1.x} y2={g1.y} stroke="var(--rail)" strokeWidth={1} />
      )}
      {to - gapTo > 2 && (
        <line x1={g2.x} y1={g2.y} x2={p2.x} y2={p2.y} stroke="var(--rail)" strokeWidth={1} />
      )}
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
    </g>
  )
}

// Automatic dimension on every wall, always visible (spec §4). It measures
// exactly the wall's rendered silhouette on the side it sits on — the mitered
// Face corners at junction ends, the body overhang at free ends — drawn as a
// broken dimension line with perpendicular ticks at the measured extent. The
// text sits at wall.dimPlacement when set (ratio along the axis, side across
// it), else at the midpoint, above the reading line (upper side for
// horizontal walls, left side for vertical ones). With onPointerDown it
// becomes a drag handle (Select tool); it is never part of the selection.
export function DimLabel({
  plan,
  wall,
  onPointerDown,
}: {
  plan: Plan
  wall: Wall
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  const { a, length, ux, uy, angle, side, off } = dimLineFrame(plan, wall)
  if (length < 20) return null
  const span = faceSpan(plan, wall, side)
  const value = Math.max(0, span.to - span.from)
  const label = formatLength(value)
  // point on the dimension line at axis parameter t (cm from the start Point)
  const at = (t: number) => ({ x: a.x + ux * t - uy * side * off, y: a.y + uy * t + ux * side * off })
  const tText = (wall.dimPlacement?.t ?? 0.5) * length
  const mid = at(tText)
  // 11px text ≈ 5.5 units per character; the line breaks around it. The ticks
  // always mark the measured extent — that legibility is the point when a
  // value refines at a new junction — even when no line piece has room.
  const gapHalf = label.length * 2.75 + 4
  return (
    <g>
      {value >= 1 && (
        <ExtentLine
          at={at}
          ux={ux}
          uy={uy}
          from={span.from}
          to={span.to}
          gapFrom={tText - gapHalf}
          gapTo={tText + gapHalf}
        />
      )}
      <g
        transform={`translate(${mid.x},${mid.y}) rotate(${angle})`}
        pointerEvents={onPointerDown ? 'auto' : 'none'}
        style={onPointerDown ? { cursor: 'move' } : undefined}
        onPointerDown={onPointerDown}
      >
        {onPointerDown && <rect x={-30} y={-8} width={60} height={16} fill="transparent" />}
        <text textAnchor="middle" dominantBaseline="central" className="dim">
          {label}
        </text>
      </g>
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
// while it is being placed or moved. They sit on the interior side whenever
// the wall borders exactly one room, else on the side the wall's (temporarily
// hidden) Dimension sits on. Each runs to the near edge of the opening from
// the silhouette end on that side, or from the near edge of the closest
// neighbouring opening when one intervenes — every value is tape-measurable.
// A side whose segment rounds to 0 cm shows nothing; a segment too short for
// its text keeps the text and drops the line. Editor feedback — deliberately
// absent from PlanScene.
export function PlacementDims({ plan, opening, rooms }: { plan: Plan; opening: Opening; rooms: Room[] }) {
  const wall = plan.walls[opening.wallId]
  const placement = openingPlacement(plan, opening)
  if (!wall || !placement) return null
  const frame = dimLineFrame(plan, wall)
  const side = interiorSide(rooms, wall) ?? frame.side
  const { a, ux, uy, angle, off } = frame
  // point on the dimension line at distance t along the wall axis
  const at = (t: number) => ({ x: a.x + ux * t - uy * side * off, y: a.y + uy * t + ux * side * off })
  const half = opening.width / 2
  // outer bounds: the silhouette span on the chosen side, cut back to the
  // near edge of the closest neighbouring opening when one intervenes
  const span = faceSpan(plan, wall, side)
  let startBound = span.from
  let endBound = span.to
  for (const other of Object.values(plan.openings)) {
    if (other.wallId !== wall.id || other.id === opening.id) continue
    if (other.offset <= placement.offset) startBound = Math.max(startBound, other.offset + other.width / 2)
    else endBound = Math.min(endBound, other.offset - other.width / 2)
  }
  const segments = [
    { key: 'start', from: startBound, to: placement.offset - half },
    { key: 'end', from: placement.offset + half, to: endBound },
  ]
  return (
    <g pointerEvents="none">
      {segments.map(({ key, from, to }) => {
        const len = to - from
        if (Math.round(len) < 1) return null
        const label = formatLength(len)
        const mid = at((from + to) / 2)
        // 9px text ≈ 5 units per character; the line breaks around it. A
        // segment too short for its text keeps the text and drops the line.
        const gapHalf = label.length * 2.5 + 4
        const withLine = len / 2 > gapHalf + 4
        return (
          <g key={key}>
            {withLine && (
              <ExtentLine
                at={at}
                ux={ux}
                uy={uy}
                from={from}
                to={to}
                gapFrom={(from + to) / 2 - gapHalf}
                gapTo={(from + to) / 2 + gapHalf}
              />
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

// Room texts group into blocks (CONTEXT.md: Room label): a custom-placed
// label is its own block where it was dragged; a default-placement label
// renders at its room's live centroid — as does the bare area of an
// unlabeled room. Reconciliation keeps at most one label per room; should
// several ever coexist (injected state), the centroid block stacks them
// defensively, oldest first, and the oldest carries the area. A label
// outside any room cannot arise from plan operations either, but is
// defensively rendered as its name alone.
export interface RoomTextBlock {
  key: string
  x: number
  y: number
  // labels rendered in this block, oldest first; empty for the bare area
  // block of an unlabeled room
  labels: RoomLabel[]
  // the detected room this block belongs to; unset for an orphan label
  room?: Room
  // set when this block holds the room's area (its oldest label is here, or
  // the room has no label at all)
  area?: number
}

export function roomTextBlocks(rooms: Room[], labels: RoomLabel[]): RoomTextBlock[] {
  const blocks: RoomTextBlock[] = []
  const defaultsByRoom = new Map<Room, RoomLabel[]>()
  const oldestByRoom = new Map<Room, RoomLabel>()
  for (const label of labels) {
    const room = roomAt(rooms, label.x, label.y)
    if (room && !oldestByRoom.has(room)) oldestByRoom.set(room, label)
    if (room && !label.placed) {
      const defaults = defaultsByRoom.get(room)
      if (defaults) defaults.push(label)
      else defaultsByRoom.set(room, [label])
    } else {
      blocks.push({
        key: label.id,
        x: label.x,
        y: label.y,
        labels: [label],
        room: room ?? undefined,
        area: room && oldestByRoom.get(room) === label ? room.areaCm2 : undefined,
      })
    }
  }
  for (const room of rooms) {
    const defaults = defaultsByRoom.get(room) ?? []
    const oldest = oldestByRoom.get(room)
    if (defaults.length === 0 && oldest) continue // all labels custom: no centroid block
    blocks.push({
      key: defaults[0]?.id ?? `room-${room.pointIds.join(':')}`,
      x: room.centroid.x,
      y: room.centroid.y,
      labels: defaults,
      room,
      area: !oldest || defaults.includes(oldest) ? room.areaCm2 : undefined,
    })
  }
  return blocks
}

// Vertical pitch of a block's text lines; the editor positions its inline
// name input on the same grid.
export const BLOCK_LINE_HEIGHT = 14

// The labels of a block with a visible name slot: named, or being edited in
// place (the input overlays the slot, so the layout must keep reserving it).
// Shared with the editor so the input lands exactly on its line.
export const blockNameSlots = (block: RoomTextBlock, editingKey?: string) =>
  block.labels.filter((label) => label.name || label.id === editingKey)

// Room labels are never selected — each line of a block is dragged and
// double-click-edited directly (CONTEXT.md: Selection): a name line targets
// its label, the area line targets the block's oldest label (or, on an
// unlabeled room, a label to be created). While the line named by editingKey
// is edited the editor overlays an input on it, so its text hides but the
// slot stays and the area keeps its offset.
export function RoomOverlay({
  rooms,
  labels,
  editingKey,
  onLinePointerDown,
  onLineDoubleClick,
}: {
  rooms: Room[]
  labels: RoomLabel[]
  editingKey?: string
  onLinePointerDown?: (block: RoomTextBlock, label: RoomLabel | null, e: React.PointerEvent) => void
  onLineDoubleClick?: (block: RoomTextBlock, label: RoomLabel | null, e: React.MouseEvent) => void
}) {
  const interactive = Boolean(onLinePointerDown || onLineDoubleClick)
  const hitRect = (
    key: string,
    y: number,
    className: string,
    label: RoomLabel | null,
    block: RoomTextBlock,
  ) => (
    <rect
      key={key}
      className={className}
      x={-50}
      y={y - 12}
      width={100}
      height={16}
      fill="transparent"
      style={{ cursor: 'move' }}
      onPointerDown={onLinePointerDown ? (e) => onLinePointerDown(block, label, e) : undefined}
      onDoubleClick={onLineDoubleClick ? (e) => onLineDoubleClick(block, label, e) : undefined}
    />
  )
  return (
    <g>
      {roomTextBlocks(rooms, labels).map((block) => {
        const named = blockNameSlots(block, editingKey)
        // creating a label on an unlabeled room also reserves a name slot
        const slots = named.length > 0 ? named.length : block.key === editingKey ? 1 : 0
        const areaY = slots > 0 ? slots * BLOCK_LINE_HEIGHT : 5
        // a block that renders nothing (nameless label whose room is gone)
        // must not linger as an invisible drag target
        if (named.length === 0 && block.area === undefined) return null
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
            {block.area !== undefined && (
              <text y={areaY} textAnchor="middle" className="room-area">
                {formatArea(block.area)}
              </text>
            )}
            {interactive &&
              named.map((label, i) =>
                hitRect(`hit-${label.id}`, i * BLOCK_LINE_HEIGHT, 'room-name-hit', label, block),
              )}
            {interactive &&
              block.area !== undefined &&
              hitRect('hit-area', areaY, 'room-area-hit', block.labels[0] ?? null, block)}
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

// Rubber-band wall while drawing, with a live length label (spec §4). The
// ghost previews the future body honestly — square caps overhang each end by
// half the thickness — and the label reads the overall (hors-tout) extent:
// axis + thickness.
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
        strokeLinecap="square"
        opacity={0.5}
      />
      {length > 20 && (
        <g transform={`translate(${(from.x + to.x) / 2},${(from.y + to.y) / 2}) rotate(${angle})`}>
          <text y={-thickness - 4} textAnchor="middle" className="dim dim-live">
            {formatLength(length + thickness)}
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
      <JunctionPatches plan={plan} />
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
