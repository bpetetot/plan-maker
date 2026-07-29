import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Plan } from '../../src/model/types';
import { PlanScene } from '../../src/sheet/scene';
import { buildPlan } from '../helpers';

// CONTEXT.md: Condemned — the sheet states it: hatched floor, no area line.
function squareWithProfile(profile?: { name: string; condemned?: true }): Plan {
  return buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    const p3 = b.point(400, 400);
    const p4 = b.point(0, 400);
    b.wall(p1, p2);
    b.wall(p2, p3);
    b.wall(p3, p4);
    b.wall(p4, p1);
    if (profile) {
      const stored = b.profile(profile.name, 200, 200);
      if (profile.condemned) stored.condemned = true;
    }
  });
}

const scene = (plan: Plan) =>
  render(
    <svg>
      <PlanScene plan={plan} measuresVisible dimFontPx={11} />
    </svg>,
  );

describe('a condemned room on the sheet', () => {
  it('hatches the floor and drops the area line, keeping the name', async () => {
    const { container } = await scene(squareWithProfile({ name: 'Store', condemned: true }));
    const hatch = container.querySelector('path.room-condemned')!;
    expect(hatch).not.toBeNull();
    expect(hatch.getAttribute('fill')).toBe('url(#condemned-hatch)');
    expect(container.querySelector('pattern#condemned-hatch')).not.toBeNull();
    expect(container.querySelector('text.room-area')).toBeNull();
    expect(container.querySelector('text.room-name')?.textContent).toBe('Store');
  });

  it('hatches and silences a condemned room with no name', async () => {
    const { container } = await scene(squareWithProfile({ name: '', condemned: true }));
    expect(container.querySelector('path.room-condemned')).not.toBeNull();
    expect(container.querySelector('text.room-area')).toBeNull();
    expect(container.querySelector('text.room-name')).toBeNull();
  });

  it('leaves an ordinary room unhatched, area shown', async () => {
    const { container } = await scene(squareWithProfile({ name: 'Kitchen' }));
    expect(container.querySelector('path.room-condemned')).toBeNull();
    expect(container.querySelector('text.room-area')).not.toBeNull();
  });
});
