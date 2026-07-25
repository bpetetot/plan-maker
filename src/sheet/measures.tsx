import { faceSpan } from '../model/faces';
import { formatLength } from '../model/format';
import { wallLength, wallPoints } from '../model/geometry';
import type { Plan, Ruler, Wall } from '../model/types';
import { COLORS, seamStroke } from './paint';

// ISO: text reads from the bottom or the right, so vertical is -90, never +90.
export const labelAngle = (dx: number, dy: number) => {
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle >= 90) angle -= 180;
  else if (angle < -90) angle += 180;
  return angle;
};

const dimLineOffset = (wall: Wall) => wall.thickness / 2 + 10;

// `side` is a sign along the start→end left normal; its default puts the line
// upper for horizontal walls, left for vertical ones.
export function dimLineFrame(plan: Plan, wall: Wall) {
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
// JetBrains Mono's 0.6 em.
const DIM_FONT_PX = 8;
const measureCharPx = (fontPx: number) => 0.6 * fontPx;

// The plate covers the whole text box, spaces included: grid, walls and
// neighbouring dimension lines must never show through a measure.
const PLATE_PAD_X = 2;
const PLATE_PAD_Y = 1;
const PLATE_RX = 2;
const plateHalfWidth = (label: string, fontPx: number) =>
  (label.length * measureCharPx(fontPx)) / 2 + PLATE_PAD_X;

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
  // The stored ratio was bounded at the size the editor draws; a wider font
  // shortens the Rail, so it binds again here (CONTEXT.md: Rail).
  const bounds = dimTravelBounds(plan, wall, side, fontPx);
  const tText = Math.min(bounds.max, Math.max(bounds.min, wall.dimPlacement?.t ?? 0.5)) * length;
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
  const gapHalf = plateHalfWidth(label, fontPx);
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
