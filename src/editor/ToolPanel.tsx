// CONTEXT.md: Tool panel. Selection values derived on render, never stored —
// the panel cannot disagree with the canvas, drags included.
import {
  BrickWall,
  DoorClosed,
  FlipHorizontal2,
  FlipVertical2,
  Grid2x2,
  Layers,
  Ruler,
  Scan,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { formatArea, formatLength } from '../model/format';
import { distance } from '../model/geometry';
import { setOpeningWidth, setWallThickness, toggleHingeSide, toggleSwing } from '../model/operations';
import type { Room } from '../model/rooms';
import { roomLabelAt, wallMeasures } from '../model/rooms';
import type { Contents, ElementRef } from '../model/selection';
import { roomContents, selectedRoom, selectionContents } from '../model/selection';
import type { Plan, Wall } from '../model/types';
import { WALL_THICKNESS_MAX } from '../model/types';
import type { Tool, ToolDefaults } from './tools';

const ELEMENT_META: Record<'wall' | 'door' | 'window', [LucideIcon, string]> = {
  wall: [BrickWall, 'Wall'],
  door: [DoorClosed, 'Door'],
  window: [Grid2x2, 'Window'],
};

interface ToolPanelProps {
  plan: Plan;
  rooms: Room[];
  sel: ElementRef[];
  tool: Tool;
  defaults: ToolDefaults;
  setDefaults: (updater: (defaults: ToolDefaults) => ToolDefaults) => void;
  setPlan: (updater: (plan: Plan) => Plan) => void;
  onDelete: () => void;
}

export function ToolPanel({
  plan,
  rooms,
  sel,
  tool,
  defaults,
  setDefaults,
  setPlan,
  onDelete,
}: ToolPanelProps) {
  if (sel.length === 0) {
    // Ruler has no pre-placement defaults; its selected panel is ticket 09.
    if (tool === 'select' || tool === 'ruler') return null;
    return <ToolDefaultsFacet tool={tool} defaults={defaults} setDefaults={setDefaults} />;
  }
  const only = sel.length === 1 ? sel[0] : null;
  const wall = only?.type === 'wall' ? (plan.walls[only.id] ?? null) : null;
  const opening = only?.type === 'opening' ? (plan.openings[only.id] ?? null) : null;
  const ruler = only?.type === 'ruler' ? (plan.rulers[only.id] ?? null) : null;
  if (only && !wall && !opening && !ruler) return null;

  // The room is read from the selection, not held in it (ADR 0014), so a
  // marquee over the same walls reads the same room.
  const room = selectedRoom(plan, rooms, sel);

  const [Icon, title]: [LucideIcon, string] = room
    ? [Scan, roomLabelAt(plan, room)?.name || 'Room']
    : !only
      ? [Layers, `${sel.length} elements`]
      : ruler
        ? [Ruler, 'Ruler']
        : ELEMENT_META[wall ? 'wall' : opening!.type];

  // CONTEXT.md: Tool panel. A room counts its boundary, never its refs: a
  // Shift+click that unlights one of its doors must not lower the count.
  const contents = room ? roomContents(plan, room) : sel.length > 1 ? selectionContents(plan, sel) : null;

  return (
    <div className="panel">
      <PanelHeader Icon={Icon} title={title} />
      {(room || wall) && (
        <section>
          <div className="panel-section-label">Dimensions</div>
          {room && (
            <div className="panel-row">
              <span className="panel-row-label">Area</span>
              <span className="panel-row-value">{formatArea(room.areaCm2)}</span>
            </div>
          )}
          {wall && <WallRows plan={plan} rooms={rooms} wall={wall} />}
          {wall && (
            <div className="panel-row">
              <span className="panel-row-label">Thickness</span>
              <NumberField
                inline
                max={WALL_THICKNESS_MAX}
                value={wall.thickness}
                onCommit={(value) => {
                  setPlan((p) => setWallThickness(p, wall.id, value));
                  // sticky measure (CONTEXT.md: Tool defaults) — last used wins
                  setDefaults((d) => ({ ...d, wallThickness: value }));
                }}
              />
            </div>
          )}
        </section>
      )}
      {ruler && (
        <section>
          <div className="panel-section-label">Dimensions</div>
          <div className="panel-row">
            <span className="panel-row-label">Length</span>
            <span className="panel-row-value">
              {formatLength(distance(ruler.a.x, ruler.a.y, ruler.b.x, ruler.b.y))}
            </span>
          </div>
        </section>
      )}
      {contents && <ContentsRows contents={contents} zeros={room !== null} />}
      {opening && (
        <section>
          <div className="panel-section-label">Width</div>
          <NumberField
            value={opening.width}
            onCommit={(width) => {
              const next = setOpeningWidth(plan, opening.id, width);
              setPlan(() => next);
              // sticky measure (CONTEXT.md: Tool defaults) — a width that will not
              // fit is rejected, so adopt what applied, never the raw entry
              const applied = next.openings[opening.id].width;
              setDefaults((d) =>
                opening.type === 'door' ? { ...d, doorWidth: applied } : { ...d, windowWidth: applied },
              );
            }}
          />
        </section>
      )}
      {opening?.type === 'door' && (
        <FlipSection
          onHinge={() => setPlan((p) => toggleHingeSide(p, opening.id))}
          onSwing={() => setPlan((p) => toggleSwing(p, opening.id))}
        />
      )}
      <button className="danger panel-delete" title="Delete" aria-label="Delete" onClick={onDelete}>
        <Trash2 size={16} aria-hidden />
        Delete
      </button>
    </div>
  );
}

// CONTEXT.md: Tool defaults. No Delete — no element yet.
function ToolDefaultsFacet({
  tool,
  defaults,
  setDefaults,
}: {
  tool: Exclude<Tool, 'select' | 'ruler'>;
  defaults: ToolDefaults;
  setDefaults: (updater: (defaults: ToolDefaults) => ToolDefaults) => void;
}) {
  const [Icon, title] = ELEMENT_META[tool];
  const widthKey = tool === 'door' ? 'doorWidth' : 'windowWidth';
  return (
    <div className="panel">
      <PanelHeader Icon={Icon} title={title} />
      {tool === 'wall' ? (
        <section>
          <div className="panel-section-label">Thickness</div>
          <NumberField
            max={WALL_THICKNESS_MAX}
            value={defaults.wallThickness}
            onCommit={(thickness) => setDefaults((d) => ({ ...d, wallThickness: thickness }))}
          />
        </section>
      ) : (
        <section>
          <div className="panel-section-label">Width</div>
          <NumberField
            value={defaults[widthKey]}
            onCommit={(width) => setDefaults((d) => ({ ...d, [widthKey]: width }))}
          />
        </section>
      )}
      {tool === 'door' && (
        <FlipSection
          onHinge={() => setDefaults((d) => ({ ...d, doorHinge: d.doorHinge === 'start' ? 'end' : 'start' }))}
          onSwing={() => setDefaults((d) => ({ ...d, doorSwing: d.doorSwing === 'in' ? 'out' : 'in' }))}
        />
      )}
    </div>
  );
}

function PanelHeader({ Icon, title }: { Icon: LucideIcon; title: string }) {
  return (
    <div className="panel-header">
      <span className="panel-badge">
        <Icon size={15} aria-hidden />
      </span>
      <span className="panel-title">{title}</span>
    </div>
  );
}

// draft is null while idle so the field mirrors the live value; while editing it
// holds the keystrokes, reaching the plan only on commit — never mid-entry.
function NumberField({
  value,
  onCommit,
  inline,
  max,
}: {
  value: number;
  onCommit: (value: number) => void;
  inline?: boolean;
  max?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const reverting = useRef(false);

  const commit = () => {
    const text = draft;
    setDraft(null);
    const n = Number(text);
    // Empty or non-numeric reverts, like Escape; a decimal rounds to the cm grid.
    if (text === null || text.trim() === '' || !Number.isFinite(n)) return;
    const rounded = Math.max(1, Math.round(n));
    onCommit(max === undefined ? rounded : Math.min(max, rounded));
  };

  return (
    <span className={inline ? 'panel-number inline' : 'panel-number'}>
      <input
        type="number"
        min={1}
        max={max}
        step={1}
        className="panel-number-input"
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (reverting.current) {
            reverting.current = false;
            return setDraft(null);
          }
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            reverting.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      <span className="panel-number-unit">cm</span>
    </span>
  );
}

function FlipSection({ onHinge, onSwing }: { onHinge: () => void; onSwing: () => void }) {
  return (
    <section>
      <div className="panel-section-label">Options</div>
      <div className="panel-flips">
        <button className="flip" title="Swap hinge side (left/right)" onClick={onHinge}>
          <FlipHorizontal2 size={14} aria-hidden /> Hinge
        </button>
        <button className="flip" title="Swap swing direction (inside/outside)" onClick={onSwing}>
          <FlipVertical2 size={14} aria-hidden /> Swing
        </button>
      </div>
    </section>
  );
}

// zeros: a room states a nil count as a fact about itself, where any other
// selection lists only what it holds.
function ContentsRows({ contents, zeros }: { contents: Contents; zeros: boolean }) {
  const rows = (
    [
      ['Walls', contents.walls],
      ['Doors', contents.doors],
      ['Windows', contents.windows],
    ] as const
  ).filter(([, count]) => zeros || count > 0);
  if (rows.length === 0) return null;
  return (
    <section>
      <div className="panel-section-label">Contents</div>
      {rows.map(([label, count]) => (
        <div key={label} className="panel-row">
          <span className="panel-row-label">{label}</span>
          <span className="panel-row-value">{count}</span>
        </div>
      ))}
    </section>
  );
}

// Spec §2: oriented Interior/Exterior when the wall borders exactly one room,
// hors-tout Length otherwise.
function WallRows({ plan, rooms, wall }: { plan: Plan; rooms: Room[]; wall: Wall }) {
  const m = wallMeasures(plan, rooms, wall);
  const rows =
    m.kind === 'oriented'
      ? ([
          ['Interior', m.interior],
          ['Exterior', m.exterior],
        ] as const)
      : ([['Length', m.length]] as const);
  return (
    <>
      {rows.map(([label, value]) => (
        <div key={label} className="panel-row">
          <span className="panel-row-label">{label}</span>
          <span className="panel-row-value">{formatLength(value)}</span>
        </div>
      ))}
    </>
  );
}
