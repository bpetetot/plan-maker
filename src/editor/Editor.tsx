// Editor UX per spec §4 — variant A "Floating minimal" of the ticket 05
// prototype: full-bleed canvas, floating toolbar, click-to-click walls,
// selection panel on the left, dimensions always visible.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BrickWall,
  DoorClosed,
  Grid2x2,
  Grid3x3,
  Magnet,
  MousePointer2,
  Redo2,
  RulerDimensionLine,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useStore } from 'zustand'
import type { Vec } from '../model/geometry'
import { nearestWall, projectOnWall, wallLength, wallPoints, wallSide } from '../model/geometry'
import {
  addRoomLabel,
  clampOpeningOffset,
  commitPoint,
  commitWall,
  mergeCoincidentPoints,
  movePoint,
  moveOpening,
  moveRoomLabel,
  placeOpening,
  planarize,
  renameRoomLabel,
  setDimPlacement,
} from '../model/operations'
import type { Room } from '../model/rooms'
import { clampToRoom, detectRooms, reconcileRoomLabels, roomAt } from '../model/rooms'
import type { ElementRef } from '../model/selection'
import {
  deleteElements,
  elementsInRect,
  isSelected,
  refKey,
  referencePoint,
  toggleRef,
  translateElements,
} from '../model/selection'
import type { Snap } from '../model/snap'
import { realignDelta, snapPoint } from '../model/snap'
import type { Opening, Plan, RoomLabel } from '../model/types'
import { WALL_THICKNESS } from '../model/types'
import { beginHistoryGroup, endHistoryGroup, redo, undo, usePlanStore } from '../store/planStore'
import { GridLines, loadGridVisible, saveGridVisible } from './grid'
import { loadMeasuresVisible, saveMeasuresVisible } from './measurePref'
import { loadSnapEnabled, saveSnapEnabled } from './snapPref'
import type { RoomTextBlock } from './render'
import { ToolPanel } from './ToolPanel'
import {
  BLOCK_LINE_HEIGHT,
  blockNameSlots,
  COLORS,
  DimLabel,
  DimRails,
  Handle,
  JunctionPatches,
  OpeningGlyph,
  OpeningGrabZone,
  PlacementDims,
  RoomOverlay,
  roomTextBlocks,
  RubberWall,
  SnapMarker,
  WallGrabZone,
  WallLine,
} from './render'
import type { Tool, ToolDefaults } from './tools'
import { initialToolDefaults } from './tools'
import { useSpaceHeld, useView } from './useView'

