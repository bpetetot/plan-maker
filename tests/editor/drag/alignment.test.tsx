// CONTEXT.md: Alignment guide, on a Plan drag: moving a Point discovers the
// same lines placing one does, and draws them the same way (ADR 0037).
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { emptyPlan } from '../../../src/model/types';
import type { Plan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { reloadPreferences, setPreference } from '../../../src/preferences/preferences';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, pointer } from '../../kit';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
  // The grid on: the rung below lands on 10 cm, so an off-grid row can only be
  // the guide's own answer.
  setPreference('grid', true);
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

// The wall being reshaped, and a far one whose lower end sits on the off-grid
// row y=403 — the only thing in reach of the drag's landing.
const twoWalls = (): Plan => ({
  ...emptyPlan(),
  points: {
    a: { id: 'a', x: 100, y: 100 },
    b: { id: 'b', x: 300, y: 100 },
    c: { id: 'c', x: 700, y: 403 },
    d: { id: 'd', x: 700, y: 603 },
  },
  walls: {
    w1: { id: 'w1', startPointId: 'a', endPointId: 'b', thickness: 10 },
    w2: { id: 'w2', startPointId: 'c', endPointId: 'd', thickness: 10 },
  },
});

describe('a dragged Point', () => {
  it('catches a foreign Point’s row, and draws the line it caught', async () => {
    usePlanStore.setState({ plan: twoWalls(), planEpoch: 0 });
    usePlanStore.temporal.getState().clear();
    const { container } = await render(<EditorWithHotkeys />);
    const svg = container.querySelector('svg')!;
    // The handles only exist once the wall is selected, so the drag goes
    // through a click on its body first.
    const zone = svg.querySelectorAll('line[stroke="transparent"]')[0];
    await pointer(zone, 'pointerdown', { button: 0, ...clientAt(svg, 200, 100) });
    await pointer(svg, 'pointerup');
    const handles = svg.querySelectorAll('.point-handle');

    await pointer(handles[1], 'pointerdown', { button: 0, ...clientAt(svg, 300, 100) });
    await pointer(svg, 'pointermove', clientAt(svg, 500, 403));
    const line = svg.querySelector('line.alignment-guide')!;
    expect(['x1', 'y1', 'x2', 'y2'].map((at) => line.getAttribute(at))).toEqual([
      '700',
      '403',
      '500',
      '403',
    ]);
    expect(usePlanStore.getState().plan.points.b).toMatchObject({ x: 500, y: 403 });

    await pointer(svg, 'pointerup');
    expect(svg.querySelector('line.alignment-guide')).toBeNull();
  });
});
