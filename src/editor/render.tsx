// Presentational SVG pieces, shared by the editor and the PNG export (WYSIWYG).
import { faceSpan, junctionPatches, wallOutline } from '../model/faces'
import { wallLength, wallPoints } from '../model/geometry'
import { formatArea, formatLength } from '../model/format'
import { openingPlacement, openingRail } from '../model/openings'
import type { Room } from '../model/rooms'
import type { ElementRef } from '../model/selection'
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

// Abutting same-colored polygons (wall bodies, junction patches) share exact
// edges, and the browser anti-aliases each edge against the background
// independently — the background bleeds through the shared edge as a hairline
// seam. A half-screen-pixel self-colored stroke overlaps the neighbours just
// enough to close it, at every zoom.
const seamStroke = (paint: string) =>
  ({
    stroke: paint,
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke',
    strokeLinejoin: 'round',
  }) as const

export function WallLine({ plan, wall, color }: { plan: Plan; wall: Wall; color?: string }) {
  const outline = wallOutline(plan, wall)
  const points = outline.map((p) => `${p.x},${p.y}`).join(' ')
  const paint = color ?? COLORS.wall
  const gaps = Object.values(plan.openings).filter((o) => o.wallId === wall.id)
  if (gaps.length === 0) {
    return <polygon points={points} fill={paint} {...seamStroke(paint)} pointerEvents="none" />
  }
  // Openings cut real holes in the body (mask), so whatever lies beneath —
  // the Grid — stays visible through the gap. Region: the outline's bbox,
  // grown past the ±1 cm the gap rects overhang the faces.
  const xs = outline.map((p) => p.x)
  const ys = outline.map((p) => p.y)
  const x = Math.min(...xs) - 2
  const y = Math.min(...ys) - 2
  const maskId = `wall-gaps-${wall.id}`
  return (
    <g pointerEvents="none">
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x={x}
        y={y}
        width={Math.max(...xs) - x + 2}
        height={Math.max(...ys) - y + 2}
      >
        <rect x={x} y={y} width={Math.max(...xs) - x + 2} height={Math.max(...ys) - y + 2} fill="#fff" />
        {gaps.map((o) => {
          const placement = openingPlacement(plan, o)
          // a window's jambs are not drawn over the wall — they ARE the wall:
          // the cut leaves a half-jamb strip of body uncut at each end, so the
          // jamb shares the wall's polygon and can never mis-register with its
          // faces (doors keep the full-width cut)
          const inset = o.type === 'window' ? WINDOW_JAMB / 2 : 0
          return placement ? (
            <rect
              key={o.id}
              transform={`translate(${placement.cx},${placement.cy}) rotate(${placement.angleDeg})`}
              x={-o.width / 2 + inset}
              y={-wall.thickness / 2 - 1}
              width={o.width - 2 * inset}
              height={wall.thickness + 2}
              fill="#000"
            />
          ) : null
        })}
      </mask>
      <polygon points={points} fill={paint} {...seamStroke(paint)} mask={`url(#${maskId})`} />
    </g>
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
      {junctionPatches(plan).map(({ pointId, wallIds, corners }) => {
        const paint = wallIds.filter((id) => selected.has(id)).length >= 2 ? COLORS.wallSelected : COLORS.wall
        return (
          <polygon
            key={pointId}
            points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
            fill={paint}
            {...seamStroke(paint)}
          />
        )
      })}
    </g>
  )
}

// Grab-zone margin around an element's body, per side, in screen px
// (CONTEXT.md: Grab zone). Converted to plan units at the current zoom so it
// stays constant on screen, whatever the wall's thickness.
const GRAB_MARGIN_PX = 2
const grabMargin = (pxPerCm: number) => GRAB_MARGIN_PX / pxPerCm

