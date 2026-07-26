import { describe, expect, it } from 'vitest';
import {
  addRoomLabel,
  moveRoomLabel,
  reconcileRoomLabels,
  renameRoomLabel,
} from '../../src/model/roomLabels';
import { commitWall } from '../../src/model/settle';
import { deleteWall, setPoints } from '../../src/model/walls';
import { buildPlan, squareRoomPlan, stackedRoomsPlan } from '../helpers';

describe('reconcileRoomLabels', () => {
  // 4×4 m square room
  const labeledSquare = (labelX: number, labelY: number) => {
    let ids = { right: ['', ''], wall: '', label: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      const w = b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
      const label = b.label('Kitchen', labelX, labelY);
      ids = { right: [p2.id, p3.id], wall: w.id, label: label.id };
    });
    return { plan, ...ids };
  };

  it('returns the same plan when every label already sits at its centroid', () => {
    const { plan } = labeledSquare(200, 200);
    expect(reconcileRoomLabels(plan, plan)).toBe(plan);
  });

  it('pins a default label to the live centroid when the room deforms', () => {
    const { plan, right, label } = labeledSquare(350, 200);
    const after = setPoints(plan, { [right[0]]: { x: 300, y: 0 }, [right[1]]: { x: 300, y: 400 } });
    const next = reconcileRoomLabels(plan, after);
    expect(next.roomLabels[label]).toMatchObject({ name: 'Kitchen', x: 150, y: 200 });
  });

  it('deletes a label whose room is no longer detected', () => {
    const { plan, wall } = labeledSquare(200, 200);
    const after = deleteWall(plan, wall);
    expect(reconcileRoomLabels(plan, after).roomLabels).toEqual({});
  });

  it('keeps each label with its room when a shared wall sweeps past a label', () => {
    const { plan, shared, top, bottom } = stackedRoomsPlan();
    // drag the shared wall down past BBB's position: the room sizes invert
    const after = setPoints(plan, { [shared[0]]: { x: 250, y: 250 }, [shared[1]]: { x: 450, y: 250 } });
    const next = reconcileRoomLabels(plan, after);
    expect(next.roomLabels[top]).toMatchObject({ name: 'AAA', x: 350, y: 80 });
    expect(next.roomLabels[bottom]).toMatchObject({ name: 'BBB', x: 350, y: 275 });
  });

  it('keeps a label whose room loop changed but still contains it (position fallback)', () => {
    const { plan, label } = labeledSquare(200, 200);
    // planar insertion splits the left wall: the room loop gains a point
    const left = Object.values(plan.walls).find(
      (w) => plan.points[w.startPointId].x === 0 && plan.points[w.endPointId].x === 0,
    )!;
    const [after] = commitWall(
      plan,
      { x: 0, y: 200, kind: 'wall', wallId: left.id },
      { x: 100, y: 200, kind: 'free' },
    );
    const next = reconcileRoomLabels(plan, after);
    expect(next.roomLabels[label]).toMatchObject({ name: 'Kitchen' });
  });

  it('drops orphan labels when reconciling a plan against itself', () => {
    let insideId = '';
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
      insideId = b.label('Kitchen', 200, 200).id;
      b.label('Orphan', 900, 900);
    });
    const next = reconcileRoomLabels(plan, plan);
    expect(Object.keys(next.roomLabels)).toEqual([insideId]);
  });
});

