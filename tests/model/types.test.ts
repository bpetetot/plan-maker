import { describe, expect, it } from 'vitest';
import { addRuler } from '../../src/model/rulers';
import { addText } from '../../src/model/texts';
import type { Plan } from '../../src/model/types';
import { emptyPlan, isPlanEmpty, oncePerPlan } from '../../src/model/types';

describe('isPlanEmpty', () => {
  it('counts rulers and texts alongside walls, openings, and labels', () => {
    expect(isPlanEmpty(emptyPlan())).toBe(true);
    expect(isPlanEmpty(addRuler(emptyPlan(), { x: 0, y: 0 }, { x: 100, y: 0 })[0])).toBe(false);
    expect(isPlanEmpty(addText(emptyPlan(), 0, 0, 'Note')[0])).toBe(false);
  });
});

describe('oncePerPlan', () => {
  it('reads once per plan and hands the same value back', () => {
    let calls = 0;
    const read = oncePerPlan((plan: Plan) => {
      calls++;
      return Object.keys(plan.walls);
    });
    const plan = emptyPlan();

    const first = read(plan);
    expect(read(plan)).toBe(first);
    expect(calls).toBe(1);
  });

  it('reads each plan on its own', () => {
    let calls = 0;
    const read = oncePerPlan((plan: Plan) => {
      calls++;
      return Object.keys(plan.walls);
    });

    expect(read(emptyPlan())).not.toBe(read(emptyPlan()));
    expect(calls).toBe(2);
  });

  it('keeps a falsy reading rather than reading again', () => {
    let calls = 0;
    const read = oncePerPlan(() => {
      calls++;
      return null;
    });
    const plan = emptyPlan();

    read(plan);
    read(plan);
    expect(calls).toBe(1);
  });
});
