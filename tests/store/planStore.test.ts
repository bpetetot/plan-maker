import { beforeEach, describe, expect, it } from 'vitest';
import { buildPlan } from '../helpers';
import { addRoomLabel } from '../../src/model/rooms';
import { addRuler, moveRulerEndpoint } from '../../src/model/rulers';
import { emptyPlan } from '../../src/model/types';
import { beginEdit, editPlan, redo, replacePlan, undo, usePlanStore } from '../../src/store/planStore';

const plan = () => usePlanStore.getState().plan;
const temporal = () => usePlanStore.temporal.getState();

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), editOpen: false });
  usePlanStore.temporal.getState().clear();
});

describe('planStore undo/redo', () => {
  it('records one history step per editPlan and undoes/redoes it', () => {
    editPlan((p) => addRoomLabel(p, 'Kitchen', 10, 10)[0]);
    editPlan((p) => addRoomLabel(p, 'Bedroom', 20, 20)[0]);
    expect(Object.keys(plan().roomLabels)).toHaveLength(2);

    undo();
    expect(Object.keys(plan().roomLabels)).toHaveLength(1);
    undo();
    expect(Object.keys(plan().roomLabels)).toHaveLength(0);
    redo();
    expect(Object.keys(plan().roomLabels)).toHaveLength(1);
  });

  it('editPlan returns the plan it landed', () => {
    const landed = editPlan((p) => addRoomLabel(p, 'Kitchen', 10, 10)[0]);
    expect(landed).toBe(plan());
    expect(Object.values(landed.roomLabels)[0].name).toBe('Kitchen');
  });

  it('does not record a step when an operation is a no-op (same plan reference)', () => {
    editPlan((p) => addRoomLabel(p, 'Kitchen', 10, 10)[0]);
    const before = temporal().pastStates.length;
    editPlan((p) => p);
    expect(temporal().pastStates.length).toBe(before);
  });

  it('collapses every aim of one Edit into a single undo step', () => {
    editPlan((p) => addRoomLabel(p, 'Start', 0, 0)[0]);

    const edit = beginEdit();
    edit.aim(addRoomLabel(plan(), 'Drag 1', 1, 1)[0]);
    edit.aim(addRoomLabel(plan(), 'Drag 2', 2, 2)[0]);
    edit.land(addRoomLabel(plan(), 'Drag 3', 3, 3)[0]);

    expect(Object.keys(plan().roomLabels)).toHaveLength(4);
    undo();
    expect(Object.keys(plan().roomLabels)).toHaveLength(1);
    redo();
    expect(Object.keys(plan().roomLabels)).toHaveLength(4);
  });

  it('records nothing for an Edit that changed nothing', () => {
    const before = temporal().pastStates.length;
    const edit = beginEdit();
    edit.land(plan());
    expect(temporal().pastStates.length).toBe(before);
  });

  it('marks the store while an Edit is open and clears it on landing', () => {
    const edit = beginEdit();
    edit.aim(addRoomLabel(plan(), 'Aimed', 0, 0)[0]);
    expect(usePlanStore.getState().editOpen).toBe(true);
    edit.land(plan());
    expect(usePlanStore.getState().editOpen).toBe(false);
  });

  it('lands an abandoned Edit when the next one opens, and deadens its handle', () => {
    const abandoned = beginEdit();
    abandoned.aim(addRoomLabel(plan(), 'Aimed', 0, 0)[0]);

    const next = beginEdit();
    expect(temporal().pastStates).toHaveLength(1);
    expect(usePlanStore.getState().editOpen).toBe(true);

    // The stale handle writes nothing: its Edit is over.
    abandoned.aim(addRoomLabel(plan(), 'Ghost', 5, 5)[0]);
    abandoned.land(addRoomLabel(plan(), 'Ghost', 5, 5)[0]);
    expect(Object.keys(plan().roomLabels)).toHaveLength(1);

    next.land(addRoomLabel(plan(), 'Real', 9, 9)[0]);
    expect(Object.keys(plan().roomLabels)).toHaveLength(2);
  });

  it('lands an abandoned Edit before a plain one, so neither folds into the other', () => {
    const abandoned = beginEdit();
    abandoned.aim(addRoomLabel(plan(), 'Dragged', 0, 0)[0]);

    editPlan((p) => addRoomLabel(p, 'Typed', 5, 5)[0]);
    expect(usePlanStore.getState().editOpen).toBe(false);
    expect(Object.keys(plan().roomLabels)).toHaveLength(2);

    undo();
    expect(Object.keys(plan().roomLabels)).toHaveLength(1);
    undo();
    expect(Object.keys(plan().roomLabels)).toHaveLength(0);
  });

  it('replacePlan closes an abandoned Edit rather than importing under it', () => {
    const abandoned = beginEdit();
    abandoned.aim(addRoomLabel(plan(), 'Dragged', 0, 0)[0]);

    const imported = buildPlan((b) => {
      b.point(0, 0);
    });
    replacePlan(imported);

    expect(usePlanStore.getState().editOpen).toBe(false);
    expect(temporal().pastStates).toHaveLength(0);
    // The stale handle cannot write the pre-import plan back over the import.
    abandoned.land(addRoomLabel(plan(), 'Late', 1, 1)[0]);
    expect(plan()).toBe(imported);
  });

  it('replacePlan swaps the plan and resets history (spec §7: import)', () => {
    editPlan((p) => addRoomLabel(p, 'Old', 0, 0)[0]);
    const imported = buildPlan((b) => {
      b.point(0, 0);
    });
    replacePlan(imported);
    expect(plan()).toBe(imported);
    expect(temporal().pastStates).toHaveLength(0);
    expect(temporal().futureStates).toHaveLength(0);
  });

  it('collapses a ruler endpoint drag into one undo that restores the start', () => {
    let id = '';
    editPlan((p) => {
      const [next, rid] = addRuler(p, { x: 0, y: 0 }, { x: 100, y: 0 });
      id = rid;
      return next;
    });

    const edit = beginEdit();
    edit.aim(moveRulerEndpoint(plan(), id, 'b', 120, 10));
    edit.land(moveRulerEndpoint(plan(), id, 'b', 150, 40));
    expect(plan().rulers[id].b).toEqual({ x: 150, y: 40 });

    undo();
    expect(plan().rulers[id].b).toEqual({ x: 100, y: 0 });
    redo();
    expect(plan().rulers[id].b).toEqual({ x: 150, y: 40 });
  });

  it('caps history at 100 steps', () => {
    for (let i = 0; i < 130; i++) {
      editPlan((p) => addRoomLabel(p, `L${i}`, i, i)[0]);
    }
    expect(temporal().pastStates.length).toBeLessThanOrEqual(100);
  });
});
