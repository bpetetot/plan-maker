import { temporal } from 'zundo'
import { create } from 'zustand'
import type { Plan } from '../model/types'
import { emptyPlan } from '../model/types'

// Spec §5: zundo temporal middleware, immutable snapshots, history limit ~100,
// in-memory only. Selection and camera live outside this store, so partialize
// keeps only the plan — planEpoch never enters the undo/redo history either.

export interface PlanState {
  plan: Plan
  // Bumped by replacePlan only — lets the editor Fit the view after any
  // replacement without reacting to ordinary edits.
  planEpoch: number
  setPlan: (updater: (plan: Plan) => Plan) => void
}

type TrackedState = { plan: Plan }

const HISTORY_LIMIT = 100

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
)

export const undo = () => usePlanStore.temporal.getState().undo()
export const redo = () => usePlanStore.temporal.getState().redo()

// Import replaces the plan and resets the undo/redo history (spec §7).
export function replacePlan(plan: Plan) {
  usePlanStore.temporal.getState().pause()
  usePlanStore.setState((state) => ({ plan, planEpoch: state.planEpoch + 1 }))
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
    pastStates: [...pastStates.slice(1 - HISTORY_LIMIT), { plan: snapshot }],
    futureStates: [],
  })
}
