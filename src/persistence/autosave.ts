import type { Plan } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { savePlan } from './storage'

export interface AutosaveOptions {
  debounceMs?: number
  onError?: (error: unknown) => void
}

// Spec §5: flush on visibilitychange/pagehide, not beforeunload.
export function startAutosave({ debounceMs = 400, onError }: AutosaveOptions = {}): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Plan | null = null

  const write = (plan: Plan) => {
    savePlan(plan).catch((error) => onError?.(error))
  }

  const flush = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (pending !== null) {
      const plan = pending
      pending = null
      write(plan)
    }
  }

  const unsubscribe = usePlanStore.subscribe((state, previous) => {
    if (state.plan === previous.plan) return
    pending = state.plan
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  })

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flush)
  }

  return () => {
    unsubscribe()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flush)
    }
    flush()
  }
}

export function acquireWriterLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(true)
  return new Promise((resolve) => {
    navigator.locks
      .request('plan-maker:writer', { ifAvailable: true }, async (lock) => {
        resolve(lock !== null)
        if (lock !== null) await new Promise(() => {}) // hold forever
      })
      .catch(() => resolve(true))
  })
}

export function requestPersistentStorage(): void {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {})
  }
}
