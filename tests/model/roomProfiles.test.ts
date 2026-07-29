import { describe, expect, it } from 'vitest';
import {
  addRoomProfile,
  moveRoomProfile,
  reconcileRoomProfiles,
  renameRoomProfile,
} from '../../src/model/roomProfiles';
import { commitWall } from '../../src/model/settle';
import { deleteWall, setPoints } from '../../src/model/walls';
import { buildPlan, squareRoomPlan, stackedRoomsPlan } from '../helpers';

describe('reconcileRoomProfiles', () => {
  // 4×4 m square room
  const namedSquare = (profileX: number, profileY: number) => {
    let ids = { right: ['', ''], wall: '', profile: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      const w = b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
      const profile = b.profile('Kitchen', profileX, profileY);
      ids = { right: [p2.id, p3.id], wall: w.id, profile: profile.id };
    });
    return { plan, ...ids };
  };

  it('returns the same plan when every profile already sits at its centroid', () => {
    const { plan } = namedSquare(200, 200);
    expect(reconcileRoomProfiles(plan, plan)).toBe(plan);
  });

  it('pins a default profile to the live centroid when the room deforms', () => {
    const { plan, right, profile } = namedSquare(350, 200);
    const after = setPoints(plan, { [right[0]]: { x: 300, y: 0 }, [right[1]]: { x: 300, y: 400 } });
    const next = reconcileRoomProfiles(plan, after);
    expect(next.roomProfiles[profile]).toMatchObject({ name: 'Kitchen', x: 150, y: 200 });
  });

  it('deletes a profile whose room is no longer detected', () => {
    const { plan, wall } = namedSquare(200, 200);
    const after = deleteWall(plan, wall);
    expect(reconcileRoomProfiles(plan, after).roomProfiles).toEqual({});
  });

  it('keeps each profile with its room when a shared wall sweeps past a profile', () => {
    const { plan, shared, top, bottom } = stackedRoomsPlan();
    // drag the shared wall down past BBB's position: the room sizes invert
    const after = setPoints(plan, { [shared[0]]: { x: 250, y: 250 }, [shared[1]]: { x: 450, y: 250 } });
    const next = reconcileRoomProfiles(plan, after);
    expect(next.roomProfiles[top]).toMatchObject({ name: 'AAA', x: 350, y: 80 });
    expect(next.roomProfiles[bottom]).toMatchObject({ name: 'BBB', x: 350, y: 275 });
  });

  it('keeps a profile whose room loop changed but still contains it (position fallback)', () => {
    const { plan, profile } = namedSquare(200, 200);
    // planar insertion splits the left wall: the room loop gains a point
    const left = Object.values(plan.walls).find(
      (w) => plan.points[w.startPointId].x === 0 && plan.points[w.endPointId].x === 0,
    )!;
    const [after] = commitWall(
      plan,
      { x: 0, y: 200, kind: 'wall', wallId: left.id },
      { x: 100, y: 200, kind: 'free' },
    );
    const next = reconcileRoomProfiles(plan, after);
    expect(next.roomProfiles[profile]).toMatchObject({ name: 'Kitchen' });
  });

  it('drops orphan profiles when reconciling a plan against itself', () => {
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
      insideId = b.profile('Kitchen', 200, 200).id;
      b.profile('Orphan', 900, 900);
    });
    const next = reconcileRoomProfiles(plan, plan);
    expect(Object.keys(next.roomProfiles)).toEqual([insideId]);
  });
});

