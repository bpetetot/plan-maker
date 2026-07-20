# 01 — How do drawing tools distinguish contextual dimensions from permanent ones?

Type: research
Status: resolved

## Question

Placement dimensions are *contextual* measures — transient, tied to a gesture
or a selection — while wall Dimensions are *permanent* annotations of the
drawing. Our current rendering makes them indistinguishable. How do
established tools mark that difference visually?

Survey primary sources (product documentation, UI guidelines, official
screenshots/videos) for:

- **Floor-plan tools**: Sweet Home 3D, ArchiCAD, Revit, SketchUp (and its
  LayOut), Chief Architect — how an opening's placement clearances are shown
  while dragging it into a wall, versus the wall's own dimension string.
- **CAD**: AutoCAD dynamic input / dynamic dimensions — the styling
  convention for the live values that follow the cursor.
- **Vector/design tools**: Figma, Sketch, Illustrator smart guides and
  measurement overlays — how a measurement that exists only during a
  drag/selection is styled against the canvas.

For each, capture the concrete visual levers used, not just the fact that a
difference exists: position relative to the geometry (on the object, inside
the wall body, offset outward, at the cursor), line treatment (solid, dashed,
arrows, tick marks, or no line at all), color and contrast (accent color, an
inverted chip, muted grey), text treatment (weight, size, boxed/pill
background vs bare), and whether a permanent dimension is dimmed, hidden, or
left untouched while the contextual one is on screen.

Also note anything about **selection-persistent** measures — tools that keep
the contextual dimension on screen after the drag ends, while the element
stays selected, since that is our chosen trigger.

Deliver a findings file under `.scratch/placement-dims-ux/research/` that ends
with the visual levers most applicable to a simple SVG floor-plan editor for
private individuals — this feeds the prototype in ticket 02.

## Answer

Findings live in `.scratch/placement-dims-ux/research/contextual-dim-conventions.md`
on the throwaway branch **`research/placement-dim-conventions`** (commit
`d774bd8`) — 556 lines, sources graded by confidence. Gist:

**Sweet Home 3D is the primary source**: it is open source and ships this exact
feature. `PlanController.getDimensionLinesAlongWall()` builds precisely two
clearance dimensions (wall end → opening edge, each side) while a door or
window is magnetized to a wall. Its differentiators from its own permanent
dimension are readable in code, not inferred:

- painted in `selectionColor` where the permanent path uses `foregroundColor`
- text size pinned to screen pixels (`fontSize / scale`) — constant at any zoom
- offset is `objectDepth + 10/scale` — a screen-pixel clearance, not plan units
- the value is rounded to what the current zoom actually resolves
- a feedback dimension shorter than 0.01 is dropped, never drawn as zero

**Two findings that bear on decisions already made:**

1. **No tool surveyed hides or dims its permanent dimension** while a
   contextual one is on screen. The current hide-during-gesture workaround has
   no precedent anywhere in the survey — independent confirmation of this map's
   "they coexist" framing decision.
2. Color is the universal carrier (interaction accent vs drawing foreground).
   The contextual measure either abandons the dimension-line frame entirely
   (Archicad Tracker, AutoCAD dynamic input, SketchUp HUD, Figma) or keeps
   witness lines but recolors and boxes the value (Revit).

**Selection-persistent** display — this map's chosen trigger — is the minority
camp but a solid one: Revit, Chief Architect, Figma. Sweet Home 3D is
gesture-only (`deleteFeedback()` on mouse release), so it does not cover that
half of our trigger.

