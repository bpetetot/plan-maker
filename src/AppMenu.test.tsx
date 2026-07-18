// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AppMenu from './AppMenu'

// jsdom has no matchMedia; stub it with a fixed system preference.
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

const openMenu = () => fireEvent.click(screen.getByTitle('Menu'))

beforeEach(() => {
  localStorage.clear()
  stubMatchMedia(false)
  delete document.documentElement.dataset.theme
})

afterEach(cleanup)

describe('theme picker', () => {
  it('offers the three options with system active by default', () => {
    renderMenu()
    openMenu()
    expect(screen.getByTitle('System theme').className).toContain('active')
    expect(screen.getByTitle('Light theme').className).not.toContain('active')
    expect(screen.getByTitle('Dark theme').className).not.toContain('active')
  })

  it('applies dark when the dark option is clicked, and persists it', () => {
    renderMenu()
    openMenu()
    fireEvent.click(screen.getByTitle('Dark theme'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByTitle('Dark theme').className).toContain('active')
    expect(localStorage.getItem('plan-maker:theme')).toBe('dark')
  })

  it('follows the OS again when switching back to system', () => {
    stubMatchMedia(true)
    renderMenu()
    openMenu()
    fireEvent.click(screen.getByTitle('Light theme'))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(screen.getByTitle('System theme'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('plan-maker:theme')).toBeNull()
  })

  it('keeps the menu open while picking a theme', () => {
    renderMenu()
    openMenu()
    fireEvent.click(screen.getByTitle('Dark theme'))
    expect(screen.getByTitle('Light theme')).toBeTruthy()
  })
})
