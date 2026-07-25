import { temporal } from 'zundo';
import { create } from 'zustand';
import type { Plan } from '../model/types';
import { emptyPlan } from '../model/types';

export interface PlanState {
  plan: Plan;
  // Bumped by replacePlan only: the editor Fits the view on it, not on edits.
  planEpoch: number;
  /** An Edit is open: what it writes is not settled, so not persistable yet. */
  editOpen: boolean;
}

type TrackedState = { plan: Plan };

const HISTORY_LIMIT = 100;

export const usePlanStore = create<PlanState>()(
  temporal(
    (): PlanState => ({
      plan: emptyPlan(),
      planEpoch: 0,
      editOpen: false,
    }),
    {
      partialize: (state): TrackedState => ({ plan: state.plan }),
      equality: (pastState, currentState) => pastState.plan === currentState.plan,
      limit: HISTORY_LIMIT,
    },
  ),
);

export const undo = () => usePlanStore.temporal.getState().undo();
export const redo = () => usePlanStore.temporal.getState().redo();

// Spec §7: import resets the undo/redo history.
export function replacePlan(plan: Plan) {
  closeEdit();
  usePlanStore.temporal.getState().pause();
  usePlanStore.setState((state) => ({ plan, planEpoch: state.planEpoch + 1 }));
  usePlanStore.temporal.getState().resume();
  usePlanStore.temporal.setState({ pastStates: [], futureStates: [] });
}

/** CONTEXT.md: Edit. One write, one undo entry — and the Plan it produced, so
 *  a caller reading back what applied never reaches for a stale closure. */
export function editPlan(edit: (plan: Plan) => Plan): Plan {
  // Lands an Edit whose drag never got its pointer-up: leaving it open would
  // fold this write into its undo entry and keep autosave suspended.
  closeEdit();
  const plan = edit(usePlanStore.getState().plan);
  usePlanStore.setState({ plan });
  return plan;
}

/** CONTEXT.md: Edit. Only `beginEdit` hands one out, so the pair cannot be
 *  split. */
export interface OpenEdit {
  aim: (plan: Plan) => void;
  land: (plan: Plan) => void;
}

// Spec §5 drag grouping: recording paused, pre-Edit snapshot pushed by hand —
// per-move steps would flood the history.
let open: { snapshot: Plan } | null = null;

function closeEdit() {
  const edit = open;
  open = null;
  if (!edit) return;
  usePlanStore.temporal.getState().resume();
  usePlanStore.setState({ editOpen: false });
  if (edit.snapshot === usePlanStore.getState().plan) return;
  const { pastStates } = usePlanStore.temporal.getState();
  usePlanStore.temporal.setState({
    pastStates: [...pastStates.slice(1 - HISTORY_LIMIT), { plan: edit.snapshot }],
    futureStates: [],
  });
}

export function beginEdit(): OpenEdit {
  // An Edit left open — a cancelled drag, an unmount mid-drag — would keep the
  // history paused for good. Every entry point lands it first.
  closeEdit();
  const mine = { snapshot: usePlanStore.getState().plan };
  open = mine;
  usePlanStore.temporal.getState().pause();
  usePlanStore.setState({ editOpen: true });
  return {
    aim: (plan) => {
      if (open === mine) usePlanStore.setState({ plan });
    },
    land: (plan) => {
      if (open !== mine) return;
      // Both in one write: the landing must reach autosave even when the settle
      // returned the very plan the last aim wrote.
      usePlanStore.setState({ plan, editOpen: false });
      closeEdit();
    },
  };
}
