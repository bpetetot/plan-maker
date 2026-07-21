import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import AppMenu from './AppMenu'

// The browser has a real matchMedia, reporting whatever the machine running
// the suite prefers; pin it so the system option has a known answer.
const stubMatchMedia = (systemDark: boolean) => {
  window.matchMedia = ((query: string) =>
    ({
      matches: systemDark && query.includes('dark'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

const noop = () => {}
const renderMenu = () =>
  render(<AppMenu onOpen={noop} onSaveAs={noop} onExportImage={noop} onReset={noop} resetDisabled={false} />)

const openMenu = () => userEvent.click(page.getByTitle('Menu'))
const themeOption = (title: string) => page.getByTitle(title)

beforeEach(() => {
  localStorage.clear()
  stubMatchMedia(false)
  delete document.documentElement.dataset.theme
})

describe('theme picker', () => {
  it('offers the three options with system active by default', async () => {
    await renderMenu()
    await openMenu()
    expect(themeOption('System theme').element().className).toContain('active')
    expect(themeOption('Light theme').element().className).not.toContain('active')
    expect(themeOption('Dark theme').element().className).not.toContain('active')
  })

  it('applies dark when the dark option is clicked, and persists it', async () => {
    await renderMenu()
    await openMenu()
    await userEvent.click(themeOption('Dark theme'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(themeOption('Dark theme').element().className).toContain('active')
    expect(localStorage.getItem('plan-maker:theme')).toBe('dark')
  })

  it('follows the OS again when switching back to system', async () => {
    stubMatchMedia(true)
    await renderMenu()
    await openMenu()
    await userEvent.click(themeOption('Light theme'))
    expect(document.documentElement.dataset.theme).toBe('light')
    await userEvent.click(themeOption('System theme'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('plan-maker:theme')).toBeNull()
  })

  it('keeps the menu open while picking a theme', async () => {
    await renderMenu()
    await openMenu()
    await userEvent.click(themeOption('Dark theme'))
    await expect.element(themeOption('Light theme')).toBeInTheDocument()
  })
})
