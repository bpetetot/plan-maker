// Rendered from the shortcut registry (ADR 0011): layout only.
// Shortcuts are added in useAppHotkeys, never here.
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { X } from 'lucide-react'
import { closeHelp, useHelpDialog } from './helpStore'
import { HELP_SECTIONS, helpRows } from './useAppHotkeys'

export default function ShortcutsDialog() {
  const open = useHelpDialog((s) => s.open)
  return (
    <Dialog open={open} onClose={closeHelp} className="help-dialog">
      <div className="help-backdrop" aria-hidden />
      <DialogPanel className="help-panel">
        <div className="help-header">
          <DialogTitle className="help-title">Help</DialogTitle>
          <button className="floating-btn icon" title="Close" aria-label="Close" onClick={closeHelp}>
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="help-sections">
          {HELP_SECTIONS.map(({ id, title, startsColumn }) => (
            <section key={id} className={startsColumn ? 'help-section starts-column' : 'help-section'}>
              <h3 className="panel-section-label">{title}</h3>
              <div className="help-list">
                {helpRows(id).map(({ keys, label }) => (
                  <div key={label} className="help-row">
                    <span className="help-label">{label}</span>
                    <span className="help-keys">
                      {keys.map((k, i) => (
                        <span key={k}>
                          {i > 0 && <span className="help-or">or</span>}
                          <span className="help-key">{k}</span>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
