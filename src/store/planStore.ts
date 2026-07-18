import { temporal } from 'zundo'
import { create } from 'zustand'
import type { Plan } from '../model/types'
import { emptyPlan } from '../model/types'

// Spec §5: zundo temporal middleware, immutable snapshots, history limit ~100,
// in-memory only. Selection and camera live outside this store, so partialize
// keeps only the plan.

export interface PlanState {
  plan: Plan
  setPlan: (updater: (plan: Plan) => Plan) => void
}

type TrackedState = { plan: Plan }

export const usePlanStore = create<PlanState>()(
  temporal(
    (set) => ({
      plan: emptyPlan(),
      setPlan: (updater) => set((state) => ({ plan: updater(state.plan) })),
    }),
    {
      partialize: (state): TrackedState => ({ plan: state.plan }),
      equality: (pastState, currentState) => pastState.plan === currentState.plan,
      limit: 100,
    },
  ),
)

export const undo = () => usePlanStore.temporal.getState().undo()
export const redo = () => usePlanStore.temporal.getState().redo()

// Import replaces the plan and resets the undo/redo history (spec §7).
export function replacePlan(plan: Plan) {
  usePlanStore.temporal.getState().pause()
  usePlanStore.setState({ plan })
  usePlanStore.temporal.getState().resume()
  usePlanStore.temporal.setState({ pastStates: [], futureStates: [] })
}

// Drag grouping (spec §5): every change between begin and end collapses into a
// single undo step. Recording is paused during the drag; the pre-drag snapshot
// is pushed manually if anything changed.
let groupSnapshot: Plan | null = null

export function beginHistoryGroup() {
  groupSnapshot = usePlanStore.getState().plan
  usePlanStore.temporal.getState().pause()
}

export function endHistoryGroup() {
  const snapshot = groupSnapshot
  groupSnapshot = null
  usePlanStore.temporal.getState().resume()
  if (snapshot === null || snapshot === usePlanStore.getState().plan) return
  const { pastStates } = usePlanStore.temporal.getState()
  usePlanStore.temporal.setState({
    pastStates: [...pastStates.slice(-99), { plan: snapshot }],
    futureStates: [],
  })
}
