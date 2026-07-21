// The editor's keyboard shortcuts, in one place. This is a registry rather
// than a handler: it is keyed by the *action*, so the UI asks it what key to
// show instead of spelling the shortcut out a second time next to the button.
// It is also what the help dialog is rendered from — each entry declares the
// sections it is listed under, so a shortcut cannot exist undocumented
// (ADR 0011).
//
// Two keyboard behaviors deliberately do *not* live here, and neither is an
// oversight (ADR 0009): Space, whose preventDefault is what stops the focused
// button from re-firing under a pan, and the modifiers read off pointer
// events (e.shiftKey on pointerdown, e.altKey on pointermove), which are more
// correct read from the event than from any tracker. Hints that mention those
// — "Alt inverts it", "Space+drag pans" — are prose, and are listed in the
// help dialog as GESTURES below.
import { formatForDisplay, useHotkeys } from '@tanstack/react-hotkeys'
import type { RegisterableHotkey } from '@tanstack/react-hotkeys'
import type { Tool } from './tools'

export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'cancel'
  | 'deleteSelection'
  | 'toggleSnap'
  | 'help'
  | `tool:${Tool}`

export type HelpSection = 'tools' | 'editor' | 'view'

export const HELP_SECTIONS: { id: HelpSection; title: string }[] = [
  { id: 'tools', title: 'Tools' },
  { id: 'editor', title: 'Editor' },
  { id: 'view', title: 'View' },
]

// Where an entry is listed, and what it is said to do *there* — the value is
// the label for that section. Escape earns two: someone reading "Tools" wants
// to know how to leave a tool, not the whole cascade.
//
// At least one section is required, and that is the whole point: an entry with
// none would be a shortcut the help cannot show. Spelling it in the type makes
// the omission a compile error rather than something a test has to notice.
type AtLeastOne<T> = { [K in keyof T]: Required<Pick<T, K>> & Partial<Omit<T, K>> }[keyof T]
type HelpLabels = AtLeastOne<Record<HelpSection, string>>

interface Shortcut {
  hotkey: RegisterableHotkey
  name: string
  sections: HelpLabels
  // Overrides the formatted hint. Legitimate for exactly one reason: the key
  // *is* a character that Shift produces, so the Shift is how you type it and
  // not a modifier of it. `formatForDisplay` would say "Shift+?", which names
  // a key nobody has. Any other use of this field re-opens the hand-written
  // hints ADR 0009 removed.
  display?: string
}

// One entry per action, so every action provably has a key to display — a
// lookup can never miss.
const SHORTCUTS: Record<ShortcutAction, Shortcut> = {
  'tool:select': { hotkey: '1', name: 'Select tool', sections: { tools: 'Select tool' } },
  'tool:wall': { hotkey: '2', name: 'Wall tool', sections: { tools: 'Wall tool' } },
  'tool:door': { hotkey: '3', name: 'Door tool', sections: { tools: 'Door tool' } },
  'tool:window': { hotkey: '4', name: 'Window tool', sections: { tools: 'Window tool' } },
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
  deleteSelection: {
    hotkey: 'Delete',
    name: 'Delete selection',
    sections: { editor: 'Delete the selection' },
  },
  // Bare S only, which the strict modifier match gives for free — all four
  // flags have to be off, Shift included. Ctrl/Cmd+S is the browser's Save
  // reflex, and flipping a persisted preference under it would be silent
  // and durable.
  toggleSnap: { hotkey: 'S', name: 'Toggle snap', sections: { editor: 'Toggle snap' } },
  // `shift: true` is not a taste: the match is strict on every modifier flag,
  // and there is no layout on which `?` arrives without Shift — declared bare
  // it would never fire once. It is the object form because '?' is outside the
  // library's key union.
  help: {
    hotkey: { key: '?', shift: true },
    name: 'Keyboard shortcuts',
    sections: { editor: 'Keyboard shortcuts' },
    display: '?',
  },
}

export const SHORTCUT_ACTIONS = Object.keys(SHORTCUTS) as ShortcutAction[]

