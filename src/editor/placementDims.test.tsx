import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { squareRoomPlan } from '../model/testHelpers';
import { emptyPlan } from '../model/types';
import type { Opening, Plan } from '../model/types';
import { usePlanStore } from '../store/planStore';
import Editor from './Editor';
import { PlacementDims } from './render';
import { clientAt, pointer } from './testKit';

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

function planWith(offset: number, width: number): { plan: Plan; opening: Opening } {
  const opening: Opening = { id: 'o', wallId: 'w', type: 'window', offset, width };
  const plan: Plan = {
    points: {
      a: { id: 'a', x: 0, y: 0 },
      b: { id: 'b', x: 400, y: 0 },
    },
    walls: { w: { id: 'w', startPointId: 'a', endPointId: 'b', thickness: 10 } },
    openings: { o: opening },
    roomLabels: {},
  };
  return { plan, opening };
}

async function renderDims(plan: Plan, opening: Opening, pxPerCm = 1) {
  const { container } = await render(
    <svg>
      <PlacementDims plan={plan} opening={opening} pxPerCm={pxPerCm} />
    </svg>,
  );
  return container;
}

describe('PlacementDims', () => {
  it('shows one dimension per side, from each silhouette end to the near edge of the opening', async () => {
    // free wall: silhouette overhangs each Point by 5
    const { plan, opening } = planWith(100, 80);
    const container = await renderDims(plan, opening);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(['65 cm', '2,65 m']);
  });

  it('hides the side whose segment is 0 cm, measuring from the effective (clamped) offset', async () => {
    // offset 0 clamps onto the rail, flush against the mitered corner at 5
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    const opening: Opening = { id: 'o', wallId: bottom.id, type: 'window', offset: 0, width: 80 };
    plan.openings.o = opening;
    const container = await renderDims(plan, opening);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(['3,10 m']);
  });

  it('centres a chip on each clearance, on the wall axis — never on a side', async () => {
    const { plan, opening } = planWith(100, 80);
    const container = await renderDims(plan, opening);
    const groups = Array.from(container.querySelectorAll('g[transform]')).map((g) =>
      g.getAttribute('transform'),
    );
    // segments -5 → 60 and 140 → 395; chips at their middles, on the axis (y = 0)
    expect(groups).toEqual(['translate(27.5,0) rotate(0) scale(1)', 'translate(272.5,0) rotate(0) scale(1)']);
    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect(container.querySelector('rect')!.getAttribute('fill')).toBe('var(--accent)');
  });

  it('keeps its position when the wall dimension is dragged to the other side', async () => {
    const { plan, opening } = planWith(100, 80);
    plan.walls.w.dimPlacement = { t: 0.5, side: 1 };
    const container = await renderDims(plan, opening);
    const group = container.querySelector('g[transform]')!;
    expect(group.getAttribute('transform')).toBe('translate(27.5,0) rotate(0) scale(1)');
  });

  it('measures from the mitered corners, whatever side the wall dimension sits on', async () => {
    // 4×4 m room, window 80 centered on the bottom wall; rail ends at the
    // mitered corners 5/395
    const plan = squareRoomPlan();
    const bottom = Object.values(plan.walls)[0];
    const opening: Opening = { id: 'o', wallId: bottom.id, type: 'window', offset: 200, width: 80 };
    plan.openings.o = opening;
    let container = await renderDims(plan, opening);
    let texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(['1,55 m', '1,55 m']);
    expect(container.querySelector('g[transform]')!.getAttribute('transform')).toBe(
      'translate(82.5,0) rotate(0) scale(1)',
    );
    bottom.dimPlacement = { t: 0.5, side: -1 };
    container = await renderDims(plan, opening);
    texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(['1,55 m', '1,55 m']);
  });

  it('reads zero on the side an opening is pushed against, and hides that chip', async () => {
    // offset 35 rests flush on the overhang (-5): start side reads 0 cm
    const { plan, opening } = planWith(35, 80);
    const container = await renderDims(plan, opening);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(['3,30 m']);
  });

  it('holds the same size on screen at every zoom, without moving its centre', async () => {
    const { plan, opening } = planWith(100, 80);
    // half scale: chip doubles in plan units, centre unmoved (ADR 0005)
    const container = await renderDims(plan, opening, 0.5);
    expect(container.querySelector('g[transform]')!.getAttribute('transform')).toBe(
      'translate(27.5,0) rotate(0) scale(2)',
    );
    const rect = container.querySelector('rect')!;
    expect(rect.getAttribute('height')).toBe('16');
  });

  it('chains from the near edge of the closest neighbouring opening', async () => {
    // edges 60/140 and neighbour 220/280: end side spans 140 → 220, start
    // side still reaches the silhouette end (-5)
    const { plan, opening } = planWith(100, 80);
    plan.openings.n = { id: 'n', wallId: 'w', type: 'window', offset: 250, width: 60 };
    const container = await renderDims(plan, opening);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(['65 cm', '80 cm']);
  });

  it('hides a side reduced to nothing by an adjacent neighbouring opening', async () => {
    // neighbour edge at 140, flush: the gap is 0 cm
    const { plan, opening } = planWith(100, 80);
    plan.openings.n = { id: 'n', wallId: 'w', type: 'window', offset: 180, width: 80 };
    const container = await renderDims(plan, opening);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(['65 cm']);
  });

  it('overflows a clearance too short for its chip, rather than shrinking or shifting it', async () => {
    // start clearance -5 → 15: 20 cm, narrower than the chip measuring it
    const { plan, opening } = planWith(60, 90);
    const container = await renderDims(plan, opening);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toEqual(['20 cm', '3,00 m']);
    const [short, long] = Array.from(container.querySelectorAll('rect'));
    expect(Number(short.getAttribute('width'))).toBeGreaterThan(20);
    expect(short.getAttribute('height')).toBe(long.getAttribute('height'));
    // centred on the clearance (-5 → 15)
    expect(short.parentElement!.getAttribute('transform')).toBe('translate(5,0) rotate(0) scale(1)');
  });
});