// Invisible grab zone for a wall; render above visible geometry.
export function WallGrabZone({
  plan,
  wall,
  pxPerCm,
  cursor,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: {
  plan: Plan
  wall: Wall
  pxPerCm: number
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
      strokeWidth={wall.thickness + 2 * grabMargin(pxPerCm)}
      strokeLinecap="square"
      style={{ cursor: cursor ?? 'pointer' }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    />
  )
}

// Full width of a window jamb bar, centered on each end of the wall gap.
// WallLine's mask leaves the inner half-bar of wall body uncut under each bar:
// that strip shares the wall's polygon, so whatever sub-pixel shortfall the
// bar's own edges have, the gap fills with wall color — never the background.
// The glyph still paints the bars on top, in its own tint: they must stay in
// the glyph's register (dark on a selected wall, accent on a selected window,
// preview on a ghost), not take the wall body's.
const WINDOW_JAMB = 1.5

// Door geometry in the door's local frame (center of the wall gap, wall along
// x) — single source shared by the visible glyph and the invisible grab zone.
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
      {/* a placed opening's gap is cut from the wall by WallLine's mask; the
          ghost is not in the plan, so it previews its future hole itself */}
      {ghost && (
        <rect
          x={-halfWidth}
          y={-thickness / 2 - 1}
          width={opening.width}
          height={thickness + 2}
          fill="var(--sheet)"
        />
      )}
      {opening.type === 'door' ? (
        <g transform={doorMirror(opening)}>
          <line {...doorLeaf(opening)} stroke={stroke} strokeWidth={2} />
          {/* solid hairline: a dashed arc would read as "above the cut plane"
              in section convention */}
          <path d={doorArc(opening)} fill="none" stroke={stroke} strokeWidth={1} />
        </g>
      ) : (
        <>
          <line x1={-halfWidth} y1={-3} x2={halfWidth} y2={-3} stroke={stroke} strokeWidth={1.5} />
          <line x1={-halfWidth} y1={3} x2={halfWidth} y2={3} stroke={stroke} strokeWidth={1.5} />
          {[-halfWidth, halfWidth].map((x) => (
            <rect
              key={x}
              x={x - WINDOW_JAMB / 2}
              y={-thickness / 2}
              width={WINDOW_JAMB}
              height={thickness}
              fill={stroke}
              {...seamStroke(stroke)}
            />
          ))}
        </>
      )}
    </g>
  )
}

// Grabbable stroke width for the door leaf/arc grab shapes, in screen px
// (non-scaling-stroke keeps it constant at every zoom level — no unit
// conversion needed, unlike grabMargin, because no plan-unit body is added).
const DOOR_GRAB_STROKE = 12

