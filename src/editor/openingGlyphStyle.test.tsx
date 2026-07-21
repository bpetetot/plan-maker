import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Opening, Plan, Wall } from '../model/types';
import { OpeningGlyph } from './render';

function planWith(opening: Opening): Plan {
  const wall: Wall = { id: 'w', startPointId: 'a', endPointId: 'b', thickness: 10 };
  return {
    points: {
      a: { id: 'a', x: 0, y: 0 },
      b: { id: 'b', x: 400, y: 0 },
    },
    walls: { w: wall },
    openings: { [opening.id]: opening },
    roomLabels: {},
  };
}

const door: Opening = {
  id: 'd',
  wallId: 'w',
  type: 'door',
  offset: 200,
  width: 90,
  hingeSide: 'start',
  swing: 'in',
};

const win: Opening = { id: 'n', wallId: 'w', type: 'window', offset: 200, width: 100 };

// Swing arc solid, not dashed: dashed means "above the cut plane" in section
// convention.
describe('opening glyph line weights', () => {
  it('draws the door leaf as a thin stroke', async () => {
    const { container } = await render(
      <svg>
        <OpeningGlyph plan={planWith(door)} opening={door} />
      </svg>,
    );
    expect(container.querySelector('line')!.getAttribute('stroke-width')).toBe('2');
  });

  it('draws the swing arc as a solid hairline', async () => {
    const { container } = await render(
      <svg>
        <OpeningGlyph plan={planWith(door)} opening={door} />
      </svg>,
    );
    const arc = container.querySelector('path')!;
    expect(arc.hasAttribute('stroke-dasharray')).toBe(false);
    expect(arc.getAttribute('stroke-width')).toBe('1');
  });

  it('draws the window glazing as thin strokes', async () => {
    const { container } = await render(
      <svg>
        <OpeningGlyph plan={planWith(win)} opening={win} />
      </svg>,
    );
    const lines = [...container.querySelectorAll('line')];
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.getAttribute('stroke-width')).toBe('1.5');
  });

  it('paints the jamb bars in the glyph register, over the wall strips', async () => {
    const { container } = await render(
      <svg>
        <OpeningGlyph plan={planWith(win)} opening={win} />
      </svg>,
    );
    const jambs = [...container.querySelectorAll('rect')];
    expect(jambs).toHaveLength(2);
    for (const jamb of jambs) {
      expect(jamb.getAttribute('width')).toBe('1.5');
      expect(jamb.getAttribute('height')).toBe('10');
    }
  });
});
