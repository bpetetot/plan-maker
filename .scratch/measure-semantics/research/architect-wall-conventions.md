# Wall reference lines and dimensioning in established floor-plan tools

Researched 2026-07-19: how professional CAD/BIM tools (Revit, ArchiCAD, AutoCAD
Architecture) and consumer floor-plan tools (Sweet Home 3D, magicplan,
RoomSketcher, Floorplanner) anchor walls with thickness, what a wall dimension
measures, how live dimensions behave while chaining walls, and how door/window
openings are dimensioned — plus drafting-standard conventions (ISO/DIN/NF/US).

> **Verification caveat.** Direct fetching of web pages was blocked by this
> sandbox's network policy (all `WebFetch`/`curl` requests returned
> "Blocked by network policy … default deny"), so official pages could not be
> read in full. Every claim below comes from WebSearch result excerpts that
> quote the cited official page (search restricted to the official domain
> where noted). Claims that could not be tied to an official excerpt are
> explicitly marked **[inferred]** or **[secondary source]**.

## 1. Drawing anchor / reference line

### Revit — "Location Line"

- A wall's **Location Line** property "specifies which of its vertical planes
  is used to position the wall in relation to the path you sketch." Documented
  options quoted from Autodesk help: **Wall Centerline, Core Centerline,
  Finish Face: Exterior, Finish Face: Interior** ("core" = the wall's main
  structural layer; for a simple wall, Wall Centerline and Core Centerline
  coincide). Source: *About the Wall Location Line* (help.autodesk.com /
  knowledge.autodesk.com, multiple versions).
  **[inferred]** The full option list also includes Core Face: Exterior and
  Core Face: Interior (six options); the search excerpt listed only four, so
  the last two were not directly verified.
- **The location line persists after placement**, "even if you modify the
  structure of its type or change to a different type" — i.e. changing wall
  type/thickness keeps the anchored plane fixed and grows the wall around it.
- Changing the Location Line value of an existing wall does **not** move the
  wall; but the location line is the **axis around which the wall flips**
  (Spacebar / flip control for interior/exterior orientation).
- Selectable before placement (Options Bar) or after (Properties palette);
  useful "when laying out compound walls that join … place them precisely with
  respect to a particular material layer of interest."

### ArchiCAD — "Reference Line"

- A basic wall has **three possible reference lines: outside face, center,
  inside face**; the **default is the outside face**. A composite wall has
  **six**: outside/center/inside of the wall, plus outside/center/inside of
  the **core**. Source: *Wall Reference Line* (help.graphisoft.com, AC 27).
- An **offset** can push the reference line off those planes: with an
  outside/inside reference line, a positive offset moves it toward the center
  (or core center), negative away from it.
- Changing the reference line position **moves the wall body laterally while
  the reference line stays in place**; a separate command (*Modify Wall
  Reference Line*) moves the line while keeping the wall's position (and can
  mirror openings). Sources: *Modify Wall Reference Line* (help.graphisoft.com
  AC 24), support.graphisoft.com.
- Junctions are governed by the reference line: walls connect "if two or more
  walls meet with their reference lines intersecting", with **Junction Order**
  controlling which walls meet first; face cleanup on top of that is handled
  by building-material intersection priorities. Sources: Graphisoft support
  articles on wall intersections (support.graphisoft.com); details partly from
  Graphisoft community pages **[secondary source]**.

### AutoCAD Architecture — "Justification" and the baseline

- Wall justification has four options: **Left, Right, Center, Baseline**.
  While drawing, `J` (command line) or Ctrl cycles justification; after
  placement, *Edit Justification* shows grips for the four options. Sources:
  *To Change the Wall Justification*, *About Wall Justification Lines and
  Cleanup Circles* (help.autodesk.com).
- The **baseline** is the wall's graph line used for cleanup and endpoint
  geometry. Documented practice (Autodesk community/blog **[secondary
  source]**): put the baseline at the exterior face of the main structural
  component (face of stud / face of CMU) for exterior walls, and center
  justification for interior walls so you don't have to pick the correct side
  while drawing.

### Sweet Home 3D

