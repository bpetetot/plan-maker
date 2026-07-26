# The Debug mode draws what the gesture computed

Some rules of the editor are only ever visible through their result. The Axis
lock is the extreme case: ADR 0034 gave it no chrome at all, on purpose, so the
one way to see which of a junction's two lines won — or whether the origin
really stayed at the grab — is to read the plan afterwards and infer backwards.

So there is a **Debug mode**: a Preference, off by default, that turns on views
meant for whoever builds the editor rather than whoever draws with it. It ships
with exactly one, the Axis lock's line, drawn over the sheet as a dashed
one-pixel hairline in the snap ink.

## It draws the value, it does not re-derive it

The gesture **keeps the line it resolved** — `PlanDrag` and the two locking
`Placement` variants each carry the `AxisLock | null` their last aim produced —
and the mode draws that. Unconditionally: the field is filled whether the mode
is on or off, because a reducer that branched on a Preference would make the
value it stores depend on who is watching.

This is the whole point. A debug view whose job is to reveal a disagreement
cannot be computed by a second reader, or it will disagree in exactly the cases
where the first one is right. The alternative — exposing `origin` and `axes` and
calling `axisLock()` again at the render — also needs Shift tracked in a hook,
which ADR 0007 and ADR 0034 both forbid, and which would break the
down → up → down round trip the lock is specified by.

A click resets the stored line to null: it moves the anchor, so what the aim
resolved ran through the previous one.

## It does not reopen ADR 0034's chrome

ADR 0034 rejected a guide line for the Axis lock after a bench at 1:1 — a
bounded one is the rubber band, a full one hides under the axis-aligned wall it
constrains, and a marker would lie where an invariant takes the result off the
axis. All three still hold **for the user**, and production draws nothing. What
changes is that a developer can ask. The full line is the right shape here for
the very reason it was the wrong one there: it says where the axis goes beyond
the cursor and behind the origin, which is what one wants to see when the
question is "why did it land there". It is drawn over the sheet and over every
piece of chrome, so the wall it holds straight cannot hide it.

## Considered Options

- **A build-time gate** (`import.meta.env.DEV`), so the mode never reaches the
  production bundle. Rejected: it makes the one situation where a bug is hard to
  reproduce — a deployed build, a phone — the one situation with no instrument.
  A Preference off by default costs a menu entry and a `null` field.
- **A side channel**: the aim functions push the resolved lock into a debug store
  when the mode is on. Rejected: `planDrag.ts` and `placement.ts` declare
  themselves free of React and of any store, and that is what makes a gesture a
  value one can test without a DOM (ADR 0023, ADR 0025). A field on the value
  costs nothing and breaks no header.
- **A registry of debug layers**, named and toggled one by one. Rejected as
  interface without a caller: there is one view. The second one adds itself
  where this one plugs in, and the shape of the container will be knowable then.
- **A permanent on-screen badge** while the mode is on. Rejected: the menu entry
  carries its own state, and the mode is worn for a gesture, not for a session.

## Consequences

- The Preference table gains a fourth entry (ADR 0026), so `Preferences` is no
  longer three fields; anything that enumerates the whole record is a compile
  error until it names the new one, which is what the listed `loadAll` is for.
- `gestureLock()` joins `movingOpeningId()` and `reshapingDrag()` as a reader on
  the Session: the render asks one question and does not learn the shape of a
  drag or of a placement to get its answer.
- A gesture that locks nothing — an Opening or a Dimension plate, both riding a
  Rail — stores no line, so the mode is silent on it rather than drawing an axis
  that constrains nothing.
- Releasing Shift clears the stored line at the next aim, not at the keystroke.
  The drawn line is therefore stale between the two, in exactly the way the lock
  itself is (ADR 0034): pressing or releasing Shift without moving changes
  nothing until the next `pointermove`.