describe('reconcileRoomLabels — placement state', () => {
  it('reverts a custom placement to default when the room deforms away from it', () => {
    let ids = { right: ['', ''], label: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
      ids = { right: [p2.id, p3.id], label: b.label('Kitchen', 350, 200, true).id };
    });
    const after = setPoints(plan, { [ids.right[0]]: { x: 300, y: 0 }, [ids.right[1]]: { x: 300, y: 400 } });
    const next = reconcileRoomLabels(plan, after);
    expect(next.roomLabels[ids.label]).toEqual({ id: ids.label, name: 'Kitchen', x: 150, y: 200 });
  });

  it('deletes a nameless label the revert strips of its custom placement', () => {
    let ids = { right: ['', ''], label: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
      ids = { right: [p2.id, p3.id], label: b.label('', 350, 200, true).id };
    });
    const after = setPoints(plan, { [ids.right[0]]: { x: 300, y: 0 }, [ids.right[1]]: { x: 300, y: 400 } });
    expect(reconcileRoomLabels(plan, after).roomLabels).toEqual({});
  });

  it('lets a named label survive a merge its older nameless neighbour would have won', () => {
    const { plan, sharedWall, bottom } = stackedRoomsPlan('');
    const next = reconcileRoomLabels(plan, deleteWall(plan, sharedWall));
    expect(Object.keys(next.roomLabels)).toEqual([bottom]);
  });

  it('keeps a custom placement that is still inside the room', () => {
    let ids = { right: ['', ''], label: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
      ids = { right: [p2.id, p3.id], label: b.label('Kitchen', 150, 200, true).id };
    });
    const after = setPoints(plan, { [ids.right[0]]: { x: 300, y: 0 }, [ids.right[1]]: { x: 300, y: 400 } });
    expect(reconcileRoomLabels(plan, after)).toBe(after);
  });
});

describe('room labels', () => {
  it('adds, renames, and moves a label', () => {
    let plan = buildPlan(() => {});
    let id: string;
    [plan, id] = addRoomLabel(plan, 'Kitchen', 100, 100);
    expect(plan.roomLabels[id]).toMatchObject({ name: 'Kitchen', x: 100, y: 100 });
    plan = renameRoomLabel(plan, id, 'Living room');
    expect(plan.roomLabels[id].name).toBe('Living room');
    plan = moveRoomLabel(plan, id, 150.6, 80.2);
    expect(plan.roomLabels[id]).toMatchObject({ x: 151, y: 80 });
  });
});

// A 4×4 m room named at its anchor, or dragged off it.
const roomWithLabel = (placed?: true) => {
  let labelId = '';
  const plan = buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    const p3 = b.point(400, 400);
    const p4 = b.point(0, 400);
    b.wall(p1, p2);
    b.wall(p2, p3);
    b.wall(p3, p4);
    b.wall(p4, p1);
    labelId = b.label('Kitchen', placed ? 350 : 200, placed ? 120 : 200, placed).id;
  });
  return { plan, labelId };
};

describe('room label placement state', () => {
  it('addRoomLabel creates a default-placement label', () => {
    const { plan } = roomWithLabel();
    const [next, id] = addRoomLabel(plan, 'Office', 200, 200);
    expect(next.roomLabels[id].placed).toBeUndefined();
  });

  it('moveRoomLabel gives the label a custom placement', () => {
    const { plan, labelId } = roomWithLabel();
    const next = moveRoomLabel(plan, labelId, 350, 120);
    expect(next.roomLabels[labelId]).toMatchObject({ x: 350, y: 120, placed: true });
  });

  it('renameRoomLabel leaves the placement state alone', () => {
    const { plan, labelId } = roomWithLabel();
    const renamed = renameRoomLabel(plan, labelId, 'Office');
    expect(renamed.roomLabels[labelId].placed).toBeUndefined();
    const customThenRenamed = renameRoomLabel(moveRoomLabel(plan, labelId, 350, 120), labelId, 'Office');
    expect(customThenRenamed.roomLabels[labelId].placed).toBe(true);
  });
});

// A label carries a name, a custom placement, or both (CONTEXT.md: Room label).
describe('a label that carries neither a name nor a placement', () => {
  it('is gone once renaming empties the name of a default-placement label', () => {
    const { plan, labelId } = roomWithLabel();
    expect(renameRoomLabel(plan, labelId, '').roomLabels).toEqual({});
  });

  it('survives renaming to nothing while it holds a custom placement', () => {
    const { plan, labelId } = roomWithLabel(true);
    const next = renameRoomLabel(plan, labelId, '');
    expect(next.roomLabels[labelId]).toMatchObject({ name: '', x: 350, y: 120, placed: true });
  });

  // The load path: alone in its room, so only the rule can be dropping it.
  it('never survives arriving in a plan, whatever room it sits in', () => {
    const square = squareRoomPlan();
    const plan = { ...square, roomLabels: { l: { id: 'l', name: '', x: 200, y: 200 } } };
    expect(reconcileRoomLabels(plan, plan).roomLabels).toEqual({});
  });
});
