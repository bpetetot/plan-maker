import { describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import type { ElementRef } from '../model/selection';
import { buildPlan, squareRoomPlan } from '../model/testHelpers';
import type { Plan, Wall } from '../model/types';
import {
  COLORS,
  DimLabel,
  dimTravelBounds,
  JunctionPatches,
  labelAngle,
  OpeningGrabZone,
  RubberWall,
  WallGrabZone,
  WallLine,
} from './render';

function planWith(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness = 10,
): { plan: Plan; wall: Wall } {
  const wall: Wall = { id: 'w', startPointId: 'a', endPointId: 'b', thickness };
  const plan: Plan = {
    points: {
      a: { id: 'a', x: x1, y: y1 },
      b: { id: 'b', x: x2, y: y2 },
    },
    walls: { w: wall },
    openings: {},
    roomLabels: {},
  };
  return { plan, wall };
}

async function renderDim(plan: Plan, wall: Wall) {
  const { container } = await render(
    <svg>
      <DimLabel plan={plan} wall={wall} />
    </svg>,
  );
  const text = container.querySelector('text')!;
  const group = text.closest('g')!;
  return { text, group };
}

describe('labelAngle', () => {
  it('reads horizontal walls left-to-right regardless of draw direction', () => {
    expect(labelAngle(100, 0)).toBe(0);
    expect(labelAngle(-100, 0)).toBe(0);
  });

  it('reads vertical walls bottom-to-top (ISO), regardless of draw direction', () => {
    expect(labelAngle(0, 100)).toBe(-90);
    expect(labelAngle(0, -100)).toBe(-90);
  });

  it('normalizes every angle into [-90, 90)', () => {
    expect(labelAngle(100, 1)).toBeCloseTo(0.57, 1);
    expect(labelAngle(-100, 1)).toBeCloseTo(-0.57, 1);
    expect(labelAngle(-100, -1)).toBeCloseTo(0.57, 1);
    expect(labelAngle(1, 100)).toBeCloseTo(89.43, 1);
    expect(labelAngle(-1, 100)).toBeCloseTo(-89.43, 1);
  });
});

describe('DimLabel value', () => {
  it('shows the hors-tout extent on a free-standing wall', async () => {
    const { plan, wall } = planWith(0, 0, 400, 0);
    const { text } = await renderDim(plan, wall);
    expect(text.textContent).toBe('4,10 m');
  });

  it('measures the silhouette on the side it sits on', async () => {
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    // default side of a horizontal wall: upper — outside the room
    expect((await renderDim(plan, bottom)).text.textContent).toBe('4,10 m');
    await cleanup();
    // side +1: below in screen coords — the interior face
    bottom.dimPlacement = { t: 0.5, side: 1 };
    expect((await renderDim(plan, bottom)).text.textContent).toBe('3,90 m');
  });

  it('marks the measured extent: a broken line with an arrowhead at each end', async () => {
    const { plan, wall } = planWith(0, 0, 400, 0);
    const { container } = await render(
      <svg>
        <DimLabel plan={plan} wall={wall} />
      </svg>,
    );
    expect(container.querySelectorAll('line')).toHaveLength(2);
    const heads = Array.from(container.querySelectorAll('polygon'));
    expect(heads).toHaveLength(2);
    // tips on the silhouette ends: x = -5 and 405
    expect(heads[0].getAttribute('points')!.startsWith('-5,-15 ')).toBe(true);
    expect(heads[1].getAttribute('points')!.startsWith('405,-15 ')).toBe(true);
  });

  it('moves the arrowheads outside a short extent, as bare triangles', async () => {
    // 25 cm wall: the text gap swallows the line, heads move outside
    const { plan, wall } = planWith(0, 0, 25, 0);
    const { container } = await render(
      <svg>
        <DimLabel plan={plan} wall={wall} />
      </svg>,
    );
    expect(container.querySelector('text')!.textContent).toBe('35 cm');
    expect(container.querySelectorAll('line')).toHaveLength(2);
    expect(container.querySelectorAll('polygon')).toHaveLength(2);
  });

  it('pins the arrow tips to the span ends, however small the span', async () => {
    // 20 cm wall between two 19 cm walls: inner-side span 9.5→10.5
    let wallId = '';
    const plan = buildPlan((b) => {
      const l = b.point(0, 0);
      const r = b.point(20, 0);
      const wall = b.wall(l, r);
      const left = b.wall(l, b.point(0, 200));
      const right = b.wall(r, b.point(20, 200));
      left.thickness = 19;
      right.thickness = 19;
      wall.dimPlacement = { t: 0.5, side: 1 };
      wallId = wall.id;
    });
    const { container } = await render(
      <svg>
        <DimLabel plan={plan} wall={plan.walls[wallId]} />
      </svg>,
    );
    const heads = Array.from(container.querySelectorAll('polygon'));
    expect(heads[0].getAttribute('points')!.startsWith('9.5,15 ')).toBe(true);
    expect(heads[1].getAttribute('points')!.startsWith('10.5,15 ')).toBe(true);
  });
});

describe('dimTravelBounds', () => {
  it('stops the plate at the base of inside heads', () => {
    // 400 cm wall, thickness 10: silhouette -5..405, plate half-width 16.4
    // heads inside → margin 7 + 16.4 = 23.4
    const { plan, wall } = planWith(0, 0, 400, 0);
    const { min, max } = dimTravelBounds(plan, wall, -1);
    expect(min).toBeCloseTo((-5 + 23.4) / 400, 5);
    expect(max).toBeCloseTo((405 - 23.4) / 400, 5);
  });

  it('lets the plate reach the extent bounds when the heads sit outside', () => {
    // 30 cm wall, thickness 10: silhouette -5..35, plate 28 wide
    // heads outside → margin is the plate half-width only
    const { plan, wall } = planWith(0, 0, 30, 0);
    const { min, max } = dimTravelBounds(plan, wall, -1);
    expect(min).toBeCloseTo((-5 + 14) / 30, 5);
    expect(max).toBeCloseTo((35 - 14) / 30, 5);
  });

  it('collapses the travel to its middle when the plate overflows the span', () => {
    // 20 cm wall, thickness 5: silhouette -2.5..22.5 (25 cm) < 28 cm plate
    const { plan, wall } = planWith(0, 0, 20, 0, 5);
    const { min, max } = dimTravelBounds(plan, wall, -1);
    expect(min).toBe(max);
    expect(min).toBeCloseTo(0.5, 5);
  });
});

describe('DimLabel selection', () => {
  it('renders the whole dimension in accent when its wall is selected', async () => {
    const { plan, wall } = planWith(0, 0, 400, 0);
    const { container } = await render(
      <svg>
        <DimLabel plan={plan} wall={wall} selected />
      </svg>,
    );
    expect(container.querySelector('text')!.classList.contains('dim-selected')).toBe(true);
    const lines = Array.from(container.querySelectorAll('line'));
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.getAttribute('stroke')).toBe(COLORS.wallSelected);
    for (const head of Array.from(container.querySelectorAll('polygon'))) {
      expect(head.getAttribute('fill')).toBe(COLORS.wallSelected);
    }
  });

  it('keeps the measure ink when its wall is not selected', async () => {
    const { plan, wall } = planWith(0, 0, 400, 0);
    const { container } = await render(
      <svg>
        <DimLabel plan={plan} wall={wall} />
      </svg>,
    );
    expect(container.querySelector('text')!.classList.contains('dim-selected')).toBe(false);
    for (const line of Array.from(container.querySelectorAll('line'))) {
      expect(line.getAttribute('stroke')).toBe('var(--dim-line)');
    }
    for (const head of Array.from(container.querySelectorAll('polygon'))) {
      expect(head.getAttribute('fill')).toBe('var(--dim-line)');
    }
  });
});

