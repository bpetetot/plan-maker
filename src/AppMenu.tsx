// Floating burger menu (top-left) with the app-level file actions.
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
import type { ThemePreference } from './theme/theme'
import { useThemePreference } from './theme/useThemePreference'

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
}

// A Popover rather than a Menu: the ARIA menu pattern puts a roving tabindex on
// its items, which would take the theme row's buttons out of the keyboard's
// reach. This dropdown mixes actions with a setting, so it is not a menu.
export default function AppMenu({ onOpen, onSaveAs, onExportImage, onReset, resetDisabled }: AppMenuProps) {
  const [themePreference, setThemePreference] = useThemePreference()

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
              </button>
              <button className="menu-item" onClick={run(onSaveAs)}>
                <Save size={16} aria-hidden /> Save as…
              </button>
              <button className="menu-item" onClick={run(onExportImage)}>
                <ImageDown size={16} aria-hidden /> Export image…
              </button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={run(openHelp)}>
                <CircleQuestionMark size={16} aria-hidden /> Help
              </button>
              <div className="menu-sep" />
              {/* picking a theme keeps the panel open — it's a setting, not an action */}
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
              </button>
            </>
          )
        }}
      </PopoverPanel>
    </Popover>
  )
}
