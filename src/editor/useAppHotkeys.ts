// Registry keyed by action, application-wide: the UI and the help dialog both read
// it, so no shortcut can exist undocumented (ADR 0011, ADR 0012; gestures: ADR 0009).
import { formatForDisplay, useHotkeys } from '@tanstack/react-hotkeys';
import type { RegisterableHotkey } from '@tanstack/react-hotkeys';
import type { Tool } from './tools';

export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'cancel'
  | 'selectAll'
  | 'deleteSelection'
  | 'toggleSnap'
  | 'toggleGrid'
  | 'toggleMeasures'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'zoomActual'
  | 'toggleTheme'
  | 'open'
  | 'saveAs'
  | 'exportImage'
  | 'reset'
  | 'help'
  | `tool:${Tool}`;

export type HelpSection = 'tools' | 'editor' | 'view' | 'file';

// Explicit split, not the browser's height balancing: the column break would
// otherwise move with the row counts.
export const HELP_SECTIONS: { id: HelpSection; title: string; startsColumn?: boolean }[] = [
  { id: 'file', title: 'File' },
  { id: 'view', title: 'View' },
  { id: 'tools', title: 'Tools', startsColumn: true },
  { id: 'editor', title: 'Editor' },
];

// At least one section: an entry with none would be a shortcut the help cannot show.
type AtLeastOne<T> = { [K in keyof T]: Required<Pick<T, K>> & Partial<Omit<T, K>> }[keyof T];
type HelpLabels = AtLeastOne<Record<HelpSection, string>>;

interface Shortcut {
  hotkey: RegisterableHotkey;
  name: string;
  sections: HelpLabels;
  // Only when the typed key is not the registered one: `?` is Shift+/, `+` is Shift+=.
  display?: string;
}

const SHORTCUTS: Record<ShortcutAction, Shortcut> = {
  'tool:select': { hotkey: '1', name: 'Select tool', sections: { tools: 'Select tool' } },
  'tool:wall': { hotkey: '2', name: 'Wall tool', sections: { tools: 'Wall tool' } },
  'tool:door': { hotkey: '3', name: 'Door tool', sections: { tools: 'Door tool' } },
  'tool:window': { hotkey: '4', name: 'Window tool', sections: { tools: 'Window tool' } },
  'tool:ruler': { hotkey: '5', name: 'Ruler tool', sections: { tools: 'Ruler tool' } },
  cancel: {
    hotkey: 'Escape',
    name: 'Cancel',
    sections: {
      tools: 'Back to the Select tool',
      editor: 'Abandon the wall chain, the selection, or the tool',
    },
  },
  undo: { hotkey: 'Mod+Z', name: 'Undo', sections: { editor: 'Undo' } },
  redo: { hotkey: 'Mod+Shift+Z', name: 'Redo', sections: { editor: 'Redo' } },
  selectAll: {
    hotkey: 'Mod+A',
    name: 'Select all',
    sections: { editor: 'Select the whole plan' },
  },
  deleteSelection: {
    hotkey: 'Delete',
    name: 'Delete selection',
    sections: { editor: 'Delete the selection' },
  },
  // Bare S, not Mod+S: that is the browser's Save, and the flip is persisted.
  toggleSnap: { hotkey: 'S', name: 'Toggle snap', sections: { editor: 'Toggle snap' } },
  toggleGrid: { hotkey: 'G', name: 'Toggle grid', sections: { view: 'Show or hide the grid' } },
  toggleMeasures: {
    hotkey: 'M',
    name: 'Toggle measures',
    sections: { view: 'Show or hide the measures' },
  },
  // Registered on the physical key: '+' is Shift+'='. Shift variant aliased below.
  zoomIn: {
    hotkey: 'Mod+=',
    name: 'Zoom in',
    sections: { view: 'Zoom in' },
    display: formatForDisplay({ key: '+', mod: true }),
  },
  // Declaration order is the help's order.
  zoomOut: { hotkey: 'Mod+-', name: 'Zoom out', sections: { view: 'Zoom out' } },
  zoomActual: { hotkey: 'Mod+0', name: 'Zoom to 100%', sections: { view: 'Zoom to 100%' } },
  // Not Mod+0: that means "100%" everywhere. Shift+1 is the canvas-editor fit.
  fit: { hotkey: 'Shift+1', name: 'Fit', sections: { view: 'Fit the plan to the screen' } },
  toggleTheme: {
    hotkey: 'Alt+Shift+D',
    name: 'Toggle theme',
    sections: { view: 'Switch between light and dark' },
  },
  open: { hotkey: 'Mod+O', name: 'Open', sections: { file: 'Open a plan' } },
  saveAs: { hotkey: 'Mod+S', name: 'Save as', sections: { file: 'Save the plan to a file' } },
  exportImage: {
    hotkey: 'Mod+Shift+E',
    name: 'Export image',
    sections: { file: 'Export the plan as an image' },
  },
  // `shift: true` required: the match is strict, and `?` never arrives without Shift.
  // Object form because '?' is outside the library's key union.
  help: {
    hotkey: { key: '?', shift: true },
    name: 'Help',
    sections: { file: 'Help' },
    display: '?',
  },
  reset: { hotkey: 'Mod+Backspace', name: 'Reset', sections: { file: 'Erase the plan' } },
};

