import { faceSpan, junctionPatches, wallOutline } from '../model/faces';
import { wallLength, wallPoints } from '../model/geometry';
import { formatArea, formatLength } from '../model/format';
import { openingPlacement, openingRail } from '../model/openings';
import type { Room } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import { roomAt } from '../model/rooms';
import type { Door, Opening, Plan, RoomLabel, Wall } from '../model/types';
import type { Snap } from '../model/snap';

// Values live in styles.css; the PNG export pins the light ones in its own
// <style>, so the standalone SVG resolves them without the document.
export const COLORS = {
  wall: 'var(--wall)',
  wallHover: 'var(--wall-hover)',
  wallSelected: 'var(--accent)',
  snap: 'var(--snap)',
  preview: 'var(--accent)',
  label: 'var(--label)',
};

// ISO: text reads from the bottom or the right, so vertical is -90, never +90.
export const labelAngle = (dx: number, dy: number) => {
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle >= 90) angle -= 180;
  else if (angle < -90) angle += 180;
  return angle;
};

// The browser anti-aliases each shared edge separately: background bleeds
// through as a hairline. A self-colored screen-pixel stroke closes it.
const seamStroke = (paint: string) =>
  ({
    stroke: paint,
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke',
    strokeLinejoin: 'round',
  }) as const;

export function WallLine({ plan, wall, color }: { plan: Plan; wall: Wall; color?: string }) {
  const outline = wallOutline(plan, wall);
  const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
  const paint = color ?? COLORS.wall;
  const gaps = Object.values(plan.openings).filter((o) => o.wallId === wall.id);
  if (gaps.length === 0) {
    return <polygon points={points} fill={paint} {...seamStroke(paint)} pointerEvents="none" />;
  }
  // Mask, not a sheet-coloured overlay: the Grid must stay visible through
  // the gap. Region is the bbox grown past the ±1 cm the gap rects overhang.
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const x = Math.min(...xs) - 2;
  const y = Math.min(...ys) - 2;
  const maskId = `wall-gaps-${wall.id}`;
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
          const placement = openingPlacement(plan, o);
          // window jambs ARE the wall: leaving a half-jamb strip uncut can
          // never mis-register with the faces (doors keep the full-width cut)
          const inset = o.type === 'window' ? WINDOW_JAMB / 2 : 0;
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
          ) : null;
        })}
      </mask>
      <polygon points={points} fill={paint} {...seamStroke(paint)} mask={`url(#${maskId})`} />
    </g>
  );
}

// Fills the central gaps outlines leave at crossings (CONTEXT.md: Face). Owned
// by every wall at its Point: no hover tint, selected tint from two selected.
export function JunctionPatches({ plan, selection }: { plan: Plan; selection?: ElementRef[] }) {
  const selected = new Set((selection ?? []).filter((r) => r.type === 'wall').map((r) => r.id));
  return (
    <g pointerEvents="none">
      {junctionPatches(plan).map(({ pointId, wallIds, corners }) => {
        const paint =
          wallIds.filter((id) => selected.has(id)).length >= 2 ? COLORS.wallSelected : COLORS.wall;
        return (
          <polygon
            key={pointId}
            points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
            fill={paint}
            {...seamStroke(paint)}
          />
        );
      })}
    </g>
  );
}

// Per side, in screen px (CONTEXT.md: Grab zone); converted to plan units so
// it stays constant on screen whatever the zoom or the wall's thickness.
const GRAB_MARGIN_PX = 2;
const grabMargin = (pxPerCm: number) => GRAB_MARGIN_PX / pxPerCm;

