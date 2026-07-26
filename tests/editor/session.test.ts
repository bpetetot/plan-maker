// CONTEXT.md: Session. The rules a transition declares — the ladder, the
// one-shot, what a Tool takes, what a gesture writes — asserted without a DOM.
import { describe, expect, it } from 'vitest';
import { emptyPlan } from '../../src/model/types';
import type { Plan } from '../../src/model/types';
import type { Intent, Session, SessionEnv } from '../../src/editor/session';
import { initialSession, reduce } from '../../src/editor/session';
import type { PointerInput } from '../../src/editor/pointer';
import { buildPlan } from '../helpers';

const env = (over: Partial<SessionEnv> = {}): SessionEnv => ({
  plan: emptyPlan(),
  pxPerCm: 1,
  space: false,
  gridVisible: true,
  measuresVisible: true,
  ...over,
});

const input = (x = 0, y = 0, over: Partial<PointerInput> = {}): PointerInput => ({
  pointerId: 1,
  button: 0,
  shiftKey: false,
  clientX: x,
  clientY: y,
  at: { x, y },
  ...over,
});

// One send, the session it produced — for a chain of intents read as a scenario.
const run = (s: Session, intents: Intent[], e = env()): Session =>
  intents.reduce((acc, intent) => reduce(acc, intent, e).session, s);

const drawing = (tool: 'wall' | 'ruler' | 'text' = 'wall') =>
  run(initialSession, [{ type: 'selectTool', tool }]);

describe('the Tool', () => {
  it('poses a Placement for every tool but Select, which poses nothing', () => {
    expect(drawing('wall').placement).toMatchObject({ tool: 'wall' });
    expect(run(drawing('wall'), [{ type: 'selectTool', tool: 'select' }]).placement).toBeNull();
  });

  it('empties the Selection on the way to a drawing tool, and keeps it under Select', () => {
    const selected: Session = { ...initialSession, selection: [{ type: 'wall', id: 'w1' }] };
    expect(run(selected, [{ type: 'selectTool', tool: 'wall' }]).selection).toEqual([]);
    expect(run(selected, [{ type: 'selectTool', tool: 'select' }]).selection).toHaveLength(1);
  });

  it('reveals the measures when the Ruler is picked, and only then', () => {
    expect(reduce(initialSession, { type: 'selectTool', tool: 'ruler' }, env()).showMeasures).toBe(true);
    expect(reduce(initialSession, { type: 'selectTool', tool: 'wall' }, env()).showMeasures).toBeUndefined();
  });
});

describe('the cancel ladder', () => {
  it('drops what the placement holds pending before touching the Selection', () => {
    // A first click leaves the chain pending, with the Selection still there.
    const pending = run({ ...drawing('wall'), selection: [{ type: 'wall', id: 'w1' }] }, [
      { type: 'pointerDown', input: input(10, 10), target: { kind: 'sheet' } },
    ]);
    expect(pending.placement).toMatchObject({ chain: { pending: expect.anything() } });
    const cancelled = run(pending, [{ type: 'cancel' }]);
    expect(cancelled.placement).toMatchObject({ chain: null });
    expect(cancelled.selection).toHaveLength(1);
    expect(cancelled.tool).toBe('wall');
  });

  it('then empties the Selection, and only then falls back to Select', () => {
    const selected: Session = { ...drawing('wall'), selection: [{ type: 'wall', id: 'w1' }] };
    const emptied = run(selected, [{ type: 'cancel' }]);
    expect(emptied.selection).toEqual([]);
    expect(emptied.tool).toBe('wall');
    expect(run(emptied, [{ type: 'cancel' }]).tool).toBe('select');
  });
});

describe('the editing box', () => {
  const oneText = (): Plan => ({
    ...emptyPlan(),
    texts: { t1: { id: 't1', x: 20, y: 20, content: 'Old', size: 'M' } },
  });

  it('hands the Text tool back to Select whatever it returns, committed or not', () => {
    const placed = run(drawing('text'), [
      { type: 'pointerDown', input: input(30, 30), target: { kind: 'sheet' } },
    ]);
    expect(placed.inlineEdit).toMatchObject({ kind: 'text', id: null });
    for (const value of ['Kitchen', '', null]) {
      const closed = reduce(placed, { type: 'closeInlineEdit', value }, env());
      expect(closed.session.tool).toBe('select');
      expect(closed.session.inlineEdit).toBeNull();
    }
  });

  it('writes nothing when a re-edit changes nothing, and writes on a change', () => {
    const e = env({ plan: oneText() });
    const open = run(initialSession, [{ type: 'editText', id: 't1' }], e);
    expect(reduce(open, { type: 'closeInlineEdit', value: 'Old' }, e).edit).toBeUndefined();
    expect(reduce(open, { type: 'closeInlineEdit', value: 'New' }, e).edit).toMatchObject({
      how: 'commit',
    });
  });

  it('spends its one shot on the box that opened it, not on any box', () => {
    const naming: Session = {
      ...initialSession,
      inlineEdit: { kind: 'roomLabel', id: null, blockKey: 'b1', at: { x: 0, y: 0 }, initial: '' },
    };
    // A label box is not the tool's, so it survives the switch to Text...
    const onText = run(naming, [{ type: 'selectTool', tool: 'text' }]);
    expect(onText.inlineEdit).toMatchObject({ kind: 'roomLabel' });
    // ...and closing it leaves the Text tool exactly where it stands.
    expect(run(onText, [{ type: 'closeInlineEdit', value: null }]).tool).toBe('text');
  });

  it('opens no box under a drawing tool', () => {
    const e = env({ plan: oneText() });
    expect(run(drawing('wall'), [{ type: 'editText', id: 't1' }], e).inlineEdit).toBeNull();
  });
});

