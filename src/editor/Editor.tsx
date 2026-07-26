// Editor UX per spec §4 — variant A "Floating minimal" of the ticket 05 prototype.
// Render and event forwarding: every session rule lives in session.ts (ADR 0033).
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
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
import { wallPoints } from '../model/geometry';
import { DIM_FONT_PX } from '../model/rail';
import { reconcileRoomLabels } from '../model/roomLabels';
import { detectRooms, roomKey, roomWallIds } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import { refKey, selectedRoom } from '../model/selection';
import type { Opening, RoomLabel } from '../model/types';
import { redo, undo, usePlanStore } from '../store/planStore';
import { GridLines } from './grid';
import { editedSlot } from './inlineEdit';
import { InlineEditor } from './inlineEditor';
import type { PointerInput, PointerTarget } from './pointer';
import { placementChrome, placementStage } from './placement';
import type { PlacementStage } from './placement';
import type { Session, SessionEnv } from './session';
import { initialSession, movingOpeningId, reshapingDrag } from './session';
import { useSession } from './useSession';
import { togglePreference, usePreferences } from '../preferences/preferences';
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
import { ROOM_TEXT_HIT } from '../sheet/rooms';
import type { ElementDecor } from '../sheet/scene';
import { PlanScene } from '../sheet/scene';
import { TEXT_SIZE_CM, textEditBox } from '../sheet/texts';
import type { Tool } from './tools';
import { keyHint } from './useAppHotkeys';
import { useSpaceHeld, useView } from './useView';

