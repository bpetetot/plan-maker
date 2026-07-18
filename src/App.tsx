import { useEffect, useState } from 'react'
import Editor from './editor/Editor'
import ReloadPrompt from './pwa/ReloadPrompt'
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
            setNotice(quota ? 'Storage is full — the plan can no longer be saved.' : 'Saving the plan failed.')
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

  if (boot === 'loading') return null

  const exportPng = async () => {
    try {
      const blob = await renderPlanPng(usePlanStore.getState().plan)
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
      <Editor
        toolbarExtra={
          <>
            <button className="pill-btn" title="Export as PNG image" onClick={exportPng}>
              PNG
            </button>
            <button
              className="pill-btn"
              title="Export as JSON file"
              onClick={() => exportPlanJson(usePlanStore.getState().plan)}
            >
              Export
            </button>
            <button className="pill-btn" title="Import a JSON file" onClick={() => importPlanJson(setNotice)}>
              Import
            </button>
          </>
        }
      />
      {readOnly && (
        <div className="banner">The plan is already open in another tab — changes here are not saved.</div>
      )}
      {notice && (
        <div className="banner error">
          {notice}
          <button onClick={() => setNotice(null)}>✕</button>
        </div>
      )}
      <ReloadPrompt />
    </>
  )
}
