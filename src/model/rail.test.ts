import { describe, expect, it } from 'vitest';
import { DIM_FONT_PX, dimSide, railedDimT } from './rail';
import { oneWallPlan, squareRoomPlan } from './testHelpers';

const horizontal = (x1: number, y1: number, x2: number, y2: number) => {
  const { plan, wall } = oneWallPlan(x1, y1, x2, y2);
  return [plan, wall] as const;
};

describe('dimSide', () => {
  // The sign is read along the start→end left normal, so it inverts with the
  // draw direction while naming the same drawn side.
  it('defaults a horizontal wall upper and a vertical one left, whatever the draw direction', () => {
    expect(dimSide(...horizontal(0, 0, 400, 0))).toBe(-1);
    expect(dimSide(...horizontal(400, 0, 0, 0))).toBe(1);
    expect(dimSide(...horizontal(0, 0, 0, 400))).toBe(1);
    expect(dimSide(...horizontal(0, 400, 0, 0))).toBe(-1);
  });

  it('answers the stored side once one is placed', () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
    wall.dimPlacement = { t: 0.5, side: 1 };
    expect(dimSide(plan, wall)).toBe(1);
  });
});

describe('railedDimT', () => {
  it('stops the plate at the base of inside heads', () => {
    // 400 cm wall, thickness 10: silhouette -5..405, plate half-width 16.4
    // heads inside → margin 7 + 16.4 = 23.4
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
    expect(railedDimT(plan, wall, -1, 0, DIM_FONT_PX)).toBeCloseTo((-5 + 23.4) / 400, 5);
    expect(railedDimT(plan, wall, -1, 1, DIM_FONT_PX)).toBeCloseTo((405 - 23.4) / 400, 5);
  });

  it('leaves a wish that already sits on the rail alone', () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
    expect(railedDimT(plan, wall, -1, 0.42, DIM_FONT_PX)).toBe(0.42);
  });

  it('lets the plate reach the extent bounds when the heads sit outside', () => {
    // 30 cm wall, thickness 10: silhouette -5..35, plate 28 wide
    // heads outside → margin is the plate half-width only
    const { plan, wall } = oneWallPlan(0, 0, 30, 0);
    expect(railedDimT(plan, wall, -1, 0, DIM_FONT_PX)).toBeCloseTo((-5 + 14) / 30, 5);
    expect(railedDimT(plan, wall, -1, 1, DIM_FONT_PX)).toBeCloseTo((35 - 14) / 30, 5);
  });

  it('pins the plate to the middle when it overflows the span', () => {
    // 20 cm wall, thickness 5: silhouette -2.5..22.5 (25 cm) < 28 cm plate
    const { plan, wall } = oneWallPlan(0, 0, 20, 0, 5);
    expect(railedDimT(plan, wall, -1, 0.9, DIM_FONT_PX)).toBeCloseTo(0.5, 5);
    expect(railedDimT(plan, wall, -1, 0.1, DIM_FONT_PX)).toBeCloseTo(0.5, 5);
  });

  // What keeps the export honest: its measure font is larger than the editor's.
  it('shortens the rail as the font widens', () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
    expect(railedDimT(plan, wall, -1, 1, 10)).toBeLessThan(railedDimT(plan, wall, -1, 1, DIM_FONT_PX));
  });

  it('rails against the side asked for, the two faces being unequal', () => {
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    // interior face 5..395, exterior -5..405: the interior rail starts later
    expect(railedDimT(plan, bottom, 1, 0, DIM_FONT_PX)).toBeGreaterThan(
      railedDimT(plan, bottom, -1, 0, DIM_FONT_PX),
    );
  });

  it('centres the placement on a wall too short to measure', () => {
    const { plan, wall } = oneWallPlan(0, 0, 0, 0);
    expect(railedDimT(plan, wall, -1, 0.9, DIM_FONT_PX)).toBe(0.5);
  });
});
