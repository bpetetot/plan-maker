// Editor UX per spec §4 — variant A "Floating minimal" of the ticket 05
// prototype: full-bleed canvas, floating toolbar, click-to-click walls,
// contextual popover on the selection, dimensions always visible.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BrickWall,
  DoorClosed,
  FlipHorizontal2,
  FlipVertical2,
  Grid2x2,
  MousePointer2,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useStore } from 'zustand'
import type { Vec } from '../model/geometry'
import {
  clampToPolygon,
  nearestWall,
  projectOnWall,
  wallLength,
  wallPoints,
  wallSide,
} from '../model/geometry'
import { formatLength } from '../model/format'
import { openingPlacement } from '../model/openings'
import {
  addRoomLabel,
  clampOpeningOffset,
  commitPoint,
  commitWall,
  movePoint,
  moveOpening,
  moveRoomLabel,
  placeOpening,
  renameRoomLabel,
  setDimPlacement,
  setOpeningWidth,
  toggleHingeSide,
  toggleSwing,
} from '../model/operations'
import type { Room } from '../model/rooms'
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
import { snapDelta, snapPoint } from '../model/snap'
import type { Opening, Plan } from '../model/types'
import { defaultOpeningWidth, OPENING_WIDTHS, WALL_THICKNESS } from '../model/types'
import { beginHistoryGroup, endHistoryGroup, redo, undo, usePlanStore } from '../store/planStore'
import type { RoomTextBlock } from './render'
import {
  COLORS,
  DimLabel,
  DimRails,
  Handle,
  JunctionPatches,
  OpeningGlyph,
  OpeningHit,
  PlacementDims,
  RoomOverlay,
  roomTextBlocks,
  RubberWall,
  SnapMarker,
  WallHit,
  WallLine,
} from './render'
import { useSpaceHeld, useView } from './useView'

type Tool = 'select' | 'wall' | 'door' | 'window'
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
  // dragging an opening along its wall; below the click threshold it is a
  // plain click — the placement dimensions only show once it becomes a move
  | { kind: 'opening'; id: string; start: Vec; moved?: boolean }
  // dragging a room's text block. `room` is the room containing the block at
  // drag start: the block can never leave it (the drag clamps to its polygon);
  // null for a label outside any room, which moves freely.
  | { kind: 'label'; id: string; room: Room | null }
  // dragging the text block of a room that has no label yet: the nameless
  // label is only created once the pointer crosses the click threshold, so a
  // plain click never touches the plan
  | { kind: 'newLabel'; start: Vec; room: Room; id?: string }
  // dragging a wall's dimension label; a movement below the click threshold
  // resolves to "select the wall" on pointer up
  | { kind: 'dim'; id: string; start: Vec; moved?: boolean }
  // the live rect lives on the drag ref (b is mutated on move) so pointer-up
  // never reads a stale React state; the marquee state only drives rendering
  | { kind: 'marquee'; additive: boolean; prev: ElementRef[]; a: Vec; b: Vec }

// Below this movement (screen px) a marquee or group drag is a plain click.
const CLICK_PX = 4

const pointSnap = (p: Plan, id: string): Snap => ({
  x: p.points[id].x,
  y: p.points[id].y,
  kind: 'point',
  pointId: id,
})

const isTypingTarget = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable
}

