import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AppMenu from './AppMenu';
import type { EditorCommands } from './editor/Editor';
import Editor, { editorCommands } from './editor/Editor';
import ShortcutsDialog from './editor/ShortcutsDialog';
import { toggleHelp, useHelpDialog } from './editor/helpStore';
import { measuresVisible, toggleGrid, toggleMeasures } from './editor/preferences';
import { useAppHotkeys } from './editor/useAppHotkeys';
import ReloadPrompt from './pwa/ReloadPrompt';
import { emptyPlan, isPlanEmpty } from './model/types';
import { acquireWriterLock, requestPersistentStorage, startAutosave } from './persistence/autosave';
import { loadPlan } from './persistence/storage';
import { redo, replacePlan, undo, usePlanStore } from './store/planStore';
import { useThemePreference } from './theme/useThemePreference';
import { transferFileName } from './transfer/json';
import { renderPlanPng } from './transfer/png';
import { downloadBlob, exportPlanJson, importPlanJson } from './transfer/transferActions';

type BootState = 'loading' | 'ready';

export default function App() {
  const [boot, setBoot] = useState<BootState>('loading');
  const [readOnly, setReadOnly] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const editor = useRef<EditorCommands>(null);
  // Owned here, not in the menu: a second useThemePreference call would be a
  // second state on the same key, deaf to the shortcut.
  const [themePreference, setThemePreference, toggleTheme] = useThemePreference();

  useEffect(() => {
    let stopAutosave: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const isWriter = await acquireWriterLock();
      const plan = await loadPlan();
      if (cancelled) return;
      if (plan) replacePlan(plan);
      requestPersistentStorage();
      if (isWriter) {
        stopAutosave = startAutosave({
          onError: (error) => {
            const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
            setNotice(
              quota ? 'Storage is full — the plan can no longer be saved.' : 'Saving the plan failed.',
            );
          },
        });
      } else {
        setReadOnly(true);
      }
      setBoot('ready');
    })();
    return () => {
      cancelled = true;
      stopAutosave?.();
    };
  }, []);

  const planIsEmpty = usePlanStore((s) => isPlanEmpty(s.plan));
  const helpOpen = useHelpDialog((s) => s.open);

  const resetPlan = () => {
    // Confirm is load-bearing: Mod+Backspace is one modifier from the Backspace
    // that deletes the selection.
    if (!window.confirm('Reset the plan? Every wall, opening and room name will be lost.')) return;
    replacePlan(emptyPlan());
  };

  const exportPng = async () => {
    try {
      // ADR 0008: export follows the on-screen Measure toggle.
      const blob = await renderPlanPng(usePlanStore.getState().plan, {
        measuresVisible: measuresVisible(),
      });
      if (!blob) {
        setNotice('Nothing to export yet — draw some walls first.');
        return;
      }
      downloadBlob(blob, transferFileName('png'));
    } catch {
      setNotice('PNG export failed.');
    }
  };

  const openPlan = () => importPlanJson(setNotice);
  const savePlanAs = () => exportPlanJson(usePlanStore.getState().plan);

  // ADR 0012: mounted here, the only node seeing both menu and editor.
  useAppHotkeys(
    {
      undo,
      redo,
      ...editorCommands(editor),
      toggleGrid,
      toggleMeasures,
      toggleTheme,
      open: openPlan,
      saveAs: savePlanAs,
      exportImage: exportPng,
      reset: resetPlan,
      help: toggleHelp,
    },
    { helpOpen, resetDisabled: planIsEmpty, ready: boot === 'ready' },
  );

  if (boot === 'loading') return null;

  return (
    <>
      <Editor ref={editor} />
      <AppMenu
        onOpen={openPlan}
        onSaveAs={savePlanAs}
        onExportImage={exportPng}
        onReset={resetPlan}
        resetDisabled={planIsEmpty}
        themePreference={themePreference}
        setThemePreference={setThemePreference}
      />
      <ShortcutsDialog />
      {readOnly && (
        <div className="banner">The plan is already open in another tab — changes here are not saved.</div>
      )}
      {notice && (
        <div className="banner error">
          {notice}
          <button title="Dismiss" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
      <ReloadPrompt />
    </>
  );
}
