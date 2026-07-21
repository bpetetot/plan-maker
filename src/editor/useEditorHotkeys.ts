// The editor's keyboard shortcuts, in one place. This is a registry rather
// than a handler: it is keyed by the *action*, so the UI asks it what key to
// show instead of spelling the shortcut out a second time next to the button.
//
// Two keyboard behaviors deliberately do *not* live here, and neither is an
// oversight (ADR 0009): Space, whose preventDefault is what stops the focused
// button from re-firing under a pan, and the modifiers read off pointer
// events (e.shiftKey on pointerdown, e.altKey on pointermove), which are more
// correct read from the event than from any tracker. Hints that mention those
// — "Alt inverts it", "Space+drag pans" — are prose, and stay written out.
import { formatForDisplay, useHotkeys } from '@tanstack/react-hotkeys'
import type { RegisterableHotkey } from '@tanstack/react-hotkeys'
import type { Tool } from './tools'

export type ShortcutAction = 'undo' | 'redo' | 'cancel' | 'deleteSelection' | 'toggleSnap' | `tool:${Tool}`

// One entry per action, so every action provably has a key to display — a
// lookup can never miss.
const SHORTCUTS: Record<ShortcutAction, { hotkey: RegisterableHotkey; name: string; description?: string }> =
  {
    undo: { hotkey: 'Mod+Z', name: 'Undo' },
    redo: { hotkey: 'Mod+Shift+Z', name: 'Redo' },
    cancel: {
      hotkey: 'Escape',
      name: 'Cancel',
      description: 'Abandon the wall chain, the selection, or the tool',
    },
    deleteSelection: { hotkey: 'Delete', name: 'Delete selection' },
    // Bare S only, which the strict modifier match gives for free — all four
    // flags have to be off, Shift included. Ctrl/Cmd+S is the browser's Save
    // reflex, and flipping a persisted preference under it would be silent
    // and durable.
    toggleSnap: { hotkey: 'S', name: 'Toggle snap' },
    'tool:select': { hotkey: '1', name: 'Select tool' },
    'tool:wall': { hotkey: '2', name: 'Wall tool' },
    'tool:door': { hotkey: '3', name: 'Door tool' },
    'tool:window': { hotkey: '4', name: 'Window tool' },
  }

// Second bindings for an action the user may arrive with muscle memory for.
// Never displayed: a button shows one key, and it is the primary above.
const ALIASES: Array<[ShortcutAction, RegisterableHotkey]> = [
  ['redo', 'Mod+Y'],
  ['deleteSelection', 'Backspace'],
]

/** The key to print next to an action, in this platform's notation. */
export const keyHint = (action: ShortcutAction) => formatForDisplay(SHORTCUTS[action].hotkey)

export interface EditorHotkeyActions {
  undo: () => void
  redo: () => void
  /** Escape's cascade: abandon the wall chain, else drop the selection, else fall back to Select. */
  cancel: () => void
  deleteSelection: () => void
  selectTool: (tool: Tool) => void
  toggleSnap: () => void
}

const callbackFor = (actions: EditorHotkeyActions, action: ShortcutAction) =>
  action.startsWith('tool:')
    ? () => actions.selectTool(action.slice('tool:'.length) as Tool)
    : actions[action as Exclude<ShortcutAction, `tool:${Tool}`>]

export function useEditorHotkeys(actions: EditorHotkeyActions) {
  const rows = (Object.keys(SHORTCUTS) as ShortcutAction[]).map((action) => ({
    hotkey: SHORTCUTS[action].hotkey,
    callback: callbackFor(actions, action),
    options: {
      meta: { name: SHORTCUTS[action].name, description: SHORTCUTS[action].description },
    },
  }))
  const aliases = ALIASES.map(([action, hotkey]) => ({
    hotkey,
    callback: callbackFor(actions, action),
    options: { meta: { name: SHORTCUTS[action].name } },
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
