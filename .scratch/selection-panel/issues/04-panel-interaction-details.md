# 04 — Panel interaction details

Type: grilling
Status: resolved

## Question

The panel's form is fixed ([01 — Panel prototype](01-panel-prototype.md):
floating card below the burger menu). Pin down the interaction details the
spec must state:

- Keyboard focus and tab order: does selecting an element move focus into
  the panel? What does Tab cycle through? Do Delete/Escape keep their canvas
  meaning while a panel control is focused?
- Behavior while a canvas drag is in progress: do the wall measures update
  live during a point/group drag? Is the panel interactive, inert, or hidden
  mid-drag?
- Show/hide behavior: instant or animated (fade/slide) on selection
  change/clear?
- Short viewports: what happens when the card is taller than the space above
  the bottom-left controls (scroll inside the card, overlap, clamp)?

## Answer

Grilled with the human (2026-07-19), confirmed recap:

- **Keyboard focus**: selecting an element never moves focus into the panel
  — focus stays with the canvas. Tab reaches the panel's controls in natural
  DOM order (top to bottom), no focus trap. While a panel control is
  focused, the existing `isTypingTarget` rule (`src/editor/Editor.tsx`)
  keeps suspending the canvas shortcuts (Delete, Escape, 1-4) — unchanged.
- **During a canvas drag** (wall point, group, opening): the panel stays
  visible and its values update live, same truth as the canvas Dimensions.
  No dimmed/inert/hidden state. (The SVG captures the pointer mid-drag, so
  the panel cannot intercept the gesture anyway.)
- **Show/hide**: instant — no fade, no slide. Content also switches
  instantly when the selection changes type.
- **Short viewports**: the card's height is capped to the space between its
  anchor (top 72px) and the bottom-left controls zone, with internal
  vertical scroll beyond (`max-height` + `overflow-y: auto`) — overlap is
  impossible by construction. Worst-case content (door) is ~300px, so the
  cap rarely bites.

Rejected: auto-focus on the first control (steals Delete/Escape from the
canvas), a dedicated jump-to-panel shortcut (engineering without a proven
need), dimming/hiding during drags, entry animations, accepted overlap on
short screens.