export const SHORTCUT_ACTIONS = Object.keys(SHORTCUTS) as ShortcutAction[];

// Interaction vocabulary with no key to register (ADR 0009). `after` places a
// gesture beside a shortcut instead of in the tail.
const GESTURES: { gesture: string; sections: HelpLabels; after?: ShortcutAction }[] = [
  { gesture: 'Right-click', sections: { tools: 'Back to the Select tool', editor: 'End the wall chain' } },
  { gesture: 'Click a room', sections: { editor: 'Select its walls' } },
  { gesture: 'Drag a box', sections: { editor: 'Select everything it covers' } },
  { gesture: 'Shift + click', sections: { editor: 'Add to the selection' } },
  { gesture: 'Double-click', sections: { editor: 'Name a room, or end the wall chain' } },
  { gesture: 'Alt', sections: { editor: 'Invert snap while held' } },
  { gesture: 'Ctrl/Cmd + scroll', sections: { view: 'Zoom in and out' }, after: 'zoomOut' },
  { gesture: 'Scroll', sections: { view: 'Pan the view top-down' } },
  { gesture: 'Shift + scroll', sections: { view: 'Pan the view sideways' } },
  { gesture: 'Space + drag', sections: { view: 'Pan the view' } },
  { gesture: 'Middle-click + drag', sections: { view: 'Pan the view' } },
];

export const keyHint = (action: ShortcutAction) =>
  SHORTCUTS[action].display ?? formatForDisplay(SHORTCUTS[action].hotkey);

export interface HelpRow {
  keys: string[];
  label: string;
}

/** Same label in the same section merges into one row: Escape and right-click
 *  both leave a tool. */
export const helpRows = (section: HelpSection): HelpRow[] => {
  const rows: HelpRow[] = [];
  const byLabel = new Map<string, HelpRow>();
  const add = (key: string, label: string) => {
    const row = byLabel.get(label);
    if (row) return void row.keys.push(key);
    const fresh = { keys: [key], label };
    byLabel.set(label, fresh);
    rows.push(fresh);
  };
  const placed = new Set<string>();
  for (const action of SHORTCUT_ACTIONS) {
    const label = SHORTCUTS[action].sections[section];
    if (!label) continue;
    add(keyHint(action), label);
    for (const g of GESTURES) {
      const anchored = g.sections[section];
      if (anchored && g.after === action) {
        add(g.gesture, anchored);
        placed.add(g.gesture);
      }
    }
  }
  for (const { gesture, sections } of GESTURES) {
    const label = sections[section];
    if (label && !placed.has(gesture)) add(gesture, label);
  }
  return rows;
};

// Never displayed: a button shows one key, the primary above.
const ALIASES: Array<[ShortcutAction, RegisterableHotkey]> = [
  ['redo', 'Mod+Y'],
  ['deleteSelection', 'Backspace'],
  ['help', 'F1'],
  // How Mod++ arrives: the strict Shift match misses the bare registration above.
  // Object form because the string type excludes Shift+punctuation.
  ['zoomIn', { key: '=', mod: true, shift: true }],
  // No Mod+Delete for reset: Delete is deleteSelection's primary key, one slip
  // from erasing the plan.
];

type SimpleAction = Exclude<ShortcutAction, `tool:${Tool}`>;

/** Derived from the registry, not restated: no action ships without a callback.
 *  Tools are the one exclusion — they differ by argument, not by callback. */
export type AppHotkeyActions = Record<SimpleAction, () => void> & {
  selectTool: (tool: Tool) => void;
};

const callbackFor = (actions: AppHotkeyActions, action: ShortcutAction) =>
  action.startsWith('tool:')
    ? () => actions.selectTool(action.slice('tool:'.length) as Tool)
    : actions[action as Exclude<ShortcutAction, `tool:${Tool}`>];

export function useAppHotkeys(
  actions: AppHotkeyActions,
  { helpOpen, resetDisabled, ready }: { helpOpen: boolean; resetDisabled: boolean; ready: boolean },
) {
  // Muting is what hands Escape back: the library stops propagation on a match, so
  // a live `cancel` would keep the Dialog open. Before `ready`, restore is pending.
  const enabled = (action: ShortcutAction) =>
    ready && (!helpOpen || action === 'help') && !(action === 'reset' && resetDisabled);
  const rows = SHORTCUT_ACTIONS.map((action) => ({
    hotkey: SHORTCUTS[action].hotkey,
    callback: callbackFor(actions, action),
    options: { enabled: enabled(action), meta: { name: SHORTCUTS[action].name } },
  }));
  const aliases = ALIASES.map(([action, hotkey]) => ({
    hotkey,
    callback: callbackFor(actions, action),
    options: { enabled: enabled(action), meta: { name: SHORTCUTS[action].name } },
  }));
  useHotkeys(
    [...rows, ...aliases],
    // Overrides the default, which lets Mod combos and Escape through in a field:
    // in the room-name field Mod+Z is the browser's undo and Escape is the field's.
    { ignoreInputs: true },
  );
}
