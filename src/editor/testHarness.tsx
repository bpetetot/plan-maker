// Registry lives in App (ADR 0012): a bare `<Editor />` answers no keystroke.
// Wired through `editorCommands`, App's own function, so the two cannot drift.
import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { useRef } from 'react';
import type { EditorCommands } from './Editor';
import Editor, { editorCommands } from './Editor';
import { toggleHelp, useHelpDialog } from './helpStore';
import { toggleGrid, toggleMeasures } from './preferences';
import type { AppHotkeyActions } from './useAppHotkeys';
import { useAppHotkeys } from './useAppHotkeys';
import { redo, undo } from '../store/planStore';

const noop = () => {};

interface Props {
  actions?: Partial<AppHotkeyActions>;
  resetDisabled?: boolean;
  ready?: boolean;
  // Pins Mod resolution so the suite is deterministic wherever it runs (default
  // linux → Ctrl); a mac test overrides it to exercise Cmd.
  platform?: 'mac' | 'windows' | 'linux';
}

function BoundEditor({ actions, resetDisabled = false, ready = true }: Omit<Props, 'platform'>) {
  const ref = useRef<EditorCommands>(null);
  const helpOpen = useHelpDialog((s) => s.open);

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
  );

  return <Editor ref={ref} />;
}

// Provider must wrap the hook's component, not sit inside it: the context is read
// where `useAppHotkeys` runs, one level up from this returned tree.
export function EditorWithHotkeys({ platform = 'linux', ...props }: Props = {}) {
  return (
    <HotkeysProvider defaultOptions={{ hotkey: { platform } }}>
      <BoundEditor {...props} />
    </HotkeysProvider>
  );
}