**Levers recommended for ticket 02** (the researcher's reading, not a verdict):
drop the dimension-line vocabulary entirely and draw the clearance *inside the
wall body on the axis* — the one position no other register occupies, removing
the collision by construction rather than by hiding; render the value as a
filled `--accent` chip with `--accent-contrast` text (the inverted-chip
convention shared by Figma, AutoCAD, Archicad and Revit) rather than reusing
the halo that `text.dim` already spends on the wall Dimension; pin the chip to
screen pixels; drop a clearance that rounds to zero.

**Explicitly warned against**: editable/focus/Tab styling (there is no input
model — a value that looks editable but is not is worse than plain text);
cursor-following tooltips (they break under a selection-persistent trigger); a
fixed HUD (loses the left/right spatial mapping the two values need); red
(reads as error or fire-safety in a floor plan).

**Caveats on source quality:**

- The widely-repeated "Revit temporary dimensions are blue" claim is *not* in
  Autodesk's own prose — their help pages describe behavior only. Marked
  secondary/moderate confidence in the findings file.
- Five domains hit the firewall's default-deny (`help.figma.com`,
  `help.sketchup.com`, `www.chiefarchitect.com`, `helpx.adobe.com`,
  `forums.autodesk.com`), verified as genuine policy blocks and listed in a
  dedicated section. Those tools rest on search snippets, marked `[S]`.
  The painful loss is Chief Architect KB-01110 — its title alone ("Controlling
  the Minimum Display Size of Temporary Dimensions and Labels") is strong
  evidence that small-zoom legibility is a real shipped problem, but the
  mechanism and default value were not readable. Worth a retry if that domain
  is allowed: nobody in the survey solved small-zoom legibility by pure
  scaling.

## Answer — second pass (corrections)

After the five blocked domains were allowed, a second pass read three of them
directly. Commit `0f8ad56` on the same branch; the findings file now opens with
a "Corrections from the second pass" section. What moved:

1. **Chief Architect answers the small-zoom question, and the answer is not
   scaling.** *Minimum Display Size* (Preferences > Appearance) is a **pixel
   floor**, set separately for Temporary Dimensions and for Labels; it "governs
   the on-screen size and does not affect printed or exported output" (set to 0
   for true printed scale). This upgrades the first pass's screen-pixel
   recommendation from an inference off Sweet Home 3D's code to a documented,
   shipped mechanism in a direct competitor — and changes its shape: a *floor*
   (text scales normally until it would fall below a threshold) avoids the
   "text stays huge while the plan shrinks" artefact that Sweet Home 3D's
   divide-by-scale produces.
2. **Correction to a first-pass claim.** "No tool surveyed hides or dims the
   other register" was too strong: Chief Architect X12 and prior withheld the
   temporary dimension when a manually drawn dimension already showed the same
   information. But it suppressed the **contextual** register in favour of the
   permanent one — the exact opposite of our workaround — and dropped the
   behavior after X12. The claim that matters for this map survives intact:
   **no tool hides its permanent dimension to make room for a contextual one.**
3. **Correction on Figma.** The first pass called it the closest trigger match
   to ours; it is not. Figma's measurement needs selection **plus** a held
   ⌥/Alt **plus** a hover target, and always involves a second object.
   **Revit and Chief Architect** are the real matches for selection-alone.
   Figma stays valuable for its visual register, not its trigger.
4. **Figma's pill styling is confirmed vendor-silent.** The help page describes
   only the red line and the measurements, and says nothing about label
   backgrounds or scaling — so "filled pill, white text" is positively
   confirmed as screenshot-inferred, not merely unverified.
5. **New — LayOut ships a fallback for this map's second fog patch.** When
   space is tight, "LayOut automatically moves the text away from the dimension
   and connects it with a leader line by default": a documented precedent for
   the leader-line escape when a clearance is too short to carry its label.
6. **Unconfirmed.** Whether SketchUp ever draws a live numeric value on canvas
   rather than only in the lower-right HUD — the page does not address it,
   flagged likely-but-unconfirmed rather than asserted.

**Sources still unreachable, for two different reasons** — neither is a sandbox
policy block any more:

- `helpx.adobe.com` — the allow worked, but every request times out at 60s or
  dies with HTTP/2 INTERNAL_ERROR (WebFetch, curl over both HTTP versions,
  browser UA all tried). Transport failure. Illustrator claims stay secondary.
- `forums.autodesk.com` — Cloudflare bot protection, i.e. vendor-side refusal
  of automated access; a human with a browser can still read it. It bore only
  on the Revit-blue question and is a forum post, so it would not have
  outranked Autodesk's own help pages either way. **The Revit "temporary
  dimensions are blue" claim stays at moderate confidence.**

Unchanged: Sweet Home 3D, Revit, AutoCAD/ACA and Archicad were primary-sourced
on the first pass and nothing about them moved.
