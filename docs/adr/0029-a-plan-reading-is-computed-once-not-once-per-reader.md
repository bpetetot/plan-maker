# A Plan reading is computed once, not once per reader

Four functions are readings of the **Plan alone** — give them a plan, they owe
you a value, and nothing else enters. All four were recomputed by whoever
happened to need them:

- `detectRooms` — four consumers (`Editor`, `ToolPanel`, `PlanScene`, the PNG
  export), each memoizing for itself or not at all. Worse, a pointermove of a
  group drag walked the wall graph **four** times: once for the render, twice
  inside `reconcileRoomLabels(orig, plan)`, once inside `translateElements`.
- `junctionPatches` — recomputed on every render of the sheet, in both adapters.
- `wallIdByPair` (private, `rooms.ts`) — a table of the whole plan, rebuilt
  **per room tested** by `selectedRoom` and `roomDeletion`.
- `wallByEdge` (private, `faces.ts`) — the same shape, rebuilt **per room and
  per hole loop** inside `detectRooms` itself.

The lever is that the plans repeat. `planDrag` aims against the same
`drag.orig` for the whole gesture, and `commitPlanDrag` settles against it
again; the store hands out one Plan object per edit and `equality` is already
reference identity. Keyed on that identity, the four traversals of a pointermove
become one.

`oncePerPlan(read)` in `model/types.ts` — beside `Plan` itself — wraps a reading
in a `WeakMap` on the plan. The four adopt it; not one signature changes, so no
caller had to be told.

- **The memo is the function, not a second door.** `detectRooms` keeps its name.
  A `planRooms` beside a still-eager `detectRooms` would have left a wrong door
  open, and nothing would have reported taking it.
- **The reading is shared, so it is sealed.** `detectRooms` and
  `junctionPatches` freeze the array they return. A consumer that sorted or
  filtered it in place used to bother nobody; now it would corrupt every later
  reader. The suite found the one such site on the first run
  (`rooms.test.ts`'s `byArea`), which is the argument for the guard.
- **`useMemo` on a plan reading is now noise.** The memo outlives a component's
  renders and crosses components; a hook-level cache of the same thing is
  strictly weaker. `Editor` lost two, and the `rooms` prop it pushed into
  `ToolPanel` and `PlanScene` is gone — `rooms` was never a parameter, it was a
  reading of the `plan` those two already held.

## Considered Options

- A `readPlan(plan) → PlanReading` module bundling rooms, blocks and labels, as
  the architecture review proposed — rejected. Only `detectRooms` is a function
  of the plan alone. `roomTextBlocks` takes a label list and `selectedRoom`
  takes a Selection, so neither fits a reading keyed on the plan; and the
  reconciled labels the review wanted in it are a function of `wallDrag.orig`,
  which is the editor's, not the plan's. The bundle would have had one honest
  member and two smuggled ones.
- Hoist the two private tables out of their loops instead of memoizing them —
  rejected: the loop is spread across public functions (`selectedRoom` calls
  `roomWallIds` per room, `roomDeletion` calls `roomOutlineWallIds` per room).
  Hoisting meant threading a table through those signatures, which is raising an
  implementation detail into the interface to save a cache.
- Freeze generically inside `oncePerPlan` — rejected: `Object.freeze` does not
  stop `Map.set`, so it would have been a lie for the two table readings. The
  freeze lives where the shape is known. Those two tables are module-private and
  out of a caller's reach anyway.
- Return a copy per call, keeping every reading private to its caller —
  rejected: it buys back the mutation freedom nobody used and gives up the
  shared identity that lets `PlanScene` and `ToolPanel` read instead of receive.
- Type the readings `readonly Room[]` and let the compiler carry it — not taken
  here. It would widen six model signatures for a hazard the runtime freeze
  already catches, in a codebase where invariants are held by a sentence at the
  right address.

## Consequences

- The existing suite passed with a single edit — `rooms.test.ts`'s `byArea`,
  caught by the freeze sorting a shared reading — which is the whole claim: same
  behaviour, computed once. The tests added assert the law at its address
  (`types.test.ts`) and the seal where it is applied.
- A reading handed back is shared. Copy before sorting, filtering in place, or
  otherwise writing to it — the arrays throw, the `Room` objects and the two
  `Map`s do not.
- Transient plans feed the cache — `reconcileRoomLabels` builds one per render
  during a drag — and are collected with them. A `WeakMap` retains nothing the
  plan does not.
- `overlayLabels` in `Editor` keeps its `useMemo`. It reconciles against
  `wallDrag.orig`, so it is not a reading of the plan and this decision does not
  reach it.