// One line per Placement stage; a missing one is a type error, not a blank hint.
const placementHint = (stage: PlacementStage): string =>
  ({
    wall: `Click to start a wall chain · ${keyHint('toggleSnap')} toggles snap · Alt inverts it`,
    chaining: `Click to add a wall · click the start point to close the room · Shift locks the axis · ${keyHint('cancel')} / double-click to stop`,
    opening: 'Hover a wall, click to place',
    ruler: `Click to start a measurement · ${keyHint('toggleSnap')} toggles snap · Alt inverts it`,
    measuring: `Click to set the end point · Shift locks the axis · ${keyHint('cancel')} / right-click cancels`,
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
  // The session as of the last transition: the camera reads the pointer phase
  // off it during a wheel, before any render has landed.
  const live = useRef<Session>(initialSession);
  const { view, toPlan, pxPerCm, zoomScale, zoomRatio, canZoomIn, canZoomOut, zoomCenter, panByPx, fitPlan } =
    useView(svgRef, () => live.current.pointer.phase === 'pan');
  const plan = usePlanStore((st) => st.plan);
  const planEpoch = usePlanStore((st) => st.planEpoch);
  const canUndo = useStore(usePlanStore.temporal, (st) => st.pastStates.length > 0);
  const canRedo = useStore(usePlanStore.temporal, (st) => st.futureStates.length > 0);
  const gridVisible = usePreferences((st) => st.grid);
  const measuresVisible = usePreferences((st) => st.measures);
  const snapEnabled = usePreferences((st) => st.snap);
  const space = useSpaceHeld();
  // Tracked only so the snap toggle re-renders on Alt transitions: every
  // gesture reads Alt off its own event (ADR 0007, ADR 0030).
  const altHeld = useKeyHold('Alt');
  // Alt inverts the current snap state (ADR 0007).
  const free = !snapEnabled !== altHeld;

  const world = (): SessionEnv => ({
    // The store, not the render closure: a transition following a write in the
    // same handler must see what that write produced.
    plan: usePlanStore.getState().plan,
    pxPerCm: pxPerCm(),
    space,
    snapEnabled,
    measuresVisible,
  });

  const [s, send] = useSession(live, world, {
    capture: (e) => svgRef.current!.setPointerCapture(e.pointerId),
    panBy: panByPx,
  });

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
  const wallDrag = reshapingDrag(s);
  const overlayLabels = useMemo(
    () => Object.values((wallDrag ? reconcileRoomLabels(wallDrag.orig, plan) : plan).roomLabels),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [wallDrag, plan],
  );

  // A reading, not a memory (ADR 0014): a marquee over the same walls lights
  // the room exactly as a click on it does.
  const selRoom = selectedRoom(plan, rooms, s.selection);
  // A room whose boundary does not resolve is unselectable, so it must not
  // announce itself either: the tint tracks what a click would select.
  const hoveredKey = s.hover?.kind === 'room' ? s.hover.id : null;
  const hovered =
    s.tool === 'select' && s.pointer.phase === 'idle' && hoveredKey
      ? (rooms.find((room) => roomKey(room) === hoveredKey) ?? null)
      : null;
  const hoveredRoom = hovered && roomWallIds(plan, hovered) ? hovered : null;

  const toggleSnap = () => togglePreference('snap');

  // No dependency list: a list naming the session and the camera goes stale the
  // first time someone forgets to extend it.
  useImperativeHandle(commands, () => ({
    cancel: () => send({ type: 'cancel' }),
    selectAll: () => send({ type: 'selectAll' }),
    deleteSelection: () => send({ type: 'deleteSelection' }),
    selectTool: (tool) => send({ type: 'selectTool', tool }),
    toggleSnap,
    zoomIn: () => zoomCenter(1 / 1.25),
    zoomOut: () => zoomCenter(1.25),
    fit: () => fitPlan(plan),
    // zoomCenter divides by its factor and zoomRatio is scale over the 100%
    // reference, so the ratio is the factor landing exactly on 100%.
    zoomActual: () => zoomCenter(zoomRatio),
  }));

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

  const onDown = (e: React.PointerEvent, target: PointerTarget) =>
    send({ type: 'pointerDown', input: pointerInput(e), target }, e);

  // Every non-svg source stops the bubble and declares what was hit: a down
  // reaches the session exactly once, with the most specific target.
  const downFrom = (target: PointerTarget) => (e: React.PointerEvent) => {
    e.stopPropagation();
    onDown(e, target);
  };

  const onMove = (e: React.PointerEvent) => {
    // The browser's hit test decides what a click takes: anything above the
    // sheet outranks the room, except the block the room is clicked by.
    const target = e.target as Element;
    const onSheet = target === svgRef.current || target.classList?.contains(ROOM_TEXT_HIT);
    send({ type: 'pointerMove', input: pointerInput(e), onSheet }, e);
  };

  const onUp = (e: React.PointerEvent) => send({ type: 'pointerUp', input: pointerInput(e) }, e);

  const onCancel = (e: React.PointerEvent) => send({ type: 'pointerCancel', input: pointerInput(e) }, e);

  const selKeys = useMemo(() => new Set(s.selection.map(refKey)), [s.selection]);
  const only = s.selection.length === 1 ? s.selection[0] : null;
  const selWall = only?.type === 'wall' ? plan.walls[only.id] : null;
  const selRuler = only?.type === 'ruler' ? plan.rulers[only.id] : null;

  const cursor = space ? 'grab' : s.tool === 'select' ? 'default' : 'crosshair';
  // What the placement puts on screen: four fields, each folded below into its
  // own piece of chrome. No field names a Tool.
  const chrome = s.placement ? placementChrome(s.placement, plan, s.defaults) : null;

  const moving = movingOpeningId(s);
  const placementOpening = chrome?.ghost ?? (moving ? (plan.openings[moving] ?? null) : null);
  const marquee = s.drag?.kind === 'marquee' ? s.drag : null;
  // Bound once: the box's own callbacks close over it, and a field read off the
  // session would not narrow inside them.
  const typed = s.inlineEdit;

  // Gesture plus selection, no cardinality threshold; a selected wall stays
  // silent for the openings it carries.
  const dimmedOpenings = useMemo(() => {
    const byId = new Map<string, Opening>();
    if (placementOpening) byId.set(placementOpening.id, placementOpening);
    for (const ref of s.selection) {
      if (ref.type !== 'opening') continue;
      const o = plan.openings[ref.id];
      if (o) byId.set(o.id, o);
    }
    return [...byId.values()];
  }, [placementOpening, s.selection, plan.openings]);

  // Room labels are never selected (CONTEXT.md: Selection): a line is dragged
  // and double-click-edited directly.
  const onLinePointerDown = (block: RoomTextBlock, label: RoomLabel | null, e: React.PointerEvent) => {
    e.stopPropagation();
    onDown(e, { kind: 'label', block, label });
  };

  const onLineDoubleClick = (block: RoomTextBlock, label: RoomLabel | null, e: React.MouseEvent) => {
    // Under a drawing tool the bubble belongs to the sheet, where a
    // double-click ends the chain.
    if (s.tool !== 'select') return;
    e.stopPropagation();
    send({ type: 'editRoomLabel', block, label });
  };

  // How the screen dresses each element of the sheet (ADR 0024). A wall's only
  // interactive part here is its Dimension plate: the body's grab zone is chrome.
  const dressElement = (ref: ElementRef): ElementDecor => {
    const selected = selKeys.has(refKey(ref));
    const selectable = s.tool === 'select';
    const lit = s.hover?.id === ref.id && s.hover.kind === ref.type && selectable;
    switch (ref.type) {
      case 'wall':
        return {
          selected,
          hovered: lit,
          onPointerDown: selectable ? downFrom({ kind: 'dim', wallId: ref.id }) : undefined,
        };
      case 'opening':
        return { selected };
      case 'ruler':
        return { selected, hovered: lit };
      case 'text':
        return {
          selected,
          hidden: s.inlineEdit?.kind === 'text' && s.inlineEdit.id === ref.id,
          onPointerDown: selectable ? downFrom({ kind: 'element', ref }) : undefined,
          // Double-click a placed Text to re-open its editor (ticket 02); stops
          // the dblclick from also reaching the sheet's room-naming path.
          onDoubleClick: selectable
            ? (e) => {
                e.stopPropagation();
                send({ type: 'editText', id: ref.id });
              }
            : undefined,
        };
    }
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
        onPointerLeave={() => send({ type: 'leaveSheet' })}
        onContextMenu={(e) => {
          e.preventDefault();
          send({ type: 'contextMenu' });
        }}
        // The native dblclick lands on the svg (its subtree is re-rendered by
        // the selecting mousedown), so the session hit-tests it — and firing
        // after both mouseups, it needs no focus-fixup guard.
        onDoubleClick={(e) => send({ type: 'doubleClick', at: toPlan(e.clientX, e.clientY) })}
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
            editingKey: editedSlot(s.inlineEdit),
            onLinePointerDown,
            onLineDoubleClick,
          }}
          chrome={
            <>
              {s.tool === 'select' &&
                Object.values(plan.walls).map((wall) => (
                  <WallGrabZone
                    key={wall.id}
                    plan={plan}
                    wall={wall}
                    pxPerCm={zoomScale}
                    cursor="move"
                    onPointerDown={downFrom({ kind: 'element', ref: { type: 'wall', id: wall.id } })}
                    onPointerEnter={() => send({ type: 'hoverElement', kind: 'wall', id: wall.id })}
                    onPointerLeave={() => send({ type: 'leaveElement', kind: 'wall', id: wall.id })}
                  />
                ))}
              {s.tool === 'select' &&
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
              {s.tool === 'select' &&
                measuresVisible &&
                Object.values(plan.rulers).map((ruler) => (
                  <RulerGrabZone
                    key={ruler.id}
                    ruler={ruler}
                    onPointerDown={downFrom({ kind: 'element', ref: { type: 'ruler', id: ruler.id } })}
                    onPointerEnter={() => send({ type: 'hoverElement', kind: 'ruler', id: ruler.id })}
                    onPointerLeave={() => send({ type: 'leaveElement', kind: 'ruler', id: ruler.id })}
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
        {typed && (
          <InlineEditor
            key={`${typed.kind}:${typed.id ?? 'new'}`}
            initial={typed.initial}
            onClose={(value) => send({ type: 'closeInlineEdit', value })}
            {...(typed.kind === 'text'
              ? {
                  multiline: true,
                  className: 'text-note-input',
                  style: { fontSize: `${TEXT_SIZE_CM[typed.size]}px` },
                  // A Text box grows with what is typed; a label's is fixed.
                  box: (value: string) => ({
                    x: typed.at.x,
                    y: typed.at.y,
                    ...textEditBox(value, typed.size),
                  }),
                }
              : {
                  className: 'room-name-input',
                  box: () => ({ x: typed.at.x - 100, y: typed.at.y - 13, width: 200, height: 17 }),
                })}
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
            className={s.tool === m ? 'floating-btn icon active' : 'floating-btn icon'}
            title={`${label} (${keyHint(`tool:${m}`)})`}
            aria-label={label}
            aria-pressed={s.tool === m}
            onClick={() => send({ type: 'selectTool', tool: m })}
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
        {s.placement
          ? placementHint(placementStage(s.placement))
          : 'Click a room or an element · drag a box to select · Shift+click adds · Shift+drag locks the axis · double-click a room to name it · Space+drag pans · scroll zooms'}
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
        sel={s.selection}
        tool={s.tool}
        defaults={s.defaults}
        setDefaults={(update) => send({ type: 'setDefaults', update })}
        onDelete={() => send({ type: 'deleteSelection' })}
      />
    </div>
  );
}
