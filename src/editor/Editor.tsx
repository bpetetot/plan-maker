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
  Ruler,
  RulerDimensionLine,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useStore } from 'zustand';
import type { Vec } from '../model/geometry';
import { projectOnWall, wallLength, wallPoints } from '../model/geometry';
import { addRoomLabel, addText, deleteText, editTextContent, renameRoomLabel } from '../model/operations';
import { detectRooms, reconcileRoomLabels, roomAt, roomKey, roomWallIds } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import {
  allElements,
  deleteElements,
  elementsInRect,
  isSelected,
  refKey,
  referencePoint,
  selectedRoom,
  selectionDeletion,
  selectionForRoom,
  toggleRef,
} from '../model/selection';
import type { Opening, RoomLabel, TextNote, TextSize, Wall } from '../model/types';
import { beginHistoryGroup, endHistoryGroup, redo, undo, usePlanStore } from '../store/planStore';
import { GridLines } from './grid';
import { InlineEditor } from './inlineEditor';
import type { PlanDrag, PlanDragSpec } from './planDrag';
import { aimPlanDrag, beginPlanDrag, commitPlanDrag } from './planDrag';
import { CLICK_PX } from './gesture';
import type { Placement, PlacementResult, PlacementStage } from './placement';
import {
  aimPlacement,
  beginPlacement,
  cancelPlacement,
  clickPlacement,
  finishPlacement,
  placementChrome,
  placementStage,
} from './placement';
import { setMeasures, toggleGrid, toggleMeasures, usePreferences } from './preferences';
import { loadSnapEnabled, saveSnapEnabled } from './snapPref';
import type { RoomTextBlock } from '../sheet/rooms';
import { ToolPanel } from './ToolPanel';
import {
  Handle,
  OpeningGrabZone,
  PlacementDims,
  RoomFill,
  RubberWall,
  RulerGrabZone,
  SnapMarker,
  WallGrabZone,
} from './chrome';
// A ghost preview is chrome drawn with the sheet's own pieces (ADR 0005).
import { RulerLabel } from '../sheet/measures';
import { OpeningGlyph } from '../sheet/openings';
import { COLORS } from '../sheet/paint';
import { BLOCK_LINE_HEIGHT, blockNameSlots, ROOM_TEXT_HIT, roomTextBlocks } from '../sheet/rooms';
import type { ElementDecor } from '../sheet/scene';
import { PlanScene } from '../sheet/scene';
import { TEXT_SIZE_CM, textAtPoint, textEditBox } from '../sheet/texts';
import type { Tool, ToolDefaults } from './tools';
import { initialToolDefaults } from './tools';
import { keyHint } from './useAppHotkeys';
import { useSpaceHeld, useView } from './useView';

type Drag =
  | { kind: 'pan'; x: number; y: number }
  // `b` is mutated on the ref, not held in state: pointer-up would read a
  // stale React value.
  | { kind: 'marquee'; additive: boolean; prev: ElementRef[]; a: Vec; b: Vec }
  // CONTEXT.md: Plan drag. Its whole composition — snap, threshold, grab point,
  // settle, selection — lives in planDrag.ts (ADR 0023).
  | { kind: 'plan'; g: PlanDrag };

// One line per Placement stage; a missing one is a type error, not a blank hint.
const placementHint = (stage: PlacementStage): string =>
  ({
    wall: `Click to start a wall chain · ${keyHint('toggleSnap')} toggles snap · Alt inverts it`,
    chaining: `Click to add a wall · click the start point to close the room · ${keyHint('cancel')} / double-click to stop`,
    opening: 'Hover a wall, click to place',
    ruler: `Click to start a measurement · ${keyHint('toggleSnap')} toggles snap · Alt inverts it`,
    measuring: `Click to set the end point · ${keyHint('cancel')} / right-click cancels`,
    text: `Click to place text · ${keyHint('toggleSnap')} toggles snap · Alt inverts it`,
    typing: `Type freely · ${keyHint('cancel')} cancels · Ctrl+Enter or click away commits`,
  })[stage];

