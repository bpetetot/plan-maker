// The Session's one React binding (ADR 0033): the value, and a send that
// performs what a pure transition declared.
import { useRef, useState } from 'react';
import { setPreference } from '../preferences/preferences';
import type { OpenEdit } from '../store/planStore';
import { beginEdit, editPlan } from '../store/planStore';
import type { Intent, PlanWrite, Session, SessionEnv } from './session';
import { initialSession, reduce } from './session';

interface SessionEffects {
  // One capture protocol: whatever the source, a gesture holds the svg.
  capture: (e: React.PointerEvent) => void;
  panBy: (dxPx: number, dyPx: number) => void;
}

/** `mirror` holds the session as of the last transition, not the last render:
 *  the camera reads the pointer phase off it before any render lands. */
export function useSession(
  mirror: React.RefObject<Session>,
  world: () => SessionEnv,
  effects: SessionEffects,
) {
  const [session, setSession] = useState(initialSession);
  // The handle cannot be born in a pure function, so the reducer names the
  // moment instead and it lives here, ending with the drag (ADR 0028).
  const openEdit = useRef<OpenEdit | null>(null);

  const write = (w: PlanWrite) => {
    switch (w.how) {
      case 'open':
        openEdit.current = beginEdit();
        return;
      case 'aim':
        openEdit.current?.aim(w.plan);
        return;
      case 'land':
        openEdit.current?.land(w.plan);
        openEdit.current = null;
        return;
      case 'commit':
        editPlan(() => w.plan);
        return;
    }
  };

  const send = (intent: Intent, e?: React.PointerEvent) => {
    const r = reduce(mirror.current, intent, world());
    // Same value back means the transition changed nothing: React bails out,
    // and so must the mirror.
    if (r.session !== mirror.current) {
      mirror.current = r.session;
      setSession(r.session);
    }
    if (r.edit) write(r.edit);
    if (r.showMeasures) setPreference('measures', true);
    if (r.panBy) effects.panBy(r.panBy.dxPx, r.panBy.dyPx);
    if (e) {
      if (r.capture) effects.capture(e);
      if (r.preventDefault) e.preventDefault();
    }
  };

  return [session, send] as const;
}
