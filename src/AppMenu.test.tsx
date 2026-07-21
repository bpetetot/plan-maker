import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import AppMenu, { type AppMenuProps } from './AppMenu'
import { mouse, pointer } from './editor/testKit'

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
const renderMenu = (props: Partial<AppMenuProps> = {}) =>
  render(
    <AppMenu
      onOpen={noop}
      onSaveAs={noop}
      onExportImage={noop}
      onReset={noop}
      resetDisabled={false}
      {...props}
    />,
  )

const openMenu = () => userEvent.click(page.getByTitle('Menu'))
const themeOption = (title: string) => page.getByTitle(title)
// Located by their label rather than their role: the role is exactly what the
// move to a Popover changes, and this contract is meant to outlive it.
const action = (name: string) => page.getByText(name, { exact: true })

// Dismissing by clicking away lands on the page background, not on anything a
// user could name — dispatched by hand, as a full press/release so it reads as
// a click to whoever is listening.
const clickOutside = async () => {
  await pointer(document.body, 'pointerdown')
  await pointer(document.body, 'pointerup')
  await mouse(document.body, 'click')
}

beforeEach(() => {
  localStorage.clear()
  stubMatchMedia(false)
  delete document.documentElement.dataset.theme
})

// The contract of the menu itself — what opens it, what shuts it, what runs.
// Stated in terms a user would use, so it holds whoever implements it.
describe('the burger menu', () => {
  it('stays shut until the burger is pressed', async () => {
    await renderMenu()
    await expect.element(action('Open')).not.toBeInTheDocument()
    await openMenu()
    await expect.element(action('Open')).toBeInTheDocument()
  })

  it.for([
    ['Open', 'onOpen'],
    ['Save as…', 'onSaveAs'],
    ['Export image…', 'onExportImage'],
    ['Reset', 'onReset'],
  ] as const)('runs %s and shuts', async ([name, prop]) => {
    const spy = vi.fn()
    await renderMenu({ [prop]: spy })
    await openMenu()
    await userEvent.click(action(name))
    expect(spy).toHaveBeenCalledOnce()
    await expect.element(action(name)).not.toBeInTheDocument()
  })

  it('shuts on Escape', async () => {
    await renderMenu()
    await openMenu()
    await userEvent.keyboard('{Escape}')
    await expect.element(action('Open')).not.toBeInTheDocument()
  })

  it('shuts when the click lands outside', async () => {
    await renderMenu()
    await openMenu()
    await clickOutside()
    await expect.element(action('Open')).not.toBeInTheDocument()
  })

  // floating-ui anchors on the button, while the design lines the dropdown up
  // with the card around it — the --anchor-offset reconciling the two reads as
  // dead weight without this. Positioning lands after the commit, hence poll.
  it('lines its left edge up with the burger card', async () => {
    await renderMenu()
    await openMenu()
    const gapUnderCard = () => {
      const card = document.querySelector('.floating:not(.menu)')!.getBoundingClientRect()
      const dropdown = document.querySelector('.menu')!.getBoundingClientRect()
      return { left: dropdown.left - card.left, top: dropdown.top - card.bottom }
    }
    await expect.poll(gapUnderCard).toEqual({ left: 0, top: 6 })
  })

  it('offers no Reset to run on an empty plan', async () => {
    await renderMenu({ resetDisabled: true })
    await openMenu()
    await expect.element(action('Reset')).toBeDisabled()
  })
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
