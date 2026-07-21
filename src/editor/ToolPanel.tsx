// CONTEXT.md: Tool panel. Selection values derived on render, never stored —
// the panel cannot disagree with the canvas, drags included.
import { BrickWall, DoorClosed, FlipHorizontal2, FlipVertical2, Grid2x2, Layers, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatLength } from '../model/format';
import { setOpeningWidth, setWallThickness, toggleHingeSide, toggleSwing } from '../model/operations';
import type { Room } from '../model/rooms';
import { wallMeasures } from '../model/rooms';
import type { ElementRef } from '../model/selection';
import type { Plan, Wall } from '../model/types';
import { OPENING_WIDTHS, WALL_THICKNESSES } from '../model/types';
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
    if (tool === 'select') return null;
    return <ToolDefaultsFacet tool={tool} defaults={defaults} setDefaults={setDefaults} />;
  }
  const only = sel.length === 1 ? sel[0] : null;
  const wall = only?.type === 'wall' ? (plan.walls[only.id] ?? null) : null;
  const opening = only?.type === 'opening' ? (plan.openings[only.id] ?? null) : null;
  if (only && !wall && !opening) return null;

  const [Icon, title]: [LucideIcon, string] = !only
    ? [Layers, `${sel.length} elements`]
    : ELEMENT_META[wall ? 'wall' : opening!.type];

  return (
    <div className="panel">
      <PanelHeader Icon={Icon} title={title} />
      {wall && (
        <section>
          <div className="panel-section-label">Dimensions</div>
          <WallRows plan={plan} rooms={rooms} wall={wall} />
          <div className="panel-row">
            <span className="panel-row-label">Thickness</span>
            <PresetSelect
              inline
              presets={WALL_THICKNESSES}
              value={wall.thickness}
              onChange={(thickness) => {
                setPlan((p) => setWallThickness(p, wall.id, thickness));
                // sticky measure (CONTEXT.md: Tool defaults) — last used wins
                setDefaults((d) => ({ ...d, wallThickness: thickness }));
              }}
            />
          </div>
        </section>
      )}
      {opening && (
        <section>
          <div className="panel-section-label">Width</div>
          <PresetSelect
            presets={OPENING_WIDTHS}
            value={opening.width}
            onChange={(width) => {
              setPlan((p) => setOpeningWidth(p, opening.id, width));
              // sticky measure (CONTEXT.md: Tool defaults) — last used wins
              setDefaults((d) =>
                opening.type === 'door' ? { ...d, doorWidth: width } : { ...d, windowWidth: width },
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
  tool: Exclude<Tool, 'select'>;
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
          <PresetSelect
            presets={WALL_THICKNESSES}
            value={defaults.wallThickness}
            onChange={(thickness) => setDefaults((d) => ({ ...d, wallThickness: thickness }))}
          />
        </section>
      ) : (
        <section>
          <div className="panel-section-label">Width</div>
          <PresetSelect
            presets={OPENING_WIDTHS}
            value={defaults[widthKey]}
            onChange={(width) => setDefaults((d) => ({ ...d, [widthKey]: width }))}
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

// An imported value outside the presets is kept as an extra option, not
// dropped — the select would lie about the element.
function PresetSelect({
  presets,
  value,
  onChange,
  inline,
}: {
  presets: number[];
  value: number;
  onChange: (value: number) => void;
  inline?: boolean;
}) {
  const values = presets.includes(value) ? presets : [...presets, value].sort((a, b) => a - b);
  return (
    <select
      className={inline ? 'panel-select inline' : 'panel-select'}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {values.map((v) => (
        <option key={v} value={v}>
          {v} cm
        </option>
      ))}
    </select>
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
