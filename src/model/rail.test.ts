import { describe, expect, it } from 'vitest';
import { DIM_FONT_PX, dimSide, openingRail, railedDimT, railedOpeningOffset } from './rail';
import { buildPlan, oneWallPlan, squareRoomPlan } from './testHelpers';

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

describe('openingRail', () => {
  it('runs the full-thickness stretch of the wall when nothing else is on it', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 200)).toEqual({ from: -5, to: 405 });
  });

  it('stops at the mitered corners of a room wall', () => {
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    expect(openingRail(plan, bottom, 200)).toEqual({ from: 5, to: 395 });
  });

  it('cuts back to the near edge of the openings flanking the reference position', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'window', 60, 60); // edges 30 / 90
      b.opening(wall, 'door', 300, 80); // edges 260 / 340
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 200)).toEqual({ from: 90, to: 260 });
  });

  it('excludes the opening being placed from its own bounds', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'window', 200, 80);
    });
    const wall = Object.values(plan.walls)[0];
    const opening = Object.values(plan.openings)[0];
    expect(openingRail(plan, wall, 200, opening.id)).toEqual({ from: -5, to: 405 });
  });

  it('sides a neighbour by the reference position, so a rail never spans one', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      b.opening(wall, 'window', 200, 80); // edges 160 / 240
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 300)).toEqual({ from: 240, to: 405 });
    expect(openingRail(plan, wall, 100)).toEqual({ from: -5, to: 160 });
  });

  it('reads a neighbour where it is drawn, not where it is stored', () => {
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(200, 0));
      b.opening(wall, 'window', 380, 80);
    });
    const wall = Object.values(plan.walls)[0];
    // full-thickness span -5 → 205, so the neighbour renders centred on 165
    expect(openingRail(plan, wall, 50)).toEqual({ from: -5, to: 125 });
  });

  it('ignores the openings of other walls', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
      const other = b.wall(b.point(0, 200), b.point(400, 200));
      b.opening(other, 'door', 200, 80);
    });
    const wall = Object.values(plan.walls)[0];
    expect(openingRail(plan, wall, 200)).toEqual({ from: -5, to: 405 });
  });
});

describe('railedOpeningOffset', () => {
  it('lands the offset flush against each end of the rail', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(400, 0));
    });
    const wall = Object.values(plan.walls)[0];
    // rail -5 → 405: a 90 opening centres between 40 and 360
    expect(railedOpeningOffset(plan, wall, 10, 90)).toBe(40);
    expect(railedOpeningOffset(plan, wall, 395, 90)).toBe(360);
    expect(railedOpeningOffset(plan, wall, 200, 90)).toBe(200);
  });

  it('lands exactly on a rail end that is not a whole centimetre', () => {
    // a 45° corner miters the rail end to an irrational offset: rounding to
    // whole centimetres must not push the opening off its bound
    const plan = buildPlan((b) => {
      const a = b.point(0, 0);
      const corner = b.point(400, 0);
      b.wall(a, corner);
      b.wall(corner, b.point(700, 300));
    });
    const wall = Object.values(plan.walls)[0];
    const rail = openingRail(plan, wall, 200);
    expect(Number.isInteger(rail.to)).toBe(false);
    expect(railedOpeningOffset(plan, wall, 400, 90)).toBe(rail.to - 45);
  });

  // Unlike the Dimension's, this Rail binds the plan (CONTEXT.md: Rail).
  it('refuses a rail shorter than the opening', () => {
    const plan = buildPlan((b) => {
      b.wall(b.point(0, 0), b.point(60, 0));
    });
    const wall = Object.values(plan.walls)[0];
    expect(railedOpeningOffset(plan, wall, 30, 90)).toBe(null);
  });

  it('refuses a wall that is not there', () => {
    const plan = buildPlan(() => {});
    expect(railedOpeningOffset(plan, undefined, 30, 90)).toBe(null);
  });
});
