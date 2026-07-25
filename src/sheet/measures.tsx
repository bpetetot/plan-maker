import type { DimensionLine } from '../model/dimension';
import { rulerDimension, wallDimension } from '../model/dimension';
import { ARROW_LEN, plateBox } from '../model/rail';
import type { Plan, Ruler, Wall } from '../model/types';
import { COLORS, seamStroke } from './paint';

const PLATE_RX = 2;

export function DimText({
  label,
  className,
  fontPx,
  x = 0,
  y = 0,
}: {
  label: string;
  className: string;
  fontPx: number;
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

// ISO: the heads sit inside the extent pointing outward, and flip outside
// pointing inward when the span runs out of room — which the reading decided.
function ExtentLine({ dim, stroke }: { dim: DimensionLine; stroke: string }) {
  const { origin, u, from, to, t, plate, arrowsInside } = dim;
  const at = (s: number) => ({ x: origin.x + u.x * s, y: origin.y + u.y * s });
  const start = arrowsInside ? from + ARROW_LEN : from;
  const end = arrowsInside ? to - ARROW_LEN : to;
  const g1 = Math.max(start, Math.min(t - plate.halfW, end));
  const g2 = Math.min(end, Math.max(t + plate.halfW, start));
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
        { t: from, dir: arrowsInside ? 1 : -1 },
        { t: to, dir: arrowsInside ? -1 : 1 },
      ].map(({ t: tip0, dir }, i) => {
        const tip = at(tip0);
        const bx = tip.x + u.x * ARROW_LEN * dir;
        const by = tip.y + u.y * ARROW_LEN * dir;
        const points = [
          `${tip.x},${tip.y}`,
          `${bx + u.y * ARROW_HALF_WIDTH},${by - u.x * ARROW_HALF_WIDTH}`,
          `${bx - u.y * ARROW_HALF_WIDTH},${by + u.x * ARROW_HALF_WIDTH}`,
        ].join(' ');
        return <polygon key={i} points={points} fill={stroke} {...seamStroke(stroke)} />;
      })}
    </g>
  );
}

// On-screen margin around the plate (CONTEXT.md: Grab zone). The plate itself
// is drawing and keeps the plan's scale; only the margin is pinned (ADR 0005).
const PLATE_GRAB_MARGIN_PX = 3;

// Draws a DimensionLine and nothing else: every position, box and flip on it
// was decided by the model.
function DimensionLineView({
  dim,
  selected,
  hovered,
  pxPerCm,
  onPointerDown,
}: {
  dim: DimensionLine;
  selected?: boolean;
  hovered?: boolean;
  pxPerCm?: number;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  // Line and arrows tint on hover like a wall body; the plate text stays plain.
  const stroke = selected ? COLORS.wallSelected : hovered ? COLORS.wallHover : 'var(--dim-line)';
  const mid = { x: dim.origin.x + dim.u.x * dim.t, y: dim.origin.y + dim.u.y * dim.t };
  const margin = pxPerCm ? PLATE_GRAB_MARGIN_PX / pxPerCm : 0;
  const halfW = dim.plate.halfW + margin;
  const halfH = dim.plate.halfH + margin;
  return (
    <g>
      {dim.value >= 1 && <ExtentLine dim={dim} stroke={stroke} />}
      <g
        transform={`translate(${mid.x},${mid.y}) rotate(${dim.angle})`}
        pointerEvents={onPointerDown ? 'auto' : 'none'}
        style={onPointerDown ? { cursor: 'move' } : undefined}
        onPointerDown={onPointerDown}
      >
        {onPointerDown && (
          <rect
            className="dim-grab"
            x={-halfW}
            y={-halfH}
            width={2 * halfW}
            height={2 * halfH}
            fill="transparent"
          />
        )}
        <DimText label={dim.label} fontPx={dim.fontPx} className={selected ? 'dim dim-selected' : 'dim'} />
      </g>
    </g>
  );
}

// Automatic dimension on every wall (spec §4). Drag handle with onPointerDown;
// never selectable.
export function DimLabel({
  plan,
  wall,
  fontPx,
  selected,
  pxPerCm,
  onPointerDown,
}: {
  plan: Plan;
  wall: Wall;
  fontPx: number;
  selected?: boolean;
  pxPerCm?: number;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const dim = wallDimension(plan, wall, fontPx);
  return dim ? (
    <DimensionLineView dim={dim} selected={selected} pxPerCm={pxPerCm} onPointerDown={onPointerDown} />
  ) : null;
}

// A hand-placed Ruler (CONTEXT.md). Its body is grabbed by the chrome's zone on
// the segment, so the plate answers to nothing here.
export function RulerLabel({
  ruler,
  fontPx,
  selected,
  hovered,
}: {
  ruler: Ruler;
  fontPx: number;
  selected?: boolean;
  hovered?: boolean;
}) {
  const dim = rulerDimension(ruler, fontPx);
  return dim ? <DimensionLineView dim={dim} selected={selected} hovered={hovered} /> : null;
}
