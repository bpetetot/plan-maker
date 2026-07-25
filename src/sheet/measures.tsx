import { faceSpan } from '../model/faces';
import { formatLength } from '../model/format';
import { labelAngle, wallLength, wallPoints } from '../model/geometry';
import { ARROW_LEN, arrowsFitInside, DIM_FONT_PX, dimSide, plateBox, railedDimT } from '../model/rail';
import type { Plan, Ruler, Wall } from '../model/types';
import { COLORS, seamStroke } from './paint';

const dimLineOffset = (wall: Wall) => wall.thickness / 2 + 10;

// Where the dimension line runs: its origin, its unit vector, the reading
// angle, the side it sits on and its distance from the wall axis.
export function dimLineFrame(plan: Plan, wall: Wall) {
  const [a, b] = wallPoints(plan, wall);
  const length = wallLength(plan, wall);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    a,
    length,
    ux: dx / length,
    uy: dy / length,
    angle: labelAngle(dx, dy),
    side: dimSide(plan, wall),
    off: dimLineOffset(wall),
  };
}

const PLATE_RX = 2;

export function DimText({
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
  const { halfW, halfH } = plateBox(label, fontPx);
  return (
    <>
      <rect
        x={x - halfW}
        y={y - halfH}
        width={2 * halfW}
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
const ARROW_HALF_WIDTH = 2.2;

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
  const inside = arrowsFitInside(to - from, gapWidth);
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
  // The stored ratio was railed at the size the editor draws; a wider font
  // shortens the Rail, so it binds again here (CONTEXT.md: Rail).
  const tText = railedDimT(plan, wall, side, wall.dimPlacement?.t ?? 0.5, fontPx) * length;
  const mid = at(tText);
  const gapHalf = plateBox(label, fontPx).halfW;
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

// A hand-placed Ruler (CONTEXT.md), drawn like a wall Dimension but laid
// directly on its own A→B segment: no face offset, value is the raw distance.
export function RulerLabel({
  ruler,
  selected,
  hovered,
  fontPx = DIM_FONT_PX,
  onPointerDown,
}: {
  ruler: Ruler;
  selected?: boolean;
  hovered?: boolean;
  fontPx?: number;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const { a, b, t } = ruler;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;
  const ux = dx / length;
  const uy = dy / length;
  const angle = labelAngle(dx, dy);
  const label = formatLength(length);
  const at = (s: number) => ({ x: a.x + ux * s, y: a.y + uy * s });
  const tText = t * length;
  const mid = at(tText);
  const gapHalf = plateBox(label, fontPx).halfW;
  // Line and arrows tint on hover like a wall body; the plate text stays plain.
  const stroke = selected ? COLORS.wallSelected : hovered ? COLORS.wallHover : undefined;
  return (
    <g>
      <ExtentLine
        at={at}
        ux={ux}
        uy={uy}
        from={0}
        to={length}
        gapFrom={tText - gapHalf}
        gapTo={tText + gapHalf}
        stroke={stroke}
      />
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
