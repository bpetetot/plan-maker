# A room selection is a reading of the wall selection

Clicking a Room puts its boundary Walls in the Selection. The Room itself never
enters it. Everything downstream — the Tool panel's title and area, the tint on
the sheet — is *derived* on render from the question "does this Selection hold
exactly the boundary of a detected Room?". A marquee that captures those same
walls therefore reads as that room too, and is treated identically. There is no
hidden mode, and no second notion of "what I am acting on".

Openings do not break the reading, as long as they belong to those walls. A
marquee over a room sweeps up its doors, and a door has no position of its own:
it follows its wall through every move and dies with it under Delete. A
selection of the room's walls plus some of their openings is behaviourally the
same selection, so it reads as the same room — otherwise the promise above
would fail for every room that has a door, which is every real room.

Clicking a room therefore takes those openings too. The tolerance above made
the two paths read alike; taking the openings makes them *be* alike, down to
the set of refs — and the click stops leaving a room's doors unlit while a
Delete carries them off. The reading stays tolerant all the same: the openings
still do not vote, so a Shift-click that puts one out leaves the room a room.
A door in a party wall is taken by both rooms it separates: it pierces the
whole thickness and has no side, and Delete already treats it that way.

Identity is what settles it. A Room is detected, never stored: it has no id,
only its loop of Points, and that loop changes under the plan's ordinary edits —
a planar insertion (ADR 0002) adds a corner, a coincident merge (ADR 0003)
removes one. A `{ type: 'room' }` entry in the Selection would therefore need
reconciling after every wall change, which is the exact cost already paid once
for Room labels — and paid there only because a label *is* stored and has
nowhere else to live. A reading has nothing to reconcile: it is recomputed from
the walls, which do have ids, and it is right by construction on every frame.

The boundary a room reads from includes its hole loops. An island's footprint —
floor and walls — is part of what defines the containing room, since it is what
punches the hole and what its area subtracts. A room that moved without its
island would sweep its own walls across standing geometry, and planarize would
shred both.

## Considered Options

- **A `{ type: 'room' }` ElementRef.** Rejected: it buys a first-class room in
  the Selection at the price of a stable identity that a derived object does not
  have. Every wall edit would need a reconciliation pass whose only sane failure
  mode is dropping the selection — so the feature would be least reliable
  exactly while the user is editing.
- **A `selRoom` state beside the Selection.** Rejected: the glossary's Selection
  would stay untouched, but the editor would carry two notions of "what I am
  acting on", and every consumer — Delete, Escape, the hotkey registry, the
  panel — would have to ask which of the two is live. Two states that are always
  mutually exclusive are one state, badly spelled.
- **Excluding island walls from the boundary.** Rejected: it keeps Delete
  narrow, but makes the move — the gesture the feature exists for — produce a
  broken plan. The delete breadth is visible before the key is pressed; the
  geometric damage is not.

## Consequences

- `roomWallIds` walks `room.holeLoops` as well as `room.pointIds`, so it is
  also what decides whether a group move translates a Room label rigidly: a
  holed room now needs its island selected for that, which is the same
  condition as moving the room whole.
- Delete has no room-specific rule. What is highlighted is what goes, island
  and party walls included — the contract of a sugar, and the only way the two
  paths to the same Selection can behave identically.
- The room text block follows the Dimension label's contract: a drag moves it,
  a click selects the room it belongs to. Both are handles, neither is an
  element, and neither is ever in the Selection.
- Clicking inside a room no longer clears the Selection. Escape and a click
  outside every room remain.
- The tint is editor chrome, not drawing (ADR 0005): it is drawn under the
  walls, takes no pointer events, and the export never sees it. It follows the
  browser's own hit test rather than the room under the pointer, so it promises
  only what a click would actually take — a grab zone outranks the room, the
  block the room is clicked by does not.
- Because the reading is a state, the Tool panel's facets follow it wherever it
  lands: a marquee that reads as a room offers no grouped Thickness either.
  Two paths to one Selection cannot offer different powers.
- A room's openings are in the Selection, so each shows its Placement
  dimensions: selecting a room with four doors posts eight clearance chips at
  once. The rule has no cardinality threshold and gains none here — the
  fallback, if this ever reads as noise, is for a Room reading to silence them,
  which is a refinement of the rule and not a retreat from this decision.
- The group grab is blind to type, so a drag started on a door of a selected
  room translates the room, exactly as a drag on one of its walls does. A click
  without travel still demotes the Selection to that door, which is how the
  door is reached in one gesture more.
- The Tool panel counts the room's Doors and Windows. The count is read from
  the room, not from the refs, so it states what the Delete below it takes even
  after a Shift-click has unlit one of them.