// Render above visible geometry.
export function WallGrabZone({
  plan,
  wall,
  pxPerCm,
  cursor,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: {
  plan: Plan;
  wall: Wall;
  pxPerCm: number;
  cursor?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const [a, b] = wallPoints(plan, wall);
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
  );
}

// Full jamb bar width; WallLine's mask leaves a half-bar of body uncut beneath.
// The glyph repaints the bars in its own tint, not the wall body's.
const WINDOW_JAMB = 1.5;

// Local frame: origin at the gap centre, wall along x. Shared by glyph and
// grab zone — they must not drift apart.
const doorMirror = (door: Door) =>
  `scale(${door.hingeSide === 'end' ? -1 : 1},${door.swing === 'out' ? -1 : 1})`;
const doorLeaf = (door: Door) => ({
  x1: -door.width / 2,
  y1: 0,
  x2: -door.width / 2,
  y2: -door.width,
});
const doorArc = (door: Door) =>
  `M ${door.width / 2} 0 A ${door.width} ${door.width} 0 0 0 ${-door.width / 2} ${-door.width}`;

export function OpeningGlyph({
  plan,
  opening,
  ghost,
  selected,
}: {
  plan: Plan;
  opening: Opening;
  ghost?: boolean;
  selected?: boolean;
}) {
  const wall = plan.walls[opening.wallId];
  const placement = openingPlacement(plan, opening);
  if (!wall || !placement) return null;
  const halfWidth = opening.width / 2;
  const thickness = wall.thickness;
  const stroke = selected ? COLORS.wallSelected : ghost ? COLORS.preview : COLORS.wall;
  return (
    <g
      transform={`translate(${placement.cx},${placement.cy}) rotate(${placement.angleDeg})`}
      opacity={ghost ? 0.55 : 1}
      pointerEvents="none"
    >
      {/* the ghost is not in the plan, so WallLine's mask cuts no gap for it */}
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
          {/* solid, not dashed: dashed reads as "above the cut plane" */}
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
  );
}

// Screen px: non-scaling-stroke needs no unit conversion, unlike grabMargin,
// because no plan-unit body is added.
const DOOR_GRAB_STROKE = 12;

// Render AFTER wall grab zones so the opening's span wins the click (spec §4).
export function OpeningGrabZone({
  plan,
  opening,
  pxPerCm,
  onPointerDown,
}: {
  plan: Plan;
  opening: Opening;
  pxPerCm: number;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const wall = plan.walls[opening.wallId];
  const placement = openingPlacement(plan, opening);
  if (!wall || !placement) return null;
  const halfWidth = opening.width / 2;
  const halfHeight = wall.thickness / 2 + grabMargin(pxPerCm);
  return (
    <g
      transform={`translate(${placement.cx},${placement.cy}) rotate(${placement.angleDeg})`}
      style={{ cursor: 'move' }}
      onPointerDown={onPointerDown}
    >
      <rect x={-halfWidth} y={-halfHeight} width={opening.width} height={halfHeight * 2} fill="transparent" />
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
  );
}

const dimLineOffset = (wall: Wall) => wall.thickness / 2 + 10;

// `side` is a sign along the start→end left normal; its default puts the line
// upper for horizontal walls, left for vertical ones.
function dimLineFrame(plan: Plan, wall: Wall) {
  const [a, b] = wallPoints(plan, wall);
  const length = wallLength(plan, wall);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const raw = (Math.atan2(dy, dx) * 180) / Math.PI;
  const angle = labelAngle(dx, dy);
  const flipped = angle !== raw;
  const side: 1 | -1 = wall.dimPlacement ? wall.dimPlacement.side : flipped ? 1 : -1;
  return { a, b, length, ux: dx / length, uy: dy / length, angle, flipped, side, off: dimLineOffset(wall) };
}

// Editor size; the PNG export passes its own via PlanScene. Advance width is
// JetBrains Mono's 0.6 em; chips keep a 9px font, hence their own constant.
const DIM_FONT_PX = 8;
const measureCharPx = (fontPx: number) => 0.6 * fontPx;
const CHIP_CHAR_PX = 5.4;

// The plate covers the whole text box, spaces included: grid, walls and
// neighbouring dimension lines must never show through a measure.
const PLATE_PAD_X = 2;
const PLATE_PAD_Y = 1;
const PLATE_RX = 2;
const plateHalfWidth = (label: string, fontPx: number) =>
  (label.length * measureCharPx(fontPx)) / 2 + PLATE_PAD_X;

function DimText({
  label,
  className,
  fontPx = DIM_FONT_PX,
  x = 0,
  y = 0,
}: {
  label: string;
  className: string;
  fontPx?: number;
  x?: number;
  y?: number;
}) {
  const half = plateHalfWidth(label, fontPx);
  const halfH = fontPx / 2 + PLATE_PAD_Y;
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
  );
}

const EXTENT_STROKE = 1;

// Plan units. Tips sit exactly on the extent boundary, so the measured value
// stays exact whatever the head's size.
const ARROW_LEN = 7;
const ARROW_HALF_WIDTH = 2.2;

// ISO: heads sit inside the extent pointing outward, and flip outside pointing
// inward when the span runs out of room (minus the leader tails).
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
  at: (t: number) => { x: number; y: number };
  ux: number;
  uy: number;
  from: number;
  to: number;
  gapFrom: number;
  gapTo: number;
  stroke?: string;
}) {
  const gapWidth = Math.max(0, Math.min(gapTo, to) - Math.max(gapFrom, from));
  const inside = to - from >= 2 * ARROW_LEN + gapWidth + 8;
  const start = inside ? from + ARROW_LEN : from;
  const end = inside ? to - ARROW_LEN : to;
  const g1 = Math.max(start, Math.min(gapFrom, end));
  const g2 = Math.min(end, Math.max(gapTo, start));
  const seg = (key: string, t1: number, t2: number) => {
    const p = at(t1);
    const q = at(t2);
    return <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={stroke} strokeWidth={EXTENT_STROKE} />;
  };
  return (
    <g pointerEvents="none">
      {g1 - start > 2 && seg('a', start, g1)}
      {end - g2 > 2 && seg('b', g2, end)}
      {[
        { t: from, dir: inside ? 1 : -1 },
        { t: to, dir: inside ? -1 : 1 },
      ].map(({ t, dir }, i) => {
        const tip = at(t);
        const bx = tip.x + ux * ARROW_LEN * dir;
        const by = tip.y + uy * ARROW_LEN * dir;
        const points = [
          `${tip.x},${tip.y}`,
          `${bx + uy * ARROW_HALF_WIDTH},${by - ux * ARROW_HALF_WIDTH}`,
          `${bx - uy * ARROW_HALF_WIDTH},${by + ux * ARROW_HALF_WIDTH}`,
        ].join(' ');
        return <polygon key={i} points={points} fill={stroke} {...seamStroke(stroke)} />;
      })}
    </g>
  );
}

