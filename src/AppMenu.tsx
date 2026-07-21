import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import {
  CircleQuestionMark,
  Eraser,
  FolderOpen,
  ImageDown,
  Menu,
  Monitor,
  Moon,
  Save,
  Sun,
} from 'lucide-react'
import { openHelp } from './editor/helpStore'
import { keyHint } from './editor/useAppHotkeys'
import type { ShortcutAction } from './editor/useAppHotkeys'
import type { ThemePreference } from './theme/theme'

const THEME_OPTIONS: { value: ThemePreference; title: string; Icon: typeof Monitor }[] = [
  { value: 'system', title: 'System theme', Icon: Monitor },
  { value: 'light', title: 'Light theme', Icon: Sun },
  { value: 'dark', title: 'Dark theme', Icon: Moon },
]

export interface AppMenuProps {
  onOpen: () => void
  onSaveAs: () => void
  onExportImage: () => void
  onReset: () => void
  resetDisabled: boolean
  themePreference: ThemePreference
  setThemePreference: (preference: ThemePreference) => void
}

// aria-hidden: the hint is glyphs ("⌘ ⇧ E"), unreadable aloud.
const Hint = ({ action }: { action: ShortcutAction }) => (
  <span className="menu-hint" aria-hidden>
    {keyHint(action)}
  </span>
)

// Popover, not Menu: a menu's roving tabindex would strand the theme buttons.
export default function AppMenu({
  onOpen,
  onSaveAs,
  onExportImage,
  onReset,
  resetDisabled,
  themePreference,
  setThemePreference,
}: AppMenuProps) {
  return (
    <Popover>
      <div className="floating" style={{ position: 'fixed', top: 16, left: 16 }}>
        <PopoverButton className="floating-btn icon" title="Menu" aria-label="Menu">
          <Menu size={16} aria-hidden />
        </PopoverButton>
      </div>
      <PopoverPanel anchor="bottom start" className="floating menu">
        {({ close }) => {
          const run = (action: () => void) => () => {
            close()
            action()
          }
          return (
            <>
              <button className="menu-item" onClick={run(onOpen)}>
                <FolderOpen size={16} aria-hidden /> Open
                <Hint action="open" />
              </button>
              <button className="menu-item" onClick={run(onSaveAs)}>
                <Save size={16} aria-hidden /> Save as…
                <Hint action="saveAs" />
              </button>
              <button className="menu-item" onClick={run(onExportImage)}>
                <ImageDown size={16} aria-hidden /> Export image…
                <Hint action="exportImage" />
              </button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={run(openHelp)}>
                <CircleQuestionMark size={16} aria-hidden /> Help
                <Hint action="help" />
              </button>
              <div className="menu-sep" />
              {/* no close() here: a theme pick is a setting, not an action */}
              <div className="menu-row">
                <span>Theme</span>
                <div className="menu-row-group" role="group" aria-label="Theme">
                  {THEME_OPTIONS.map(({ value, title, Icon }) => (
                    <button
                      key={value}
                      className={themePreference === value ? 'floating-btn icon active' : 'floating-btn icon'}
                      title={title}
                      aria-label={title}
                      aria-pressed={themePreference === value}
                      onClick={() => setThemePreference(value)}
                    >
                      <Icon size={16} aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
              <div className="menu-sep" />
              <button className="menu-item danger-item" disabled={resetDisabled} onClick={run(onReset)}>
                <Eraser size={16} aria-hidden /> Reset
                <Hint action="reset" />
              </button>
            </>
          )
        }}
      </PopoverPanel>
    </Popover>
  )
}