type Drag =
  | { kind: 'pan'; x: number; y: number }
  // `orig` is the plan at drag start — labels reconcile against it at the
  // end of the gesture, never on intermediate states
  | { kind: 'point'; id: string; orig: Plan }
  | {
      kind: 'group'
      refs: ElementRef[]
      start: Vec
      orig: Plan
      // set when the drag started on an element of a multi-selection: a
      // movement below the click threshold collapses the selection to it
      clickRef?: ElementRef
      // the point the realignment lands on the grid, fixed at pointer-down so
      // the preview never jumps when another candidate becomes the nearest
      refPoint: Vec | null
      moved?: boolean
    }
  // dragging an opening along its wall; below the click threshold it is a
  // plain click — the placement dimensions only show once it becomes a move
  | { kind: 'opening'; id: string; start: Vec; moved?: boolean }
  // dragging a room's text block. `room` is the room containing the block at
  // drag start: the block can never leave it (the drag clamps to its region).
  // null is defensive — an orphan label cannot arise from plan operations
  // (CONTEXT.md: Room label) — and lets such a label move freely.
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
  const { view, toPlan, pxPerCm, zoomScale, zoomRatio, zoomCenter, panByPx, fitPlan } = useView(svgRef)
  const plan = usePlanStore((s) => s.plan)
  const setPlan = usePlanStore((s) => s.setPlan)
  const planEpoch = usePlanStore((s) => s.planEpoch)
  const canUndo = useStore(usePlanStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(usePlanStore.temporal, (s) => s.futureStates.length > 0)
  const [tool, setTool] = useState<Tool>('select')
  const [gridVisible, setGridVisible] = useState(loadGridVisible)
  const [measuresVisible, setMeasuresVisible] = useState(loadMeasuresVisible)
  const [snapEnabled, setSnapEnabled] = useState(loadSnapEnabled)
  const [defaults, setDefaults] = useState<ToolDefaults>(initialToolDefaults)
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
  // Alt lives in state, not a ref: the snap toggle shows the *effective* state,
  // so pressing and releasing the key has to re-render. Auto-repeat is absorbed
  // by React's bail-out on an unchanged value.
  const [altHeld, setAltHeld] = useState(false)
  // Snap's two alignment rungs are suspended when snapping is off, and Alt
  // inverts whichever state is current for the gesture's duration (ADR 0007).
  const isFree = (alt: boolean) => !snapEnabled !== alt
  const free = isFree(altHeld)

  // Fit after any replacement of the plan (open, startup restore, reset).
  // Runs on mount too, which frames the plan restored before the editor mounted.
  useEffect(() => {
    fitPlan(usePlanStore.getState().plan)
    // fitPlan is recreated every render but only reads the svg ref; epoch is the trigger
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [planEpoch])

  const rooms = useMemo(() => detectRooms(plan), [plan])
  const blocks = useMemo(() => roomTextBlocks(rooms, Object.values(plan.roomLabels)), [rooms, plan])
  // While walls are dragged the plan only reconciles labels at the end of the
  // gesture — but the displayed labels preview that reconciliation live, so a
  // default-placement block keeps tracking its room's anchor mid-gesture.
  const dragNow = drag.current
  const wallDrag = dragNow && (dragNow.kind === 'point' || dragNow.kind === 'group') ? dragNow : null
  const overlayLabels = useMemo(
    () => Object.values((wallDrag ? reconcileRoomLabels(wallDrag.orig, plan) : plan).roomLabels),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [wallDrag, plan],
  )

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

  const toggleSnap = useCallback(() => {
    setSnapEnabled(!snapEnabled)
    saveSnapEnabled(!snapEnabled)
  }, [snapEnabled])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return
      setAltHeld(e.altKey)
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
      // bare S only: Ctrl/Cmd+S is the browser's Save reflex, and flipping a
      // persisted preference under it would be silent and durable
      else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) toggleSnap()
    }
    const up = (e: KeyboardEvent) => {
      setAltHeld(e.altKey)
    }
    // Alt drives a visible affordance now, so a keyup the window never receives
    // (Alt+Tab away) would leave the toggle lying about the effective state.
    const clearAlt = () => setAltHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clearAlt)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clearAlt)
    }
  }, [chain, sel, deleteSelection, toggleSnap])

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
      const s = snapPoint(plan, c.x, c.y, { tolerance: tolerance(), anchor, walls: true, free })
      if (chain && 'start' in chain && s.pointId === chain.start && chain.last !== chain.start) {
        // clicking the chain's start point closes the room
        setPlan(
          (p) =>
            commitWall(p, pointSnap(p, chain.last), pointSnap(p, chain.start), defaults.wallThickness)[0],
        )
        setChain(null)
        setSnap(null)
        return
      }
      if (chain) {
        // one setPlan per drawn wall: resolving the (possibly pending) start
        // and committing the wall land in a single history entry (ADR 0002)
        const startSnap = 'pending' in chain ? chain.pending : pointSnap(plan, chain.last)
        const [withStart, startId] = commitPoint(plan, startSnap)
        const [next, pointId] = commitWall(
          withStart,
          pointSnap(withStart, startId),
          s,
          defaults.wallThickness,
        )
        setPlan(() => next)
        setChain({ start: 'pending' in chain ? startId : chain.start, last: pointId })
      } else {
        setChain({ pending: s })
      }
    } else if ((tool === 'door' || tool === 'window') && openPreview) {
      // keep the placement tool active, but select the new opening so its
      // panel shows right away
      const [next, id] = placeOpening(plan, openPreview.wallId, tool, openPreview.offset, {
        width: tool === 'door' ? defaults.doorWidth : defaults.windowWidth,
        hingeSide: defaults.doorHinge,
        swing: defaults.doorSwing,
      })
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
      startPlanDrag({
        kind: 'group',
        refs: sel,
        start: c,
        orig: plan,
        clickRef: ref,
        refPoint: referencePoint(plan, sel, c),
      })
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
          free,
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
          const { dx, dy } = realignDelta(d.refPoint, c.x - d.start.x, c.y - d.start.y, isFree(e.altKey))
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
        const t = d.room ? clampToRoom(c, d.room) : c
        setPlan((p) => moveRoomLabel(p, d.id, t.x, t.y))
      } else if (d.kind === 'newLabel') {
        const t = clampToRoom(c, d.room)
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
      setSnap(snapPoint(plan, c.x, c.y, { tolerance: tolerance(), anchor, walls: true, free }))
    } else if (tool === 'door' || tool === 'window') {
      const near = nearestWall(plan, c.x, c.y, 40 / pxPerCm() + WALL_THICKNESS)
      if (near) {
        const width = tool === 'door' ? defaults.doorWidth : defaults.windowWidth
        const offset = clampOpeningOffset(plan, near.wall, near.t, width)
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
    // wall geometry changed: coincident points merge (ADR 0003), walls split
    // at new junctions (ADR 0002, issue 08) and labels reconcile once, at the
    // end of the gesture (CONTEXT.md: Room label), inside the same history
    // group
    if (d.kind === 'point' || d.kind === 'group') {
      setPlan((p) => {
        const moving = new Set<string>()
        if (d.kind === 'point') moving.add(d.id)
        else
          for (const ref of d.refs) {
            const wall = ref.type === 'wall' ? p.walls[ref.id] : undefined
            if (wall) {
              moving.add(wall.startPointId)
              moving.add(wall.endPointId)
            }
          }
        return reconcileRoomLabels(d.orig, planarize(mergeCoincidentPoints(p, moving)))
      })
    }
    if (d.kind !== 'pan') endHistoryGroup()
  }

  const selKeys = useMemo(() => new Set(sel.map(refKey)), [sel])
  const only = sel.length === 1 ? sel[0] : null
  const selWall = only?.type === 'wall' ? plan.walls[only.id] : null

  const cursor = space ? 'grab' : tool === 'select' ? 'default' : 'crosshair'
  const ghostOpening: Opening | null =
    openPreview && (tool === 'door' || tool === 'window')
      ? tool === 'door'
        ? {
            id: '__ghost',
            wallId: openPreview.wallId,
            type: 'door',
            offset: openPreview.offset,
            width: defaults.doorWidth,
            hingeSide: defaults.doorHinge,
            swing: defaults.doorSwing,
          }
        : {
            id: '__ghost',
            wallId: openPreview.wallId,
            type: 'window',
            offset: openPreview.offset,
            width: defaults.windowWidth,
          }
      : null

  // The opening being placed (ghost) or moved.
  const placementOpening = ghostOpening ?? (movingOpeningId ? (plan.openings[movingOpeningId] ?? null) : null)

  // Openings showing placement dimensions: the one under the gesture, plus
  // every opening of the selection — no cardinality threshold, and a selected
  // wall stays silent for the openings it carries. Gesture and selection draw
  // identically, so the drag merely continues past the release into the
  // selection it leaves behind.
  const dimmedOpenings = useMemo(() => {
    const byId = new Map<string, Opening>()
    if (placementOpening) byId.set(placementOpening.id, placementOpening)
    for (const ref of sel) {
      if (ref.type !== 'opening') continue
      const o = plan.openings[ref.id]
      if (o) byId.set(o.id, o)
    }
    return [...byId.values()]
  }, [placementOpening, sel, plan.openings])

  // Room labels are never selected (CONTEXT.md: Selection) — each line of a
  // text block is dragged and double-click-edited directly. Dragging a line
  // gives its label a custom placement; on an unlabeled room the drag
  // creates the label.
  const onLinePointerDown = (block: RoomTextBlock, label: RoomLabel | null, e: React.PointerEvent) => {
    if (tool !== 'select' || e.button !== 0 || space) return
    if (label) startPlanDrag({ kind: 'label', id: label.id, room: block.room ?? null })
    else if (block.room)
      startPlanDrag({ kind: 'newLabel', start: toPlan(e.clientX, e.clientY), room: block.room })
  }

  const startEditing = (block: RoomTextBlock, label: RoomLabel | null) => {
    // the input overlays the label's own name slot in the (possibly stacked)
    // block; creation targets the top slot
    const named = blockNameSlots(block, label?.id)
    const line = label
      ? Math.max(
          0,
          named.findIndex((l) => l.id === label.id),
        )
      : 0
    setEditing({
      key: label?.id ?? block.key,
      labelId: label?.id ?? null,
      x: block.x,
      y: block.y + line * BLOCK_LINE_HEIGHT,
      initial: label?.name ?? '',
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

  const onLineDoubleClick = (block: RoomTextBlock, label: RoomLabel | null, e: React.MouseEvent) => {
    if (tool !== 'select') return
    e.stopPropagation()
    startEditing(block, label)
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
    // edit the room's area-carrying block: its oldest label, or create one
    const block = room ? blocks.find((b) => b.room === room && b.area !== undefined) : undefined
    if (block) startEditing(block, block.labels[0] ?? null)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
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
        {/* purely visual (CONTEXT.md: Grid) — grid snapping stays active either way */}
        {gridVisible && <GridLines view={view} pxPerCm={zoomScale} />}
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
        <JunctionPatches plan={plan} selection={sel} />
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
          labels={overlayLabels}
          measuresVisible={measuresVisible}
          editingKey={editing?.key}
          onLinePointerDown={onLinePointerDown}
          onLineDoubleClick={onLineDoubleClick}
        />
        {tool === 'select' &&
          Object.values(plan.walls).map((wall) => (
            <WallGrabZone
              key={wall.id}
              plan={plan}
              wall={wall}
              pxPerCm={zoomScale}
              cursor="move"
              onPointerDown={(e) =>
                onElementPointerDown({ type: 'wall', id: wall.id }, e, (c) => {
                  const refs: ElementRef[] = [{ type: 'wall', id: wall.id }]
                  return {
                    kind: 'group',
                    refs,
                    start: c,
                    orig: plan,
                    refPoint: referencePoint(plan, refs, c),
                  }
                })
              }
              onPointerEnter={() => setHoverWall(wall.id)}
              onPointerLeave={() => setHoverWall((h) => (h === wall.id ? null : h))}
            />
          ))}
        {tool === 'select' &&
          Object.values(plan.openings).map((opening) => (
            <OpeningGrabZone
              key={opening.id}
              plan={plan}
              opening={opening}
              pxPerCm={zoomScale}
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
        {/* after the grab zones so the label wins the hit-test where they overlap.
            Every wall keeps its own dimension throughout: placement dimensions
            wear a different register and no longer share its slot.
            Hiding is global — selecting a wall does not bring its dimension
            back, so a hidden plan stays clean whatever is selected. */}
        {measuresVisible &&
          Object.values(plan.walls).map((wall) => (
            <DimLabel
              key={wall.id}
              plan={plan}
              wall={wall}
              selected={selKeys.has(refKey({ type: 'wall', id: wall.id }))}
              onPointerDown={
                tool === 'select'
                  ? (e) => {
                      if (e.button !== 0 || space) return
                      startPlanDrag({ kind: 'dim', id: wall.id, start: toPlan(e.clientX, e.clientY) })
                    }
                  : undefined
              }
            />
          ))}
        {dimmedOpenings.map((opening) => (
          <PlacementDims key={opening.id} plan={plan} opening={opening} rooms={rooms} pxPerCm={zoomScale} />
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
                startPlanDrag({ kind: 'point', id: p.id, orig: plan })
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
            thickness={defaults.wallThickness}
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
            : 'Click to start a wall chain · S toggles snap · Alt inverts it'
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
            {Math.round(zoomRatio * 100)}%
          </button>
          <button
            className="floating-btn icon"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => zoomCenter(1 / 1.25)}
          >
            <ZoomIn size={16} aria-hidden />
          </button>
          <span className="floating-sep" />
          {/* shows the *effective* state — Alt inverts the state it holds, and
              a click always toggles snapping itself, never the inversion */}
          <button
            className={free ? 'floating-btn icon' : 'floating-btn icon active'}
            title={snapEnabled ? 'Disable snap (S)' : 'Enable snap (S)'}
            aria-label="Snap"
            aria-pressed={!free}
            onClick={toggleSnap}
          >
            <Magnet size={16} aria-hidden />
          </button>
          <button
            className={gridVisible ? 'floating-btn icon active' : 'floating-btn icon'}
            title={gridVisible ? 'Hide grid' : 'Show grid'}
            aria-label="Grid"
            aria-pressed={gridVisible}
            onClick={() => {
              setGridVisible(!gridVisible)
              saveGridVisible(!gridVisible)
            }}
          >
            <Grid3x3 size={16} aria-hidden />
          </button>
          <button
            className={measuresVisible ? 'floating-btn icon active' : 'floating-btn icon'}
            title={measuresVisible ? 'Hide measures' : 'Show measures'}
            aria-label="Measures"
            aria-pressed={measuresVisible}
            onClick={() => {
              setMeasuresVisible(!measuresVisible)
              saveMeasuresVisible(!measuresVisible)
            }}
          >
            <RulerDimensionLine size={16} aria-hidden />
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

      {/* tool panel, fixed floating card on the left (CONTEXT.md: Tool panel) */}
      <ToolPanel
        plan={plan}
        rooms={rooms}
        sel={sel}
        tool={tool}
        defaults={defaults}
        setDefaults={setDefaults}
        setPlan={setPlan}
        onDelete={() => deleteSelection(sel)}
      />
    </div>
  )
}