// The Rail (CONTEXT.md), as ratios of the axis length, keeping the plate clear
// of the arrowheads. Clamped last: the schema requires a ratio in [0, 1].
export function dimTravelBounds(plan: Plan, wall: Wall, side: 1 | -1, fontPx = DIM_FONT_PX) {
  const length = wallLength(plan, wall);
  if (length < 1) return { min: 0.5, max: 0.5 };
  const span = faceSpan(plan, wall, side);
  const half = plateHalfWidth(formatLength(Math.max(0, span.to - span.from)), fontPx);
  const inside = span.to - span.from >= 2 * ARROW_LEN + 2 * half + 8;
  const margin = inside ? ARROW_LEN + half : half;
  let min = (span.from + margin) / length;
  let max = (span.to - margin) / length;
  if (min > max) min = max = (min + max) / 2;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return { min: clamp01(min), max: clamp01(max) };
}

// Automatic dimension on every wall (spec §4), measuring the rendered
// silhouette on its side. Drag handle with onPointerDown; never selectable.
export function DimLabel({
  plan,
  wall,
  selected,
  fontPx = DIM_FONT_PX,
  onPointerDown,
}: {
  plan: Plan;
  wall: Wall;
  selected?: boolean;
  fontPx?: number;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const { a, length, ux, uy, angle, side, off } = dimLineFrame(plan, wall);
  if (length < 20) return null;
  const span = faceSpan(plan, wall, side);
  const value = Math.max(0, span.to - span.from);
  const label = formatLength(value);
  const at = (t: number) => ({ x: a.x + ux * t - uy * side * off, y: a.y + uy * t + ux * side * off });
  const tText = (wall.dimPlacement?.t ?? 0.5) * length;
  const mid = at(tText);
  const gapHalf = plateHalfWidth(label, fontPx);
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
  );
}

// Screen pixels: 9px measure text plus 5px of padding each side.
const CHIP_HEIGHT = 16;
const chipWidth = (label: string) => label.length * CHIP_CHAR_PX + 10;

// CONTEXT.md: Placement dimension. Chips, not a Dimension: on the wall axis is
// the one register free to coexist with the wall's own (ADR 0005). Editor only.
export function PlacementDims({ plan, opening, pxPerCm }: { plan: Plan; opening: Opening; pxPerCm: number }) {
  const wall = plan.walls[opening.wallId];
  const placement = openingPlacement(plan, opening);
  if (!wall || !placement) return null;
  const { a, ux, uy, angle } = dimLineFrame(plan, wall);
  const at = (t: number) => ({ x: a.x + ux * t, y: a.y + uy * t });
  // a screen pixel in plan units: constant chip size, centre still where it
  // measures
  const k = 1 / Math.max(pxPerCm, 0.0001);
  const half = opening.width / 2;
  const rail = openingRail(plan, wall, placement.offset, opening.id);
  const segments = [
    { key: 'start', from: rail.from, to: placement.offset - half },
    { key: 'end', from: placement.offset + half, to: rail.to },
  ];
  return (
    <g pointerEvents="none">
      {segments.map(({ key, from, to }) => {
        const len = to - from;
        if (Math.round(len) < 1) return null;
        const label = formatLength(len);
        const mid = at((from + to) / 2);
        const w = chipWidth(label);
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
        );
      })}
    </g>
  );
}