- Walls are anchored on their **centerline**: "the start and end points of the
  wall are always in the middle of the wall", so entering a measured room
  length as the distance between end points makes the room 2 × ½-wall-thickness
  smaller than intended. Source: SourceForge feature request #1098
  ("Possibility to input wall length as measured in room") on the official
  project tracker — **[secondary source]** (project tracker, not the user
  guide; the user guide itself describes drawing walls with a tooltip and
  entering length + angle, and a wall dialog that edits thickness and the
  colors/textures of the **left and right sides**, consistent with a
  centerline anchor). Sources: sweethome3d.com/users-guide/, forum threads
  "Set walls by interior dimensions?", "Length of a wall".
- Multiple forum threads ask for interior-dimension input and for choosing
  which side thickness grows toward — i.e. thickness is split around the
  centerline and users notice the interior-dimension mismatch.
  **[secondary source]** (official forum).

### magicplan

- Wall thickness is **not per-wall**: you set one **interior** and one
  **exterior** wall thickness per floor ("It is not possible to change the
  thickness of individual walls"). Source: *Change Exterior and Interior Wall
  Thickness* (help.magicplan.app).
- Rooms are captured/drawn as room shapes and assembled into a floor plan;
  individual wall measurements are shown on the wall (tap the blue value to
  edit, or drag walls). Sources: *Change the Wall Dimensions of Your Floor
  Plan*, *Assemble Your Rooms to Create a Floor Plan* (help.magicplan.app).
  The anchor semantics (which face the tapped measurement edits) are not
  documented in the excerpts found — **not verified**.

### RoomSketcher

- Measurement features distinguish **inside wall lengths** and **outside
  measurements** explicitly: "accurately show the length of any wall, on the
  inside or outside of your floor plan"; interior measurements are "the
  distance between the inner surfaces of walls in a room", exterior
  measurements "the building's total outline, including wall thickness."
  Source: roomsketcher.com *Measurements* feature page and blog *The 7
  Measurement Types in RoomSketcher* (official site).
- When entering exact numbers, "you can type an exact wall length for the
  **inside or outside edge** of the wall" — the user chooses the reference
  edge rather than the tool imposing one. Source: roomsketcher.com blog/help
  content (official site). The internal drawing anchor (centerline vs face)
  is not documented in the excerpts found — **not verified**.

### Floorplanner

- Per-wall settings expose **Thickness**, Wall Height, Raise from floor, and
  **"Move the wall across axis"** (i.e. the wall body can be shifted relative
  to its drawn axis — an axis-anchored model with an offset escape hatch).
  Source: *How to enter the exact measurements of a wall* (help.floorplanner.com,
  article 8437038).
- To set an exact length "edit the **interior wall dimension** … and select
  from the **tabs above the dimension** to direct placement of the new
  configuration" — i.e. the editable value is an interior measurement and the
  user chooses which end/side absorbs the change. Source: same help article.

## 2. What a wall dimension measures

- **Revit** — both permanent and temporary dimensions have an explicit,
  user-chosen wall reference: **Wall centerlines / Wall faces / Center of
  core / Faces of core**. For aligned dimensions, "if you select wall
  centerlines, the cursor first snaps to the centerline"; Tab cycles through
  the other references. So the value is never implicitly side-dependent — the
  reference plane is a setting, and either face can be dimensioned
  deliberately. Sources: *Add an Aligned Dimension*, *Specify Temporary
  Dimension Settings* (knowledge.autodesk.com / help.autodesk.com).
- **ArchiCAD** — the dimension tool attaches to points controlled by
  *Dimension Details* checkboxes: **Outer Faces, Core Faces, Reference
  lines**. Automatic Interior/Exterior Dimensioning places dimension points
  "at the faces and/or reference lines depending on the options checked",
  with a "dimension core only" option. A single click on a wall dimensions
  its **thickness** (optionally core-only). Sources: *Linear Dimension Tool
  Settings*, *Automatic Interior Dimensioning*, *Dimensioning Wall or Slab
  Thickness* (help.graphisoft.com); support.graphisoft.com articles
  "Why does the dimension tool measure only the wall thickness?",
  "Dimensions automatically include core skins of walls".
- **AutoCAD Architecture** — the wall's **Length property is the distance
  between the start point and endpoint** (the baseline grips), independent of
  how faces clean up. Source: *About Wall Lengths* / *About Wall Length
  Property* (help.autodesk.com).
- **Consumer tools** — none of them dimension "a face of one wall" as such;
  they present **room-oriented values**: RoomSketcher shows inside wall
  lengths, outside (overall) measurements, and room dimensions as separate
  togglable measurement types; Floorplanner edits the interior wall
  dimension; magicplan shows one measurement per wall segment (reference not
  documented); Sweet Home 3D's wall length is the centerline
  (endpoint-to-endpoint) distance.

## 3. Live-dimension stability while chaining walls

- **AutoCAD Architecture is explicit that faces are unstable and the baseline
  is the truth**: "the 'true' length of the wall is the distance between the
  2 end grips. The wall can appear to have a different length when it cleans
  up with other walls; the difference can be twice the cleanup-circle radius
  longer or shorter than the 'true' length." The Length property always
  returns the baseline distance. Source: *About Wall Lengths*
  (help.autodesk.com). This is the clearest primary-source statement of the
  exact problem Plan Maker has: face lengths shorten/lengthen at cleanups, so
  the tool measures the justification line, which is junction-invariant.
- **Revit** — while drawing, bold **listening dimensions** "interactively
  change as the cursor is moved after the first click" and accept typed
  values; they measure along the path being sketched, i.e. the location line
  **[inferred from the definition of the Location Line as the sketched
  path]**. After placement, temporary dimensions re-appear per the Temporary
  Dimension Settings references (centerlines by default in practice —
  **[inferred]**, the default value was not verifiable from excerpts).
  Because the location line "persists even if you modify the structure of its
  type", joins/type changes do not re-anchor it. Sources: *Specify Temporary
  Dimension Settings*, *About the Wall Location Line* (Autodesk); listening-
  dimension description from Revit training material **[secondary source]**.
- **ArchiCAD** — walls join when their **reference lines** intersect; the
  reference line "stays in place" while the wall body moves/cleans up around
  it. Numeric input while drawing (tracker) applies to the reference line
  being drawn **[inferred — not directly verified from an official excerpt]**.
  Sources: *Wall Reference Line*, *Modify Wall Reference Line*
  (help.graphisoft.com); support.graphisoft.com intersection articles.
- **Net pattern across all three professional tools**: the drawn/edited
  length lives on the reference line (location line / reference line /
  baseline), which is unaffected by miters and cleanups; **faces are derived
  display geometry**. Dimensions of faces exist, but only as deliberately
  placed annotations, not as the live drawing feedback.

## 4. Dimensioning openings

### Tool behavior

- **Revit** — *Temporary Dimension Properties* (Manage > Additional Settings >
  Temporary Dimensions) sets, independently of the wall reference: doors and
  windows measured from **Centerlines** or from **Openings** (the opening
  edges). Walls: centerlines / faces / center of core / faces of core.
  Source: *Specify Temporary Dimension Settings* (knowledge.autodesk.com,
  2018–2022). So when you place/move a door, the flanking temporary
  dimensions run from the chosen wall reference to the door's centerline or
  to its near opening edge, per setting.
- **ArchiCAD** — Automatic Exterior Dimensioning includes openings in the
  generated dimension chains, and dimension details control faces / core
  faces / reference lines; specific opening-reference options (edge vs
  center) were **not verifiable** from the excerpts found. Sources:
  *Automatic Exterior Dimensioning* (help.graphisoft.com AC 18),
  *Automatic Interior Dimensioning* (AC 27).
- **magicplan** — doors/windows are "wall objects" that cut through the wall;
  positioning is done by dragging in 2D or in **elevation view**, and by
  tapping the visible dimension next to the object to type/laser a value.
  Which reference that dimension uses is not documented in the excerpts —
  **not verified**. Source: help.magicplan.app (*Add Objects*, *Elevation
  view* articles).

### Drafting standards and conventions

- **US practice (frame vs masonry)** — wood-frame buildings are dimensioned
  "from the face of the exterior stud to the **center of openings** to the
  center of the interior stud"; masonry buildings "are dimensioned to their
  **edges**", including openings, and "if a window or door is located within
  a masonry wall, dimension to the **rough opening**, as masonry walls are
  not forgiving of dimension errors." Sources: JCCC drafting-course blog
  (Lydia Sloan Cline, *Architectural Dimensioning*) and EVstudio
  *Dimensioning 101* — **[secondary sources: instructor course material and
  an architecture firm's published guide; consistent with each other]**.
- **German practice (DIN 1356)** — openings in plan carry **width above the
  dimension line and height below it** (e.g. 0.90 over 1.20 = 90 cm wide,
  120 cm high), plus the sill/parapet height as **BRH** in cm (e.g. "BRH 80",
  measured from top of finished floor to underside of the window opening).
  Sources: DIN 1356-1 summaries and German drafting course PDFs
  (HS Ruhr West course PDF of DIN 1356-1, uni-hamburg *Bauzeichnen* script,
  baunormenlexikon.de) — **[the standard itself is paywalled; conventions
  verified from course material quoting it]**.
- **French practice (NF P02-001 / NF P02-005)** — construction-drawing
  dimensioning is governed by NF P02-001 (1985) and NF P02-005 (1986).
  Convention: exterior dimension chains give **widths of the baies (openings)
  and the wall lengths between them**; vertical opening data is given as
  **allège (Al., sill height), baie height, and lintel-to-ceiling**; sections
  must pass through the baies to allow their dimensioning. Sources: French
  technical-education course PDFs (stigenervilliers.free.fr *Cotations des
  dessins d'archi*, ecolelamache.org *Cours Dessins d'architecture*,
  abc-maconnerie.com) — **[secondary sources: vocational course material]**.
- **ISO** — ISO 129-1:2018 gives only general dimensioning principles for all
  technical drawings; it explicitly delegates construction-specific rules to
  **ISO 6284** (construction documentation, indication of limit deviations,
  latest 2023). Neither standard's full text was accessible; no
  opening-specific rule could be verified from ISO sources directly.
  Sources: iso.org catalog pages for ISO 129-1:2018 and ISO 6284.

## Implications for Plan Maker

Plan Maker's motto is *simplicity beats precision* and the audience is private
individuals. The findings map to its four open questions as follows — options,
not decisions:

### Anchor (currently: centerline, thickness split half/half)

- Every professional tool anchors on a configurable reference line, but the
  **defaults differ**: Revit defaults to the wall centerline, ArchiCAD to the
  outside face, ACA practice favors baseline-at-structure for exterior and
  center for interior walls. Consumer tools that document it (Sweet Home 3D,
  Floorplanner's axis) use the **centerline** with no configuration.
- Options:
  - **Keep centerline-only** (Sweet Home 3D model): simplest mental model,
    matches current code, junction-friendly. Cost: users who measure a real
    room (interior faces) can't enter that number directly — the most common
    consumer complaint found (Sweet Home 3D forum, Floorplanner solves it by
    letting you edit the interior dimension).
  - **Configurable reference line** (Revit/ArchiCAD model): professional
    power, real complexity in UI, junctions, and flipping semantics. Likely
    overkill for the audience.
  - **Centerline anchor + face-referenced numeric entry** (RoomSketcher/
    Floorplanner pattern): keep the axis as the geometry anchor, but let the
    user type an inside-edge (or outside-edge) value that the tool converts.
    Middle ground with no change to the data model.

### What a wall dimension shows (currently: the face on the dimension's side)

- Professional tools never make the value implicitly side-dependent: the
  reference (centerline / face / core) is an explicit, named choice, and ACA's
  canonical Length is the baseline distance. Consumer tools show
  **room-meaningful values** (inside lengths, outside overall) as distinct
  labeled measurement types, not "whichever face you happen to be near".
- Options:
  - **Measure the axis** (junction-invariant, matches Sweet Home 3D/ACA
    Length): one value per wall, stable, but equals neither face — may
    confuse a user checking with a tape measure inside a room.
  - **Keep face measurement but label/segment it per room** (RoomSketcher
    "inside wall length"): side-dependence becomes a feature ("this room's
    wall is 3.42 m") instead of an inconsistency — but requires accepting
    that the two sides differ, and values still shift at junctions.
  - **Offer both as distinct dimension kinds** (inside length vs overall/axis)
    the way RoomSketcher exposes measurement types — more UI, clearer
    semantics.

### Stability while chaining (currently: values jump as miters form)

- This is a solved problem in professional tools by construction: the drawn
  and displayed length is the reference-line length, which junctions cannot
  change (explicitly documented for ACA: face length can differ from true
  length by up to twice the cleanup radius). Faces are derived geometry.
- Options:
  - **Live/placement dimensions measure the axis** while drawing/chaining
    (professional pattern): typed values and displayed feedback never jump;
    persisted face dimensions can remain face-based if desired.
  - **Freeze face dimensions of already-placed walls during a chain** and
    re-evaluate on commit: keeps face semantics but hides the jump; more
    special-case logic.
  - **Accept the jump** (status quo): honest geometry, worst perceived
    stability.

### Opening placement dimensions (currently: wall-end face → near opening edge)

- Revit makes both references configurable: wall side (centerline/faces) and
  opening side (centerline vs opening edges). Drafting practice splits by
  construction type: **center of opening** (US wood frame) vs **edges of
  opening / rough opening** (masonry, and the French/German chains which
  dimension baie widths edge-to-edge, with height and sill given as
  width-over-height + BRH/allège annotations).
- For a consumer tool the observable, tape-measurable references are the
  **opening edges and the finished wall faces/corners of the room** — which
  is what French/German masonry convention effectively dimensions in plan.
  Options:
  - **Near edge of opening ← → inside face of flanking wall/room corner**:
    matches what a user can verify with a tape measure; edge-to-edge is also
    the masonry convention.
  - **Center of opening**: matches US frame convention and is what installers
    of the *frame* want, but is not directly tape-measurable against a
    finished wall; likely less intuitive for the audience.
  - **From the wall's axis endpoints** (junction-invariant like the wall
    case): stable while the wall network changes, but the number corresponds
    to nothing physical in the room.
  - Whichever edge reference is chosen, the DIN/NF practice of annotating the
    opening itself as *width × height (+ sill height)* is independent of the
    flanking dimensions and cheap to display.

## Sources

Official pages cited (located via domain-restricted search; page bodies could
not be fetched directly from this sandbox — see caveat at top):

- https://help.autodesk.com/cloudhelp/2016/ENU/Revit-Model/files/GUID-F26DB6DA-A0EC-424D-B656-3BDF47607F4F.htm (About the Wall Location Line; same GUID on knowledge.autodesk.com for Revit 2016–2023)
- https://knowledge.autodesk.com/support/revit-products/learn-explore/caas/CloudHelp/cloudhelp/2018/ENU/Revit-Customize/files/GUID-0C635A25-161D-4756-A3D1-C564079A1965-htm.html (Specify Temporary Dimension Settings)
- https://knowledge.autodesk.com/support/revit-products/learn-explore/caas/CloudHelp/cloudhelp/2019/ENU/Revit-DocumentPresent/files/GUID-E0FB313E-CE57-4741-9EF5-6747BBA3BDDB-htm.html (Add an Aligned Dimension)
- https://knowledge.autodesk.com/support/revit-products/learn-explore/caas/CloudHelp/cloudhelp/2017/ENU/Revit-Model/files/GUID-FDBDB1AF-6750-4C00-A87A-C9DF191F04BC-htm.html (Flip the Orientation of Compound Walls)
- https://help.graphisoft.com/AC/27/INT/_AC27_Help/040_ElementsVB/040_ElementsVB-7.htm (Wall Reference Line, ArchiCAD 27)
- https://help.graphisoft.com/AC/24/int/_AC24_Help/040_ElementsVB/040_ElementsVB-19.htm (Modify Wall Reference Line)
- https://help.graphisoft.com/AC/24/INT/_AC24_Help/140_UserInterfaceToolSettings/140_UserInterfaceToolSettings-23.htm (Linear Dimension Tool Settings)
- https://help.graphisoft.com/AC/27/INT/_AC27_Help/070_Documentation/070_Documentation-50.htm (Automatic Interior Dimensioning)
- https://help.graphisoft.com/AC/18/INT/AC18Help/04_Documentation/04_Documentation-60.htm (Automatic Exterior Dimensioning)
- https://help.graphisoft.com/AC/20/INT/AC20Help/04_Documentation/04_Documentation-48.htm (Dimensioning Wall or Slab Thickness)
- https://support.graphisoft.com/hc/en-us/articles/32175420313233-Why-does-the-dimension-tool-measure-only-the-wall-thickness
- https://support.graphisoft.com/hc/en-us/articles/32174541267345-Dimensions-automatically-include-core-skins-of-walls
- https://support.graphisoft.com/hc/en-us/articles/33723560215185-How-to-move-wall-reference-line-without-affecting-it-s-position
- https://support.graphisoft.com/hc/en-us/articles/19243962225553-Incorrect-wall-intersection-showing-on-floor-plan
- https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Architecture/files/GUID-AC69C7B9-17A4-40CD-939D-834339D5BDFD.htm (To Change the Wall Justification)
- https://help.autodesk.com/view/ARCHDESK/2024/ENU/?guid=GUID-33F8B759-ECFE-4359-B186-C95C98B30D36 (About Wall Justification Lines and Cleanup Circles)
- https://help.autodesk.com/view/ARCHDESK/2024/ENU/?guid=GUID-6C646E14-02EE-4360-856D-77C2AFBF1377 (About Wall Lengths)
- https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-Architecture/files/GUID-6396B1E1-37FA-4C1E-B08E-7F1CBD76CA91.htm (About Wall Length Property)
- https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Architecture/files/GUID-15BF3ACD-953C-47CB-B405-8D4C6733635A.htm (To Draw Walls)
- https://www.sweethome3d.com/users-guide/ (Sweet Home 3D User's Guide)
- https://sourceforge.net/p/sweethome3d/feature-requests/1098/ (official project tracker: wall endpoints are in the middle of the wall)
- https://www.sweethome3d.com/support/forum/viewthread_thread,4033 ; …,4426 ; …,12407 (official forum threads on interior dimensions / wall length / thickness direction)
- https://help.magicplan.app/change-exterior-and-interior-wall-thickness
- https://help.magicplan.app/change-dimensions-of-your-floor-plan
- https://help.magicplan.app/elevation-of-windows-doors-and-other-furniture-objects-attached-or-next-to-a-wall
- https://help.magicplan.app/add-furniture-objects
- https://www.roomsketcher.com/features/pro-features/measurements/
- https://www.roomsketcher.com/blog/the-7-measurement-types-in-roomsketcher/
- https://help.floorplanner.com/en/articles/8437038-how-to-enter-the-exact-measurements-of-a-wall-thickness-height-raise-from-floor-move-wall-across-axis
- https://www.iso.org/standard/64007.html (ISO 129-1:2018 catalog page)
- https://www.iso.org/standard/82512.html (ISO 6284:2023 catalog page)

Secondary sources (clearly marked as such in the text):

- https://blogs.jccc.edu/lcline/2012/04/15/architectural-dimensioning/ (JCCC drafting course, Lydia Sloan Cline)
- https://evstudio.com/dimensioning-101/ (EVstudio, architecture/engineering firm)
- https://elearning.hs-ruhrwest.de/pluginfile.php/294487/mod_folder/content/0/DIN%201356-1_2018%20-%20Bauzeichnungen%20-%20Teil%201_Grundregeln%20der%20Darstellung.pdf (HS Ruhr West course copy of DIN 1356-1)
- https://epub.sub.uni-hamburg.de/epub/volltexte/2010/4886/pdf/Bauzeichnen_I.pdf (Uni Hamburg Bauzeichnen script)
- https://www.baunormenlexikon.de/norm/din-1356-1/379167e5-3825-4bb6-86e2-5b05e092e322 (DIN 1356-1:2024 summary)
- http://stigenervilliers.free.fr/PDF%20dessin%201/dessin%20batiment/06_Cotations%20des%20dessin%20d'archi.pdf (French construction-drawing dimensioning course)
- https://sti2d.ecolelamache.org/documents/Cours%20Dessins%20d'architecture.pdf (French architecture-drawing course; NF P02-001 / NF P02-005)
- https://www.abc-maconnerie.com/lecture-plan/generalites/bases-dessin-technique/cotations.html
- https://community.graphisoft.com/t5/Getting-started/How-Walls-are-Connected-in-Archicad/ta-p/303922
- https://forums.autodesk.com/t5/autocad-architecture-forum/wall-baseline-vs-justification-purposes/td-p/5708062
- https://sbcode.net/sh3d/drawing-walls/ (third-party Sweet Home 3D tutorial)