// Dimension reads "4,10 m": 400 axis + 10 thickness, both ends free.
const editorPlan = (): Plan => ({
  points: {
    a: { id: 'a', x: 100, y: 100 },
    b: { id: 'b', x: 500, y: 100 },
  },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
  openings: {},
  roomLabels: {},
});

describe('placement dimensions while placing an opening', () => {
  it('shows them on hover while the wall keeps its own dimension, both ways', async () => {
    usePlanStore.setState({ plan: editorPlan() });
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    await userEvent.click(page.getByLabelText('Door'));
    // ghost door 90 centered on the wall: 160 cm each side, edge to overhang
    await pointer(svg, 'pointermove', clientAt(svg, 300, 100));
    await expect.element(page.getByText('4,10 m')).toBeInTheDocument();
    await expect.poll(() => page.getByText('1,60 m').elements()).toHaveLength(2);
    await pointer(svg, 'pointermove', clientAt(svg, 300, 400));
    await expect.element(page.getByText('4,10 m')).toBeInTheDocument();
    await expect.element(page.getByText('1,60 m')).not.toBeInTheDocument();
  });
});

describe('placement dimensions while moving an opening', () => {
  it('shows them during the drag without touching any wall dimension', async () => {
    const plan = editorPlan();
    plan.walls.w2 = { id: 'w2', startPointId: 'c', endPointId: 'd', thickness: 10 };
    plan.points.c = { id: 'c', x: 100, y: 300 };
    plan.points.d = { id: 'd', x: 400, y: 300 };
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 };
    usePlanStore.setState({ plan });
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    // grab zone: the only transparent rect spanning the opening's width
    const grab = container.querySelector('rect[width="120"][fill="transparent"]')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 250, 100) });
    await pointer(svg, 'pointermove', clientAt(svg, 300, 100));
    // opening centered on the wall: 145 cm each side, to the overhangs
    await expect.poll(() => page.getByText('1,45 m').elements()).toHaveLength(2);
    await expect.element(page.getByText('4,10 m')).toBeInTheDocument();
    await expect.element(page.getByText('3,10 m')).toBeInTheDocument();
  });

  it('continues past the release, because the drag leaves the opening selected', async () => {
    const plan = editorPlan();
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 };
    usePlanStore.setState({ plan });
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    const grab = container.querySelector('rect[width="120"][fill="transparent"]')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 250, 100) });
    await pointer(svg, 'pointermove', clientAt(svg, 300, 100));
    await pointer(svg, 'pointerup');
    await expect.poll(() => page.getByText('1,45 m').elements()).toHaveLength(2);
  });
});

describe('placement dimensions on the selection', () => {
  const twoOpeningsPlan = (): Plan => {
    const plan = editorPlan();
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 };
    plan.openings.o2 = { id: 'o2', wallId: 'w1', type: 'window', offset: 300, width: 120 };
    return plan;
  };

  it('shows them on a plain click — a selected opening keeps its chips', async () => {
    usePlanStore.setState({ plan: editorPlan() });
    const plan = usePlanStore.getState().plan;
    plan.openings.o1 = { id: 'o1', wallId: 'w1', type: 'window', offset: 150, width: 120 };
    usePlanStore.setState({ plan: { ...plan } });
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    const grab = container.querySelector('rect[width="120"][fill="transparent"]')!;
    await pointer(grab, 'pointerdown', { button: 0, ...clientAt(svg, 150, 100) });
    await pointer(svg, 'pointerup');
    // overhang (-5) to each edge (90/210): 95 cm and 1,95 m
    await expect.element(page.getByText('95 cm')).toBeInTheDocument();
    await expect.element(page.getByText('1,95 m')).toBeInTheDocument();
    await expect.element(page.getByText('4,10 m')).toBeInTheDocument();
  });

  it('shows them for every opening of a multi-selection, with no cardinality threshold', async () => {
    usePlanStore.setState({ plan: twoOpeningsPlan() });
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    const [g1, g2] = Array.from(container.querySelectorAll('rect[width="120"][fill="transparent"]'));
    await pointer(g1, 'pointerdown', { button: 0, ...clientAt(svg, 150, 100) });
    await pointer(svg, 'pointerup');
    await pointer(g2, 'pointerdown', { button: 0, shiftKey: true, ...clientAt(svg, 300, 100) });
    await pointer(svg, 'pointerup');
    // o1 edges 90/210, o2 edges 240/360: 95 cm to the overhang, a shared
    // 30 cm gap, then 45 cm to the far overhang (405)
    await expect.element(page.getByText('95 cm')).toBeInTheDocument();
    await expect.poll(() => page.getByText('30 cm').elements()).toHaveLength(2);
    await expect.element(page.getByText('45 cm')).toBeInTheDocument();
  });

  it('stays silent for the openings a selected wall carries', async () => {
    usePlanStore.setState({ plan: twoOpeningsPlan() });
    const { container } = await render(<Editor />);
    const svg = container.querySelector('svg')!;
    // 480: on the wall, clear of both openings
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 480, 100) });
    await pointer(svg, 'pointerup');
    await expect.element(page.getByText('4,10 m')).toBeInTheDocument();
    await expect.element(page.getByText('95 cm')).not.toBeInTheDocument();
    await expect.element(page.getByText('90 cm')).not.toBeInTheDocument();
  });
});