describe('WallLine', () => {
  async function renderWall(plan: Plan, wall: Wall) {
    const { container } = await render(
      <svg>
        <WallLine plan={plan} wall={wall} />
      </svg>,
    );
    return container.querySelector('polygon')!;
  }

  it('draws a free-standing wall as a rectangle overhanging its Points', async () => {
    const { plan, wall } = planWith(0, 0, 400, 0);
    const polygon = await renderWall(plan, wall);
    expect(polygon.getAttribute('points')).toBe('-5,5 405,5 405,-5 -5,-5');
  });

  it('miters a square-room corner: faces meet where the dimensions measure', async () => {
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    const polygon = await renderWall(plan, bottom);
    // interior face y=5 spans 5..395, exterior face y=-5 spans -5..405
    expect(polygon.getAttribute('points')).toBe('5,5 395,5 405,-5 -5,-5');
  });
});

describe('DimLabel on a vertical wall', () => {
  it('rotates the text -90 for both draw directions', async () => {
    for (const [y1, y2] of [
      [0, 200],
      [200, 0],
    ]) {
      const { plan, wall } = planWith(0, y1, 0, y2);
      const { group } = await renderDim(plan, wall);
      expect(group.getAttribute('transform')).toContain('rotate(-90)');
      await cleanup();
    }
  });

  it('defaults to the left side of the wall (above the reading line)', async () => {
    const { plan, wall } = planWith(0, 0, 0, 200);
    const { group } = await renderDim(plan, wall);
    // -15: on the dimension line, left of the wall axis
    expect(group.getAttribute('transform')).toBe('translate(-15,100) rotate(-90)');
  });

  it('keeps a constant 10 cm distance from the face, whatever the thickness', async () => {
    // face at thickness/2 from the axis, dimension line 10 cm beyond it
    for (const [thickness, off] of [
      [10, 15],
      [30, 25],
    ] as const) {
      const { plan, wall } = planWith(0, 0, 0, 200, thickness);
      const { group } = await renderDim(plan, wall);
      expect(group.getAttribute('transform')).toBe(`translate(-${off},100) rotate(-90)`);
      await cleanup();
    }
  });

  it('keeps a stored placement on its geometric side', async () => {
    // side is a sign along the start→end left normal: geometric right is
    // -1 drawn downward, +1 drawn upward — both land at x = 15
    for (const [y1, y2, side] of [
      [0, 200, -1],
      [200, 0, 1],
    ] as const) {
      const { plan, wall } = planWith(0, y1, 0, y2);
      wall.dimPlacement = { t: 0.5, side };
      const { group } = await renderDim(plan, wall);
      expect(group.getAttribute('transform')).toBe('translate(15,100) rotate(-90)');
      await cleanup();
    }
  });
});