/** Registry lives in App (ADR 0012); lifting this state there instead would
 *  move the editor's insides into its parent. Read through a ref, never stale. */
export interface EditorCommands {
  cancel: () => void;
  selectAll: () => void;
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
  selectAll: () => ref.current?.selectAll(),
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
  const drag = useRef<Drag | null>(null);
  const { view, toPlan, pxPerCm, zoomScale, zoomRatio, canZoomIn, canZoomOut, zoomCenter, panByPx, fitPlan } =
    useView(svgRef, () => drag.current?.kind === 'pan');
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
  const [hoverRuler, setHoverRuler] = useState<string | null>(null);
  // The room's loop, not the object: a Room is rebuilt on every plan change.
  const [hoverRoom, setHoverRoom] = useState<string | null>(null);
  // CONTEXT.md: Placement. What the active drawing tool has pending — the
  // chain, the Ruler's A, the aimed Opening — is one value (ADR 0025); null
  // under Select, which poses nothing.
  const [placement, setPlacement] = useState<Placement | null>(null);
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
  // A Text under edit: `id` null while placing (the node is born only on a
  // non-empty commit, so an aborted placement leaves no orphan).
  const [textEditing, setTextEditing] = useState<{
    id: string | null;
    x: number;
    y: number;
    size: TextSize;
    initial: string;
  } | null>(null);
  // A Text placement mousedown must not run its focus fixup, or it blurs the
  // just-mounted editor and commits it empty before a key can land.
  const placingText = useRef(false);
  const space = useSpaceHeld();
  // Tracked, not sampled: the snap toggle shows the *effective* state, so Alt
  // transitions must re-render. The keyup after an Alt+Tab never arrives.
  const altHeld = useKeyHold('Alt');
  // Alt inverts the current snap state for the gesture (ADR 0007).
  const isFree = (alt: boolean) => !snapEnabled !== alt;
  const free = isFree(altHeld);
  const placementEnv = (freeNow: boolean) => ({ pxPerCm: pxPerCm(), free: freeNow, defaults });

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
  const dragKind = dragNow?.kind === 'plan' ? dragNow.g.spec.kind : null;
  const wallDrag =
    dragNow?.kind === 'plan' && (dragKind === 'point' || dragKind === 'group') ? dragNow.g : null;
  const overlayLabels = useMemo(
    () => Object.values((wallDrag ? reconcileRoomLabels(wallDrag.orig, plan) : plan).roomLabels),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [wallDrag, plan],
  );

  // A reading, not a memory (ADR 0014): a marquee over the same walls lights
  // the room exactly as a click on it does.
  const selRoom = useMemo(() => selectedRoom(plan, rooms, sel), [plan, rooms, sel]);
  // A room whose boundary does not resolve is unselectable, so it must not
  // announce itself either: the tint tracks what a click would select.
  const hovered =
    tool === 'select' && !dragNow && hoverRoom
      ? (rooms.find((room) => roomKey(room) === hoverRoom) ?? null)
      : null;
  const hoveredRoom = hovered && roomWallIds(plan, hovered) ? hovered : null;

  const switchTool = (next: Tool) => {
    setTool(next);
    setPlacement(next === 'select' ? null : beginPlacement(next));
    setTextEditing(null);
    if (next !== 'select') setSel([]);
    // A Ruler is measured, so drawing one reveals the measures (ticket 03).
    if (next === 'ruler') setMeasures(true);
  };

  // Everything a placement can ask of the editor, in one place. A completion
  // names the Tool it hands back to, which reseeds the placement itself.
  const applyPlacement = (r: PlacementResult) => {
    const next = r.plan;
    if (next) setPlan(() => next);
    if (r.tool) switchTool(r.tool);
    else setPlacement(r.placement);
    if (r.selection) setSel(r.selection);
    if (r.editor) {
      // The paired mousedown (next event) must skip its focus fixup so the
      // editor's autoFocus survives — see onMouseDown below.
      placingText.current = true;
      setTextEditing({ id: null, ...r.editor, initial: '' });
    }
  };

