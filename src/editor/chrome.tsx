import type { Vec } from '../model/geometry';
import { labelAngle, wallAxis, wallPoints } from '../model/geometry';
import { formatLength } from '../model/format';
import { openingPlacement } from '../model/openings';
import { DIM_FONT_PX, openingRail } from '../model/rail';
import type { Room } from '../model/rooms';
import type { Snap } from '../model/snap';
import type { Opening, Plan, Ruler, Wall } from '../model/types';
import { DimText } from '../sheet/measures';
import { doorArc, doorLeaf, doorMirror } from '../sheet/openings';
import { COLORS } from '../sheet/paint';

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

// Screen px, non-scaling-stroke: a Ruler has no body to add a margin to, so the
// grab zone is a constant-width transparent line laid on the A→B segment.
const RULER_GRAB_STROKE = 12;

// Render after the value so the segment wins the click (CONTEXT.md: Grab zone).
export function RulerGrabZone({
  ruler,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: {
  ruler: Ruler;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const { a, b } = ruler;
  return (
    <line
      className="ruler-grab"
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke="transparent"
      strokeWidth={RULER_GRAB_STROKE}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      style={{ cursor: 'move' }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    />
  );
}

// Screen pixels: 9px measure text plus 5px of padding each side. A chip keeps
// its own font, apart from the measure register's.
const CHIP_HEIGHT = 16;
const CHIP_CHAR_PX = 5.4;
const chipWidth = (label: string) => label.length * CHIP_CHAR_PX + 10;

// CONTEXT.md: Placement dimension. Chips, not a Dimension: on the wall axis is
// the one register free to coexist with the wall's own (ADR 0005). Editor only.
export function PlacementDims({ plan, opening, pxPerCm }: { plan: Plan; opening: Opening; pxPerCm: number }) {
  const wall = plan.walls[opening.wallId];
  const placement = openingPlacement(plan, opening);
  const axis = wall && wallAxis(plan, wall);
  if (!wall || !placement || !axis) return null;
  const { a, u, angle } = axis;
  const at = (t: number) => ({ x: a.x + u.x * t, y: a.y + u.y * t });
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

// Interaction chrome, not drawing (ADR 0005), so the export never prints it.
// evenodd: an island's footprint is not this room's floor (CONTEXT.md: Room).
export function RoomFill({ room, variant }: { room: Room; variant: 'hover' | 'selected' }) {
  const loop = (points: Vec[]) => `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')} Z`;
  return (
    <path
      className={`room-fill-${variant}`}
      d={[room.polygon, ...room.holes].map(loop).join(' ')}
      fillRule="evenodd"
      pointerEvents="none"
    />
  );
}

// Screen px held constant via /pxPerCm; RING_PX is shared with Handle so the
// attached snap ring stays its exact size in green (ADR 0019).
const RING_PX = 7;
const SNAP_DOT_PX = 2.6;

export function SnapMarker({ snap, pxPerCm }: { snap: Snap | null; pxPerCm: number }) {
  if (!snap) return null;
  // point and wall snaps share one ring — both attach to existing geometry
  const attached = snap.kind === 'point' || snap.kind === 'wall';
  return (
    <g pointerEvents="none">
      {attached ? (
        // Handle's double-stroke ring, edged in snap green instead of wall: a
        // sheet-colored band the snap green outlines on both sides.
        <>
          <circle
            cx={snap.x}
            cy={snap.y}
            r={RING_PX / pxPerCm}
            fill="none"
            stroke={COLORS.snap}
            strokeWidth={5}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={snap.x}
            cy={snap.y}
            r={RING_PX / pxPerCm}
            fill="none"
            stroke="var(--sheet)"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : (
        // sheet halo keeps the dot legible over a dark wall
        <>
          <circle
            cx={snap.x}
            cy={snap.y}
            r={(SNAP_DOT_PX + 1.1) / pxPerCm}
            fill="none"
            stroke="var(--sheet)"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={snap.x} cy={snap.y} r={SNAP_DOT_PX / pxPerCm} fill={COLORS.snap} />
        </>
      )}
    </g>
  );
}

// Screen px: the ring (RING_PX, shared with the snap marker) stays small and
// constant at every zoom, while a wider invisible disc catches the pointer.
const HANDLE_GRAB_PX = 14;

export function Handle({
  x,
  y,
  pxPerCm,
  onPointerDown,
}: {
  x: number;
  y: number;
  pxPerCm: number;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const r = RING_PX / pxPerCm;
  return (
    <g>
      {/* wall-colored edge defines the sheet ring where it overhangs the body */}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill="none"
        stroke="var(--wall)"
        strokeWidth={5}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <circle
        cx={x}
        cy={y}
        r={r}
        fill="none"
        stroke="var(--sheet)"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <circle
        className="point-handle"
        cx={x}
        cy={y}
        r={HANDLE_GRAB_PX / pxPerCm}
        fill="transparent"
        style={{ cursor: 'grab' }}
        onPointerDown={onPointerDown}
      />
    </g>
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
          <DimText
            label={formatLength(length + thickness)}
            className="dim dim-live"
            fontPx={DIM_FONT_PX}
            y={-thickness - 7}
          />
        </g>
      )}
    </g>
  );
}
