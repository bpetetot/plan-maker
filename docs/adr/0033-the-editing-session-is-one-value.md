# The editing session is one value

`Editor.tsx` held what the editor was doing as eleven `useState`s and three
refs, and every transition wrote some hand-picked subset of them: `switchTool`
five, `applyPlacement` five, the pointer-up branch three, the cancel ladder
three, the box's close four. `grabSpec` wrote one while reading four — a
function returning a drag spec whose side effect was the Selection. No module
answered "what is the editor doing right now?", so each rule was re-remembered
at its call site: that a Selection only exists under Select, that the Ruler
reveals the measures, that a Text placement spends its one shot on opening the
box, that the cancel ladder has three rungs in that order.

Two of the fourteen were not state at all. `marquee` duplicated the `drag` ref
field for field — the ref for a fresh read at pointer-up, the state for the
rect on screen — and the ref was *mutated* (`g.b = intent.at`) because a React
value would have read stale. `movingOpeningId` was a reading of the drag,
written by hand at three sites and cleared at two more.

We named it a **Session** (`CONTEXT.md`) and gave it one address:
`src/editor/session.ts`, eight fields and a pure reducer over an `Intent`.

```
reduce(session, Intent, SessionEnv)  →  SessionResult
```

The module is pure — no React, no DOM, no store. `SessionEnv` carries what a
transition reads of the outside world (the plan, the camera scale, the two
Preferences a gesture consults); `SessionResult` carries the next session plus
what the transition *declares*: the plan write and how it reaches the history,
the pointer capture, a `preventDefault`, the measures toggle, a pan. Nothing is
performed inside. `planDrag.ts` (ADR 0023), `placement.ts` (ADR 0025),
`inlineEdit.ts` and `pointer.ts` (ADR 0030) are unchanged: they became the
reducer's internals, and the rules that used to sit *between* them now sit in
it. `Editor.tsx` keeps the render, the event forwarding, and the application of
what a transition declared.

ADR 0030 rejected routing `enter`/`leave`, `contextmenu` and Escape through the
pointer router, on the grounds that they act on the Placement and the Tool
rather than on the pointer stream. That holds: they are Intents of the Session,
which is what they were always acting on. The router keeps the stream and only
the stream, and its union is now named `PointerIntent` — one of the shapes an
Intent takes.

`useSession.ts` is the one React binding: `useState` for the value, a mirror ref
holding it *as of the last transition*, and the `OpenEdit` handle. The `Editor`
owns that ref and hands it in, because the camera needs it too — `useView`'s
wheel listener asks whether a Pan is under way, and it asks before any render
of the down that started one has landed. The
handle cannot be born in a pure function, so the reducer names the moment
instead — `open`, `aim`, `land`, `commit` — and the hook holds the handle,
which still ends with the drag (ADR 0028). `open` is a transition of its own
rather than a lazy first write, because `beginEdit()` takes the pre-drag
snapshot at grab time and its `snapshot === plan` guard is what makes a
click-without-motion free in the history.

## Considered Options

- **`useReducer`** — rejected: it wants the reducer's return to *be* the state,
  so declared effects would have to be drained in a `useEffect`, a frame after
  the handler. `setPointerCapture` and `preventDefault` are only valid inside
  the handler that received the event, and a drag's `aim` one frame late is a
  drag that trails the pointer.
- **A zustand store for the session**, like `planStore` — rejected: `getState()`
  is always fresh, which is the one thing the mirror ref is for, but the value
  would live at module scope and outlive the component. None of the 40 editor
  test files reset it, so a session would leak from one test into the next; the
  failure would surface far from its cause.
- **An impure `useSession` calling the store directly**, the reducer computing
  only the value — rejected: it puts the rules back where they cannot be
  asserted without a browser. The declared-effect result is what lets
  `session.test.ts` state "a grab opens an Edit", "an empty Selection writes
  nothing", "an unchanged re-edit writes nothing" in node.
- **One module, `session.ts`, hook included** (as the review had it) — rejected:
  the module that holds every rule is the one that must stay assertable without
  React. The hook is 60 lines and follows `useView.ts`, the convention already
  in place.
- **A Session holding the plan** — rejected: it reopens ADR 0022. The plan has
  one write path, and a Placement already carries no plan (ADR 0025). The env
  reads it from the store at every send, which is *stronger* than what the
  component had: the stale-closure guard the double-click and the box's commit
  each carried by hand is now structural.

## Consequences

- **Fourteen states become eight fields**, across this ADR's change and the one
  that unified the editing box before it. Three refs become one, whose job is
  nameable: the session as of the last transition, which the wheel handler
  needs for the pan phase and a second send in one handler needs for the first
  one's result. No value is mutated in place any more.
- The three hovers become one `hover`, because the hit test names one thing at a
  time. The "only clear it if it is still me" guard, which existed because
  `enter`/`leave` are not ordered, is written once. The rule that a pointermove
  owns the room tint while the grab zones own theirs is now explicit — it used
  to be an accident of the states being separate.
- A transition that changes nothing returns **the same session**, so hovering
  empty space still costs no render — what `setHoverRoom(null)`'s bail-out did
  by luck, the reducer does by rule.
- `movingOpeningId` and `marquee` are gone as *state*: what replaces them is a
  reading each, `movingOpeningId(s)` and the rect drawn off `s.drag`.
- The rules have one address each: the cancel ladder, the one-shot, "a Selection
  only exists under Select", "the Ruler reveals the measures", "the box hands
  the Text tool back whatever it returns".
- **No behaviour changed** — every editor test file passes untouched, which is
  what the refactor was verified against. `session.test.ts` adds the policy in
  node, mirroring what `pointer.test.ts` does for the stream, and it is where
  the two states no user path reaches are pinned: a label box open under the
  Text tool, and a grab on a target that has nothing to edit.
- `Editor.tsx` drops from 969 to 580 lines, of which 277 are JSX. The review's
  "~350" is not reachable this way: what is left is the render, the forwarding,
  and the readings the render needs. Extracting the toolbar is a separate
  chantier, not this one.