// The half of the interaction vocabulary that has no key to register: pointer
// gestures, and the modifiers ADR 0009 keeps out of the registry. They are
// listed beside the shortcuts because a reader is looking for the way to do
// something, not for a key — the key/gesture split is ours, not theirs.
const GESTURES: { gesture: string; sections: HelpLabels }[] = [
  { gesture: 'Right-click', sections: { tools: 'Back to the Select tool', editor: 'End the wall chain' } },
  { gesture: 'Drag a box', sections: { editor: 'Select everything it covers' } },
  { gesture: 'Shift + click', sections: { editor: 'Add to the selection' } },
  { gesture: 'Double-click', sections: { editor: 'Name a room, or end the wall chain' } },
  { gesture: 'Alt', sections: { editor: 'Invert snap while held' } },
  { gesture: 'Scroll', sections: { view: 'Zoom in and out' } },
  { gesture: 'Space + drag', sections: { view: 'Pan the view' } },
]

/** The key to print next to an action, in this platform's notation. */
export const keyHint = (action: ShortcutAction) =>
  SHORTCUTS[action].display ?? formatForDisplay(SHORTCUTS[action].hotkey)

export interface HelpRow {
  /** Every way to reach this row's action — a row shows them as alternatives. */
  keys: string[]
  label: string
}

/**
 * What the help dialog lists under one section: shortcuts first, then gestures.
 *
 * Entries carrying the *same label in the same section* are the same action
 * reached two ways, and merge into one row — Escape and right-click both leave
 * a tool, and listing that twice reads as a rendering fault rather than as a
 * choice. The label is the whole identity: nothing has to be declared paired,
 * so a future shortcut that says what a gesture already says joins it on its
 * own. The row keeps the position of its first key.
 */
export const helpRows = (section: HelpSection): HelpRow[] => {
  const rows: HelpRow[] = []
  const byLabel = new Map<string, HelpRow>()
  const add = (key: string, label: string) => {
    const row = byLabel.get(label)
    if (row) return void row.keys.push(key)
    const fresh = { keys: [key], label }
    byLabel.set(label, fresh)
    rows.push(fresh)
  }
  for (const action of SHORTCUT_ACTIONS) {
    const label = SHORTCUTS[action].sections[section]
    if (label) add(keyHint(action), label)
  }
  for (const { gesture, sections } of GESTURES) {
    const label = sections[section]
    if (label) add(gesture, label)
  }
  return rows
}

// Second bindings for an action the user may arrive with muscle memory for.
// Never displayed: a button shows one key, and it is the primary above.
const ALIASES: Array<[ShortcutAction, RegisterableHotkey]> = [
  ['redo', 'Mod+Y'],
  ['deleteSelection', 'Backspace'],
  ['help', 'F1'],
]

export interface EditorHotkeyActions {
  undo: () => void
  redo: () => void
  /** Escape's cascade: abandon the wall chain, else drop the selection, else fall back to Select. */
  cancel: () => void
  deleteSelection: () => void
  selectTool: (tool: Tool) => void
  toggleSnap: () => void
  help: () => void
}

const callbackFor = (actions: EditorHotkeyActions, action: ShortcutAction) =>
  action.startsWith('tool:')
    ? () => actions.selectTool(action.slice('tool:'.length) as Tool)
    : actions[action as Exclude<ShortcutAction, `tool:${Tool}`>]

export function useEditorHotkeys(actions: EditorHotkeyActions, { helpOpen }: { helpOpen: boolean }) {
  // The help dialog is a mode, and a mode captures the keyboard: acting on a
  // plan the panel is covering would land as a surprise on close. Nothing
  // grants this for free — Headless UI's Dialog intercepts Escape and no other
  // key, so every shortcut still reaches the listener on `document`. Escape is
  // the reverse trap: the library stops propagation on a match, so an enabled
  // `cancel` *wins over* the Dialog and the panel stops closing. Muting the
  // rows is what hands Escape back. `help` alone stays live — the key that
  // opened the dialog closes it.
  const enabled = (action: ShortcutAction) => !helpOpen || action === 'help'
  const rows = SHORTCUT_ACTIONS.map((action) => ({
    hotkey: SHORTCUTS[action].hotkey,
    callback: callbackFor(actions, action),
    options: { enabled: enabled(action), meta: { name: SHORTCUTS[action].name } },
  }))
  const aliases = ALIASES.map(([action, hotkey]) => ({
    hotkey,
    callback: callbackFor(actions, action),
    options: { enabled: enabled(action), meta: { name: SHORTCUTS[action].name } },
  }))
  useHotkeys(
    [...rows, ...aliases],
    // The library's default lets Ctrl/Meta combos and Escape through inside a
    // field. This editor has exactly one field — inline room naming — and while
    // it is open no editor shortcut is wanted: Mod+Z has to stay the browser's
    // undo of the typing, and Escape belongs to the field, which cancels the
    // edit with its own handler.
    { ignoreInputs: true },
  )
}