describe('a gesture', () => {
  const plan = buildPlan((b) => {
    const a = b.point(0, 0);
    const c = b.point(100, 0);
    b.wall(a, c);
  });
  const wallId = Object.keys(plan.walls)[0];

  it('opens an Edit and captures the pointer when a grab begins', () => {
    const grab = reduce(
      initialSession,
      {
        type: 'pointerDown',
        input: input(0, 0),
        target: { kind: 'element', ref: { type: 'wall', id: wallId } },
      },
      env({ plan }),
    );
    expect(grab.edit).toEqual({ how: 'open' });
    expect(grab.capture).toBe(true);
    expect(grab.session.drag).toMatchObject({ kind: 'plan' });
    // The grab is the Selection: a single element dragged alone is selected.
    expect(grab.session.selection).toEqual([{ type: 'wall', id: wallId }]);
  });

  it('holds nothing when the target has nothing to edit', () => {
    const grab = reduce(
      initialSession,
      {
        type: 'pointerDown',
        input: input(0, 0),
        target: { kind: 'handle', handle: { type: 'point', id: 'gone' } },
      },
      env({ plan }),
    );
    // The very session back, phase included: a dead grab costs no render.
    expect(grab.session).toBe(initialSession);
    expect(grab.edit).toBeUndefined();
    expect(grab.capture).toBeUndefined();
  });

  it('lands a cancelled drag on the plan it started from', () => {
    const e = env({ plan });
    const grabbed = run(
      initialSession,
      [
        {
          type: 'pointerDown',
          input: input(0, 0),
          target: { kind: 'element', ref: { type: 'wall', id: wallId } },
        },
        { type: 'pointerMove', input: input(50, 50), onSheet: false },
      ],
      e,
    );
    const cancelled = reduce(grabbed, { type: 'pointerCancel', input: input(50, 50) }, e);
    expect(cancelled.edit).toEqual({ how: 'land', plan });
    expect(cancelled.session.drag).toBeNull();
  });

  it('declares no write when the Selection is empty on a delete', () => {
    expect(reduce(initialSession, { type: 'deleteSelection' }, env()).edit).toBeUndefined();
    const selected: Session = { ...initialSession, selection: [{ type: 'wall', id: wallId }] };
    expect(reduce(selected, { type: 'deleteSelection' }, env({ plan })).edit).toMatchObject({
      how: 'commit',
    });
  });
});

describe('the hover', () => {
  it('is the same session back when nothing changed, so an idle move costs no render', () => {
    const moved = { type: 'pointerMove', input: input(5, 5), onSheet: true } as const;
    expect(reduce(initialSession, moved, env()).session).toBe(initialSession);
  });

  it('drops a room but never a grab zone: the move owns the tint, the zones own theirs', () => {
    const onWall = run(initialSession, [{ type: 'hoverElement', kind: 'wall', id: 'w1' }]);
    // A move over chrome resolves no room; the wall's own hover must survive it.
    const after = run(onWall, [{ type: 'pointerMove', input: input(9, 9), onSheet: false }]);
    expect(after.hover).toEqual({ kind: 'wall', id: 'w1' });
    expect(run(onWall, [{ type: 'leaveSheet' }]).hover).toEqual({ kind: 'wall', id: 'w1' });
  });

  it('clears on leaving only the zone it still holds', () => {
    const onWall = run(initialSession, [{ type: 'hoverElement', kind: 'wall', id: 'w1' }]);
    // The enter of the next zone can land before the leave of the last one.
    expect(run(onWall, [{ type: 'leaveElement', kind: 'wall', id: 'w2' }]).hover).toEqual({
      kind: 'wall',
      id: 'w1',
    });
    expect(run(onWall, [{ type: 'leaveElement', kind: 'wall', id: 'w1' }]).hover).toBeNull();
  });
});
