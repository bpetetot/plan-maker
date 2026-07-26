import { describe, expect, it } from 'vitest';
import { axisLock, lockAim, onAxis } from '../../src/model/axisLock';

const origin = { x: 100, y: 250 };

describe('axisLock', () => {
  it('holds the y when the aim ran further horizontally', () => {
    expect(axisLock(origin, { x: 400, y: 300 }, true)).toEqual({ held: 'y', at: 250 });
  });

  it('holds the x when the aim ran further vertically', () => {
    expect(axisLock(origin, { x: 140, y: 700 }, true)).toEqual({ held: 'x', at: 100 });
  });

  it('gives a tie to the horizontal', () => {
    expect(axisLock(origin, { x: 200, y: 350 }, true)).toEqual({ held: 'y', at: 250 });
  });

  it('flips across the diagonal, aim by aim', () => {
    expect(axisLock(origin, { x: 200, y: 349 }, true)?.held).toBe('y');
    expect(axisLock(origin, { x: 200, y: 351 }, true)?.held).toBe('x');
  });

  it('takes the sign of neither run', () => {
    expect(axisLock(origin, { x: -300, y: 240 }, true)).toEqual({ held: 'y', at: 250 });
  });

  it('is null without the modifier', () => {
    expect(axisLock(origin, { x: 400, y: 300 }, false)).toBeNull();
  });

  it('is null without an origin — what has no origin has no lock', () => {
    expect(axisLock(null, { x: 400, y: 300 }, true)).toBeNull();
  });
});

describe('onAxis', () => {
  const lock = { held: 'y', at: 250 } as const;

  it('accepts a position whose held coordinate is the origin’s', () => {
    expect(onAxis(lock, { x: 900, y: 250 })).toBe(true);
  });

  it('rejects one that is off it, however close', () => {
    expect(onAxis(lock, { x: 900, y: 251 })).toBe(false);
  });

  it('filters nothing without a lock', () => {
    expect(onAxis(null, { x: 900, y: 251 })).toBe(true);
  });
});

describe('lockAim', () => {
  it('holds the named coordinate and leaves the free one', () => {
    expect(lockAim({ held: 'y', at: 250 }, { x: 903, y: 118 })).toEqual({ x: 903, y: 250 });
    expect(lockAim({ held: 'x', at: 100 }, { x: 903, y: 118 })).toEqual({ x: 100, y: 118 });
  });

  it('moves nothing without a lock', () => {
    expect(lockAim(null, { x: 903, y: 118 })).toEqual({ x: 903, y: 118 });
  });
});