  const deleteSelection = useCallback(
    (selection: ElementRef[]) => {
      if (selection.length === 0) return;
      // A room keeps other rooms' walls (ADR 0015); rooms read from the latest
      // plan, not a render-time closure.
      setPlan((p) => deleteElements(p, selectionDeletion(p, detectRooms(p), selection)));
      setSel([]);
    },
    [setPlan],
  );

  const toggleSnap = useCallback(() => {
    setSnapEnabled(!snapEnabled);
    saveSnapEnabled(!snapEnabled);
  }, [snapEnabled]);

  // No dependency list: a list naming the placement, sel, tool, snapEnabled and
  // the camera goes stale the first time someone forgets to extend it.
  useImperativeHandle(commands, () => ({
    // The cancel ladder: the placement drops what it has pending, then the
    // Selection empties, then the tool falls back to Select (ADR 0018).
    cancel: () => {
      const dropped = placement && cancelPlacement(placement);
      if (dropped) setPlacement(dropped);
      else if (sel.length > 0) setSel([]);
      else switchTool('select');
    },
    // Through switchTool: a Selection only exists under the Select tool.
    selectAll: () => {
      switchTool('select');
      // Rulers join only while measures are shown (ticket 02).
      setSel(allElements(plan, measuresVisible));
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

  // A Plan drag always opens a history group — there is no variant that does
  // not, which is what closes ADR 0022's dangling precondition.
  const startPlanDrag = (spec: PlanDragSpec) => {
    beginHistoryGroup();
    drag.current = { kind: 'plan', g: beginPlanDrag(plan, spec) };
    // Or the tint flashes back onto the pre-drag room at pointer-up, and stays
    // there until the next pointermove.
    setHoverRoom(null);
  };

  // Everything the drag wants on screen, in one place. `live` goes false at
  // commit: the placement dims track a slide under way, not one that landed.
  const showPlanDrag = (d: PlanDrag, live: boolean) => {
    const spec = d.spec;
    setPlan(() => d.plan);
    setMovingOpeningId(live && spec.kind === 'opening' && d.moved ? spec.id : null);
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
    // An open Text editor swallows the click: it commits on blur, and the sheet
    // must not place a second Text or start a marquee underneath it.
    if (textEditing) return;
    const c = toPlan(e.clientX, e.clientY);
    if (placement) {
      // Alt off the event for a Text and off the tracked state for the others:
      // an inconsistency this move preserves rather than settles.
      applyPlacement(
        clickPlacement(placement, plan, c, placementEnv(placement.tool === 'text' ? isFree(e.altKey) : free)),
      );
      return;
    }
    drag.current = { kind: 'marquee', additive: e.shiftKey, prev: sel, a: c, b: c };
    setHoverRoom(null);
    setMarquee({ a: c, b: c });
    svg.setPointerCapture(e.pointerId);
  };

  const onElementPointerDown = (
    ref: ElementRef,
    e: React.PointerEvent,
    soloDrag: (c: Vec) => PlanDragSpec,
  ) => {
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
        clickRef: ref,
        refPoint: referencePoint(plan, sel, c),
      });
    } else {
      setSel([ref]);
      startPlanDrag(soloDrag(c));
    }
  };

  // A single ref-shaped element dragged alone is a group of one: same rigid
  // translation, same grid realignment.
  const soloGroup = (refs: ElementRef[], c: Vec): PlanDragSpec => ({
    kind: 'group',
    refs,
    start: c,
    refPoint: referencePoint(plan, refs, c),
  });

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const c = toPlan(e.clientX, e.clientY);
    const d = drag.current;
    if (d) {
      if (d.kind === 'pan') {
        panByPx(e.clientX - d.x, e.clientY - d.y);
        drag.current = { kind: 'pan', x: e.clientX, y: e.clientY };
      } else if (d.kind === 'marquee') {
        d.b = c;
        setMarquee({ a: d.a, b: c });
      } else {
        // e.altKey, not the tracked state: correct even when Alt went down
        // before the window had focus.
        const next = aimPlanDrag(d.g, c, { pxPerCm: pxPerCm(), free: isFree(e.altKey) });
        drag.current = { kind: 'plan', g: next };
        showPlanDrag(next, true);
      }
      return;
    }
    if (placement) {
      setPlacement(aimPlacement(placement, plan, c, placementEnv(free)));
      return;
    }
    // The browser's hit test decides what a click takes: anything above the
    // sheet outranks the room, except the block the room is clicked by.
    const target = e.target as Element;
    const onSheet = target === svgRef.current || target.classList?.contains(ROOM_TEXT_HIT);
    const room = onSheet ? roomAt(rooms, c.x, c.y) : null;
    // Same value bails React out: tracking costs a render only on a change.
    setHoverRoom(room ? roomKey(room) : null);
  };

