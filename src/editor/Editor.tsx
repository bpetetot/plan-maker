// Editor UX per spec §4 — variant A "Floating minimal" of the ticket 05 prototype.
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useKeyHold } from '@tanstack/react-hotkeys';
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
} from 'lucide-react';
import { useStore } from 'zustand';
import type { Vec } from '../model/geometry';
import { nearestWall, projectOnWall, wallLength, wallPoints, wallSide } from '../model/geometry';
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
} from '../model/operations';
import type { Room } from '../model/rooms';
import { clampToRoom, detectRooms, reconcileRoomLabels, roomAt } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import {
  deleteElements,
  elementsInRect,
  isSelected,
  refKey,
  referencePoint,
  toggleRef,
  translateElements,
} from '../model/selection';
import type { Snap } from '../model/snap';
import { realignDelta, snapPoint } from '../model/snap';
import type { Opening, Plan, RoomLabel } from '../model/types';
import { WALL_THICKNESS } from '../model/types';
import { beginHistoryGroup, endHistoryGroup, redo, undo, usePlanStore } from '../store/planStore';
import { GridLines } from './grid';
import { toggleGrid, toggleMeasures, usePreferences } from './preferences';
import { loadSnapEnabled, saveSnapEnabled } from './snapPref';
import type { RoomTextBlock } from './render';
import { ToolPanel } from './ToolPanel';
import {
  BLOCK_LINE_HEIGHT,
  blockNameSlots,
  COLORS,
  DimLabel,
  dimTravelBounds,
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
} from './render';
import type { Tool, ToolDefaults } from './tools';
import { initialToolDefaults } from './tools';
import { keyHint } from './useAppHotkeys';
import { useSpaceHeld, useView } from './useView';

type Drag =
  | { kind: 'pan'; x: number; y: number }
  // `orig`: plan at drag start. Labels reconcile against it at gesture end,
  // never on intermediate states.
  | { kind: 'point'; id: string; orig: Plan }
  | {
      kind: 'group';
      refs: ElementRef[];
      start: Vec;
      orig: Plan;
      clickRef?: ElementRef;
      // Fixed at pointer-down, not recomputed: the preview would jump when
      // another candidate became the nearest.
      refPoint: Vec | null;
      moved?: boolean;
    }
  // `grabDelta` keeps the grab point under the cursor (CONTEXT.md: Grab zone).
  | { kind: 'opening'; id: string; start: Vec; grabDelta: number; moved?: boolean }
  // `room` clamps the block; null (orphan label, impossible per CONTEXT.md:
  // Room label) is defensive and moves freely.
  | { kind: 'label'; id: string; room: Room | null; grabDelta: Vec }
  // The label is created only past the click threshold: a plain click must
  // not touch the plan.
  | { kind: 'newLabel'; start: Vec; room: Room; grabDelta: Vec; id?: string }
  | { kind: 'dim'; id: string; start: Vec; grabDelta: number; moved?: boolean }
  // `b` is mutated on the ref, not held in state: pointer-up would read a
  // stale React value.
  | { kind: 'marquee'; additive: boolean; prev: ElementRef[]; a: Vec; b: Vec };

// Screen px; below this a drag is a plain click.
const CLICK_PX = 4;

const pointSnap = (p: Plan, id: string): Snap => ({
  x: p.points[id].x,
  y: p.points[id].y,
  kind: 'point',
  pointId: id,
});

/** Registry lives in App (ADR 0012); lifting this state there instead would
 *  move the editor's insides into its parent. Read through a ref, never stale. */
export interface EditorCommands {
  cancel: () => void;
  deleteSelection: () => void;
  selectTool: (tool: Tool) => void;
  toggleSnap: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** Back to 100% — the ratio the zoom indicator shows, not a scale of 1. */
  zoomActual: () => void;
}

