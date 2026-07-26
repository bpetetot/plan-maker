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
import { projectOnWall, wallPoints } from '../model/geometry';
import { openingPlacement } from '../model/openings';
import { wallDimension } from '../model/dimension';
import { DIM_FONT_PX } from '../model/rail';
import { reconcileRoomLabels } from '../model/roomLabels';
import { detectRooms, roomAt, roomKey, roomWallIds } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import {
  allElements,
  deleteSelection,
  elementsInRect,
  isSelected,
  refKey,
  referencePoint,
  selectedRoom,
  selectionForRoom,
  toggleRef,
} from '../model/selection';
import type { Opening, RoomLabel, TextNote } from '../model/types';
import type { OpenEdit } from '../store/planStore';
import { beginEdit, editPlan, redo, undo, usePlanStore } from '../store/planStore';
import { GridLines } from './grid';
import type { InlineEdit } from './inlineEdit';
import { commitInlineEdit, editedSlot, openRoomLabel, openText, placeText } from './inlineEdit';
import { InlineEditor } from './inlineEditor';
import type { PlanDrag, PlanDragSpec } from './planDrag';
import { aimPlanDrag, beginPlanDrag, commitPlanDrag } from './planDrag';
import type { GrabTarget, Intent, PointerInput, PointerState, PointerTarget } from './pointer';
import { IDLE, routePointerCancel, routePointerDown, routePointerMove, routePointerUp } from './pointer';
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
import { setPreference, togglePreference, usePreferences } from '../preferences/preferences';
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
import { ROOM_TEXT_HIT, roomTextBlocks } from '../sheet/rooms';
import type { ElementDecor } from '../sheet/scene';
import { PlanScene } from '../sheet/scene';
import { TEXT_SIZE_CM, textAtPoint, textEditBox } from '../sheet/texts';
import type { Tool, ToolDefaults } from './tools';
import { initialToolDefaults } from './tools';
import { keyHint } from './useAppHotkeys';
import { useSpaceHeld, useView } from './useView';

