import { describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { buildPlan, oneWallPlan, squareRoomPlan } from '../model/testHelpers';
import type { Plan, Ruler, Wall } from '../model/types';
import { DimLabel, dimTravelBounds, labelAngle, RulerLabel } from './measures';
import { COLORS } from './paint';

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
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
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
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
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
    const { plan, wall } = oneWallPlan(0, 0, 25, 0);
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
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
    const { min, max } = dimTravelBounds(plan, wall, -1);
    expect(min).toBeCloseTo((-5 + 23.4) / 400, 5);
    expect(max).toBeCloseTo((405 - 23.4) / 400, 5);
  });

  it('lets the plate reach the extent bounds when the heads sit outside', () => {
    // 30 cm wall, thickness 10: silhouette -5..35, plate 28 wide
    // heads outside → margin is the plate half-width only
    const { plan, wall } = oneWallPlan(0, 0, 30, 0);
    const { min, max } = dimTravelBounds(plan, wall, -1);
    expect(min).toBeCloseTo((-5 + 14) / 30, 5);
    expect(max).toBeCloseTo((35 - 14) / 30, 5);
  });

  it('collapses the travel to its middle when the plate overflows the span', () => {
    // 20 cm wall, thickness 5: silhouette -2.5..22.5 (25 cm) < 28 cm plate
    const { plan, wall } = oneWallPlan(0, 0, 20, 0, 5);
    const { min, max } = dimTravelBounds(plan, wall, -1);
    expect(min).toBe(max);
    expect(min).toBeCloseTo(0.5, 5);
  });

  // The Rail binds at every drawing, not only at the gesture (CONTEXT.md: Rail):
  // a placement its own wall outgrew is drawn back on the Rail, not where stored.
  it('draws a stored placement its wall no longer allows back on the rail', async () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
    wall.dimPlacement = { t: 0.99, side: -1 };
    const { max } = dimTravelBounds(plan, wall, -1);
    const { group } = await renderDim(plan, wall);
    const x = Number(/translate\(([-\d.]+),/.exec(group.getAttribute('transform')!)![1]);
    expect(0.99).toBeGreaterThan(max);
    expect(x).toBeCloseTo(max * 400, 3);
  });
});

describe('DimLabel selection', () => {
  it('renders the whole dimension in accent when its wall is selected', async () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
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
    const { plan, wall } = oneWallPlan(0, 0, 400, 0);
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

describe('RulerLabel', () => {
  const ruler = (ax: number, ay: number, bx: number, by: number, t = 0.5): Ruler => ({
    id: 'r',
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    t,
  });

  async function renderRuler(r: Ruler, selected?: boolean) {
    const { container } = await render(
      <svg>
        <RulerLabel ruler={r} selected={selected} />
      </svg>,
    );
    return container;
  }

  it('measures the free A→B distance, laid directly on the segment', async () => {
    const container = await renderRuler(ruler(0, 0, 400, 0));
    // no lateral offset: the value equals the raw distance, formatted like a wall
    expect(container.querySelector('text')!.textContent).toBe('4,00 m');
  });

  it('pins an arrowhead at each endpoint, on the segment itself', async () => {
    const container = await renderRuler(ruler(0, 0, 400, 0));
    const heads = Array.from(container.querySelectorAll('polygon'));
    expect(heads).toHaveLength(2);
    // tips at A=(0,0) and B=(400,0): no off, so y stays 0
    expect(heads[0].getAttribute('points')!.startsWith('0,0 ')).toBe(true);
    expect(heads[1].getAttribute('points')!.startsWith('400,0 ')).toBe(true);
  });

  it('reads ISO on a vertical ruler, whatever the draw direction', async () => {
    for (const [y1, y2] of [
      [0, 200],
      [200, 0],
    ]) {
      const container = await renderRuler(ruler(0, y1, 0, y2));
      const group = container.querySelector('text')!.closest('g')!;
      expect(group.getAttribute('transform')).toContain('rotate(-90)');
      await cleanup();
    }
  });

  it('slides the value to t along the segment', async () => {
    const container = await renderRuler(ruler(0, 0, 400, 0, 0.25));
    const group = container.querySelector('text')!.closest('g')!;
    // t=0.25 of a 400 cm horizontal ruler: value plate centred at x=100
    expect(group.getAttribute('transform')).toBe('translate(100,0) rotate(0)');
  });

  it('inks the whole ruler in accent when selected', async () => {
    const container = await renderRuler(ruler(0, 0, 400, 0), true);
    expect(container.querySelector('text')!.classList.contains('dim-selected')).toBe(true);
    for (const line of Array.from(container.querySelectorAll('line'))) {
      expect(line.getAttribute('stroke')).toBe(COLORS.wallSelected);
    }
    for (const head of Array.from(container.querySelectorAll('polygon'))) {
      expect(head.getAttribute('fill')).toBe(COLORS.wallSelected);
    }
  });

  it('keeps the measure ink when unselected', async () => {
    const container = await renderRuler(ruler(0, 0, 400, 0));
    for (const line of Array.from(container.querySelectorAll('line'))) {
      expect(line.getAttribute('stroke')).toBe('var(--dim-line)');
    }
  });
});

describe('DimLabel on a vertical wall', () => {
  it('rotates the text -90 for both draw directions', async () => {
    for (const [y1, y2] of [
      [0, 200],
      [200, 0],
    ]) {
      const { plan, wall } = oneWallPlan(0, y1, 0, y2);
      const { group } = await renderDim(plan, wall);
      expect(group.getAttribute('transform')).toContain('rotate(-90)');
      await cleanup();
    }
  });

  it('defaults to the left side of the wall (above the reading line)', async () => {
    const { plan, wall } = oneWallPlan(0, 0, 0, 200);
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
      const { plan, wall } = oneWallPlan(0, 0, 0, 200, thickness);
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
      const { plan, wall } = oneWallPlan(0, y1, 0, y2);
      wall.dimPlacement = { t: 0.5, side };
      const { group } = await renderDim(plan, wall);
      expect(group.getAttribute('transform')).toBe('translate(15,100) rotate(-90)');
      await cleanup();
    }
  });
});