describe('reconcileRoomProfiles — placement state', () => {
  it('reverts a custom placement to default when the room deforms away from it', () => {
    let ids = { right: ['', ''], profile: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
      ids = { right: [p2.id, p3.id], profile: b.profile('Kitchen', 350, 200, true).id };
    });
    const after = setPoints(plan, { [ids.right[0]]: { x: 300, y: 0 }, [ids.right[1]]: { x: 300, y: 400 } });
    const next = reconcileRoomProfiles(plan, after);
    expect(next.roomProfiles[ids.profile]).toEqual({ id: ids.profile, name: 'Kitchen', x: 150, y: 200 });
  });

  it('deletes a nameless profile the revert strips of its custom placement', () => {
    let ids = { right: ['', ''], profile: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
      ids = { right: [p2.id, p3.id], profile: b.profile('', 350, 200, true).id };
    });
    const after = setPoints(plan, { [ids.right[0]]: { x: 300, y: 0 }, [ids.right[1]]: { x: 300, y: 400 } });
    expect(reconcileRoomProfiles(plan, after).roomProfiles).toEqual({});
  });

  it('lets a named profile survive a merge its older nameless neighbour would have won', () => {
    const { plan, sharedWall, bottom } = stackedRoomsPlan('');
    const next = reconcileRoomProfiles(plan, deleteWall(plan, sharedWall));
    expect(Object.keys(next.roomProfiles)).toEqual([bottom]);
  });

  it('keeps a custom placement that is still inside the room', () => {
    let ids = { right: ['', ''], profile: '' };
    const plan = buildPlan((b) => {
      const p1 = b.point(0, 0);
      const p2 = b.point(400, 0);
      const p3 = b.point(400, 400);
      const p4 = b.point(0, 400);
      b.wall(p1, p2);
      b.wall(p2, p3);
      b.wall(p3, p4);
      b.wall(p4, p1);
      ids = { right: [p2.id, p3.id], profile: b.profile('Kitchen', 150, 200, true).id };
    });
    const after = setPoints(plan, { [ids.right[0]]: { x: 300, y: 0 }, [ids.right[1]]: { x: 300, y: 400 } });
    expect(reconcileRoomProfiles(plan, after)).toBe(after);
  });
});

describe('room profiles', () => {
  it('adds, renames, and moves a profile', () => {
    let plan = buildPlan(() => {});
    let id: string;
    [plan, id] = addRoomProfile(plan, 'Kitchen', 100, 100);
    expect(plan.roomProfiles[id]).toMatchObject({ name: 'Kitchen', x: 100, y: 100 });
    plan = renameRoomProfile(plan, id, 'Living room');
    expect(plan.roomProfiles[id].name).toBe('Living room');
    plan = moveRoomProfile(plan, id, 150.6, 80.2);
    expect(plan.roomProfiles[id]).toMatchObject({ x: 151, y: 80 });
  });
});

// A 4×4 m room named at its anchor, or dragged off it.
const roomWithProfile = (placed?: true) => {
  let profileId = '';
  const plan = buildPlan((b) => {
    const p1 = b.point(0, 0);
    const p2 = b.point(400, 0);
    const p3 = b.point(400, 400);
    const p4 = b.point(0, 400);
    b.wall(p1, p2);
    b.wall(p2, p3);
    b.wall(p3, p4);
    b.wall(p4, p1);
    profileId = b.profile('Kitchen', placed ? 350 : 200, placed ? 120 : 200, placed).id;
  });
  return { plan, profileId };
};

describe('room profile placement state', () => {
  it('addRoomProfile creates a default-placement profile', () => {
    const { plan } = roomWithProfile();
    const [next, id] = addRoomProfile(plan, 'Office', 200, 200);
    expect(next.roomProfiles[id].placed).toBeUndefined();
  });

  it('moveRoomProfile gives the profile a custom placement', () => {
    const { plan, profileId } = roomWithProfile();
    const next = moveRoomProfile(plan, profileId, 350, 120);
    expect(next.roomProfiles[profileId]).toMatchObject({ x: 350, y: 120, placed: true });
  });

  it('renameRoomProfile leaves the placement state alone', () => {
    const { plan, profileId } = roomWithProfile();
    const renamed = renameRoomProfile(plan, profileId, 'Office');
    expect(renamed.roomProfiles[profileId].placed).toBeUndefined();
    const customThenRenamed = renameRoomProfile(
      moveRoomProfile(plan, profileId, 350, 120),
      profileId,
      'Office',
    );
    expect(customThenRenamed.roomProfiles[profileId].placed).toBe(true);
  });
});

// A profile carries a name, a custom placement, or both (CONTEXT.md: Room profile).
describe('a profile that carries neither a name nor a placement', () => {
  it('is gone once renaming empties the name of a default-placement profile', () => {
    const { plan, profileId } = roomWithProfile();
    expect(renameRoomProfile(plan, profileId, '').roomProfiles).toEqual({});
  });

  it('survives renaming to nothing while it holds a custom placement', () => {
    const { plan, profileId } = roomWithProfile(true);
    const next = renameRoomProfile(plan, profileId, '');
    expect(next.roomProfiles[profileId]).toMatchObject({ name: '', x: 350, y: 120, placed: true });
  });

  // The load path: alone in its room, so only the rule can be dropping it.
  it('never survives arriving in a plan, whatever room it sits in', () => {
    const square = squareRoomPlan();
    const plan = { ...square, roomProfiles: { l: { id: 'l', name: '', x: 200, y: 200 } } };
    expect(reconcileRoomProfiles(plan, plan).roomProfiles).toEqual({});
  });
});
