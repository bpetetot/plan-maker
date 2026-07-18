// PROTOTYPE — wayfinder ticket 05. Shared presentational SVG pieces (no layout, no gestures).
import type { Opening, Plan, Snap, Wall } from './model'
import { WALL_T, fmtLen, wallLen, wallPts } from './model'

export const COLORS = {
  wall: '#2f2f2f',
  wallHover: '#7aa5f8',
  wallSelected: '#2563eb',
  snap: '#16a34a',
  preview: '#2563eb',
  invalid: '#dc2626',
}

export function GridDefs() {
  const minors = []
  for (let i = 10; i < 100; i += 10) {
    minors.push(<line key={`v${i}`} x1={i} y1={0} x2={i} y2={100} stroke="#f0f0f0" strokeWidth={1} />)
    minors.push(<line key={`h${i}`} x1={0} y1={i} x2={100} y2={i} stroke="#f0f0f0" strokeWidth={1} />)
  }
  return (
    <defs>
      <pattern id="grid" width={100} height={100} patternUnits="userSpaceOnUse">
        {minors}
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#dedede" strokeWidth={1} />
      </pattern>
    </defs>
  )
}

export function GridRect({ view }: { view: { x: number; y: number; w: number; h: number } }) {
  return <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#grid)" pointerEvents="none" />
}

export function WallLine({
  plan,
  wall,
  color,
  dashed,
}: {
  plan: Plan
  wall: Wall
  color?: string
  dashed?: boolean
}) {
  const [a, b] = wallPts(plan, wall)
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={color ?? COLORS.wall}
      strokeWidth={WALL_T}
      strokeLinecap="round"
      strokeDasharray={dashed ? '8 8' : undefined}
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
  const [a, b] = wallPts(plan, wall)
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke="transparent"
      strokeWidth={WALL_T * 2.6}
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
  onPointerDown,
  interactive,
}: {
  plan: Plan
  opening: Opening
  ghost?: boolean
  selected?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  interactive?: boolean
}) {
  const w = plan.walls[opening.wall]
  if (!w) return null
  const [a, b] = wallPts(plan, w)
  const L = wallLen(plan, w)
  if (L < 1) return null
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  const cx = a.x + ((b.x - a.x) * opening.center) / L
  const cy = a.y + ((b.y - a.y) * opening.center) / L
  const hw = opening.width / 2
  const stroke = selected ? COLORS.wallSelected : ghost ? COLORS.preview : COLORS.wall
  return (
    <g
      transform={`translate(${cx},${cy}) rotate(${ang})`}
      opacity={ghost ? 0.55 : 1}
      style={interactive ? { cursor: 'move' } : undefined}
      onPointerDown={onPointerDown}
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      {/* gap in the wall */}
      <rect x={-hw} y={-WALL_T / 2 - 1} width={opening.width} height={WALL_T + 2} fill="#ffffff" />
      {opening.kind === 'door' ? (
        <>
          <line x1={-hw} y1={0} x2={-hw} y2={-opening.width} stroke={stroke} strokeWidth={3} />
          <path
            d={`M ${hw} 0 A ${opening.width} ${opening.width} 0 0 0 ${-hw} ${-opening.width}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        </>
      ) : (
        <>
          <line x1={-hw} y1={-3} x2={hw} y2={-3} stroke={stroke} strokeWidth={2} />
          <line x1={-hw} y1={3} x2={hw} y2={3} stroke={stroke} strokeWidth={2} />
          <line x1={-hw} y1={-WALL_T / 2} x2={-hw} y2={WALL_T / 2} stroke={stroke} strokeWidth={2} />
          <line x1={hw} y1={-WALL_T / 2} x2={hw} y2={WALL_T / 2} stroke={stroke} strokeWidth={2} />
        </>
      )}
      {/* fat hit target for selecting/dragging the opening */}
      {interactive && <rect x={-hw} y={-WALL_T * 1.4} width={opening.width} height={WALL_T * 2.8} fill="transparent" />}
    </g>
  )
}

export function DimLabel({ plan, wall }: { plan: Plan; wall: Wall }) {
  const [a, b] = wallPts(plan, wall)
  const L = wallLen(plan, wall)
  if (L < 20) return null
  let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  if (ang > 90) ang -= 180
  else if (ang <= -90) ang += 180
  return (
    <g transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2}) rotate(${ang})`} pointerEvents="none">
      <text y={-WALL_T - 4} textAnchor="middle" className="dim">
        {fmtLen(L)}
      </text>
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

// Rubber-band wall while drawing, with a live length label.
export function RubberWall({
  from,
  to,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
}) {
  const L = Math.hypot(to.x - from.x, to.y - from.y)
  let ang = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
  if (ang > 90) ang -= 180
  else if (ang <= -90) ang += 180
  return (
    <g pointerEvents="none">
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={COLORS.preview}
        strokeWidth={WALL_T}
        strokeLinecap="round"
        opacity={0.5}
      />
      {L > 20 && (
        <g transform={`translate(${(from.x + to.x) / 2},${(from.y + to.y) / 2}) rotate(${ang})`}>
          <text y={-WALL_T - 4} textAnchor="middle" className="dim dim-live">
            {fmtLen(L)}
          </text>
        </g>
      )}
    </g>
  )
}
