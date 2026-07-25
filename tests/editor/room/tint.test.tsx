import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { doorOn, namedRoomPlan, nestedRoomPlan, squareRoomPlan } from '../../helpers';
import { emptyPlan } from '../../../src/model/types';
import { usePlanStore } from '../../../src/store/planStore';
import { EditorWithHotkeys } from '../../harness';
import { clientAt, key, pointer } from '../../kit';

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), planEpoch: 0 });
  usePlanStore.temporal.getState().clear();
});

async function setup(plan = squareRoomPlan()) {
  usePlanStore.setState({ plan });
  const { container } = await render(<EditorWithHotkeys />);
  const svg = container.querySelector('svg')!;
  return { svg };
}

const clickAt = async (svg: SVGSVGElement, x: number, y: number, init: PointerEventInit = {}) => {
  await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, x, y), ...init });
  await pointer(svg, 'pointerup');
};

describe('the room tint', () => {
  const hovered = (svg: SVGSVGElement) => svg.querySelectorAll('.room-fill-hover');
  const tinted = (svg: SVGSVGElement) => svg.querySelectorAll('.room-fill-selected');

  it('follows the pointer over a room and drops outside', async () => {
    const { svg } = await setup();
    await pointer(svg, 'pointermove', clientAt(svg, 200, 200));
    expect(hovered(svg)).toHaveLength(1);
    await pointer(svg, 'pointermove', clientAt(svg, 600, 600));
    expect(hovered(svg)).toHaveLength(0);
  });

  it('marks the selected room, however the selection was made', async () => {
    const { svg } = await setup();
    expect(tinted(svg)).toHaveLength(0);
    await clickAt(svg, 200, 200);
    expect(tinted(svg)).toHaveLength(1);
    await pointer(svg, 'pointerdown', { button: 0, ...clientAt(svg, -50, -50) });
    await pointer(svg, 'pointermove', clientAt(svg, 450, 450));
    await pointer(svg, 'pointerup');
    expect(tinted(svg)).toHaveLength(1);
  });

  // The tint promises what a click would take, so anything above the sheet
  // outranks the room.
  it('drops over a wall, where a click would take the wall instead', async () => {
    const { svg } = await setup();
    await pointer(svg, 'pointermove', clientAt(svg, 200, 200));
    expect(hovered(svg)).toHaveLength(1);
    const zone = svg.querySelectorAll('line[stroke="transparent"]')[0];
    await pointer(zone, 'pointermove', clientAt(svg, 200, 0));
    expect(hovered(svg)).toHaveLength(0);
  });

  it('drops over an opening, which a click would take instead', async () => {
    const plan = squareRoomPlan();
    plan.openings.o1 = doorOn(Object.values(plan.walls)[0].id);
    const { svg } = await setup(plan);
    // the grab zone spans the door's 90 cm width
    const zone = svg.querySelector('rect[width="90"]')!;
    await pointer(zone, 'pointermove', clientAt(svg, 200, 0));
    expect(hovered(svg)).toHaveLength(0);
  });

  it('holds over the room text, which a click would take the room by', async () => {
    const { svg } = await setup(namedRoomPlan('Kitchen'));
    await pointer(document.querySelector('.room-name-hit')!, 'pointermove', clientAt(svg, 200, 148));
    expect(hovered(svg)).toHaveLength(1);
  });

  it('stays away while a tool other than Select is active', async () => {
    const { svg } = await setup();
    await key('2');
    await pointer(svg, 'pointermove', clientAt(svg, 200, 200));
    expect(hovered(svg)).toHaveLength(0);
  });

  it('leaves an island bare, its footprint punched out of the room', async () => {
    const { svg } = await setup(nestedRoomPlan());
    await clickAt(svg, 330, 330);
    const fill = tinted(svg)[0];
    expect(fill.getAttribute('fill-rule')).toBe('evenodd');
    // outer loop plus the island loop: two subpaths, so the hole is a hole
    expect(fill.getAttribute('d')!.match(/M/g)).toHaveLength(2);
  });

  it('never reaches the export, which is the plan and nothing else', async () => {
    const { svg } = await setup();
    await clickAt(svg, 200, 200);
    expect(tinted(svg)).toHaveLength(1);
    const { buildExportSvg } = await import('../../../src/transfer/png');
    const exported = buildExportSvg(usePlanStore.getState().plan, { measuresVisible: true })!;
    expect(exported).not.toContain('room-fill');
  });
});

// The block is a handle, not an element: the same contract DimLabel already
// has — drag moves it, a click selects what it belongs to.
