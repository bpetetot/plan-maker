// Editor UX per spec §4 — variant A "Floating minimal" of the ticket 05
// prototype: full-bleed canvas, floating toolbar, click-to-click walls,
// contextual popover on the selection, dimensions always visible.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Vec } from '../model/geometry'
import { nearestWall, projectOnWall, wallLength, wallPoints } from '../model/geometry'
import { formatLength } from '../model/format'
import { openingPlacement } from '../model/openings'
import {
  addRoomLabel,
  addWall,
  clampOpeningOffset,
  ensurePoint,
  movePoint,
  moveOpening,
  moveRoomLabel,
  placeOpening,
  renameRoomLabel,
  setOpeningWidth,
  toggleHingeSide,
  toggleSwing,
} from '../model/operations'
import { detectRooms, roomAt } from '../model/rooms'
import type { ElementRef } from '../model/selection'
import {
  deleteElements,
  elementsInRect,
  isSelected,
  refKey,
  selectionBounds,
  toggleRef,
  translateElements,
} from '../model/selection'
import type { Snap } from '../model/snap'
import { snapPoint } from '../model/snap'
import type { Opening, Plan } from '../model/types'
import { defaultOpeningWidth, OPENING_WIDTHS, WALL_THICKNESS } from '../model/types'
import { beginHistoryGroup, endHistoryGroup, redo, undo, usePlanStore } from '../store/planStore'
import {
  COLORS,
  DimLabel,
  Handle,
  OpeningGlyph,
  OpeningHit,
  RoomOverlay,
  RubberWall,
  SnapMarker,
  WallHit,
  WallLine,
} from './render'
import { useSpaceHeld, useView } from './useView'

type Mode = 'select' | 'wall' | 'door' | 'window'
type Drag =
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'point'; id: string }
  | {
      kind: 'group'
      refs: ElementRef[]
      start: Vec
      orig: Plan
      // set when the drag started on an element of a multi-selection: a
      // movement below the click threshold collapses the selection to it
      clickRef?: ElementRef
      moved?: boolean
    }
  | { kind: 'opening'; id: string }
  | { kind: 'label'; id: string }
  // the live rect lives on the drag ref (b is mutated on move) so pointer-up
  // never reads a stale React state; the marquee state only drives rendering
  | { kind: 'marquee'; additive: boolean; prev: ElementRef[]; a: Vec; b: Vec }

// Below this movement (screen px) a marquee or group drag is a plain click.
const CLICK_PX = 4

const isTypingTarget = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable
}

