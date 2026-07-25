import { describe, expect, it } from 'vitest';
import { addRuler, deleteRuler, moveRulerEndpoint, translateRuler } from './rulers';
import { emptyPlan } from './types';

describe('rulers', () => {
  it('addRuler stores a free-coordinate segment centered at t = 0.5', () => {
    const [next, id] = addRuler(emptyPlan(), { x: 10, y: 20 }, { x: 300, y: 20 });
    expect(next.rulers[id]).toEqual({ id, a: { x: 10, y: 20 }, b: { x: 300, y: 20 }, t: 0.5 });
  });

  it('addRuler rounds endpoints to integer centimeters', () => {
    const [next, id] = addRuler(emptyPlan(), { x: 10.4, y: 19.6 }, { x: 300.5, y: 20.2 });
    expect(next.rulers[id]).toMatchObject({ a: { x: 10, y: 20 }, b: { x: 301, y: 20 } });
  });

  it('moveRulerEndpoint moves one end, rounding, and leaves the other alone', () => {
    const [withRuler, id] = addRuler(emptyPlan(), { x: 0, y: 0 }, { x: 100, y: 0 });
    const next = moveRulerEndpoint(withRuler, id, 'b', 150.6, 40.2);
    expect(next.rulers[id]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 151, y: 40 } });
  });

  it('moveRulerEndpoint ignores an unknown ruler', () => {
    const plan = emptyPlan();
    expect(moveRulerEndpoint(plan, 'nope', 'a', 5, 5)).toBe(plan);
  });

  it('translateRuler shifts both endpoints and leaves t alone', () => {
    const [withRuler, id] = addRuler(emptyPlan(), { x: 0, y: 0 }, { x: 100, y: 0 }, 0.25);
    const next = translateRuler(withRuler, id, 10.4, -5.6);
    expect(next.rulers[id]).toEqual({ id, a: { x: 10, y: -6 }, b: { x: 110, y: -6 }, t: 0.25 });
    expect(translateRuler(withRuler, 'nope', 10, 10)).toBe(withRuler);
  });

  it('deleteRuler removes the segment and no-ops on an unknown id', () => {
    const [withRuler, id] = addRuler(emptyPlan(), { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(deleteRuler(withRuler, id).rulers).toEqual({});
    expect(deleteRuler(withRuler, 'nope')).toBe(withRuler);
  });
});
