// CONTEXT.md: Room label
import { describe, expect, it } from 'vitest'
import { detectRooms } from '../model/rooms'
import type { Plan, RoomLabel } from '../model/types'
import type { PlanBuilder } from '../model/testHelpers'
import { buildPlan } from '../model/testHelpers'
import { roomTextBlocks } from './render'

// 4×4 m square room, axis (0,0)-(400,400): centroid (200,200).
const square = (build: (b: PlanBuilder) => void) =>
  buildPlan((b) => {
    const p1 = b.point(0, 0)
    const p2 = b.point(400, 0)
    const p3 = b.point(400, 400)
    const p4 = b.point(0, 400)
    b.wall(p1, p2)
    b.wall(p2, p3)
    b.wall(p3, p4)
    b.wall(p4, p1)
    build(b)
  })

const blocksOf = (plan: Plan) => roomTextBlocks(detectRooms(plan), Object.values(plan.roomLabels))

describe('roomTextBlocks', () => {
  it('renders a default-placement label at the room centroid, not its anchor', () => {
    let label!: RoomLabel
    const plan = square((b) => {
      label = b.label('Kitchen', 350, 120)
    })
    const blocks = blocksOf(plan)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ x: 200, y: 200, labels: [label], area: 390 * 390 })
  })

  it('renders a custom placement where it was dragged', () => {
    let label!: RoomLabel
    const plan = square((b) => {
      label = b.label('Kitchen', 350, 120, true)
    })
    const blocks = blocksOf(plan)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ x: 350, y: 120, labels: [label], area: 390 * 390 })
  })

  it('shows the area alone at the centroid of an unlabeled room', () => {
    const plan = square(() => {})
    const blocks = blocksOf(plan)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ x: 200, y: 200, labels: [], area: 390 * 390 })
  })

  it('defensively renders an orphan label at its anchor, name only', () => {
    let orphan!: RoomLabel
    const plan = square((b) => {
      orphan = b.label('Lost', 900, 900)
    })
    const blocks = blocksOf(plan)
    const block = blocks.find((b) => b.x === 900)!
    expect(block).toMatchObject({ y: 900, labels: [orphan] })
    expect(block.area).toBeUndefined()
    expect(block.room).toBeUndefined()
  })
})