export default function Editor() {
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { view, toPlan, pxPerCm, zoomCenter, panByPx, fitPlan } = useView(svgRef)
  const plan = usePlanStore((s) => s.plan)
  const setPlan = usePlanStore((s) => s.setPlan)
  const canUndo = useStore(usePlanStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(usePlanStore.temporal, (s) => s.futureStates.length > 0)
  const [mode, setMode] = useState<Mode>('select')
  const [sel, setSel] = useState<ElementRef[]>([])
  const [hoverWall, setHoverWall] = useState<string | null>(null)
  const [chain, setChain] = useState<{ start: string; last: string } | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [openPreview, setOpenPreview] = useState<{ wallId: string; offset: number } | null>(null)
  const [marquee, setMarquee] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(
    null,
  )
  const space = useSpaceHeld()
  const drag = useRef<Drag | null>(null)
  const alt = useRef(false)

  const rooms = useMemo(() => detectRooms(plan), [plan])

  const tolerance = () => 14 / pxPerCm()

  const switchMode = (m: Mode) => {
    setMode(m)
    setChain(null)
    setSnap(null)
    setOpenPreview(null)
    if (m !== 'select') setSel([])
  }

  const deleteSelection = useCallback(
    (selection: ElementRef[]) => {
      if (selection.length === 0) return
      setPlan((p) => deleteElements(p, selection))
      setSel([])
    },
    [setPlan],
  )

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return
      alt.current = e.altKey
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.key === 'Escape') {
        if (chain) setChain(null)
        else if (sel.length > 0) setSel([])
        else switchMode('select')
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection(sel)
      } else if (e.key === '1') switchMode('select')
      else if (e.key === '2') switchMode('wall')
      else if (e.key === '3') switchMode('door')
      else if (e.key === '4') switchMode('window')
    }
    const up = (e: KeyboardEvent) => {
      alt.current = e.altKey
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [chain, sel, deleteSelection])

  const startPlanDrag = (d: Drag) => {
    beginHistoryGroup()
    drag.current = d
  }

  const onSvgPointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    if (drag.current) {
      // a child handler already started a drag — just capture the pointer
      svg.setPointerCapture(e.pointerId)
      return
    }
    if (space || e.button === 1) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY }
      svg.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    const c = toPlan(e.clientX, e.clientY)
    if (mode === 'wall') {
      const anchor = chain ? plan.points[chain.last] : undefined
      const s = snapPoint(plan, c.x, c.y, { tolerance: tolerance(), anchor, free: alt.current })
      if (chain && s.pointId === chain.start && chain.last !== chain.start) {
        // clicking the chain's start point closes the room
        setPlan((p) => addWall(p, chain.last, chain.start))
        setChain(null)
        setSnap(null)
        return
      }
      const [withPoint, pointId] = ensurePoint(plan, s)
      let next = withPoint
      if (chain && chain.last !== pointId) next = addWall(next, chain.last, pointId)
      setPlan(() => next)
      setChain(chain ? { ...chain, last: pointId } : { start: pointId, last: pointId })
    } else if ((mode === 'door' || mode === 'window') && openPreview) {
      // keep the placement tool active, but select the new opening so its
      // actions popover shows right away
      const [next, id] = placeOpening(plan, openPreview.wallId, mode, openPreview.offset)
      setPlan(() => next)
      setSel(id ? [{ type: 'opening', id }] : [])
    } else if (mode === 'select') {
      // dragging on empty canvas draws a selection marquee; a click-sized
      // marquee resolves to "clear the selection" on pointer up
      drag.current = { kind: 'marquee', additive: e.shiftKey, prev: sel, a: c, b: c }
      setMarquee({ a: c, b: c })
      svg.setPointerCapture(e.pointerId)
    } else {
      // clicking empty canvas clears the selection in every non-wall mode
      setSel([])
    }
  }

  // Shared click grammar for walls, openings and labels: Shift+click toggles
  // membership; clicking an element of a multi-selection drags the whole
  // group; anything else selects just this element and starts its solo drag.
  const onElementPointerDown = (ref: ElementRef, e: React.PointerEvent, soloDrag: (c: Vec) => Drag) => {
    if (e.button !== 0 || space) return
    if (e.shiftKey) {
      // don't let the svg handler start a marquee on top of this toggle
      e.stopPropagation()
      setSel((s) => toggleRef(s, ref))
      return
    }
    const c = toPlan(e.clientX, e.clientY)
    if (sel.length > 1 && isSelected(sel, ref)) {
      startPlanDrag({ kind: 'group', refs: sel, start: c, orig: plan, clickRef: ref })
    } else {
      setSel([ref])
      startPlanDrag(soloDrag(c))
    }
  }

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const c = toPlan(e.clientX, e.clientY)
    const d = drag.current
    if (d) {
      if (d.kind === 'pan') {
        panByPx(e.clientX - d.x, e.clientY - d.y)
        drag.current = { kind: 'pan', x: e.clientX, y: e.clientY }
      } else if (d.kind === 'point') {
        const s = snapPoint(plan, c.x, c.y, {
          tolerance: tolerance(),
          exclude: new Set([d.id]),
          free: alt.current,
        })
        setPlan((p) => movePoint(p, d.id, s.x, s.y))
        setSnap(s)
      } else if (d.kind === 'group') {
        if (!d.moved && Math.hypot(c.x - d.start.x, c.y - d.start.y) * pxPerCm() >= CLICK_PX) {
          d.moved = true
        }
        if (d.moved) {
          const dx = Math.round((c.x - d.start.x) / 10) * 10
          const dy = Math.round((c.y - d.start.y) / 10) * 10
          setPlan(() => translateElements(d.orig, d.refs, dx, dy))
        }
      } else if (d.kind === 'marquee') {
        d.b = c
        setMarquee({ a: d.a, b: c })
      } else if (d.kind === 'opening') {
        const opening = plan.openings[d.id]
        if (opening) {
          const { t } = projectOnWall(plan, plan.walls[opening.wallId], c.x, c.y)
          setPlan((p) => moveOpening(p, d.id, t))
        }
      } else if (d.kind === 'label') {
        setPlan((p) => moveRoomLabel(p, d.id, c.x, c.y))
      }
      return
    }
    if (mode === 'wall') {
      const anchor = chain ? plan.points[chain.last] : undefined
      setSnap(snapPoint(plan, c.x, c.y, { tolerance: tolerance(), anchor, free: alt.current }))
    } else if (mode === 'door' || mode === 'window') {
      const near = nearestWall(plan, c.x, c.y, 40 / pxPerCm() + WALL_THICKNESS)
      if (near) {
        const offset = clampOpeningOffset(plan, near.wall, near.t, defaultOpeningWidth(mode))
        setOpenPreview(offset === null ? null : { wallId: near.wall.id, offset })
      } else setOpenPreview(null)
    }
  }

  const onSvgPointerUp = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (d.kind === 'marquee') {
      const wPx = Math.abs(d.b.x - d.a.x) * pxPerCm()
      const hPx = Math.abs(d.b.y - d.a.y) * pxPerCm()
      if (wPx < CLICK_PX && hPx < CLICK_PX) {
        setSel(d.additive ? d.prev : [])
      } else {
        const captured = elementsInRect(plan, d.a, d.b)
        setSel(d.additive ? [...d.prev, ...captured.filter((r) => !isSelected(d.prev, r))] : captured)
      }
      setMarquee(null)
      return
    }
    // a click (no movement) on an element of a multi-selection collapses the
    // selection to that element instead of dragging the group
    if (d.kind === 'group' && !d.moved && d.clickRef) setSel([d.clickRef])
    if (d.kind === 'point') setSnap(null)
    if (d.kind !== 'pan') endHistoryGroup()
  }

  const selKeys = useMemo(() => new Set(sel.map(refKey)), [sel])
  const selectedLabelIds = useMemo(
    () => new Set(sel.filter((r) => r.type === 'label').map((r) => r.id)),
    [sel],
  )
  const only = sel.length === 1 ? sel[0] : null
  const selWall = only?.type === 'wall' ? plan.walls[only.id] : null
  const selOpening = only?.type === 'opening' ? plan.openings[only.id] : null
  const selLabel = only?.type === 'label' ? plan.roomLabels[only.id] : null
  const multi = sel.length > 1

  // popover anchored to the selection, in wrapper coordinates
  let popover: { left: number; top: number } | null = null
  if (svgRef.current && wrapRef.current && (selWall || selOpening || selLabel || multi)) {
    let px = 0
    let py = 0
    let anchored = true
    if (multi) {
      // anchor below the selection's bounding box
      const bounds = selectionBounds(plan, sel)
      anchored = bounds !== null
      if (bounds) {
        px = (bounds.minX + bounds.maxX) / 2
        py = bounds.maxY
      }
    } else if (selWall) {
      const [a, b] = wallPoints(plan, selWall)
      px = (a.x + b.x) / 2
      py = (a.y + b.y) / 2
    } else if (selOpening) {
      const placement = openingPlacement(plan, selOpening)
      if (placement) {
        px = placement.cx
        py = placement.cy
      }
    } else if (selLabel) {
      px = selLabel.x
      py = selLabel.y
    }
    const matrix = svgRef.current.getScreenCTM()
    if (matrix && anchored) {
      const sp = new DOMPoint(px, py).matrixTransform(matrix)
      const r = wrapRef.current.getBoundingClientRect()
      popover = { left: sp.x - r.left, top: sp.y - r.top + 24 }
    }
  }

  const cursor = space ? 'grab' : mode === 'select' ? 'default' : 'crosshair'
  const ghostOpening: Opening | null =
    openPreview && (mode === 'door' || mode === 'window')
      ? mode === 'door'
        ? {
            id: '__ghost',
            wallId: openPreview.wallId,
            type: 'door',
            offset: openPreview.offset,
            width: defaultOpeningWidth('door'),
            hingeSide: 'start',
            swing: 'in',
          }
        : {
            id: '__ghost',
            wallId: openPreview.wallId,
            type: 'window',
            offset: openPreview.offset,
            width: defaultOpeningWidth('window'),
          }
      : null

  const onLabelPointerDown = (label: Plan['roomLabels'][string], e: React.PointerEvent) => {
    if (mode !== 'select') return
    onElementPointerDown({ type: 'label', id: label.id }, e, () => ({ kind: 'label', id: label.id }))
  }

  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (mode === 'wall') {
      setChain(null)
      setSnap(null)
      return
    }
    if (mode !== 'select') return
    const c = toPlan(e.clientX, e.clientY)
    const room = roomAt(rooms, c.x, c.y)
    if (!room) return
    const hasLabel = Object.values(plan.roomLabels).some((l) => roomAt(rooms, l.x, l.y) === room)
    if (hasLabel) return
    setPlan((p) => addRoomLabel(p, 'Room', c.x, c.y))
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{ width: '100%', height: '100%', background: '#fff', display: 'block', cursor }}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onDoubleClick={onCanvasDoubleClick}
      >
        {/* the grid is not displayed (spec §4) — grid snapping stays active */}
        {Object.values(plan.walls).map((wall) => (
          <WallLine
            key={wall.id}
            plan={plan}
            wall={wall}
            color={
              selKeys.has(refKey({ type: 'wall', id: wall.id }))
                ? COLORS.wallSelected
                : hoverWall === wall.id && mode === 'select'
                  ? COLORS.wallHover
                  : undefined
            }
          />
        ))}
        {Object.values(plan.openings).map((opening) => (
          <OpeningGlyph
            key={opening.id}
            plan={plan}
            opening={opening}
            selected={selKeys.has(refKey({ type: 'opening', id: opening.id }))}
          />
        ))}
        <RoomOverlay
          rooms={rooms}
          labels={Object.values(plan.roomLabels)}
          onLabelPointerDown={onLabelPointerDown}
          selectedLabelIds={selectedLabelIds}
        />
        {Object.values(plan.walls).map((wall) => (
          <DimLabel key={wall.id} plan={plan} wall={wall} />
        ))}
        {mode === 'select' &&
          Object.values(plan.walls).map((wall) => (
            <WallHit
              key={wall.id}
              plan={plan}
              wall={wall}
              cursor="move"
              onPointerDown={(e) =>
                onElementPointerDown({ type: 'wall', id: wall.id }, e, (c) => ({
                  kind: 'group',
                  refs: [{ type: 'wall', id: wall.id }],
                  start: c,
                  orig: plan,
                }))
              }
              onPointerEnter={() => setHoverWall(wall.id)}
              onPointerLeave={() => setHoverWall((h) => (h === wall.id ? null : h))}
            />
          ))}
        {mode === 'select' &&
          Object.values(plan.openings).map((opening) => (
            <OpeningHit
              key={opening.id}
              plan={plan}
              opening={opening}
              onPointerDown={(e) =>
                onElementPointerDown({ type: 'opening', id: opening.id }, e, () => ({
                  kind: 'opening',
                  id: opening.id,
                }))
              }
            />
          ))}
        {selWall &&
          wallPoints(plan, selWall).map((p) => (
            <Handle
              key={p.id}
              x={p.x}
              y={p.y}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                startPlanDrag({ kind: 'point', id: p.id })
                svgRef.current!.setPointerCapture(e.pointerId)
              }}
            />
          ))}
        {marquee && (
          <rect
            x={Math.min(marquee.a.x, marquee.b.x)}
            y={Math.min(marquee.a.y, marquee.b.y)}
            width={Math.abs(marquee.b.x - marquee.a.x)}
            height={Math.abs(marquee.b.y - marquee.a.y)}
            fill="rgba(37, 99, 235, 0.08)"
            stroke={COLORS.wallSelected}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {chain && snap && <RubberWall from={plan.points[chain.last]} to={snap} thickness={WALL_THICKNESS} />}
        {ghostOpening && <OpeningGlyph plan={plan} opening={ghostOpening} ghost />}
        {mode === 'wall' && <SnapMarker snap={snap} />}
        {drag.current?.kind === 'point' && <SnapMarker snap={snap} />}
      </svg>

      {/* floating toolbar (spec §4) */}
      <div
        className="floating"
        style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}
      >
        {(
          [
            ['select', 'Select', '1'],
            ['wall', 'Wall', '2'],
            ['door', 'Door', '3'],
            ['window', 'Window', '4'],
          ] as const
        ).map(([m, label, key]) => (
          <button
            key={m}
            className={mode === m ? 'floating-btn active' : 'floating-btn'}
            onClick={() => switchMode(m)}
          >
            {label} <span className="kbd">{key}</span>
          </button>
        ))}
      </div>

      {/* one-line contextual hint */}
      <div
        className="hint"
        style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)' }}
      >
        {mode === 'wall'
          ? chain
            ? 'Click to add a wall · click the start point to close the room · Esc / double-click to stop'
            : 'Click to start a wall chain · Alt disables snapping'
          : mode === 'door' || mode === 'window'
            ? 'Hover a wall, click to place'
            : 'Click or drag a box to select · Shift+click adds · double-click a room to name it · Space+drag pans · scroll zooms'}
      </div>

      {/* zoom controls and undo/redo (bottom-left) */}
      <div style={{ position: 'absolute', left: 16, bottom: 16, display: 'flex', gap: 8 }}>
        <div className="floating">
          <button className="floating-btn" title="Zoom out" onClick={() => zoomCenter(1.25)}>
            −
          </button>
          <button className="floating-btn" title="Fit to plan" onClick={() => fitPlan(plan)}>
            {Math.round(pxPerCm() * 100)}%
          </button>
          <button className="floating-btn" title="Zoom in" onClick={() => zoomCenter(1 / 1.25)}>
            +
          </button>
        </div>
        <div className="floating">
          <button className="floating-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => undo()}>
            ↺
          </button>
          <button
            className="floating-btn"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={() => redo()}
          >
            ↻
          </button>
        </div>
      </div>

      {/* contextual popover next to the selection */}
      {popover && (selWall || selOpening || selLabel || multi) && (
        <div className="popover" style={{ position: 'absolute', left: popover.left, top: popover.top }}>
          {multi && (
            <>
              <span>{sel.length} elements</span>
              <button className="danger" onClick={() => deleteSelection(sel)}>
                Delete
              </button>
            </>
          )}
          {selWall && (
            <>
              <span>Wall · {formatLength(wallLength(plan, selWall))}</span>
              <button className="danger" onClick={() => deleteSelection(sel)}>
                Delete
              </button>
            </>
          )}
          {selOpening && (
            <>
              <span>{selOpening.type === 'door' ? 'Door' : 'Window'}</span>
              <select
                value={selOpening.width}
                onChange={(e) => setPlan((p) => setOpeningWidth(p, selOpening.id, Number(e.target.value)))}
              >
                {OPENING_WIDTHS.map((w) => (
                  <option key={w} value={w}>
                    {w} cm
                  </option>
                ))}
              </select>
              {selOpening.type === 'door' && (
                <>
                  <button
                    className="flip"
                    title="Swap hinge side (left/right)"
                    onClick={() => setPlan((p) => toggleHingeSide(p, selOpening.id))}
                  >
                    ⇋ Hinge
                  </button>
                  <button
                    className="flip"
                    title="Swap swing direction (inside/outside)"
                    onClick={() => setPlan((p) => toggleSwing(p, selOpening.id))}
                  >
                    ⇵ Swing
                  </button>
                </>
              )}
              <button className="danger" onClick={() => deleteSelection(sel)}>
                Delete
              </button>
            </>
          )}
          {selLabel && (
            <>
              <input
                value={selLabel.name}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) => setPlan((p) => renameRoomLabel(p, selLabel.id, e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') setSel([])
                }}
              />
              <button className="danger" onClick={() => deleteSelection(sel)}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
