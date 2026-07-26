import { describe, expect, it } from 'vitest';
import { axialHeld, axisLock, lockAim, onAxis, WORLD_AXES } from '../../src/model/axisLock';

const origin = { x: 100, y: 250 };
// A 45° slant, unit length: what a diagonal wall lends its Point.
const SLANT = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
const world = (aim: { x: number; y: number }, on = true) => axisLock(origin, aim, WORLD_AXES, on);

describe('axisLock among the world axes', () => {
  it('takes the horizontal when the aim ran further that way', () => {
    expect(world({ x: 400, y: 300 })).toEqual({ at: origin, dir: { x: 1, y: 0 } });
  });

  it('takes the vertical when the aim ran further that way', () => {
    expect(world({ x: 140, y: 700 })).toEqual({ at: origin, dir: { x: 0, y: 1 } });
  });

  it('gives a tie to the horizontal', () => {
    expect(world({ x: 200, y: 350 })?.dir).toEqual({ x: 1, y: 0 });
  });

  it('flips across the diagonal, aim by aim', () => {
    expect(world({ x: 200, y: 349 })?.dir).toEqual({ x: 1, y: 0 });
    expect(world({ x: 200, y: 351 })?.dir).toEqual({ x: 0, y: 1 });
  });

  it('takes the sign of neither run', () => {
    expect(world({ x: -300, y: 240 })?.dir).toEqual({ x: 1, y: 0 });
  });

  it('is null without the modifier', () => {
    expect(world({ x: 400, y: 300 }, false)).toBeNull();
  });

  it('is null without an origin — what has no origin has no lock', () => {
    expect(axisLock(null, { x: 400, y: 300 }, WORLD_AXES, true)).toBeNull();
  });

  it('is null with no direction to borrow — a Point no wall holds', () => {
    expect(axisLock(origin, { x: 400, y: 300 }, [], true)).toBeNull();
  });
});

describe('axisLock among borrowed directions', () => {
  it('takes the one whose line passes nearest the aim', () => {
    const axes = [SLANT, { x: 0, y: 1 }];
    // (200,350) is on the slant, 100 cm off the vertical
    expect(axisLock(origin, { x: 200, y: 350 }, axes, true)?.dir).toEqual(SLANT);
    // (110,700) is 10 cm off the vertical, far from the slant
    expect(axisLock(origin, { x: 110, y: 700 }, axes, true)?.dir).toEqual({ x: 0, y: 1 });
  });

  it('takes a lone direction whatever the aim, there being nothing to prefer', () => {
    expect(axisLock(origin, { x: 400, y: 251 }, [SLANT], true)?.dir).toEqual(SLANT);
    expect(axisLock(origin, { x: 101, y: 900 }, [SLANT], true)?.dir).toEqual(SLANT);
  });
});

describe('onAxis', () => {
  const horizontal = { at: origin, dir: { x: 1, y: 0 } };

  it('accepts a position the line runs through', () => {
    expect(onAxis(horizontal, { x: 900, y: 250 })).toBe(true);
    expect(onAxis({ at: origin, dir: SLANT }, { x: 300, y: 450 })).toBe(true);
  });

  it('rejects one that is off it, however close', () => {
    expect(onAxis(horizontal, { x: 900, y: 251 })).toBe(false);
    expect(onAxis({ at: origin, dir: SLANT }, { x: 300, y: 452 })).toBe(false);
  });

  it('filters nothing without a lock', () => {
    expect(onAxis(null, { x: 900, y: 251 })).toBe(true);
  });
});

describe('lockAim', () => {
  it('holds a world axis by its own coordinate', () => {
    expect(lockAim({ at: origin, dir: { x: 1, y: 0 } }, { x: 903, y: 118 })).toEqual({ x: 903, y: 250 });
    expect(lockAim({ at: origin, dir: { x: 0, y: 1 } }, { x: 903, y: 118 })).toEqual({ x: 100, y: 118 });
  });

  it('projects onto a borrowed slant', () => {
    // (200,350) is on the slant; aiming 20 cm off it lands back on it
    const p = lockAim({ at: origin, dir: SLANT }, { x: 210, y: 340 });
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(350);
  });

  it('moves nothing without a lock', () => {
    expect(lockAim(null, { x: 903, y: 118 })).toEqual({ x: 903, y: 118 });
  });
});

describe('axialHeld', () => {
  it('names the coordinate a world axis holds still', () => {
    expect(axialHeld({ at: origin, dir: { x: 1, y: 0 } })).toBe('y');
    expect(axialHeld({ at: origin, dir: { x: 0, y: 1 } })).toBe('x');
  });

  it('names none for a slant, which holds no coordinate at all', () => {
    expect(axialHeld({ at: origin, dir: SLANT })).toBeNull();
    expect(axialHeld(null)).toBeNull();
  });
});
