import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR_MS = 60 * 60 * 1000

// Spec §6: prompt update flow — the user chooses when to reload, so unsaved
// in-memory editor state (undo history, selection) is never lost silently.
export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) setInterval(() => registration.update(), HOUR_MS)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="banner">
      A new version is available.
      <button className="banner-action" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
      <button onClick={() => setNeedRefresh(false)}>✕</button>
    </div>
  )
}
