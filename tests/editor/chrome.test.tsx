import { describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import type { Snap } from '../../src/model/snap';
import { buildPlan, oneWallPlan } from '../helpers';
import { COLORS } from '../../src/sheet/paint';
import { AlignmentGuides, OpeningGrabZone, RubberWall, SnapMarker, WallGrabZone } from '../../src/editor/chrome';

describe('Grab zones', () => {
  // Body plus a constant 2 screen px per side (CONTEXT.md: Grab zone).
  it('sizes a wall grab zone to the body plus 2 screen px per side', async () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0, 30);
    const { container } = await render(
      <svg>
        <WallGrabZone plan={plan} wall={wall} pxPerCm={2} />
      </svg>,
    );
    // 2 px at 2 px/cm is 1 cm per side: 30 + 2 = 32
    expect(container.querySelector('line')!.getAttribute('stroke-width')).toBe('32');
  });

  it('keeps the wall margin constant on screen when zoomed out', async () => {
    const { plan, wall } = oneWallPlan(0, 0, 400, 0, 10);
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
    const { plan, wall } = oneWallPlan(0, 0, 400, 0, 30);
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

describe('SnapMarker', () => {
  async function renderMarker(snap: Snap | null, pxPerCm: number) {
    const { container } = await render(
      <svg>
        <SnapMarker snap={snap} pxPerCm={pxPerCm} />
      </svg>,
    );
    return container;
  }
  const rings = (c: Element) =>
    Array.from(c.querySelectorAll('circle')).filter((el) => el.getAttribute('fill') === 'none');

  it('renders nothing without a snap', async () => {
    const c = await renderMarker(null, 1);
    expect(c.querySelector('circle')).toBeNull();
  });

  it("draws the Handle's double-stroke ring, snap-edged, for a point snap", async () => {
    const c = await renderMarker({ kind: 'point', x: 0, y: 0 }, 1);
    const r = rings(c);
    expect(r).toHaveLength(2);
    // snap-green edge under a sheet-colored band — the Handle look in green
    expect(r.map((el) => el.getAttribute('stroke'))).toEqual([COLORS.snap, 'var(--sheet)']);
    for (const el of r) expect(el.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('gives a wall snap the same ring as a point snap: both attach to existing geometry', async () => {
    const c = await renderMarker({ kind: 'wall', x: 0, y: 0 }, 1);
    const r = rings(c);
    expect(r).toHaveLength(2);
    expect(r.map((el) => el.getAttribute('stroke'))).toEqual([COLORS.snap, 'var(--sheet)']);
  });

  it('holds the ring at 7 screen px, shrinking its world radius as the view zooms in', async () => {
    for (const [pxPerCm, worldR] of [
      [1, '7'],
      [2, '3.5'],
    ] as const) {
      const c = await renderMarker({ kind: 'point', x: 0, y: 0 }, pxPerCm);
      for (const el of rings(c)) expect(el.getAttribute('r')).toBe(worldR);
      await cleanup();
    }
  });

  it('marks a free snap with a small filled dot, not a ring', async () => {
    const c = await renderMarker({ kind: 'free', x: 0, y: 0 }, 1);
    // no snap-green edge: the free dot is filled, not the attached ring
    const greenEdge = rings(c).filter((el) => el.getAttribute('stroke') === COLORS.snap);
    expect(greenEdge).toHaveLength(0);
    const dot = Array.from(c.querySelectorAll('circle')).find(
      (el) => el.getAttribute('fill') === COLORS.snap,
    )!;
    expect(dot.getAttribute('r')).toBe('2.6');
  });
});

describe('AlignmentGuides', () => {
  // Two Points far apart: one lends its column, the other its row.
  const plan = buildPlan((b) => {
    b.point(100, 900);
    b.point(900, 100);
  });
  const [column, row] = Object.keys(plan.points);

  const renderGuides = async (snap: Snap, pxPerCm = 1) => {
    const { container } = await render(
      <svg>
        <AlignmentGuides snap={snap} plan={plan} pxPerCm={pxPerCm} />
      </svg>,
    );
    return container;
  };

  const aligned = (guides: Snap['guides']): Snap => ({ x: 100, y: 100, kind: 'alignment', guides });

  it('draws nothing for a snap that rides no guide', async () => {
    const c = await renderGuides({ x: 100, y: 100, kind: 'grid' });
    expect(c.querySelector('line')).toBeNull();
  });

  it('bounds the segment between the source Point and the aim', async () => {
    const c = await renderGuides(aligned([{ pointId: column, held: 'x', at: 100 }]));
    const line = c.querySelector('line.alignment-guide')!;
    expect(['x1', 'y1', 'x2', 'y2'].map((a) => line.getAttribute(a))).toEqual(['100', '900', '100', '100']);
    expect(line.getAttribute('stroke')).toBe(COLORS.snap);
    expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('names the source with a small sheet-filled square', async () => {
    const c = await renderGuides(aligned([{ pointId: column, held: 'x', at: 100 }]));
    const square = c.querySelector('rect')!;
    expect(square.getAttribute('fill')).toBe('var(--sheet)');
    expect(square.getAttribute('stroke')).toBe(COLORS.snap);
    // centred on the source Point, 3.4 screen px each way
    expect([square.getAttribute('x'), square.getAttribute('y')]).toEqual(['96.6', '896.6']);
  });

  it('holds the square at a constant on-screen size', async () => {
    const c = await renderGuides(aligned([{ pointId: column, held: 'x', at: 100 }]), 2);
    expect(c.querySelector('rect')!.getAttribute('width')).toBe('3.4');
  });

  it('draws one segment per live guide, and nothing extra at the crossing', async () => {
    const c = await renderGuides(
      aligned([
        { pointId: column, held: 'x', at: 100 },
        { pointId: row, held: 'y', at: 100 },
      ]),
    );
    expect(c.querySelectorAll('line.alignment-guide')).toHaveLength(2);
    expect(c.querySelectorAll('rect')).toHaveLength(2);
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
