// PROTOTYPE — floating variant switcher (dev only, not part of any design).
import { useEffect } from 'react'

export function Switcher({
  variants,
  current,
  onChange,
}: {
  variants: { key: string; name: string }[]
  current: string
  onChange: (key: string) => void
}) {
  const idx = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  )
  const step = (d: number) => onChange(variants[(idx + d + variants.length) % variants.length].key)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!import.meta.env.DEV) return null

  return (
    <div className="switcher">
      <button onClick={() => step(-1)} aria-label="Previous variant">
        ◀
      </button>
      <span>
        {variants[idx].key} — {variants[idx].name}
      </span>
      <button onClick={() => step(1)} aria-label="Next variant">
        ▶
      </button>
    </div>
  )
}
