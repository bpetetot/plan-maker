import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR_MS = 60 * 60 * 1000

// Spec §6: prompt update flow — the user chooses when to reload, so unsaved
// in-memory editor state (undo history, selection) is never lost silently.
export default function ReloadPrompt() {
  const updateInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) updateInterval.current = setInterval(() => registration.update(), HOUR_MS)
    },
  })

  useEffect(
    () => () => {
      if (updateInterval.current !== null) clearInterval(updateInterval.current)
    },
    [],
  )

  if (!needRefresh) return null

  return (
    <div className="banner">
      A new version is available.
      <button className="banner-action" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
      <button title="Dismiss" aria-label="Dismiss" onClick={() => setNeedRefresh(false)}>
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
