// The editor with a keyboard, for tests.
//
// The registry moved to App (ADR 0012), so a bare `<Editor />` no longer
// answers a keystroke — nothing is registered above it. Tests about the
// editor's own keys mount this instead: it is the smallest thing that is both
// an editor and a place shortcuts are bound.
//
// The editor half of the wiring is `editorCommands`, the very function App
// uses, so the two cannot drift. The rest is stubbed — a test that wants to see
// Open or Reset fire passes its own spy.
import { useRef } from 'react'
import type { EditorCommands } from './Editor'
import Editor, { editorCommands } from './Editor'
import { toggleHelp, useHelpDialog } from './helpStore'
import { toggleGrid, toggleMeasures } from './preferences'
import type { AppHotkeyActions } from './useAppHotkeys'
import { useAppHotkeys } from './useAppHotkeys'
import { redo, undo } from '../store/planStore'

const noop = () => {}

export function EditorWithHotkeys({
  actions,
  resetDisabled = false,
  ready = true,
}: {
  actions?: Partial<AppHotkeyActions>
  resetDisabled?: boolean
  ready?: boolean
} = {}) {
  const ref = useRef<EditorCommands>(null)
  const helpOpen = useHelpDialog((s) => s.open)

  useAppHotkeys(
    {
      undo,
      redo,
      ...editorCommands(ref),
      toggleGrid,
      toggleMeasures,
      toggleTheme: noop,
      open: noop,
      saveAs: noop,
      exportImage: noop,
      reset: noop,
      help: toggleHelp,
      ...actions,
    },
    { helpOpen, resetDisabled, ready },
  )

  return <Editor ref={ref} />
}
