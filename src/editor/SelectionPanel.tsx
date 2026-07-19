// Selection panel (spec .scratch/selection-panel/spec.md): fixed floating
// card on the left showing the selection's parameters and actions, hidden on
// empty selection. Values are derived on render (wallMeasures) — the panel
// can never disagree with the canvas Dimensions, including live during drags.
import { BrickWall, DoorClosed, FlipHorizontal2, FlipVertical2, Grid2x2, Layers, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatLength } from '../model/format'
import { setOpeningWidth, toggleHingeSide, toggleSwing } from '../model/operations'
import type { Room } from '../model/rooms'
import { wallMeasures } from '../model/rooms'
import type { ElementRef } from '../model/selection'
import type { Plan, Wall } from '../model/types'
import { OPENING_WIDTHS } from '../model/types'

interface SelectionPanelProps {
  plan: Plan
  rooms: Room[]
  sel: ElementRef[]
  setPlan: (updater: (plan: Plan) => Plan) => void
  onDelete: () => void
}

export function SelectionPanel({ plan, rooms, sel, setPlan, onDelete }: SelectionPanelProps) {
  if (sel.length === 0) return null
  const only = sel.length === 1 ? sel[0] : null
  const wall = only?.type === 'wall' ? (plan.walls[only.id] ?? null) : null
  const opening = only?.type === 'opening' ? (plan.openings[only.id] ?? null) : null
  if (only && !wall && !opening) return null

  const [Icon, title]: [LucideIcon, string] = !only
    ? [Layers, `${sel.length} elements`]
    : wall
      ? [BrickWall, 'Wall']
      : opening!.type === 'door'
        ? [DoorClosed, 'Door']
        : [Grid2x2, 'Window']

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-badge">
          <Icon size={15} aria-hidden />
        </span>
        <span className="panel-title">{title}</span>
      </div>
      {wall && (
        <section>
          <div className="panel-section-label">Dimensions</div>
          <WallRows plan={plan} rooms={rooms} wall={wall} />
        </section>
      )}
      {opening && (
        <section>
          <div className="panel-section-label">Width</div>
          <select
            className="panel-select"
            value={opening.width}
            onChange={(e) => setPlan((p) => setOpeningWidth(p, opening.id, Number(e.target.value)))}
          >
            {OPENING_WIDTHS.map((w) => (
              <option key={w} value={w}>
                {w} cm
              </option>
            ))}
          </select>
        </section>
      )}
      {opening?.type === 'door' && (
        <section>
          <div className="panel-section-label">Options</div>
          <div className="panel-flips">
            <button
              className="flip"
              title="Swap hinge side (left/right)"
              onClick={() => setPlan((p) => toggleHingeSide(p, opening.id))}
            >
              <FlipHorizontal2 size={14} aria-hidden /> Hinge
            </button>
            <button
              className="flip"
              title="Swap swing direction (inside/outside)"
              onClick={() => setPlan((p) => toggleSwing(p, opening.id))}
            >
              <FlipVertical2 size={14} aria-hidden /> Swing
            </button>
          </div>
        </section>
      )}
      <button className="danger panel-delete" title="Delete" aria-label="Delete" onClick={onDelete}>
        <Trash2 size={16} aria-hidden />
        Delete
      </button>
    </div>
  )
}

// Wall measure rows (spec §2): oriented Interior/Exterior when the wall
// borders exactly one room, a single hors-tout Length otherwise.
function WallRows({ plan, rooms, wall }: { plan: Plan; rooms: Room[]; wall: Wall }) {
  const m = wallMeasures(plan, rooms, wall)
  const rows =
    m.kind === 'oriented'
      ? ([
          ['Interior', m.interior],
          ['Exterior', m.exterior],
          ['Thickness', m.thickness],
        ] as const)
      : ([
          ['Length', m.length],
          ['Thickness', m.thickness],
        ] as const)
  return (
    <>
      {rows.map(([label, value]) => (
        <div key={label} className="panel-row">
          <span className="panel-row-label">{label}</span>
          <span className="panel-row-value">{formatLength(value)}</span>
        </div>
      ))}
    </>
  )
}
