// Registry lives in App (ADR 0012): a bare `<Editor />` answers no keystroke.
// Wired through `editorCommands`, App's own function, so the two cannot drift.
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