// Invisible grab zone for an opening (its full span on the wall).
// Render AFTER wall grab zones so clicking the opening's span wins (spec §4).
export function OpeningGrabZone({
  plan,
  opening,
  pxPerCm,
  onPointerDown,
}: {
  plan: Plan
  opening: Opening
  pxPerCm: number
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  const wall = plan.walls[opening.wallId]
  const placement = openingPlacement(plan, opening)
  if (!wall || !placement) return null
  const halfWidth = opening.width / 2
  const halfHeight = wall.thickness / 2 + grabMargin(pxPerCm)
  return (
    <g
      transform={`translate(${placement.cx},${placement.cy}) rotate(${placement.angleDeg})`}
      style={{ cursor: 'move' }}
      onPointerDown={onPointerDown}
    >
      <rect x={-halfWidth} y={-halfHeight} width={opening.width} height={halfHeight * 2} fill="transparent" />
      {/* the door leaf and swing arc are grabbable too */}
      {opening.type === 'door' && (
        <g transform={doorMirror(opening)}>
          <line
            {...doorLeaf(opening)}
            stroke="transparent"
            strokeWidth={DOOR_GRAB_STROKE}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={doorArc(opening)}
            fill="none"
            stroke="transparent"
            strokeWidth={DOOR_GRAB_STROKE}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </g>
  )
}

// Distance from the wall centerline to the line the dimension text is
// vertically centered on — the same line the rails materialise. A constant
// 10 cm from the wall face, whatever the thickness.
const dimLineOffset = (wall: Wall) => wall.thickness / 2 + 10

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

// Dimension text size in the editor; the PNG export renders a notch larger
// and passes its own via PlanScene. The advance width of one measure-font
// character derives from it (JetBrains Mono: 0.6 em), so every width estimate
// follows the font size. Placement chips keep the 9px font, hence their own
// constant.
const DIM_FONT_PX = 8
const measureCharPx = (fontPx: number) => 0.6 * fontPx
const CHIP_CHAR_PX = 5.4

// The plate under a dimension text: a rounded sheet-coloured reserve covering
// the whole text box, spaces included, so grid, walls and neighbouring
// dimension lines never show through a measure.
const PLATE_PAD_X = 2
const PLATE_PAD_Y = 1
const PLATE_RX = 2
const plateHalfWidth = (label: string, fontPx: number) =>
  (label.length * measureCharPx(fontPx)) / 2 + PLATE_PAD_X

// A measure text on its plate, centered on (x, y). The plate is the measure's
// mask — the text itself carries no halo.
function DimText({
  label,
  className,
  fontPx = DIM_FONT_PX,
  x = 0,
  y = 0,
}: {
  label: string
  className: string
  fontPx?: number
  x?: number
  y?: number
}) {
  const half = plateHalfWidth(label, fontPx)
  const halfH = fontPx / 2 + PLATE_PAD_Y
  return (
    <>
      <rect
        x={x - half}
        y={y - halfH}
        width={2 * half}
        height={2 * halfH}
        rx={PLATE_RX}
        fill="var(--sheet)"
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontPx}
        className={className}
      >
        {label}
      </text>
    </>
  )
}

const EXTENT_STROKE = 1

// ISO arrowheads bound the measured extent: a filled triangle at each end,
// its tip exactly on the extent boundary — the value stays exact whatever
// the head's size. All in plan units, like the extent line itself.
const ARROW_LEN = 7
const ARROW_HALF_WIDTH = 2.2

// The broken dimension line DimLabel draws: a piece on each side of the text
// gap (only where it has room) and an ISO arrowhead at each end of the
// measured extent. When the span has room for the heads and the text, the
// heads sit inside it pointing outward; on a shorter span they move outside,
// pointing inward at each other as bare triangles — the ISO convention when
// space runs out, minus the leader tails past the heads.
function ExtentLine({
  at,
  ux,
  uy,
  from,
  to,
  gapFrom,
  gapTo,
  stroke = 'var(--dim-line)',
}: {
  at: (t: number) => { x: number; y: number }
  ux: number
  uy: number
  from: number
  to: number
  gapFrom: number
  gapTo: number
  stroke?: string
}) {
  const gapWidth = Math.max(0, Math.min(gapTo, to) - Math.max(gapFrom, from))
  const inside = to - from >= 2 * ARROW_LEN + gapWidth + 8
  // line pieces stop at the arrow bases when the heads sit inside the extent
  const start = inside ? from + ARROW_LEN : from
  const end = inside ? to - ARROW_LEN : to
  const g1 = Math.max(start, Math.min(gapFrom, end))
  const g2 = Math.min(end, Math.max(gapTo, start))
  const seg = (key: string, t1: number, t2: number) => {
    const p = at(t1)
    const q = at(t2)
    return <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={stroke} strokeWidth={EXTENT_STROKE} />
  }
  return (
    <g pointerEvents="none">
      {g1 - start > 2 && seg('a', start, g1)}
      {end - g2 > 2 && seg('b', g2, end)}
      {[
        { t: from, dir: inside ? 1 : -1 },
        { t: to, dir: inside ? -1 : 1 },
      ].map(({ t, dir }, i) => {
        const tip = at(t)
        const bx = tip.x + ux * ARROW_LEN * dir
        const by = tip.y + uy * ARROW_LEN * dir
        const points = [
          `${tip.x},${tip.y}`,
          `${bx + uy * ARROW_HALF_WIDTH},${by - ux * ARROW_HALF_WIDTH}`,
          `${bx - uy * ARROW_HALF_WIDTH},${by + ux * ARROW_HALF_WIDTH}`,
        ].join(' ')
        return <polygon key={i} points={points} fill={stroke} {...seamStroke(stroke)} />
      })}
    </g>
  )
}

// The Rail (CONTEXT.md): the travel of a dimension text's center along its
// wall, as ratios of the axis length. The plate stays clear of the
// arrowheads — flush with their bases when the heads sit inside the extent,
// free to reach the extent bounds when a short span pushes them outside. A
// span too narrow for the plate collapses the travel to its middle, and the
// stored ratio must stay in [0, 1] (schema), so the bounds are intersected
// with it last.
export function dimTravelBounds(plan: Plan, wall: Wall, side: 1 | -1, fontPx = DIM_FONT_PX) {
  const length = wallLength(plan, wall)
  if (length < 1) return { min: 0.5, max: 0.5 }
  const span = faceSpan(plan, wall, side)
  const half = plateHalfWidth(formatLength(Math.max(0, span.to - span.from)), fontPx)
  const inside = span.to - span.from >= 2 * ARROW_LEN + 2 * half + 8
  const margin = inside ? ARROW_LEN + half : half
  let min = (span.from + margin) / length
  let max = (span.to - margin) / length
  if (min > max) min = max = (min + max) / 2
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
  return { min: clamp01(min), max: clamp01(max) }
}

// Automatic dimension on every wall, always visible (spec §4). It measures
// exactly the wall's rendered silhouette on the side it sits on — the mitered
// Face corners at junction ends, the body overhang at free ends — drawn as a
// broken dimension line with ISO arrowheads at the measured extent. The
// text sits at wall.dimPlacement when set (ratio along the axis, side across
// it), else at the midpoint, above the reading line (upper side for
// horizontal walls, left side for vertical ones). With onPointerDown it
// becomes a drag handle (Select tool); it is never part of the selection.
export function DimLabel({
  plan,
  wall,
  selected,
  fontPx = DIM_FONT_PX,
  onPointerDown,
}: {
  plan: Plan
  wall: Wall
  selected?: boolean
  fontPx?: number
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
  // the line breaks exactly at the plate's edges. The arrowheads are always
  // drawn — that legibility is the point when a value refines at a new
  // junction — even when no line piece has room.
  const gapHalf = plateHalfWidth(label, fontPx)
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
          stroke={selected ? COLORS.wallSelected : undefined}
        />
      )}
      <g
        transform={`translate(${mid.x},${mid.y}) rotate(${angle})`}
        pointerEvents={onPointerDown ? 'auto' : 'none'}
        style={onPointerDown ? { cursor: 'move' } : undefined}
        onPointerDown={onPointerDown}
      >
        {onPointerDown && <rect x={-30} y={-8} width={60} height={16} fill="transparent" />}
        <DimText label={label} fontPx={fontPx} className={selected ? 'dim dim-selected' : 'dim'} />
      </g>
    </g>
  )
}

