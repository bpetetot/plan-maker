// CONTEXT.md: Alignment guide — discovered by the aim, drawn on the sheet, and
// never offered by the gesture's own origin (ADR 0037).
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../../../src/model/types';
import type { Plan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { reloadPreferences, setPreference } from '../../../src/preferences/preferences';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, pointer, viewBoxOf, wheel } from '../../kit';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
  // The grid on, so the rung below the guides lands on 10 cm and an off-grid
  // row is the guide's own answer, not the fallback's.
  setPreference('grid', true);
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

// One vertical wall at x=400, its lower end on the off-grid row y=703: two
// Points, and no two of their rows or columns coincide.
const wallPlan = (): Plan => ({
  ...emptyPlan(),
  points: { a: { id: 'a', x: 400, y: 703 }, b: { id: 'b', x: 400, y: 903 } },
  walls: { w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 } },
});

async function setup() {
  usePlanStore.setState({ plan: wallPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
  const { container } = await render(<EditorWithHotkeys />);
  const svg = container.querySelector('svg')!;
  await key('2');
  return { container, svg };
}

const guide = (svg: SVGSVGElement) => svg.querySelector('line.alignment-guide');

// A placement click, the aim arriving first as the pointer really does.
async function click(svg: SVGSVGElement, x: number, y: number) {
  await pointer(svg, 'pointermove', clientAt(svg, x, y));
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, x, y) });
}

const drawnPoints = () => Object.values(usePlanStore.getState().plan.points);

describe('a wall drawn in open space', () => {
  it('catches a distant Point’s row, and says which Point offered it', async () => {
    const { svg } = await setup();
    await click(svg, 300, 950);
    await pointer(svg, 'pointermove', clientAt(svg, 300, 703));
    const line = guide(svg)!;
    expect(['x1', 'y1', 'x2', 'y2'].map((a) => line.getAttribute(a))).toEqual(['400', '703', '300', '703']);
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 300, 703) });
    expect(drawnPoints()).toContainEqual(expect.objectContaining({ x: 300, y: 703 }));
  });

  // The load-bearing exclusion: caught here, the feature would be the automatic
  // axis snapping ADR 0020 removed.
  it('never catches the Drawing anchor’s own row', async () => {
    const { svg } = await setup();
    // The chain starts on the Point itself, which the ladder's own rung takes
    await click(svg, 400, 703);
    await pointer(svg, 'pointermove', clientAt(svg, 300, 703));
    expect(guide(svg)).toBeNull();
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 300, 703) });
    expect(drawnPoints()).toContainEqual(expect.objectContaining({ x: 300, y: 700 }));
  });

  it('offers nothing from a Point the viewport no longer shows', async () => {
    const { container, svg } = await setup();
    const [vx, , vw] = viewBoxOf(container);
    const scale = svg.getBoundingClientRect().width / vw;
    // Panned until the wall sits past the right edge, the aim still inside
    await wheel(svg, { deltaX: -(vx + vw - 400 + 10) * scale });
    await click(svg, 300, 950);
    await pointer(svg, 'pointermove', clientAt(svg, 300, 703));
    expect(guide(svg)).toBeNull();
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, 300, 703) });
    expect(drawnPoints()).toContainEqual(expect.objectContaining({ x: 300, y: 700 }));
  });
});