// What the live drag holds; when it begins, aims and ends is the pointer
// router's call (ADR 0030). A Pan holds nothing: the router carries its deltas.
type Drag =
  // `b` is mutated on the ref, not held in state: pointer-up would read a
  // stale React value.
  | { kind: 'marquee'; additive: boolean; prev: ElementRef[]; a: Vec; b: Vec }
  // CONTEXT.md: Plan drag. Its whole composition — snap, grab point, settle,
  // selection — lives in planDrag.ts (ADR 0023).
  | { kind: 'plan'; g: PlanDrag; edit: OpenEdit };

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
  // The router says what the stream means; `drag` holds what it advances.
  const pointerState = useRef<PointerState>(IDLE);
  const drag = useRef<Drag | null>(null);
  const { view, toPlan, pxPerCm, zoomScale, zoomRatio, canZoomIn, canZoomOut, zoomCenter, panByPx, fitPlan } =
    useView(svgRef, () => pointerState.current.phase === 'pan');
  const plan = usePlanStore((s) => s.plan);
  const planEpoch = usePlanStore((s) => s.planEpoch);
  const canUndo = useStore(usePlanStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(usePlanStore.temporal, (s) => s.futureStates.length > 0);
  const [tool, setTool] = useState<Tool>('select');
  const gridVisible = usePreferences((s) => s.grid);
  const measuresVisible = usePreferences((s) => s.measures);
  const snapEnabled = usePreferences((s) => s.snap);
  const [defaults, setDefaults] = useState<ToolDefaults>(initialToolDefaults);
  const [sel, setSel] = useState<ElementRef[]>([]);
  const [hoverWall, setHoverWall] = useState<string | null>(null);
  const [hoverRuler, setHoverRuler] = useState<string | null>(null);
  // The room's loop, not the object: a Room is rebuilt on every plan change.
  const [hoverRoom, setHoverRoom] = useState<string | null>(null);
  // CONTEXT.md: Placement — what the drawing tool has pending, as one value
  // (ADR 0025). Null under Select, which poses nothing.
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [marquee, setMarquee] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(
    null,
  );
  const [movingOpeningId, setMovingOpeningId] = useState<string | null>(null);
  // Plan touched on commit only, not per keystroke: one undo entry.
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);
  const space = useSpaceHeld();
  // Tracked only so the snap toggle re-renders on Alt transitions: every
  // gesture reads Alt off its own event (ADR 0007, ADR 0030).
  const altHeld = useKeyHold('Alt');
  // Alt inverts the current snap state (ADR 0007).
  const free = !snapEnabled !== altHeld;
  const placementEnv = (freeNow: boolean) => ({ pxPerCm: pxPerCm(), free: freeNow, defaults });

  // Fit on any plan replacement (open, restore, reset); mount included, which
  // frames a plan restored before the editor mounted.
  useEffect(() => {
    fitPlan(usePlanStore.getState().plan);
    // fitPlan is recreated every render but only reads the svg ref; epoch is the trigger
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [planEpoch]);

  // No useMemo: a reading of the plan is already computed once per plan
  // (ADR 0029), and that memo outlives this component's renders.
  const rooms = detectRooms(plan);
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
  const selRoom = selectedRoom(plan, rooms, sel);
  // A room whose boundary does not resolve is unselectable, so it must not
  // announce itself either: the tint tracks what a click would select.
  const hovered =
    tool === 'select' && pointerState.current.phase === 'idle' && hoverRoom
      ? (rooms.find((room) => roomKey(room) === hoverRoom) ?? null)
      : null;
  const hoveredRoom = hovered && roomWallIds(plan, hovered) ? hovered : null;

  const switchTool = (next: Tool) => {
    setTool(next);
    setPlacement(next === 'select' ? null : beginPlacement(next));
    setInlineEdit((e) => (e?.kind === 'text' ? null : e));
    if (next !== 'select') setSel([]);
    // A Ruler is measured, so drawing one reveals the measures (ticket 03).
    if (next === 'ruler') setPreference('measures', true);
  };

  // Everything a placement can ask of the editor, in one place. A completion
  // names the Tool it hands back to, which reseeds the placement itself.
  const applyPlacement = (r: PlacementResult) => {
    const next = r.plan;
    if (next) editPlan(() => next);
    if (r.tool) switchTool(r.tool);
    else setPlacement(r.placement);
    if (r.selection) setSel(r.selection);
    if (r.editor) setInlineEdit(placeText(r.editor));
  };

  const deleteSelected = useCallback((selection: ElementRef[]) => {
    if (selection.length === 0) return;
    editPlan((p) => deleteSelection(p, selection));
    setSel([]);
  }, []);

  const toggleSnap = useCallback(() => togglePreference('snap'), []);

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
    deleteSelection: () => deleteSelected(sel),
    selectTool: switchTool,
    toggleSnap,
    zoomIn: () => zoomCenter(1 / 1.25),
    zoomOut: () => zoomCenter(1.25),
    fit: () => fitPlan(plan),
    // zoomCenter divides by its factor and zoomRatio is scale over the 100%
    // reference, so the ratio is the factor landing exactly on 100%.
    zoomActual: () => zoomCenter(zoomRatio),
  }));

  // A Plan drag always opens an Edit — there is no variant that does not, and
  // the handle rides on the drag, so the two end together (ADR 0028).
  const startPlanDrag = (spec: PlanDragSpec) => {
    drag.current = { kind: 'plan', g: beginPlanDrag(plan, spec), edit: beginEdit() };
    // Or the tint flashes back onto the pre-drag room at pointer-up, and stays
    // there until the next pointermove.
    setHoverRoom(null);
  };

  // Everything the drag wants on screen, in one place. `live` goes false at
  // commit: the placement dims track a slide under way, not one that landed.
  const showPlanDrag = (d: PlanDrag, edit: OpenEdit, live: boolean) => {
    const spec = d.spec;
    if (live) edit.aim(d.plan);
    else edit.land(d.plan);
    setMovingOpeningId(live && spec.kind === 'opening' && d.moved ? spec.id : null);
  };

  // A single ref-shaped element dragged alone is a group of one: same rigid
  // translation, same grid realignment.
  const soloGroup = (refs: ElementRef[], c: Vec): PlanDragSpec => ({
    kind: 'group',
    refs,
    start: c,
    refPoint: referencePoint(plan, refs, c),
  });

  // The one place the stream converts to plan coordinates.
  const pointerInput = (e: React.PointerEvent): PointerInput => ({
    pointerId: e.pointerId,
    button: e.button,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    clientX: e.clientX,
    clientY: e.clientY,
    at: toPlan(e.clientX, e.clientY),
  });

  const pointerCtx = () => ({
    space,
    snapEnabled,
    placementOpen: placement !== null,
    // Only a Text box swallows the click: a Room label box coexists with a
    // marquee, which its own blur-commit does not disturb.
    textEditing: inlineEdit?.kind === 'text',
  });

  // One capture protocol: whatever the source, a gesture holds the svg.
  const capture = (e: React.PointerEvent) => svgRef.current!.setPointerCapture(e.pointerId);

  // A grabbed member of a multi-selection drags the group; anything else alone.
  const grabSpec = (target: GrabTarget, c: Vec, additive: boolean): PlanDragSpec | null => {
    switch (target.kind) {
      case 'element': {
        const ref = target.ref;
        if (sel.length > 1 && isSelected(sel, ref)) {
          return {
            kind: 'group',
            refs: sel,
            start: c,
            clickRef: ref,
            refPoint: referencePoint(plan, sel, c),
          };
        }
        setSel([ref]);
        if (ref.type === 'opening') {
          const opening = plan.openings[ref.id];
          return {
            kind: 'opening',
            id: ref.id,
            // Drawn, not stored: on a shrunk wall the glyph sits on its Rail
            // while the offset still holds the wish.
            grabDelta:
              (openingPlacement(plan, opening)?.offset ?? opening.offset) -
              projectOnWall(plan, plan.walls[opening.wallId], c.x, c.y).t,
          };
        }
        return soloGroup([ref], c);
      }
      case 'handle': {
        const h = target.handle;
        if (h.type === 'point') {
          const p = plan.points[h.id];
          return p ? { kind: 'point', id: p.id, grabDelta: { x: p.x - c.x, y: p.y - c.y } } : null;
        }
        const p = plan.rulers[h.id]?.[h.end];
        return p
          ? { kind: 'rulerEnd', id: h.id, end: h.end, grabDelta: { x: p.x - c.x, y: p.y - c.y } }
          : null;
      }
      case 'dim': {
        const wall = plan.walls[target.wallId];
        if (!wall) return null;
        // The drawn position, not the stored wish: a wall shortened since the
        // last drag rails the plate elsewhere, and the grab must start there.
        const dim = wallDimension(plan, wall, DIM_FONT_PX);
        if (!dim) return null;
        return { kind: 'dim', id: wall.id, grabDelta: dim.plateAt - projectOnWall(plan, wall, c.x, c.y).t };
      }
      case 'label': {
        const { block, label } = target;
        const grabDelta = { x: block.x - c.x, y: block.y - c.y };
        if (label) {
          return { kind: 'label', id: label.id, room: block.room ?? null, grabDelta, additive, prev: sel };
        }
        return block.room ? { kind: 'newLabel', room: block.room, grabDelta, additive, prev: sel } : null;
      }
    }
  };

  const dispatch = (intent: Intent, e: React.PointerEvent) => {
    switch (intent.type) {
      case 'none':
        return;
      case 'toggleSelection':
        setSel((s) => toggleRef(s, intent.ref));
        return;
      case 'beginPan':
        capture(e);
        return;
      case 'beginMarquee':
        drag.current = {
          kind: 'marquee',
          additive: intent.additive,
          prev: sel,
          a: intent.at,
          b: intent.at,
        };
        setHoverRoom(null);
        setMarquee({ a: intent.at, b: intent.at });
        capture(e);
        return;
      case 'beginGrab': {
        const spec = grabSpec(intent.target, intent.at, intent.additive);
        // A target with nothing to edit starts no gesture: the router must not
        // stay in a grab it would otherwise hold until an unrelated up.
        if (!spec) {
          pointerState.current = IDLE;
          return;
        }
        startPlanDrag(spec);
        capture(e);
        return;
      }
      case 'placementClick': {
        if (!placement) return;
        const r = clickPlacement(placement, plan, intent.at, placementEnv(intent.free));
        applyPlacement(r);
        // Pointer Events: preventDefault on a pointerdown suppresses its
        // compatibility mouse events — whose focus fixup would blur the box.
        if (r.editor) e.preventDefault();
        return;
      }
      case 'panBy':
        panByPx(intent.dxPx, intent.dyPx);
        return;
      case 'aimMarquee': {
        const g = drag.current;
        if (g?.kind !== 'marquee') return;
        g.b = intent.at;
        setMarquee({ a: g.a, b: intent.at });
        return;
      }
      case 'aimGrab': {
        const g = drag.current;
        if (g?.kind !== 'plan') return;
        const next = aimPlanDrag(g.g, intent.at, {
          pxPerCm: pxPerCm(),
          free: intent.free,
          moved: intent.moved,
        });
        drag.current = { kind: 'plan', g: next, edit: g.edit };
        showPlanDrag(next, g.edit, true);
        return;
      }
      case 'aimPlacement':
        if (placement) setPlacement(aimPlacement(placement, plan, intent.at, placementEnv(intent.free)));
        return;
      case 'hover': {
        // The browser's hit test decides what a click takes: anything above the
        // sheet outranks the room, except the block the room is clicked by.
        const target = e.target as Element;
        const onSheet = target === svgRef.current || target.classList?.contains(ROOM_TEXT_HIT);
        const room = onSheet ? roomAt(rooms, intent.at.x, intent.at.y) : null;
        // Same value bails React out: tracking costs a render only on a change.
        setHoverRoom(room ? roomKey(room) : null);
        return;
      }
      case 'end': {
        const g = drag.current;
        drag.current = null;
        if (g?.kind === 'marquee') {
          if (intent.moved) {
            const captured = elementsInRect(plan, g.a, g.b, measuresVisible);
            setSel(g.additive ? [...g.prev, ...captured.filter((r) => !isSelected(g.prev, r))] : captured);
          } else {
            setSel(selectionForRoom(plan, roomAt(rooms, g.a.x, g.a.y), g.additive, g.prev));
          }
          setMarquee(null);
        } else if (g?.kind === 'plan') {
          // Settle included (CONTEXT.md: Settle) — inside the same Edit.
          const landed = commitPlanDrag(g.g);
          showPlanDrag(landed, g.edit, false);
          if (landed.selection) setSel(landed.selection);
        }
        return;
      }
      case 'cancel': {
        // The browser took the pointer — a scroll gesture, a palm, a rotation.
        // The drag never lands: it drops what it holds (ADR 0018).
        const g = drag.current;
        drag.current = null;
        if (g?.kind === 'marquee') setMarquee(null);
        else if (g?.kind === 'plan') {
          // Landing on the pre-drag plan closes the Edit and records nothing:
          // it is the snapshot beginEdit took.
          g.edit.land(g.g.orig);
          setMovingOpeningId(null);
        }
        return;
      }
    }
  };

  const routed = (e: React.PointerEvent, [next, intent]: [PointerState, Intent]) => {
    pointerState.current = next;
    dispatch(intent, e);
  };

  const onDown = (e: React.PointerEvent, target: PointerTarget) =>
    routed(e, routePointerDown(pointerState.current, pointerInput(e), target, pointerCtx()));

  // Every non-svg source stops the bubble and declares what was hit: a down
  // reaches the router exactly once, with the most specific target.
  const downFrom = (target: PointerTarget) => (e: React.PointerEvent) => {
    e.stopPropagation();
    onDown(e, target);
  };

  const onMove = (e: React.PointerEvent) =>
    routed(e, routePointerMove(pointerState.current, pointerInput(e), pointerCtx()));

  const onUp = (e: React.PointerEvent) => routed(e, routePointerUp(pointerState.current, pointerInput(e)));

  const onCancel = (e: React.PointerEvent) =>
    routed(e, routePointerCancel(pointerState.current, pointerInput(e)));

  const onSvgContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (pointerState.current.phase !== 'idle') return;
    const dropped = placement && cancelPlacement(placement);
    if (dropped) setPlacement(dropped);
    else if (tool !== 'select') switchTool('select');
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
    e.stopPropagation();
    onDown(e, { kind: 'label', block, label });
  };

  const onLineDoubleClick = (block: RoomTextBlock, label: RoomLabel | null, e: React.MouseEvent) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setInlineEdit(openRoomLabel(block, label));
  };

  // Double-click a placed Text to re-open its editor (ticket 02); stops the
  // dblclick from also reaching the sheet's room-naming path.
  const onTextDoubleClick = (text: TextNote, e: React.MouseEvent) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setInlineEdit(openText(text));
  };

  // A just-placed node is born here; an emptied one is discarded. Null is
  // Escape: the box closes and the tool hands back, but nothing is written.
  const finishInlineEdit = (value: string | null) => {
    const ed = inlineEdit;
    setInlineEdit(null);
    // One-shot: a Text placement hands back to Select whatever the box returns
    // (ADR 0021); a re-edit is already there, and a Room label never switches.
    if (tool === 'text') switchTool('select');
    if (!ed) return;
    // Latest plan, not the render closure: a placement click just committed
    // through editPlan and the closure reads stale.
    const done = commitInlineEdit(usePlanStore.getState().plan, ed, value);
    if (!done) return;
    editPlan(() => done.plan);
    if (done.selection) setSel(done.selection);
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
          onPointerDown: selectable ? downFrom({ kind: 'dim', wallId: ref.id }) : undefined,
        };
      case 'opening':
        return { selected };
      case 'ruler':
        return { selected, hovered: hoverRuler === ref.id && selectable };
      case 'text':
        return {
          selected,
          hidden: inlineEdit?.kind === 'text' && inlineEdit.id === ref.id,
          onPointerDown: selectable ? downFrom({ kind: 'element', ref }) : undefined,
          onDoubleClick: selectable ? (e) => onTextDoubleClick(plan.texts[ref.id], e) : undefined,
        };
    }
  };

  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (placement) {
      // Latest plan, not the render closure: the double-click's own clicks just
      // committed through editPlan and the closure reads stale.
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
    // Off the plan's own labels, not the drag overlay's: a double-click never
    // lands mid-drag, so there is nothing to reconcile here.
    const blocks = roomTextBlocks(rooms, Object.values(plan.roomLabels));
    const block = room ? blocks.find((b) => b.room === room && b.area !== undefined) : undefined;
    if (block) setInlineEdit(openRoomLabel(block, block.labels[0] ?? null));
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{ width: '100%', height: '100%', background: 'var(--sheet)', display: 'block', cursor }}
        onPointerDown={(e) => onDown(e, { kind: 'sheet' })}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
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
          measuresVisible={measuresVisible}
          dimFontPx={DIM_FONT_PX}
          decor={{
            element: dressElement,
            pxPerCm: zoomScale,
            labels: overlayLabels,
            editingKey: editedSlot(inlineEdit),
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
                    onPointerDown={downFrom({ kind: 'element', ref: { type: 'wall', id: wall.id } })}
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
                    onPointerDown={downFrom({ kind: 'element', ref: { type: 'opening', id: opening.id } })}
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
                    onPointerDown={downFrom({ kind: 'element', ref: { type: 'ruler', id: ruler.id } })}
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
              onPointerDown={downFrom({ kind: 'handle', handle: { type: 'point', id: p.id } })}
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
                onPointerDown={downFrom({
                  kind: 'handle',
                  handle: { type: 'rulerEnd', id: selRuler.id, end },
                })}
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
        {chrome?.rulerGhost && (
          <RulerLabel ruler={{ id: '__ghost', ...chrome.rulerGhost, t: 0.5 }} fontPx={DIM_FONT_PX} />
        )}
        <SnapMarker snap={chrome?.snap ?? null} pxPerCm={zoomScale} />
        {/* One box, keyed by what is typed: without the key the component's
            mirrored value would outlive a switch from one target to the other. */}
        {inlineEdit && (
          <InlineEditor
            key={`${inlineEdit.kind}:${inlineEdit.id ?? 'new'}`}
            multiline={inlineEdit.kind === 'text'}
            className={inlineEdit.kind === 'text' ? 'text-note-input' : 'room-name-input'}
            initial={inlineEdit.initial}
            style={
              inlineEdit.kind === 'text' ? { fontSize: `${TEXT_SIZE_CM[inlineEdit.size]}px` } : undefined
            }
            box={(value) =>
              inlineEdit.kind === 'text'
                ? { x: inlineEdit.at.x, y: inlineEdit.at.y, ...textEditBox(value, inlineEdit.size) }
                : { x: inlineEdit.at.x - 100, y: inlineEdit.at.y - 13, width: 200, height: 17 }
            }
            onClose={finishInlineEdit}
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
            onClick={() => togglePreference('grid')}
          >
            <Grid3x3 size={16} aria-hidden />
          </button>
          <button
            className={measuresVisible ? 'floating-btn icon active' : 'floating-btn icon'}
            title={`${measuresVisible ? 'Hide' : 'Show'} measures (${keyHint('toggleMeasures')})`}
            aria-label="Measures"
            aria-pressed={measuresVisible}
            onClick={() => togglePreference('measures')}
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
        sel={sel}
        tool={tool}
        defaults={defaults}
        setDefaults={setDefaults}
        onDelete={() => deleteSelected(sel)}
      />
    </div>
  );
}
