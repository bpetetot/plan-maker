// CONTEXT.md: DimensionLine — the ISO figure a Dimension and a Ruler are both
// drawn as, read here so the sheet only places what the model decided.
import { faceSpan } from './faces';
import { formatLength } from './format';
import type { Vec } from './geometry';
import { labelAngle, wallAxis } from './geometry';
import type { Span } from './openings';
import { arrowsFitInside, dimSide, plateBox, railedRatio } from './rail';
import type { Plan, Ruler, Wall } from './types';

/** Where the line runs: its origin at axis parameter 0, already off the Face. */
interface Run {
  origin: Vec;
  u: Vec;
  angle: number;
}

export interface DimensionLine extends Run {
  /** The measured extent, as axis parameters from `origin`. */
  from: number;
  to: number;
  value: number;
  label: string;
  /** Where the plate sits once railed — an axis parameter, not a ratio. */
  plateAt: number;
  fontPx: number;
  plate: { halfW: number; halfH: number };
  arrowsInside: boolean;
}

// A Dimension sits at a constant distance from the Face it measures, whatever
// the wall's thickness (CONTEXT.md: Dimension).
const FACE_CLEARANCE = 10;

// Below this a wall states no Dimension: the plate and its heads would be
// longer than the wall itself.
const MIN_DIM_LENGTH = 20;

// One place decides the plate's box, its position on the Rail and whether the
// heads point inward — the drawing re-deciding any of them is how they drift.
function dimensionLine(
  run: Run,
  span: Span,
  length: number,
  value: number,
  t: number,
  fontPx: number,
): DimensionLine {
  const label = formatLength(value);
  const plate = plateBox(label, fontPx);
  return {
    ...run,
    from: span.from,
    to: span.to,
    value,
    label,
    plateAt: railedRatio(span, length, plate.halfW, t) * length,
    fontPx,
    plate,
    arrowsInside: arrowsFitInside(span.to - span.from, 2 * plate.halfW),
  };
}

// The automatic dimension of a wall (spec §4), measuring the rendered
// silhouette on the side it sits on. The side is the plan's, never a caller's.
export function wallDimension(plan: Plan, wall: Wall, fontPx: number): DimensionLine | null {
  const axis = wallAxis(plan, wall);
  if (!axis || axis.length < MIN_DIM_LENGTH) return null;
  const { a, u, length, angle } = axis;
  const side = dimSide(plan, wall);
  const span = faceSpan(plan, wall, side);
  const off = wall.thickness / 2 + FACE_CLEARANCE;
  const origin = { x: a.x - u.y * side * off, y: a.y + u.x * side * off };
  const value = Math.max(0, span.to - span.from);
  const run = { origin, u, angle };
  return dimensionLine(run, span, length, value, wall.dimPlacement?.t ?? 0.5, fontPx);
}

// A hand-placed Ruler (CONTEXT.md): the same figure laid directly on its own
// A→B segment — no Face to offset from, and the value is the raw distance.
export function rulerDimension(ruler: Ruler, fontPx: number): DimensionLine | null {
  const { a, b, t } = ruler;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;
  const run = {
    origin: { x: a.x, y: a.y },
    u: { x: dx / length, y: dy / length },
    angle: labelAngle(dx, dy),
  };
  return dimensionLine(run, { from: 0, to: length }, length, length, t, fontPx);
}
