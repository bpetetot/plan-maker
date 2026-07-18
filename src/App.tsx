import { useEffect, useState } from 'react'
import Editor from './editor/Editor'
import { acquireWriterLock, requestPersistentStorage, startAutosave } from './persistence/autosave'
import { loadPlan } from './persistence/storage'
import { replacePlan } from './store/planStore'

type BootState = 'loading' | 'ready'

export default function App() {
  const [boot, setBoot] = useState<BootState>('loading')
  const [readOnly, setReadOnly] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
            setSaveError(quota ? 'Storage is full — the plan can no longer be saved.' : 'Saving the plan failed.')
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

  return (
    <>
      <Editor />
      {readOnly && (
        <div className="banner">The plan is already open in another tab — changes here are not saved.</div>
      )}
      {saveError && (
        <div className="banner error">
          {saveError}
          <button onClick={() => setSaveError(null)}>✕</button>
        </div>
      )}
    </>
  )
}
