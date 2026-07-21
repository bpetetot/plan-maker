import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import AppMenu from './AppMenu'
import Editor from './editor/Editor'
import ShortcutsDialog from './editor/ShortcutsDialog'
import { loadMeasuresVisible } from './editor/measurePref'
import ReloadPrompt from './pwa/ReloadPrompt'
import { emptyPlan, isPlanEmpty } from './model/types'
import { acquireWriterLock, requestPersistentStorage, startAutosave } from './persistence/autosave'
import { loadPlan } from './persistence/storage'
import { replacePlan, usePlanStore } from './store/planStore'
import { transferFileName } from './transfer/json'
import { renderPlanPng } from './transfer/png'
import { downloadBlob, exportPlanJson, importPlanJson } from './transfer/transferActions'

type BootState = 'loading' | 'ready'

export default function App() {
  const [boot, setBoot] = useState<BootState>('loading')
  const [readOnly, setReadOnly] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let stopAutosave: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      const isWriter = await acquireWriterLock()
      const plan = await loadPlan()
      if (cancelled) return
      if (plan) replacePlan(plan)
      requestPersistentStorage()
      if (isWriter) {
        stopAutosave = startAutosave({
          onError: (error) => {
            const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
            setNotice(
              quota ? 'Storage is full — the plan can no longer be saved.' : 'Saving the plan failed.',
            )
          },
        })
      } else {
        setReadOnly(true)
      }
      setBoot('ready')
    })()
    return () => {
      cancelled = true
      stopAutosave?.()
    }
  }, [])

  const planIsEmpty = usePlanStore((s) => isPlanEmpty(s.plan))

  if (boot === 'loading') return null

  const resetPlan = () => {
    if (!window.confirm('Reset the plan? It will be lost.')) return
    replacePlan(emptyPlan())
  }

  const exportPng = async () => {
    try {
      // the export follows the on-screen Measure toggle (ADR 0008) — the
      // preference is a session value, so this reads what the editor is showing
      // even when storage is unavailable
      const blob = await renderPlanPng(usePlanStore.getState().plan, {
        measuresVisible: loadMeasuresVisible(),
      })
      if (!blob) {
        setNotice('Nothing to export yet — draw some walls first.')
        return
      }
      downloadBlob(blob, transferFileName('png'))
    } catch {
      setNotice('PNG export failed.')
    }
  }

  return (
    <>
      <Editor />
      <AppMenu
        onOpen={() => importPlanJson(setNotice)}
        onSaveAs={() => exportPlanJson(usePlanStore.getState().plan)}
        onExportImage={exportPng}
        onReset={resetPlan}
        resetDisabled={planIsEmpty}
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
  )
}