  const onSvgContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (drag.current) return;
    const dropped = placement && cancelPlacement(placement);
    if (dropped) setPlacement(dropped);
    else if (tool !== 'select') switchTool('select');
  };

  const onSvgPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.kind === 'pan') return;
    if (d.kind === 'marquee') {
      const wPx = Math.abs(d.b.x - d.a.x) * pxPerCm();
      const hPx = Math.abs(d.b.y - d.a.y) * pxPerCm();
      if (wPx < CLICK_PX && hPx < CLICK_PX) {
        setSel(selectionForRoom(plan, roomAt(rooms, d.a.x, d.a.y), d.additive, d.prev));
      } else {
        const captured = elementsInRect(plan, d.a, d.b, measuresVisible);
        setSel(d.additive ? [...d.prev, ...captured.filter((r) => !isSelected(d.prev, r))] : captured);
      }
      setMarquee(null);
      return;
    }
    // Settle included (CONTEXT.md: Settle) — inside the same history group.
    const landed = commitPlanDrag(d.g);
    showPlanDrag(landed, false);
    if (landed.selection) setSel(landed.selection);
    endHistoryGroup();
  };

  const selKeys = useMemo(() => new Set(sel.map(refKey)), [sel]);
  const only = sel.length === 1 ? sel[0] : null;
  const selWall = only?.type === 'wall' ? plan.walls[only.id] : null;
  const selRuler = only?.type === 'ruler' ? plan.rulers[only.id] : null;

  const cursor = space ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  // What the placement puts on screen: four fields, each folded below into its
  // own piece of chrome. No field names a Tool.
  const chrome = placement ? placementChrome(placement, plan, defaults) : null;

  const placementOpening =
    chrome?.ghost ?? (movingOpeningId ? (plan.openings[movingOpeningId] ?? null) : null);

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
    const c = toPlan(e.clientX, e.clientY);
    const grabDelta = { x: block.x - c.x, y: block.y - c.y };
    if (label) {
      startPlanDrag({
        kind: 'label',
        id: label.id,
        room: block.room ?? null,
        start: c,
        grabDelta,
        additive: e.shiftKey,
        prev: sel,
      });
    } else if (block.room) {
      startPlanDrag({
        kind: 'newLabel',
        start: c,
        room: block.room,
        grabDelta,
        additive: e.shiftKey,
        prev: sel,
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

  // Null means Escape cancelled the box (CONTEXT.md: Interaction chrome).
  const finishEditing = (value: string | null) => {
    const ed = editing;
    setEditing(null);
    if (!ed || value === null) return;
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

  // Double-click a placed Text to re-open its editor (ticket 02); stops the
  // dblclick from also reaching the sheet's room-naming path.
  const onTextDoubleClick = (text: TextNote, e: React.MouseEvent) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setTextEditing({ id: text.id, x: text.x, y: text.y, size: text.size, initial: text.content });
  };

  // A just-placed node is born here; an emptied one is discarded. Null is
  // Escape: the box closes and the tool hands back, but nothing is written.
  const finishTextEditing = (value: string | null) => {
    const ed = textEditing;
    setTextEditing(null);
    // One-shot: placement hands back to Select; a re-edit is already there.
    if (tool === 'text') switchTool('select');
    if (!ed || value === null) return;
    const empty = value.trim() === '';
    if (ed.id) {
      setPlan((p) => (empty ? deleteText(p, ed.id!) : editTextContent(p, ed.id!, value)));
    } else if (!empty) {
      // A placed Text hands back to Select, selected (the 06 auto-select
      // deferral) — mirroring a placed Ruler and Opening.
      const [next, id] = addText(plan, ed.x, ed.y, value, ed.size);
      setPlan(() => next);
      setSel([{ type: 'text', id }]);
    }
  };

  // How the screen dresses each element of the sheet (ADR 0024). A wall's only
  // interactive part here is its Dimension plate: the body's grab zone is chrome.
  const dressElement = (ref: ElementRef): ElementDecor => {
    const selected = selKeys.has(refKey(ref));
    const selectable = tool === 'select';
    switch (ref.type) {
      case 'wall':
        return {
          selected,
          hovered: hoverWall === ref.id && selectable,
          onPointerDown: selectable ? (e) => onDimPointerDown(plan.walls[ref.id], e) : undefined,
        };
      case 'opening':
        return { selected };
      case 'ruler':
        return { selected, hovered: hoverRuler === ref.id && selectable };
      case 'text':
        return {
          selected,
          hidden: textEditing?.id === ref.id,
          onPointerDown: selectable
            ? (e) => onElementPointerDown(ref, e, (c) => soloGroup([ref], c))
            : undefined,
          onDoubleClick: selectable ? (e) => onTextDoubleClick(plan.texts[ref.id], e) : undefined,
        };
    }
  };

  const onDimPointerDown = (wall: Wall, e: React.PointerEvent) => {
    if (e.button !== 0 || space) return;
    const c = toPlan(e.clientX, e.clientY);
    const textT = (wall.dimPlacement?.t ?? 0.5) * wallLength(plan, wall);
    startPlanDrag({
      kind: 'dim',
      id: wall.id,
      start: c,
      grabDelta: textT - projectOnWall(plan, wall, c.x, c.y).t,
    });
  };

  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (placement) {
      // Latest plan, not the render closure: the double-click's own clicks just
      // committed through setPlan and the closure reads stale.
      applyPlacement(finishPlacement(placement, usePlanStore.getState().plan));
      return;
    }
    if (tool !== 'select') return;
    const c = toPlan(e.clientX, e.clientY);
    // A Text is content on top of any room, so re-edit it before the room label.
    // The native dblclick lands on the svg (its subtree is re-rendered by the
    // selecting mousedown), so this hit-test, not the grab rect's handler, opens
    // the editor — and firing after both mouseups, it needs no focus-fixup guard.
    const hitText = textAtPoint(Object.values(plan.texts), c.x, c.y, zoomScale);
    if (hitText) {
      onTextDoubleClick(hitText, e);
      return;
    }
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
        // Placing a Text just mounted and focused the editor; the paired
        // mousedown's focus fixup would blur it. Cancel only that one.
        onMouseDown={(e) => {
          if (placingText.current) {
            placingText.current = false;
            e.preventDefault();
          }
        }}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        // A pointer that left the sheet hovers nothing; only pointermove would
        // ever clear the tint otherwise, and it stops arriving.
        onPointerLeave={() => setHoverRoom(null)}
        onContextMenu={onSvgContextMenu}
        onDoubleClick={onCanvasDoubleClick}
      >
        {/* purely visual (CONTEXT.md: Grid) — grid snapping stays active either way */}
        {gridVisible && <GridLines view={view} pxPerCm={zoomScale} />}
        {/* under the walls: a tint marks a floor, it never repaints geometry */}
        {hoveredRoom && hoveredRoom !== selRoom && <RoomFill room={hoveredRoom} variant="hover" />}
        {selRoom && <RoomFill room={selRoom} variant="selected" />}
        <PlanScene
          plan={plan}
          rooms={rooms}
          measuresVisible={measuresVisible}
          decor={{
            element: dressElement,
            pxPerCm: zoomScale,
            labels: overlayLabels,
            editingKey: editing?.key,
            onLinePointerDown,
            onLineDoubleClick,
          }}
          chrome={
            <>
              {tool === 'select' &&
                Object.values(plan.walls).map((wall) => (
                  <WallGrabZone
                    key={wall.id}
                    plan={plan}
                    wall={wall}
                    pxPerCm={zoomScale}
                    cursor="move"
                    onPointerDown={(e) =>
                      onElementPointerDown({ type: 'wall', id: wall.id }, e, (c) =>
                        soloGroup([{ type: 'wall', id: wall.id }], c),
                      )
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
                        grabDelta:
                          opening.offset - projectOnWall(plan, plan.walls[opening.wallId], c.x, c.y).t,
                      }))
                    }
                  />
                ))}
              {/* Only while drawn: measures hidden ⇒ a Ruler is inert (ticket 02).
                  A body drag translates the one Ruler rigidly (a single-ref group). */}
              {tool === 'select' &&
                measuresVisible &&
                Object.values(plan.rulers).map((ruler) => (
                  <RulerGrabZone
                    key={ruler.id}
                    ruler={ruler}
                    onPointerDown={(e) =>
                      onElementPointerDown({ type: 'ruler', id: ruler.id }, e, (c) =>
                        soloGroup([{ type: 'ruler', id: ruler.id }], c),
                      )
                    }
                    onPointerEnter={() => setHoverRuler(ruler.id)}
                    onPointerLeave={() => setHoverRuler((h) => (h === ruler.id ? null : h))}
                  />
                ))}
            </>
          }
        />
        {dimmedOpenings.map((opening) => (
          <PlacementDims key={opening.id} plan={plan} opening={opening} pxPerCm={zoomScale} />
        ))}
        {selWall &&
          wallPoints(plan, selWall).map((p) => (
            <Handle
              key={p.id}
              x={p.x}
              y={p.y}
              pxPerCm={zoomScale}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                const c = toPlan(e.clientX, e.clientY);
                startPlanDrag({
                  kind: 'point',
                  id: p.id,
                  grabDelta: { x: p.x - c.x, y: p.y - c.y },
                });
                svgRef.current!.setPointerCapture(e.pointerId);
              }}
            />
          ))}
        {selRuler &&
          measuresVisible &&
          (['a', 'b'] as const).map((end) => {
            const p = selRuler[end];
            return (
              <Handle
                key={end}
                x={p.x}
                y={p.y}
                pxPerCm={zoomScale}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  const c = toPlan(e.clientX, e.clientY);
                  startPlanDrag({
                    kind: 'rulerEnd',
                    id: selRuler.id,
                    end,
                    grabDelta: { x: p.x - c.x, y: p.y - c.y },
                  });
                  svgRef.current!.setPointerCapture(e.pointerId);
                }}
              />
            );
          })}
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
        {chrome?.rubber && <RubberWall {...chrome.rubber} />}
        {chrome?.ghost && <OpeningGlyph plan={plan} opening={chrome.ghost} ghost />}
        {chrome?.rulerGhost && <RulerLabel ruler={{ id: '__ghost', ...chrome.rulerGhost, t: 0.5 }} />}
        <SnapMarker snap={chrome?.snap ?? null} pxPerCm={zoomScale} />
        {editing && (
          <InlineEditor
            className="room-name-input"
            initial={editing.initial}
            box={() => ({ x: editing.x - 100, y: editing.y - 13, width: 200, height: 17 })}
            onClose={finishEditing}
          />
        )}
        {textEditing && (
          <InlineEditor
            multiline
            className="text-note-input"
            initial={textEditing.initial}
            style={{ fontSize: `${TEXT_SIZE_CM[textEditing.size]}px` }}
            box={(value) => ({
              x: textEditing.x,
              y: textEditing.y,
              ...textEditBox(value, textEditing.size),
            })}
            onClose={finishTextEditing}
          />
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
            ['ruler', 'Ruler', Ruler],
            ['text', 'Text', Type],
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
        {placement
          ? placementHint(placementStage(placement))
          : 'Click a room or an element · drag a box to select · Shift+click adds · double-click a room to name it · Space+drag pans · scroll zooms'}
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
