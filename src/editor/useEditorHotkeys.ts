// The editor's keyboard shortcuts, in one place. This is a registry rather
// than a handler: every row carries the name it would be listed under, so a
// help screen or a command palette can be rendered from it without the
// shortcuts having to be spelled out a second time in the UI.
//
// Two keyboard behaviors deliberately do *not* live here, and neither is an
// oversight (ADR 0009): Space, whose preventDefault is what stops the focused
// button from re-firing under a pan, and the modifiers read off pointer
// events (e.shiftKey on pointerdown, e.altKey on pointermove), which are more
// correct read from the event than from any tracker.
import { useHotkeys } from '@tanstack/react-hotkeys'
import type { Tool } from './tools'

export interface EditorHotkeyActions {
  undo: () => void
  redo: () => void
  /** Escape's cascade: abandon the wall chain, else drop the selection, else fall back to Select. */
  cancel: () => void
  deleteSelection: () => void
  selectTool: (tool: Tool) => void
  toggleSnap: () => void
}

export function useEditorHotkeys(actions: EditorHotkeyActions) {
  useHotkeys(
    [
      { hotkey: 'Mod+Z', callback: actions.undo, options: { meta: { name: 'Undo' } } },
      { hotkey: 'Mod+Shift+Z', callback: actions.redo, options: { meta: { name: 'Redo' } } },
      { hotkey: 'Mod+Y', callback: actions.redo, options: { meta: { name: 'Redo' } } },
      {
        hotkey: 'Escape',
        callback: actions.cancel,
        options: {
          meta: { name: 'Cancel', description: 'Abandon the wall chain, the selection, or the tool' },
        },
      },
      {
        hotkey: 'Delete',
        callback: actions.deleteSelection,
        options: { meta: { name: 'Delete selection' } },
      },
      {
        hotkey: 'Backspace',
        callback: actions.deleteSelection,
        options: { meta: { name: 'Delete selection' } },
      },
      {
        hotkey: '1',
        callback: () => actions.selectTool('select'),
        options: { meta: { name: 'Select tool' } },
      },
      { hotkey: '2', callback: () => actions.selectTool('wall'), options: { meta: { name: 'Wall tool' } } },
      { hotkey: '3', callback: () => actions.selectTool('door'), options: { meta: { name: 'Door tool' } } },
      {
        hotkey: '4',
        callback: () => actions.selectTool('window'),
        options: { meta: { name: 'Window tool' } },
      },
      // Bare S only, which the strict modifier match gives for free — all four
      // flags have to be off, Shift included. Ctrl/Cmd+S is the browser's Save
      // reflex, and flipping a persisted preference under it would be silent
      // and durable.
      { hotkey: 'S', callback: actions.toggleSnap, options: { meta: { name: 'Toggle snap' } } },
    ],
    // The library's default lets Ctrl/Meta combos and Escape through inside a
    // field. This editor has exactly one field — inline room naming — and while
    // it is open no editor shortcut is wanted: Mod+Z has to stay the browser's
    // undo of the typing, and Escape belongs to the field, which cancels the
    // edit with its own handler.
    { ignoreInputs: true },
  )
}
