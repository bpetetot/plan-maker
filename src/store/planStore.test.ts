import { beforeEach, describe, expect, it } from 'vitest'
import { buildPlan } from '../model/testHelpers'
import { addRoomLabel } from '../model/operations'
import { emptyPlan } from '../model/types'
import { beginHistoryGroup, endHistoryGroup, redo, replacePlan, undo, usePlanStore } from './planStore'

const plan = () => usePlanStore.getState().plan
const temporal = () => usePlanStore.temporal.getState()

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan() })
  usePlanStore.temporal.getState().clear()
})

describe('planStore undo/redo', () => {
  it('records one history step per setPlan and undoes/redoes it', () => {
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'Kitchen', 10, 10))
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'Bedroom', 20, 20))
    expect(Object.keys(plan().roomLabels)).toHaveLength(2)

    undo()
    expect(Object.keys(plan().roomLabels)).toHaveLength(1)
    undo()
    expect(Object.keys(plan().roomLabels)).toHaveLength(0)
    redo()
    expect(Object.keys(plan().roomLabels)).toHaveLength(1)
  })

  it('does not record a step when an operation is a no-op (same plan reference)', () => {
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'Kitchen', 10, 10))
    const before = temporal().pastStates.length
    usePlanStore.getState().setPlan((p) => p)
    expect(temporal().pastStates.length).toBe(before)
  })

  it('groups all changes between beginHistoryGroup and endHistoryGroup into one undo step', () => {
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'Start', 0, 0))

    beginHistoryGroup()
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'Drag 1', 1, 1))
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'Drag 2', 2, 2))
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'Drag 3', 3, 3))
    endHistoryGroup()

    expect(Object.keys(plan().roomLabels)).toHaveLength(4)
    undo()
    expect(Object.keys(plan().roomLabels)).toHaveLength(1)
    redo()
    expect(Object.keys(plan().roomLabels)).toHaveLength(4)
  })

  it('records nothing for a group where nothing changed', () => {
    const before = temporal().pastStates.length
    beginHistoryGroup()
    endHistoryGroup()
    expect(temporal().pastStates.length).toBe(before)
  })

  it('replacePlan swaps the plan and resets history (spec §7: import)', () => {
    usePlanStore.getState().setPlan((p) => addRoomLabel(p, 'Old', 0, 0))
    const imported = buildPlan((b) => {
      b.point(0, 0)
    })
    replacePlan(imported)
    expect(plan()).toBe(imported)
    expect(temporal().pastStates).toHaveLength(0)
    expect(temporal().futureStates).toHaveLength(0)
  })

  it('caps history at 100 steps', () => {
    for (let i = 0; i < 130; i++) {
      usePlanStore.getState().setPlan((p) => addRoomLabel(p, `L${i}`, i, i))
    }
    expect(temporal().pastStates.length).toBeLessThanOrEqual(100)
  })
})
