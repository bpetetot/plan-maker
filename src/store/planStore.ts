import { temporal } from 'zundo';
import { create } from 'zustand';
import type { Plan } from '../model/types';
import { emptyPlan } from '../model/types';

export interface PlanState {
  plan: Plan;
  // Bumped by replacePlan only: the editor Fits the view on it, not on edits.
  planEpoch: number;
  setPlan: (updater: (plan: Plan) => Plan) => void;
}

type TrackedState = { plan: Plan };

const HISTORY_LIMIT = 100;

export const usePlanStore = create<PlanState>()(
  temporal(
    (set) => ({
      plan: emptyPlan(),
      planEpoch: 0,
      setPlan: (updater) => set((state) => ({ plan: updater(state.plan) })),
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
  usePlanStore.temporal.getState().pause();
  usePlanStore.setState((state) => ({ plan, planEpoch: state.planEpoch + 1 }));
  usePlanStore.temporal.getState().resume();
  usePlanStore.temporal.setState({ pastStates: [], futureStates: [] });
}

// Spec §5 drag grouping: recording paused, pre-drag snapshot pushed by hand —
// per-move steps would flood the history.
let groupSnapshot: Plan | null = null;

export function beginHistoryGroup() {
  groupSnapshot = usePlanStore.getState().plan;
  usePlanStore.temporal.getState().pause();
}

export function endHistoryGroup() {
  const snapshot = groupSnapshot;
  groupSnapshot = null;
  usePlanStore.temporal.getState().resume();
  if (snapshot === null || snapshot === usePlanStore.getState().plan) return;
  const { pastStates } = usePlanStore.temporal.getState();
  usePlanStore.temporal.setState({
    pastStates: [...pastStates.slice(1 - HISTORY_LIMIT), { plan: snapshot }],
    futureStates: [],
  });
}