// CONTEXT.md: Room label. Reconciliation keeps one label per room and none
// outside a room; the extra cases here only guard injected state.
export interface RoomTextBlock {
  key: string;
  x: number;
  y: number;
  // oldest first
  labels: RoomLabel[];
  // unset for an orphan label
  room?: Room;
  // set only on the block carrying the room's area
  area?: number;
}

export function roomTextBlocks(rooms: Room[], labels: RoomLabel[]): RoomTextBlock[] {
  const blocks: RoomTextBlock[] = [];
  const defaultsByRoom = new Map<Room, RoomLabel[]>();
  const oldestByRoom = new Map<Room, RoomLabel>();
  for (const label of labels) {
    const room = roomAt(rooms, label.x, label.y);
    if (room && !oldestByRoom.has(room)) oldestByRoom.set(room, label);
    if (room && !label.placed) {
      const defaults = defaultsByRoom.get(room);
      if (defaults) defaults.push(label);
      else defaultsByRoom.set(room, [label]);
    } else {
      blocks.push({
        key: label.id,
        x: label.x,
        y: label.y,
        labels: [label],
        room: room ?? undefined,
        area: room && oldestByRoom.get(room) === label ? room.areaCm2 : undefined,
      });
    }
  }
  for (const room of rooms) {
    const defaults = defaultsByRoom.get(room) ?? [];
    const oldest = oldestByRoom.get(room);
    if (defaults.length === 0 && oldest) continue;
    blocks.push({
      key: defaults[0]?.id ?? `room-${room.pointIds.join(':')}`,
      x: room.anchor.x,
      y: room.anchor.y,
      labels: defaults,
      room,
      area: !oldest || defaults.includes(oldest) ? room.areaCm2 : undefined,
    });
  }
  return blocks;
}

// The editor positions its inline name input on this same grid.
export const BLOCK_LINE_HEIGHT = 13;

// A label being edited keeps its slot: the editor's input overlays it and must
// land on that line.
export const blockNameSlots = (block: RoomTextBlock, editingKey?: string) =>
  block.labels.filter((label) => label.name || label.id === editingKey);

// Room labels are never selected; lines are dragged and edited directly
// (CONTEXT.md: Selection). Only the area line is a Measure (CONTEXT.md).
export function RoomOverlay({
  rooms,
  labels,
  measuresVisible,
  editingKey,
  onLinePointerDown,
  onLineDoubleClick,
}: {
  rooms: Room[];
  labels: RoomLabel[];
  measuresVisible: boolean;
  editingKey?: string;
  onLinePointerDown?: (block: RoomTextBlock, label: RoomLabel | null, e: React.PointerEvent) => void;
  onLineDoubleClick?: (block: RoomTextBlock, label: RoomLabel | null, e: React.MouseEvent) => void;
}) {
  const interactive = Boolean(onLinePointerDown || onLineDoubleClick);
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
  );
  return (
    <g>
      {roomTextBlocks(rooms, labels).map((block) => {
        const named = blockNameSlots(block, editingKey);
        const area = measuresVisible ? block.area : undefined;
        // creating a label on an unlabeled room also reserves a name slot
        const slots = named.length > 0 ? named.length : block.key === editingKey ? 1 : 0;
        const areaY = slots > 0 ? slots * BLOCK_LINE_HEIGHT : 5;
        // a block that renders nothing must not linger as an invisible drag
        // target
        if (named.length === 0 && area === undefined) return null;
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
        );
      })}
    </g>
  );
}

export function SnapMarker({ snap }: { snap: Snap | null }) {
  if (!snap) return null;
  return (
    <g pointerEvents="none">
      {/* dashed guide for any locked-axis position, wall intersections too */}
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
  );
}

export function Handle({
  x,
  y,
  onPointerDown,
}: {
  x: number;
  y: number;
  onPointerDown?: (e: React.PointerEvent) => void;
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
  );
}

// Rubber-band wall while drawing (spec §4). Square caps overhang by half the
// thickness, so the label reads the hors-tout extent: axis + thickness.
export function RubberWall({
  from,
  to,
  thickness,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  thickness: number;
}) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = labelAngle(to.x - from.x, to.y - from.y);
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
  );
}

// The PNG export's scene: no selection, no UI chrome (spec §7). Takes the
// on-screen measure preference rather than always printing (ADR 0008).
export function PlanScene({
  plan,
  rooms,
  measuresVisible,
  dimFontPx,
}: {
  plan: Plan;
  rooms: Room[];
  measuresVisible: boolean;
  dimFontPx?: number;
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
  );
}
