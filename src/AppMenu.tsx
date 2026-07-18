// Floating burger menu (top-left) with the app-level file actions.
import { useEffect, useRef, useState } from 'react'

export interface AppMenuProps {
  onOpen: () => void
  onSaveAs: () => void
  onExportImage: () => void
  onReset: () => void
  resetDisabled: boolean
}

export default function AppMenu({ onOpen, onSaveAs, onExportImage, onReset, resetDisabled }: AppMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div ref={ref} className="floating" style={{ position: 'fixed', top: 16, left: 16 }}>
      <button
        className="floating-btn"
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ☰
      </button>
      {open && (
        <div className="floating menu" role="menu">
          <button className="menu-item" role="menuitem" onClick={run(onOpen)}>
            Open
          </button>
          <button className="menu-item" role="menuitem" onClick={run(onSaveAs)}>
            Save as…
          </button>
          <button className="menu-item" role="menuitem" onClick={run(onExportImage)}>
            Export image…
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item danger-item"
            role="menuitem"
            disabled={resetDisabled}
            onClick={run(onReset)}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  )
}