/** Shared so App and test harnesses reach the editor the same way. */
export const editorCommands = (ref: React.RefObject<EditorCommands | null>) => ({
  cancel: () => ref.current?.cancel(),
  deleteSelection: () => ref.current?.deleteSelection(),
  selectTool: (tool: Tool) => ref.current?.selectTool(tool),
  toggleSnap: () => ref.current?.toggleSnap(),
  zoomIn: () => ref.current?.zoomIn(),
  zoomOut: () => ref.current?.zoomOut(),
  fit: () => ref.current?.fit(),
  zoomActual: () => ref.current?.zoomActual(),
});

export default function Editor({ ref: commands }: { ref?: React.Ref<EditorCommands> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { view, toPlan, pxPerCm, zoomScale, zoomRatio, canZoomIn, canZoomOut, zoomCenter, panByPx, fitPlan } =
    useView(svgRef);
  const plan = usePlanStore((s) => s.plan);
  const setPlan = usePlanStore((s) => s.setPlan);
  const planEpoch = usePlanStore((s) => s.planEpoch);
  const canUndo = useStore(usePlanStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(usePlanStore.temporal, (s) => s.futureStates.length > 0);
  const [tool, setTool] = useState<Tool>('select');
  const gridVisible = usePreferences((s) => s.grid);
  const measuresVisible = usePreferences((s) => s.measures);
  const [snapEnabled, setSnapEnabled] = useState(loadSnapEnabled);
  const [defaults, setDefaults] = useState<ToolDefaults>(initialToolDefaults);
  const [sel, setSel] = useState<ElementRef[]>([]);
  const [hoverWall, setHoverWall] = useState<string | null>(null);
  // First click held as a pending snap, not committed: aborting the chain
  // (Esc, tool switch, double-click) must not mutate the plan.
  const [chain, setChain] = useState<{ start: string; last: string } | { pending: Snap } | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [openPreview, setOpenPreview] = useState<{ wallId: string; offset: number } | null>(null);
  const [marquee, setMarquee] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(
    null,
  );
  const [movingOpeningId, setMovingOpeningId] = useState<string | null>(null);
  // Plan touched on commit only, not per keystroke: one undo entry.
  // labelId null until the room has a label — created on non-empty commit.
  const [editing, setEditing] = useState<{
    key: string;
    labelId: string | null;
    x: number;
    y: number;
    initial: string;
  } | null>(null);
  const editCancelled = useRef(false);
  const space = useSpaceHeld();
  const drag = useRef<Drag | null>(null);
  // Tracked, not sampled: the snap toggle shows the *effective* state, so Alt
  // transitions must re-render. The keyup after an Alt+Tab never arrives.
  const altHeld = useKeyHold('Alt');
  // Alt inverts the current snap state for the gesture (ADR 0007).
  const isFree = (alt: boolean) => !snapEnabled !== alt;
  const free = isFree(altHeld);

  // Fit on any plan replacement (open, restore, reset); mount included, which
  // frames a plan restored before the editor mounted.
  useEffect(() => {
    fitPlan(usePlanStore.getState().plan);
    // fitPlan is recreated every render but only reads the svg ref; epoch is the trigger
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [planEpoch]);

  const rooms = useMemo(() => detectRooms(plan), [plan]);
  const blocks = useMemo(() => roomTextBlocks(rooms, Object.values(plan.roomLabels)), [rooms, plan]);
  // The plan reconciles labels only at gesture end; the display previews it
  // live, so a default-placement block tracks its room's anchor mid-drag.
  const dragNow = drag.current;
  const wallDrag = dragNow && (dragNow.kind === 'point' || dragNow.kind === 'group') ? dragNow : null;
  const overlayLabels = useMemo(
    () => Object.values((wallDrag ? reconcileRoomLabels(wallDrag.orig, plan) : plan).roomLabels),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [wallDrag, plan],
  );

  const tolerance = () => 14 / pxPerCm();

  const switchTool = (next: Tool) => {
    setTool(next);
    setChain(null);
    setSnap(null);
    setOpenPreview(null);
    if (next !== 'select') setSel([]);
  };

  const deleteSelection = useCallback(
    (selection: ElementRef[]) => {
      if (selection.length === 0) return;
      setPlan((p) => deleteElements(p, selection));
      setSel([]);
    },
    [setPlan],
  );

  const toggleSnap = useCallback(() => {
    setSnapEnabled(!snapEnabled);
    saveSnapEnabled(!snapEnabled);
  }, [snapEnabled]);

  // No dependency list: a list naming chain, sel, tool, snapEnabled and the
  // camera goes stale the first time someone forgets to extend it.
  useImperativeHandle(commands, () => ({
    cancel: () => {
      if (chain) setChain(null);
      else if (sel.length > 0) setSel([]);
      else switchTool('select');
    },
    deleteSelection: () => deleteSelection(sel),
    selectTool: switchTool,
    toggleSnap,
    zoomIn: () => zoomCenter(1 / 1.25),
    zoomOut: () => zoomCenter(1.25),
    fit: () => fitPlan(plan),
    // zoomCenter divides by its factor and zoomRatio is scale over the 100%
    // reference, so the ratio is the factor landing exactly on 100%.
    zoomActual: () => zoomCenter(zoomRatio),
  }));

  const startPlanDrag = (d: Drag) => {
    beginHistoryGroup();
    drag.current = d;
  };

  const onSvgPointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    if (drag.current) {
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (space || e.button === 1) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const c = toPlan(e.clientX, e.clientY);
    if (tool === 'wall') {
      const anchor = chain ? ('pending' in chain ? chain.pending : plan.points[chain.last]) : undefined;
      const s = snapPoint(plan, c.x, c.y, { tolerance: tolerance(), anchor, walls: true, free });
      if (chain && 'start' in chain && s.pointId === chain.start && chain.last !== chain.start) {
        setPlan(
          (p) =>
            commitWall(p, pointSnap(p, chain.last), pointSnap(p, chain.start), defaults.wallThickness)[0],
        );
        setChain(null);
        setSnap(null);
        return;
      }
      if (chain) {
        // One setPlan per drawn wall: pending start and wall land in a single
        // history entry (ADR 0002).
        const startSnap = 'pending' in chain ? chain.pending : pointSnap(plan, chain.last);
        const [withStart, startId] = commitPoint(plan, startSnap);
        const [next, pointId] = commitWall(
          withStart,
          pointSnap(withStart, startId),
          s,
          defaults.wallThickness,
        );
        setPlan(() => next);
        setChain({ start: 'pending' in chain ? startId : chain.start, last: pointId });
      } else {
        setChain({ pending: s });
      }
    } else if ((tool === 'door' || tool === 'window') && openPreview) {
      // Tool stays active, but the new opening is selected so its panel shows.
      const [next, id] = placeOpening(plan, openPreview.wallId, tool, openPreview.offset, {
        width: tool === 'door' ? defaults.doorWidth : defaults.windowWidth,
        hingeSide: defaults.doorHinge,
        swing: defaults.doorSwing,
      });
      setPlan(() => next);
      setSel(id ? [{ type: 'opening', id }] : []);
    } else if (tool === 'select') {
      drag.current = { kind: 'marquee', additive: e.shiftKey, prev: sel, a: c, b: c };
      setMarquee({ a: c, b: c });
      svg.setPointerCapture(e.pointerId);
    } else {
      setSel([]);
    }
  };

  const onElementPointerDown = (ref: ElementRef, e: React.PointerEvent, soloDrag: (c: Vec) => Drag) => {
    if (e.button !== 0 || space) return;
    if (e.shiftKey) {
      // Or the svg handler starts a marquee on top of this toggle.
      e.stopPropagation();
      setSel((s) => toggleRef(s, ref));
      return;
    }
    const c = toPlan(e.clientX, e.clientY);
    if (sel.length > 1 && isSelected(sel, ref)) {
      startPlanDrag({
        kind: 'group',
        refs: sel,
        start: c,
        orig: plan,
        clickRef: ref,
        refPoint: referencePoint(plan, sel, c),
      });
    } else {
      setSel([ref]);
      startPlanDrag(soloDrag(c));
    }
  };

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const c = toPlan(e.clientX, e.clientY);
    const d = drag.current;
    if (d) {
      if (d.kind === 'pan') {
        panByPx(e.clientX - d.x, e.clientY - d.y);
        drag.current = { kind: 'pan', x: e.clientX, y: e.clientY };
      } else if (d.kind === 'point') {
        const s = snapPoint(plan, c.x, c.y, {
          tolerance: tolerance(),
          exclude: new Set([d.id]),
          free,
        });
        setPlan((p) => movePoint(p, d.id, s.x, s.y));
        setSnap(s);
      } else if (d.kind === 'group') {
        if (!d.moved && Math.hypot(c.x - d.start.x, c.y - d.start.y) * pxPerCm() >= CLICK_PX) {
          d.moved = true;
        }
        if (d.moved) {
          // e.altKey, not the tracked state: correct even when Alt went down
          // before the window had focus.
          const { dx, dy } = realignDelta(d.refPoint, c.x - d.start.x, c.y - d.start.y, isFree(e.altKey));
          setPlan(() => translateElements(d.orig, d.refs, dx, dy));
        }
      } else if (d.kind === 'marquee') {
        d.b = c;
        setMarquee({ a: d.a, b: c });
      } else if (d.kind === 'opening') {
        const opening = plan.openings[d.id];
        if (opening) {
          if (!d.moved && Math.hypot(c.x - d.start.x, c.y - d.start.y) * pxPerCm() >= CLICK_PX) {
            d.moved = true;
            setMovingOpeningId(d.id);
          }
          if (d.moved) {
            const { t } = projectOnWall(plan, plan.walls[opening.wallId], c.x, c.y);
            setPlan((p) => moveOpening(p, d.id, t + d.grabDelta));
          }
        }
      } else if (d.kind === 'label') {
        const target = { x: c.x + d.grabDelta.x, y: c.y + d.grabDelta.y };
        const t = d.room ? clampToRoom(target, d.room) : target;
        setPlan((p) => moveRoomLabel(p, d.id, t.x, t.y));
      } else if (d.kind === 'newLabel') {
        const t = clampToRoom({ x: c.x + d.grabDelta.x, y: c.y + d.grabDelta.y }, d.room);
        if (d.id) {
          setPlan((p) => moveRoomLabel(p, d.id!, t.x, t.y));
        } else if (Math.hypot(c.x - d.start.x, c.y - d.start.y) * pxPerCm() >= CLICK_PX) {
          const [next, id] = addRoomLabel(plan, '', t.x, t.y);
          setPlan(() => next);
          d.id = id;
        }
      } else if (d.kind === 'dim') {
        const wall = plan.walls[d.id];
        if (wall) {
          if (!d.moved && Math.hypot(c.x - d.start.x, c.y - d.start.y) * pxPerCm() >= CLICK_PX) {
            d.moved = true;
          }
          if (d.moved) {
            const length = wallLength(plan, wall);
            const { t } = projectOnWall(plan, wall, c.x, c.y);
            const side = wallSide(plan, wall, c.x, c.y);
            setPlan((p) =>
              setDimPlacement(
                p,
                d.id,
                length < 1 ? 0.5 : (t + d.grabDelta) / length,
                side,
                dimTravelBounds(plan, wall, side),
              ),
            );
          }
        }
      }
      return;
    }
    if (tool === 'wall') {
      const anchor = chain ? ('pending' in chain ? chain.pending : plan.points[chain.last]) : undefined;
      setSnap(snapPoint(plan, c.x, c.y, { tolerance: tolerance(), anchor, walls: true, free }));
    } else if (tool === 'door' || tool === 'window') {
      const near = nearestWall(plan, c.x, c.y, 40 / pxPerCm() + WALL_THICKNESS);
      if (near) {
        const width = tool === 'door' ? defaults.doorWidth : defaults.windowWidth;
        const offset = clampOpeningOffset(plan, near.wall, near.t, width);
        setOpenPreview(offset === null ? null : { wallId: near.wall.id, offset });
      } else setOpenPreview(null);
    }
  };

  const onSvgContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (drag.current) return;
    if (chain) {
      setChain(null);
      setSnap(null);
    } else if (tool !== 'select') {
      switchTool('select');
    }
  };

  const onSvgPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.kind === 'marquee') {
      const wPx = Math.abs(d.b.x - d.a.x) * pxPerCm();
      const hPx = Math.abs(d.b.y - d.a.y) * pxPerCm();
      if (wPx < CLICK_PX && hPx < CLICK_PX) {
        setSel(d.additive ? d.prev : []);
      } else {
        const captured = elementsInRect(plan, d.a, d.b);
        setSel(d.additive ? [...d.prev, ...captured.filter((r) => !isSelected(d.prev, r))] : captured);
      }
      setMarquee(null);
      return;
    }
    if (d.kind === 'group' && !d.moved && d.clickRef) setSel([d.clickRef]);
    // The dim label is a handle, not an element: only a click selects its wall.
    if (d.kind === 'dim') {
      if (!d.moved) setSel([{ type: 'wall', id: d.id }]);
    }
    if (d.kind === 'point') setSnap(null);
    if (d.kind === 'opening') setMovingOpeningId(null);
    // Merge (ADR 0003), split (ADR 0002) and reconcile (CONTEXT.md: Room
    // label) once at gesture end, inside the same history group.
    if (d.kind === 'point' || d.kind === 'group') {
      setPlan((p) => {
        const moving = new Set<string>();
        if (d.kind === 'point') moving.add(d.id);
        else
          for (const ref of d.refs) {
            const wall = ref.type === 'wall' ? p.walls[ref.id] : undefined;
            if (wall) {
              moving.add(wall.startPointId);
              moving.add(wall.endPointId);
            }
          }
        return reconcileRoomLabels(d.orig, planarize(mergeCoincidentPoints(p, moving)));
      });
    }
    if (d.kind !== 'pan') endHistoryGroup();
  };

  const selKeys = useMemo(() => new Set(sel.map(refKey)), [sel]);
  const only = sel.length === 1 ? sel[0] : null;
  const selWall = only?.type === 'wall' ? plan.walls[only.id] : null;

  const cursor = space ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
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
      : null;

  const placementOpening =
    ghostOpening ?? (movingOpeningId ? (plan.openings[movingOpeningId] ?? null) : null);

  // Gesture plus selection, no cardinality threshold; a selected wall stays
  // silent for the openings it carries.
  const dimmedOpenings = useMemo(() => {
    const byId = new Map<string, Opening>();
    if (placementOpening) byId.set(placementOpening.id, placementOpening);
    for (const ref of sel) {
      if (ref.type !== 'opening') continue;
      const o = plan.openings[ref.id];
      if (o) byId.set(o.id, o);
    }
    return [...byId.values()];
  }, [placementOpening, sel, plan.openings]);

  // Room labels are never selected (CONTEXT.md: Selection): a line is dragged
  // and double-click-edited directly.
  const onLinePointerDown = (block: RoomTextBlock, label: RoomLabel | null, e: React.PointerEvent) => {
    if (tool !== 'select' || e.button !== 0 || space) return;
    if (label) {
      const c = toPlan(e.clientX, e.clientY);
      startPlanDrag({
        kind: 'label',
        id: label.id,
        room: block.room ?? null,
        grabDelta: { x: block.x - c.x, y: block.y - c.y },
      });
    } else if (block.room) {
      const c = toPlan(e.clientX, e.clientY);
      startPlanDrag({
        kind: 'newLabel',
        start: c,
        room: block.room,
        grabDelta: { x: block.x - c.x, y: block.y - c.y },
      });
    }
  };

  const startEditing = (block: RoomTextBlock, label: RoomLabel | null) => {
    // The input overlays the label's own slot in a stacked block; creation
    // targets the top slot.
    const named = blockNameSlots(block, label?.id);
    const line = label
      ? Math.max(
          0,
          named.findIndex((l) => l.id === label.id),
        )
      : 0;
    setEditing({
      key: label?.id ?? block.key,
      labelId: label?.id ?? null,
      x: block.x,
      y: block.y + line * BLOCK_LINE_HEIGHT,
      initial: label?.name ?? '',
    });
  };

  // Commit path shared by Enter, Escape and clicking away — all end in a blur.
  const finishEditing = (value: string) => {
    const ed = editing;
    setEditing(null);
    if (!ed) return;
    if (editCancelled.current) {
      editCancelled.current = false;
      return;
    }
    const name = value.trim();
    if (name === ed.initial) return;
    if (ed.labelId) setPlan((p) => renameRoomLabel(p, ed.labelId!, name));
    else if (name) setPlan((p) => addRoomLabel(p, name, ed.x, ed.y)[0]);
  };

  const onLineDoubleClick = (block: RoomTextBlock, label: RoomLabel | null, e: React.MouseEvent) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    startEditing(block, label);
  };

  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (tool === 'wall') {
      setChain(null);
      setSnap(null);
      return;
    }
    if (tool !== 'select') return;
    const c = toPlan(e.clientX, e.clientY);
    const room = roomAt(rooms, c.x, c.y);
    const block = room ? blocks.find((b) => b.room === room && b.area !== undefined) : undefined;
    if (block) startEditing(block, block.labels[0] ?? null);
  };

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
                  const refs: ElementRef[] = [{ type: 'wall', id: wall.id }];
                  return {
                    kind: 'group',
                    refs,
                    start: c,
                    orig: plan,
                    refPoint: referencePoint(plan, refs, c),
                  };
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
                  grabDelta: opening.offset - projectOnWall(plan, plan.walls[opening.wallId], c.x, c.y).t,
                }))
              }
            />
          ))}
        {/* After the grab zones so the label wins the hit-test. Hiding is
            global: selecting a wall does not bring its dimension back. */}
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
                      if (e.button !== 0 || space) return;
                      const c = toPlan(e.clientX, e.clientY);
                      const textT = (wall.dimPlacement?.t ?? 0.5) * wallLength(plan, wall);
                      startPlanDrag({
                        kind: 'dim',
                        id: wall.id,
                        start: c,
                        grabDelta: textT - projectOnWall(plan, wall, c.x, c.y).t,
                      });
                    }
                  : undefined
              }
            />
          ))}
        {dimmedOpenings.map((opening) => (
          <PlacementDims key={opening.id} plan={plan} opening={opening} pxPerCm={zoomScale} />
        ))}
        {selWall &&
          wallPoints(plan, selWall).map((p) => (
            <Handle
              key={p.id}
              x={p.x}
              y={p.y}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                startPlanDrag({ kind: 'point', id: p.id, orig: plan });
                svgRef.current!.setPointerCapture(e.pointerId);
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
        {editing && (
          <foreignObject x={editing.x - 100} y={editing.y - 13} width={200} height={17}>
            <input
              className="room-name-input"
              defaultValue={editing.initial}
              autoFocus
              onFocus={(e) => e.target.select()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                else if (e.key === 'Escape') {
                  editCancelled.current = true;
                  e.currentTarget.blur();
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
            ['select', 'Select', MousePointer2],
            ['wall', 'Wall', BrickWall],
            ['door', 'Door', DoorClosed],
            ['window', 'Window', Grid2x2],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            className={tool === m ? 'floating-btn icon active' : 'floating-btn icon'}
            title={`${label} (${keyHint(`tool:${m}`)})`}
            aria-label={label}
            aria-pressed={tool === m}
            onClick={() => switchTool(m)}
          >
            <Icon size={16} aria-hidden />
            <span className="key-hint">{keyHint(`tool:${m}`)}</span>
          </button>
        ))}
      </div>

      <div
        className="hint"
        style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)' }}
      >
        {tool === 'wall'
          ? chain
            ? `Click to add a wall · click the start point to close the room · ${keyHint('cancel')} / double-click to stop`
            : `Click to start a wall chain · ${keyHint('toggleSnap')} toggles snap · Alt inverts it`
          : tool === 'door' || tool === 'window'
            ? 'Hover a wall, click to place'
            : 'Click or drag a box to select · Shift+click adds · double-click a room to name it · Space+drag pans · scroll zooms'}
      </div>

      <div style={{ position: 'absolute', left: 16, bottom: 16, display: 'flex', gap: 8 }}>
        <div className="floating">
          <button
            className="floating-btn icon"
            title={`Zoom out (${keyHint('zoomOut')})`}
            aria-label="Zoom out"
            disabled={!canZoomOut}
            onClick={() => zoomCenter(1.25)}
          >
            <ZoomOut size={16} aria-hidden />
          </button>
          <button
            className="floating-btn"
            title={`Fit to plan (${keyHint('fit')})`}
            onClick={() => fitPlan(plan)}
          >
            {Math.round(zoomRatio * 100)}%
          </button>
          <button
            className="floating-btn icon"
            title={`Zoom in (${keyHint('zoomIn')})`}
            aria-label="Zoom in"
            disabled={!canZoomIn}
            onClick={() => zoomCenter(1 / 1.25)}
          >
            <ZoomIn size={16} aria-hidden />
          </button>
          <span className="floating-sep" />
          {/* Effective state: a click toggles snapping itself, never Alt's
              inversion. */}
          <button
            className={free ? 'floating-btn icon' : 'floating-btn icon active'}
            title={`${snapEnabled ? 'Disable' : 'Enable'} snap (${keyHint('toggleSnap')})`}
            aria-label="Snap"
            aria-pressed={!free}
            onClick={toggleSnap}
          >
            <Magnet size={16} aria-hidden />
          </button>
          <button
            className={gridVisible ? 'floating-btn icon active' : 'floating-btn icon'}
            title={`${gridVisible ? 'Hide' : 'Show'} grid (${keyHint('toggleGrid')})`}
            aria-label="Grid"
            aria-pressed={gridVisible}
            onClick={toggleGrid}
          >
            <Grid3x3 size={16} aria-hidden />
          </button>
          <button
            className={measuresVisible ? 'floating-btn icon active' : 'floating-btn icon'}
            title={`${measuresVisible ? 'Hide' : 'Show'} measures (${keyHint('toggleMeasures')})`}
            aria-label="Measures"
            aria-pressed={measuresVisible}
            onClick={toggleMeasures}
          >
            <RulerDimensionLine size={16} aria-hidden />
          </button>
        </div>
        <div className="floating">
          <button
            className="floating-btn icon"
            title={`Undo (${keyHint('undo')})`}
            aria-label="Undo"
            disabled={!canUndo}
            onClick={() => undo()}
          >
            <Undo2 size={16} aria-hidden />
          </button>
          <button
            className="floating-btn icon"
            title={`Redo (${keyHint('redo')})`}
            aria-label="Redo"
            disabled={!canRedo}
            onClick={() => redo()}
          >
            <Redo2 size={16} aria-hidden />
          </button>
        </div>
      </div>

      {/* CONTEXT.md: Tool panel */}
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
  );
}