// The chip's on-screen metrics, in screen pixels: 9px measure text plus 5px
// of padding on each side.
const CHIP_HEIGHT = 16
const chipWidth = (label: string) => label.length * CHIP_CHAR_PX + 10

// Placement dimensions: the pair of temporary measures flanking an opening,
// shown while it is placed or moved and, past the release, for as long as it
// stays in the selection (CONTEXT.md: Placement dimension).
//
// Each is the clearance left to one end of the opening's Rail — a mitered Face
// corner, a free end's overhang, or the near edge of a neighbouring opening —
// so every value is tape-measurable, and reads zero exactly when the opening
// can travel no further.
//
// It is deliberately not drawn as a Dimension: no dimension line, no ticks, no
// witness lines, no offset from a face. Each value is a filled accent chip
// centred on the clearance it measures, on the wall's axis, inside the wall
// body — the one position no other register occupies, so it coexists with the
// wall's Dimension instead of displacing it. Being interaction chrome, the chip
// holds a constant size on screen while its centre stays in plan coordinates
// (ADR 0005): it never shrinks, never shifts and never disappears, so a chip
// wider than its clearance simply overflows it. A clearance reduced to nothing
// shows no chip; the other side shows its own normally. Editor feedback —
// deliberately absent from PlanScene.
export function PlacementDims({ plan, opening, pxPerCm }: { plan: Plan; opening: Opening; pxPerCm: number }) {
  const wall = plan.walls[opening.wallId]
  const placement = openingPlacement(plan, opening)
  if (!wall || !placement) return null
  const { a, ux, uy, angle } = dimLineFrame(plan, wall)
  // point on the wall axis at distance t from the start Point
  const at = (t: number) => ({ x: a.x + ux * t, y: a.y + uy * t })
  // a screen pixel expressed in plan units, so the chip keeps its size at
  // every zoom while its centre stays where it measures
  const k = 1 / Math.max(pxPerCm, 0.0001)
  const half = opening.width / 2
  const rail = openingRail(plan, wall, placement.offset, opening.id)
  const segments = [
    { key: 'start', from: rail.from, to: placement.offset - half },
    { key: 'end', from: placement.offset + half, to: rail.to },
  ]
  return (
    <g pointerEvents="none">
      {segments.map(({ key, from, to }) => {
        const len = to - from
        if (Math.round(len) < 1) return null
        const label = formatLength(len)
        const mid = at((from + to) / 2)
        const w = chipWidth(label)
        return (
          <g key={key} transform={`translate(${mid.x},${mid.y}) rotate(${angle}) scale(${k})`}>
            <rect
              x={-w / 2}
              y={-CHIP_HEIGHT / 2}
              width={w}
              height={CHIP_HEIGHT}
              rx={CHIP_HEIGHT / 2}
              fill="var(--accent)"
            />
            <text textAnchor="middle" dominantBaseline="central" className="placement-chip">
              {label}
            </text>
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
      x: room.anchor.x,
      y: room.anchor.y,
      labels: defaults,
      room,
      area: !oldest || defaults.includes(oldest) ? room.areaCm2 : undefined,
    })
  }
  return blocks
}

// Vertical pitch of a block's text lines; the editor positions its inline
// name input on the same grid.
export const BLOCK_LINE_HEIGHT = 13

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
// The area line is a Measure and follows the Measure toggle; the name lines
// are not, and always show (CONTEXT.md: Measure).
export function RoomOverlay({
  rooms,
  labels,
  measuresVisible,
  editingKey,
  onLinePointerDown,
  onLineDoubleClick,
}: {
  rooms: Room[]
  labels: RoomLabel[]
  measuresVisible: boolean
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
      y={y - 10}
      width={100}
      height={13}
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
        const area = measuresVisible ? block.area : undefined
        // creating a label on an unlabeled room also reserves a name slot
        const slots = named.length > 0 ? named.length : block.key === editingKey ? 1 : 0
        const areaY = slots > 0 ? slots * BLOCK_LINE_HEIGHT : 5
        // a block that renders nothing (nameless label whose room is gone, or
        // a bare area with measures hidden) must not linger as an invisible
        // drag target
        if (named.length === 0 && area === undefined) return null
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
          <DimText label={formatLength(length + thickness)} className="dim dim-live" y={-thickness - 7} />
        </g>
      )}
    </g>
  )
}

// The full plan as it should appear in a PNG export: walls, openings, room
// labels/areas, dimensions — no selection, no UI chrome (spec §7).
// Hidden measures are hidden from the export too (ADR 0008), so the scene
// takes the on-screen preference rather than always printing measures.
export function PlanScene({
  plan,
  rooms,
  measuresVisible,
  dimFontPx,
}: {
  plan: Plan
  rooms: Room[]
  measuresVisible: boolean
  dimFontPx?: number
}) {
  return (
    <>
      {Object.values(plan.walls).map((wall) => (
        <WallLine key={wall.id} plan={plan} wall={wall} />
      ))}
      <JunctionPatches plan={plan} />
      {Object.values(plan.openings).map((opening) => (
        <OpeningGlyph key={opening.id} plan={plan} opening={opening} />
      ))}
      <RoomOverlay rooms={rooms} labels={Object.values(plan.roomLabels)} measuresVisible={measuresVisible} />
      {measuresVisible &&
        Object.values(plan.walls).map((wall) => (
          <DimLabel key={wall.id} plan={plan} wall={wall} fontPx={dimFontPx} />
        ))}
    </>
  )
}
