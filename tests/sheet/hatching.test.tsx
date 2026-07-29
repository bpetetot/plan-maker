import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Plan } from '../../src/model/types';
import { PlanScene } from '../../src/sheet/scene';
import { buildPlan } from '../helpers';

// CONTEXT.md: Hatching — the sheet states it by hatching the floor, and nothing
// else: whether the area prints is the Silenced mark's business alone.
function squareWithProfile(profile?: { name: string; hatched?: true; areaSilenced?: true }): Plan {
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
      b.profile(profile.name, 200, 200, {
        hatched: profile.hatched,
        areaSilenced: profile.areaSilenced,
      });
    }
  });
}

const scene = (plan: Plan) =>
  render(
    <svg>
      <PlanScene plan={plan} measuresVisible dimFontPx={11} />
    </svg>,
  );

describe('a hatched room on the sheet', () => {
  it('hatches the floor, keeping the name of a room whose area is silenced', async () => {
    const plan = squareWithProfile({ name: 'Store', hatched: true, areaSilenced: true });
    const { container } = await scene(plan);
    const hatch = container.querySelector('path.room-hatched')!;
    expect(hatch).not.toBeNull();
    expect(hatch.getAttribute('fill')).toBe('url(#room-hatch)');
    expect(container.querySelector('pattern#room-hatch')).not.toBeNull();
    expect(container.querySelector('text.room-area')).toBeNull();
    expect(container.querySelector('text.room-name')?.textContent).toBe('Store');
  });

  it('draws nothing but the hatching for a nameless room whose area is silenced', async () => {
    const { container } = await scene(squareWithProfile({ name: '', hatched: true, areaSilenced: true }));
    expect(container.querySelector('path.room-hatched')).not.toBeNull();
    expect(container.querySelector('text.room-area')).toBeNull();
    expect(container.querySelector('text.room-name')).toBeNull();
  });

  // The two marks are independent (ADR 0039): a hatched floor can state its area.
  it('renders both when a hatched floor states its area', async () => {
    const { container } = await scene(squareWithProfile({ name: 'Nook', hatched: true }));
    expect(container.querySelector('path.room-hatched')).not.toBeNull();
    expect(container.querySelector('text.room-area')).not.toBeNull();
  });

  it('leaves an ordinary room unhatched, area shown', async () => {
    const { container } = await scene(squareWithProfile({ name: 'Kitchen' }));
    expect(container.querySelector('path.room-hatched')).toBeNull();
    expect(container.querySelector('text.room-area')).not.toBeNull();
  });
});
