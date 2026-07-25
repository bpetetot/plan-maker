import { describe, expect, it } from 'vitest';
import { rulerDimension, wallDimension } from './dimension';
import { DIM_FONT_PX } from './rail';
import { oneWallPlan, squareRoomPlan } from './testHelpers';
import type { Ruler } from './types';

// Wider than the editor's, as the export's is (ADR 0024).
const WIDER_FONT_PX = 10;

const wallDim = (x1: number, y1: number, x2: number, y2: number, thickness = 10, fontPx = DIM_FONT_PX) => {
  const { plan, wall } = oneWallPlan(x1, y1, x2, y2, thickness);
  return wallDimension(plan, wall, fontPx);
};

const ruler = (bx: number, by: number, t = 0.5): Ruler => ({
  id: 'r',
  a: { x: 0, y: 0 },
  b: { x: bx, y: by },
  t,
});

describe('wallDimension value', () => {
  it('measures the rendered silhouette, not the axis', () => {
    // 400 cm axis, 10 cm thick: square caps overhang half a thickness each end
    expect(wallDim(0, 0, 400, 0)).toMatchObject({ value: 410, label: '4,10 m' });
  });

  it('reads the side the dimension sits on, which the plan owns', () => {
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    // default side of a horizontal wall: upper — outside the room
    expect(wallDimension(plan, bottom, DIM_FONT_PX)?.value).toBe(410);
    bottom.dimPlacement = { t: 0.5, side: 1 };
    expect(wallDimension(plan, bottom, DIM_FONT_PX)?.value).toBe(390);
  });

  it('states no Dimension on a wall shorter than its own plate and heads', () => {
    expect(wallDim(0, 0, 19, 0)).toBeNull();
    expect(wallDim(0, 0, 20, 0)).not.toBeNull();
  });
});

describe('wallDimension frame', () => {
  it('sits a constant clearance past the Face, whatever the thickness', () => {
    // side -1 on a horizontal wall: the line runs above the axis
    expect(wallDim(0, 0, 400, 0)?.origin).toEqual({ x: 0, y: -15 });
    expect(wallDim(0, 0, 400, 0, 30)?.origin).toEqual({ x: 0, y: -25 });
  });

  it('reads ISO — from the bottom or the right, never +90', () => {
    expect(wallDim(0, 0, 0, 400)?.angle).toBe(-90);
    expect(wallDim(0, 400, 0, 0)?.angle).toBe(-90);
  });
});

describe('wallDimension on the Rail', () => {
  it('rails a stored wish its own wall no longer allows', () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
    wall.dimPlacement = { t: 0.99, side: -1 };
    // silhouette -5..405, plate half-width 16.4, heads inside → margin 23.4
    expect(wallDimension(plan, wall, DIM_FONT_PX)?.plateAt).toBeCloseTo(405 - 23.4, 5);
  });

  it('rails shorter at export size, the same stored wish sitting elsewhere', () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
    wall.dimPlacement = { t: 1, side: -1 };
    const editor = wallDimension(plan, wall, DIM_FONT_PX)!;
    const exported = wallDimension(plan, wall, WIDER_FONT_PX)!;
    expect(exported.plate.halfW).toBeGreaterThan(editor.plate.halfW);
    expect(exported.plateAt).toBeLessThan(editor.plateAt);
  });

  it('pins the plate to the middle of a span too narrow to hold it', () => {
    // 20 cm wall, thickness 5: silhouette -2.5..22.5 (25 cm) < the 28 cm plate
    const { plan, wall } = oneWallPlan(0, 0, 20, 0, 5);
    wall.dimPlacement = { t: 0.9, side: -1 };
    expect(wallDimension(plan, wall, DIM_FONT_PX)?.plateAt).toBeCloseTo(10, 5);
  });
});

describe('wallDimension arrowheads', () => {
  it('keeps the heads inside an extent with room for them', () => {
    expect(wallDim(0, 0, 400, 0)?.arrowsInside).toBe(true);
  });

  it('flips them outside when the plate and the heads no longer fit', () => {
    expect(wallDim(0, 0, 25, 0)?.arrowsInside).toBe(false);
  });
});

describe('rulerDimension', () => {
  it('measures the raw A→B distance, laid on the segment itself', () => {
    const dim = rulerDimension(ruler(400, 0), DIM_FONT_PX)!;
    expect(dim).toMatchObject({ value: 400, label: '4,00 m', from: 0, to: 400 });
    // no Face to offset from: the line is the segment
    expect(dim.origin).toEqual({ x: 0, y: 0 });
  });

  it('reads ISO like a wall Dimension', () => {
    expect(rulerDimension(ruler(0, 200), DIM_FONT_PX)?.angle).toBe(-90);
  });

  it('leaves a placement the segment has room for alone', () => {
    expect(rulerDimension(ruler(400, 0, 0.25), DIM_FONT_PX)?.plateAt).toBe(100);
  });

  // CONTEXT.md: Rail — it binds at every drawing, and a Ruler is drawn as the
  // same DimensionLine. An imported extreme would otherwise plate its own head.
  it('rails an extreme stored t back off its own arrowhead', () => {
    const dim = rulerDimension(ruler(400, 0, 0), DIM_FONT_PX)!;
    expect(dim.plateAt).toBeCloseTo(23.4, 5);
    expect(dim.plateAt - dim.plate.halfW).toBeGreaterThanOrEqual(7);
  });

  it('states nothing for a segment shorter than a centimetre', () => {
    expect(rulerDimension(ruler(0, 0), DIM_FONT_PX)).toBeNull();
  });
});