describe('JunctionPatches', () => {
  // A T junction: two collinear bar walls split at the stem's Point.
  function tJunctionPlan(): { plan: Plan; bar1: Wall; bar2: Wall; stem: Wall } {
    let bar1!: Wall, bar2!: Wall, stem!: Wall;
    const plan = buildPlan((b) => {
      const left = b.point(0, 0);
      const mid = b.point(200, 0);
      const right = b.point(400, 0);
      const foot = b.point(200, 200);
      bar1 = b.wall(left, mid);
      bar2 = b.wall(mid, right);
      stem = b.wall(mid, foot);
    });
    return { plan, bar1, bar2, stem };
  }

  async function renderPatch(plan: Plan, selection?: ElementRef[]) {
    const { container } = await render(
      <svg>
        <JunctionPatches plan={plan} selection={selection} />
      </svg>,
    );
    return container.querySelector('polygon')!;
  }

  it('tints the patch when two of its walls are selected', async () => {
    const { plan, bar1, bar2 } = tJunctionPlan();
    const patch = await renderPatch(plan, [
      { type: 'wall', id: bar1.id },
      { type: 'wall', id: bar2.id },
    ]);
    expect(patch.getAttribute('fill')).toBe(COLORS.wallSelected);
  });

  it('keeps the plain wall color when only one of its walls is selected', async () => {
    const { plan, bar1 } = tJunctionPlan();
    const patch = await renderPatch(plan, [{ type: 'wall', id: bar1.id }]);
    expect(patch.getAttribute('fill')).toBe(COLORS.wall);
  });

  it('keeps the plain wall color without a selection (PNG export)', async () => {
    const { plan } = tJunctionPlan();
    const patch = await renderPatch(plan);
    expect(patch.getAttribute('fill')).toBe(COLORS.wall);
  });
});

describe('Grab zones', () => {
  // Body plus a constant 2 screen px per side (CONTEXT.md: Grab zone).
  it('sizes a wall grab zone to the body plus 2 screen px per side', async () => {
    const { plan, wall } = planWith(0, 0, 400, 0, 30);
    const { container } = await render(
      <svg>
        <WallGrabZone plan={plan} wall={wall} pxPerCm={2} />
      </svg>,
    );
    // 2 px at 2 px/cm is 1 cm per side: 30 + 2 = 32
    expect(container.querySelector('line')!.getAttribute('stroke-width')).toBe('32');
  });

  it('keeps the wall margin constant on screen when zoomed out', async () => {
    const { plan, wall } = planWith(0, 0, 400, 0, 10);
    const { container } = await render(
      <svg>
        <WallGrabZone plan={plan} wall={wall} pxPerCm={0.5} />
      </svg>,
    );
    // 2 px at 0.5 px/cm is 4 cm per side: 10 + 8 = 18
    expect(container.querySelector('line')!.getAttribute('stroke-width')).toBe('18');
  });

  it('covers the square body overhang at a free wall end: square cap', async () => {
    // Not a round cap: it misses the square corners of the body overhang,
    // at 0.707 × thickness from the Point.
    const { plan, wall } = planWith(0, 0, 400, 0, 30);
    const { container } = await render(
      <svg>
        <WallGrabZone plan={plan} wall={wall} pxPerCm={2} />
      </svg>,
    );
    expect(container.querySelector('line')!.getAttribute('stroke-linecap')).toBe('square');
  });

  it('sizes an opening grab rect to the wall body plus 2 screen px per side', async () => {
    let openingId = '';
    const plan = buildPlan((b) => {
      const wall = b.wall(b.point(0, 0), b.point(400, 0));
      wall.thickness = 30;
      openingId = b.opening(wall, 'window', 200).id;
    });
    const { container } = await render(
      <svg>
        <OpeningGrabZone plan={plan} opening={plan.openings[openingId]} pxPerCm={2} />
      </svg>,
    );
    const rect = container.querySelector('rect')!;
    expect(rect.getAttribute('height')).toBe('32');
    expect(rect.getAttribute('y')).toBe('-16');
  });
});

describe('RubberWall', () => {
  async function renderRubber(from: { x: number; y: number }, to: { x: number; y: number }) {
    const { container } = await render(
      <svg>
        <RubberWall from={from} to={to} thickness={10} />
      </svg>,
    );
    return container;
  }

  it('labels the hors-tout extent: axis length plus the thickness', async () => {
    const container = await renderRubber({ x: 0, y: 0 }, { x: 400, y: 0 });
    expect(container.querySelector('text')!.textContent).toBe('4,10 m');
  });

  it('previews the future body honestly: square caps', async () => {
    const container = await renderRubber({ x: 0, y: 0 }, { x: 400, y: 0 });
    expect(container.querySelector('line')!.getAttribute('stroke-linecap')).toBe('square');
  });
});