export default function Editor() {
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { view, toPlan, pxPerCm, zoomScale, zoomCenter, panByPx, fitPlan } = useView(svgRef)
  const plan = usePlanStore((s) => s.plan)
  const setPlan = usePlanStore((s) => s.setPlan)
  const planEpoch = usePlanStore((s) => s.planEpoch)
  const canUndo = useStore(usePlanStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(usePlanStore.temporal, (s) => s.futureStates.length > 0)
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<ElementRef[]>([])
  const [hoverWall, setHoverWall] = useState<string | null>(null)
  // A wall chain being drawn. The first click is held as a pending snap —
  // nothing is committed to the plan until the first wall commit, so aborting
  // the chain (Esc, tool switch, double-click) never mutates the plan.
  const [chain, setChain] = useState<{ start: string; last: string } | { pending: Snap } | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [openPreview, setOpenPreview] = useState<{ wallId: string; offset: number } | null>(null)
  const [marquee, setMarquee] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(
    null,
  )
  // wall whose dimension is being dragged past the click threshold — drives the rails
  const [railWallId, setRailWallId] = useState<string | null>(null)
  // opening being solo-dragged — drives its placement dimensions
  const [movingOpeningId, setMovingOpeningId] = useState<string | null>(null)
  // Inline room-name editing over a text block (Excalidraw-style). The plan is
  // only touched on commit — one undo entry — and Escape cancels; labelId is
  // null while the room has no label yet (one is created on non-empty commit).
  const [editing, setEditing] = useState<{
    key: string
    labelId: string | null
    x: number
    y: number
    initial: string
  } | null>(null)
  const editCancelled = useRef(false)
  const space = useSpaceHeld()
  const drag = useRef<Drag | null>(null)
  const alt = useRef(false)

  // Fit after any replacement of the plan (open, startup restore, reset).
  // Runs on mount too, which frames the plan restored before the editor mounted.
  useEffect(() => {
    fitPlan(usePlanStore.getState().plan)
    // fitPlan is recreated every render but only reads the svg ref; epoch is the trigger
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [planEpoch])

  const rooms = useMemo(() => detectRooms(plan), [plan])
  const blocks = useMemo(() => roomTextBlocks(rooms, Object.values(plan.roomLabels)), [rooms, plan])

  const tolerance = () => 14 / pxPerCm()

  const switchTool = (next: Tool) => {
    setTool(next)
    setChain(null)
    setSnap(null)
    setOpenPreview(null)
    if (next !== 'select') setSel([])
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
        else switchTool('select')
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection(sel)
      } else if (e.key === '1') switchTool('select')
      else if (e.key === '2') switchTool('wall')
      else if (e.key === '3') switchTool('door')
      else if (e.key === '4') switchTool('window')
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
    if (tool === 'wall') {
      const anchor = chain ? ('pending' in chain ? chain.pending : plan.points[chain.last]) : undefined
      const s = snapPoint(plan, c.x, c.y, { tolerance: tolerance(), anchor, walls: true, free: alt.current })
      if (chain && 'start' in chain && s.pointId === chain.start && chain.last !== chain.start) {
        // clicking the chain's start point closes the room
        setPlan((p) => commitWall(p, pointSnap(p, chain.last), pointSnap(p, chain.start))[0])
        setChain(null)
        setSnap(null)
        return
      }
      if (chain) {
        // one setPlan per drawn wall: resolving the (possibly pending) start
        // and committing the wall land in a single history entry (ADR 0002)
        const startSnap = 'pending' in chain ? chain.pending : pointSnap(plan, chain.last)
        const [withStart, startId] = commitPoint(plan, startSnap)
        const [next, pointId] = commitWall(withStart, pointSnap(withStart, startId), s)
        setPlan(() => next)
        setChain({ start: 'pending' in chain ? startId : chain.start, last: pointId })
      } else {
        setChain({ pending: s })
      }
    } else if ((tool === 'door' || tool === 'window') && openPreview) {
      // keep the placement tool active, but select the new opening so its
      // actions popover shows right away
      const [next, id] = placeOpening(plan, openPreview.wallId, tool, openPreview.offset)
      setPlan(() => next)
      setSel(id ? [{ type: 'opening', id }] : [])
    } else if (tool === 'select') {
      // dragging on empty canvas draws a selection marquee; a click-sized
      // marquee resolves to "clear the selection" on pointer up
      drag.current = { kind: 'marquee', additive: e.shiftKey, prev: sel, a: c, b: c }
      setMarquee({ a: c, b: c })
      svg.setPointerCapture(e.pointerId)
    } else {
      // clicking empty canvas clears the selection in every non-wall tool
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
          // e.altKey rather than the tracked key state: it is correct even
          // when Alt was already down before the window had focus
          const { dx, dy } = snapDelta(c.x - d.start.x, c.y - d.start.y, e.altKey)
          setPlan(() => translateElements(d.orig, d.refs, dx, dy))
        }
      } else if (d.kind === 'marquee') {
        d.b = c
        setMarquee({ a: d.a, b: c })
      } else if (d.kind === 'opening') {
        const opening = plan.openings[d.id]
        if (opening) {
          if (!d.moved && Math.hypot(c.x - d.start.x, c.y - d.start.y) * pxPerCm() >= CLICK_PX) {
            d.moved = true
            setMovingOpeningId(d.id)
          }
          const { t } = projectOnWall(plan, plan.walls[opening.wallId], c.x, c.y)
          setPlan((p) => moveOpening(p, d.id, t))
        }
      } else if (d.kind === 'label') {
        const t = d.room ? clampToPolygon(c, d.room.polygon) : c
        setPlan((p) => moveRoomLabel(p, d.id, t.x, t.y))
      } else if (d.kind === 'newLabel') {
        const t = clampToPolygon(c, d.room.polygon)
        if (d.id) {
          setPlan((p) => moveRoomLabel(p, d.id!, t.x, t.y))
        } else if (Math.hypot(c.x - d.start.x, c.y - d.start.y) * pxPerCm() >= CLICK_PX) {
          const [next, id] = addRoomLabel(plan, '', t.x, t.y)
          setPlan(() => next)
          d.id = id
        }
      } else if (d.kind === 'dim') {
        const wall = plan.walls[d.id]
        if (wall) {
          if (!d.moved && Math.hypot(c.x - d.start.x, c.y - d.start.y) * pxPerCm() >= CLICK_PX) {
            d.moved = true
            setRailWallId(d.id)
          }
          if (d.moved) {
            const length = wallLength(plan, wall)
            const { t } = projectOnWall(plan, wall, c.x, c.y)
            setPlan((p) =>
              setDimPlacement(p, d.id, length < 1 ? 0.5 : t / length, wallSide(plan, wall, c.x, c.y)),
            )
          }
        }
      }
      return
    }
    if (tool === 'wall') {
      const anchor = chain ? ('pending' in chain ? chain.pending : plan.points[chain.last]) : undefined
      setSnap(snapPoint(plan, c.x, c.y, { tolerance: tolerance(), anchor, walls: true, free: alt.current }))
    } else if (tool === 'door' || tool === 'window') {
      const near = nearestWall(plan, c.x, c.y, 40 / pxPerCm() + WALL_THICKNESS)
      if (near) {
        const offset = clampOpeningOffset(plan, near.wall, near.t, defaultOpeningWidth(tool))
        setOpenPreview(offset === null ? null : { wallId: near.wall.id, offset })
      } else setOpenPreview(null)
    }
  }

  // Right-click exits the drawing gesture; the canvas never shows the
  // native context menu.
  const onSvgContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (drag.current) return
    if (chain) {
      // like Escape's first rung: end the chain, stay in the Wall tool
      setChain(null)
      setSnap(null)
    } else if (tool !== 'select') {
      switchTool('select')
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
    // a click on a dimension label selects its wall; a drag never touches the
    // selection — the label is a handle, not an element
    if (d.kind === 'dim') {
      if (!d.moved) setSel([{ type: 'wall', id: d.id }])
      setRailWallId(null)
    }
    if (d.kind === 'point') setSnap(null)
    if (d.kind === 'opening') setMovingOpeningId(null)
    if (d.kind !== 'pan') endHistoryGroup()
  }

  const selKeys = useMemo(() => new Set(sel.map(refKey)), [sel])
  const only = sel.length === 1 ? sel[0] : null
  const selWall = only?.type === 'wall' ? plan.walls[only.id] : null
  const selOpening = only?.type === 'opening' ? plan.openings[only.id] : null
  const multi = sel.length > 1

  // popover anchored to the selection, in wrapper coordinates
  let popover: { left: number; top: number } | null = null
  if (svgRef.current && wrapRef.current && (selWall || selOpening || multi)) {
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
    }
    const matrix = svgRef.current.getScreenCTM()
    if (matrix && anchored) {
      const sp = new DOMPoint(px, py).matrixTransform(matrix)
      const r = wrapRef.current.getBoundingClientRect()
      popover = { left: sp.x - r.left, top: sp.y - r.top + 24 }
    }
  }

  const cursor = space ? 'grab' : tool === 'select' ? 'default' : 'crosshair'
  const ghostOpening: Opening | null =
    openPreview && (tool === 'door' || tool === 'window')
      ? tool === 'door'
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

  // The opening being placed (ghost) or moved: it carries the placement
  // dimensions and temporarily hides its wall's own dimension.
  const placementOpening = ghostOpening ?? (movingOpeningId ? (plan.openings[movingOpeningId] ?? null) : null)

  // Room labels are never selected (CONTEXT.md: Selection) — the text block is
  // dragged and double-click-edited directly.
  const onBlockPointerDown = (block: RoomTextBlock, e: React.PointerEvent) => {
    if (tool !== 'select' || e.button !== 0 || space) return
    if (block.label) startPlanDrag({ kind: 'label', id: block.label.id, room: block.room ?? null })
    else if (block.room)
      startPlanDrag({ kind: 'newLabel', start: toPlan(e.clientX, e.clientY), room: block.room })
  }

  const startEditing = (block: RoomTextBlock) => {
    setEditing({
      key: block.key,
      labelId: block.label?.id ?? null,
      x: block.x,
      y: block.y,
      initial: block.label?.name ?? '',
    })
  }

  // Commit path shared by Enter, Escape and clicking away — all end in a blur.
  // An empty name only clears the label's name: the marker (and the area's
  // position) survives.
  const finishEditing = (value: string) => {
    const ed = editing
    setEditing(null)
    if (!ed) return
    if (editCancelled.current) {
      editCancelled.current = false
      return
    }
    const name = value.trim()
    if (name === ed.initial) return
    if (ed.labelId) setPlan((p) => renameRoomLabel(p, ed.labelId!, name))
    else if (name) setPlan((p) => addRoomLabel(p, name, ed.x, ed.y)[0])
  }

  const onBlockDoubleClick = (block: RoomTextBlock, e: React.MouseEvent) => {
    if (tool !== 'select') return
    e.stopPropagation()
    startEditing(block)
  }

  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (tool === 'wall') {
      setChain(null)
      setSnap(null)
      return
    }
    if (tool !== 'select') return
    const c = toPlan(e.clientX, e.clientY)
    const room = roomAt(rooms, c.x, c.y)
    const block = room ? blocks.find((b) => b.room === room) : undefined
    if (block) startEditing(block)
  }

  // shared by every popover variant
  const deleteButton = (
    <button className="danger" title="Delete" aria-label="Delete" onClick={() => deleteSelection(sel)}>
      <Trash2 size={16} aria-hidden />
    </button>
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{ width: '100%', height: '100%', background: 'var(--sheet)', display: 'block', cursor }}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onContextMenu={onSvgContextMenu}
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
                : hoverWall === wall.id && tool === 'select'
                  ? COLORS.wallHover
                  : undefined
            }
          />
        ))}
        <JunctionPatches plan={plan} />
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
          editingKey={editing?.key}
          onBlockPointerDown={onBlockPointerDown}
          onBlockDoubleClick={onBlockDoubleClick}
        />
        {tool === 'select' &&
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
        {tool === 'select' &&
          Object.values(plan.openings).map((opening) => (
            <OpeningHit
              key={opening.id}
              plan={plan}
              opening={opening}
              onPointerDown={(e) =>
                onElementPointerDown({ type: 'opening', id: opening.id }, e, (c) => ({
                  kind: 'opening',
                  id: opening.id,
                  start: c,
                }))
              }
            />
          ))}
        {railWallId && plan.walls[railWallId] && <DimRails plan={plan} wall={plan.walls[railWallId]} />}
        {/* after the hit targets so the label wins the hit-test where they overlap;
            the wall carrying a placement gesture shows the placement dimensions
            instead of its own */}
        {Object.values(plan.walls).map((wall) =>
          wall.id === placementOpening?.wallId ? null : (
            <DimLabel
              key={wall.id}
              plan={plan}
              wall={wall}
              onPointerDown={
                tool === 'select'
                  ? (e) => {
                      if (e.button !== 0 || space) return
                      startPlanDrag({ kind: 'dim', id: wall.id, start: toPlan(e.clientX, e.clientY) })
                    }
                  : undefined
              }
            />
          ),
        )}
        {placementOpening && <PlacementDims plan={plan} opening={placementOpening} rooms={rooms} />}
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
            fill="var(--marquee-fill)"
            stroke={COLORS.wallSelected}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {chain && snap && (
          <RubberWall
            from={'pending' in chain ? chain.pending : plan.points[chain.last]}
            to={snap}
            thickness={WALL_THICKNESS}
          />
        )}
        {ghostOpening && <OpeningGlyph plan={plan} opening={ghostOpening} ghost />}
        {tool === 'wall' && <SnapMarker snap={snap} />}
        {drag.current?.kind === 'point' && <SnapMarker snap={snap} />}
        {/* inline room-name editing, directly on the sheet (Excalidraw-style);
            sized to sit on the block's name line, above the area */}
        {editing && (
          <foreignObject x={editing.x - 100} y={editing.y - 14} width={200} height={18}>
            <input
              className="room-name-input"
              defaultValue={editing.initial}
              autoFocus
              onFocus={(e) => e.target.select()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') {
                  editCancelled.current = true
                  e.currentTarget.blur()
                }
              }}
              onBlur={(e) => finishEditing(e.currentTarget.value)}
            />
          </foreignObject>
        )}
      </svg>

      {/* floating toolbar (spec §4) */}
      <div
        className="floating"
        style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}
      >
        {(
          [
            ['select', 'Select', '1', MousePointer2],
            ['wall', 'Wall', '2', BrickWall],
            ['door', 'Door', '3', DoorClosed],
            ['window', 'Window', '4', Grid2x2],
          ] as const
        ).map(([m, label, key, Icon]) => (
          <button
            key={m}
            className={tool === m ? 'floating-btn icon active' : 'floating-btn icon'}
            title={`${label} (${key})`}
            aria-label={label}
            aria-pressed={tool === m}
            onClick={() => switchTool(m)}
          >
            <Icon size={16} aria-hidden />
            <span className="key-hint">{key}</span>
          </button>
        ))}
      </div>

      {/* one-line contextual hint */}
      <div
        className="hint"
        style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)' }}
      >
        {tool === 'wall'
          ? chain
            ? 'Click to add a wall · click the start point to close the room · Esc / double-click to stop'
            : 'Click to start a wall chain · Alt disables snapping'
          : tool === 'door' || tool === 'window'
            ? 'Hover a wall, click to place'
            : 'Click or drag a box to select · Shift+click adds · double-click a room to name it · Space+drag pans · scroll zooms'}
      </div>

      {/* zoom controls and undo/redo (bottom-left) */}
      <div style={{ position: 'absolute', left: 16, bottom: 16, display: 'flex', gap: 8 }}>
        <div className="floating">
          <button
            className="floating-btn icon"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => zoomCenter(1.25)}
          >
            <ZoomOut size={16} aria-hidden />
          </button>
          <button className="floating-btn" title="Fit to plan" onClick={() => fitPlan(plan)}>
            {Math.round(zoomScale * 100)}%
          </button>
          <button
            className="floating-btn icon"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => zoomCenter(1 / 1.25)}
          >
            <ZoomIn size={16} aria-hidden />
          </button>
        </div>
        <div className="floating">
          <button
            className="floating-btn icon"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={() => undo()}
          >
            <Undo2 size={16} aria-hidden />
          </button>
          <button
            className="floating-btn icon"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={() => redo()}
          >
            <Redo2 size={16} aria-hidden />
          </button>
        </div>
      </div>

      {/* contextual popover next to the selection */}
      {popover && (selWall || selOpening || multi) && (
        <div className="popover" style={{ position: 'absolute', left: popover.left, top: popover.top }}>
          {multi && (
            <>
              <span>{sel.length} elements</span>
              {deleteButton}
            </>
          )}
          {selWall && (
            <>
              {/* the drawn length is the hors-tout extent: axis + thickness */}
              <span>Wall · {formatLength(wallLength(plan, selWall) + selWall.thickness)}</span>
              {deleteButton}
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
                    <FlipHorizontal2 size={16} aria-hidden /> Hinge
                  </button>
                  <button
                    className="flip"
                    title="Swap swing direction (inside/outside)"
                    onClick={() => setPlan((p) => toggleSwing(p, selOpening.id))}
                  >
                    <FlipVertical2 size={16} aria-hidden /> Swing
                  </button>
                </>
              )}
              {deleteButton}
            </>
          )}
        </div>
      )}
    </div>
  )
}
