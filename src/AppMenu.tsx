// Floating burger menu (top-left) with the app-level file actions.
import { Eraser, FolderOpen, ImageDown, Menu, Save } from 'lucide-react'
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
        className="floating-btn icon"
        title="Menu"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Menu size={16} aria-hidden />
      </button>
      {open && (
        <div className="floating menu" role="menu">
          <button className="menu-item" role="menuitem" onClick={run(onOpen)}>
            <FolderOpen size={16} aria-hidden /> Open
          </button>
          <button className="menu-item" role="menuitem" onClick={run(onSaveAs)}>
            <Save size={16} aria-hidden /> Save as…
          </button>
          <button className="menu-item" role="menuitem" onClick={run(onExportImage)}>
            <ImageDown size={16} aria-hidden /> Export image…
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item danger-item"
            role="menuitem"
            disabled={resetDisabled}
            onClick={run(onReset)}
          >
            <Eraser size={16} aria-hidden /> Reset
          </button>
        </div>
      )}
    </div>
  )
}
