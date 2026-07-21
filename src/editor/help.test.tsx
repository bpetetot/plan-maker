// The help dialog: the two ways in, the two ways out, and the two guarantees
// that make it worth rendering from the registry — every shortcut is listed,
// and none of them fires while the dialog is up.
import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import AppMenu from '../AppMenu'
import Editor from './Editor'
import ShortcutsDialog from './ShortcutsDialog'
import { closeHelp } from './helpStore'
import { key } from './testKit'
import { SHORTCUT_ACTIONS, keyHint } from './useEditorHotkeys'

// The store outlives the component tree, so a test that leaves the dialog open
// leaks into the next one.
beforeEach(() => {
  localStorage.clear()
  closeHelp()
})

const dialog = () => page.getByRole('dialog')
const noop = () => {}

// The editor registers the shortcut, the dialog reads the same registry — both
// are needed to exercise either half.
const setupEditor = () =>
  render(
    <>
      <Editor />
      <ShortcutsDialog />
    </>,
  )

describe('opening the help dialog', () => {
  it('opens on ? and closes on ?', async () => {
    const { unmount } = await setupEditor()
    await expect.element(dialog()).not.toBeInTheDocument()

    await key('?', { shiftKey: true })
    await expect.element(dialog()).toBeInTheDocument()

    await key('?', { shiftKey: true })
    await expect.element(dialog()).not.toBeInTheDocument()
    await unmount()
  })

  it('closes on Escape', async () => {
    const { unmount } = await setupEditor()
    await key('?', { shiftKey: true })
    await expect.element(dialog()).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await expect.element(dialog()).not.toBeInTheDocument()
    await unmount()
  })

  it('opens from the burger menu', async () => {
    const { unmount } = await render(
      <>
        <AppMenu onOpen={noop} onSaveAs={noop} onExportImage={noop} onReset={noop} resetDisabled={false} />
        <ShortcutsDialog />
      </>,
    )
    await userEvent.click(page.getByTitle('Menu'))
    await userEvent.click(page.getByText('Keyboard shortcuts', { exact: true }))
    await expect.element(dialog()).toBeInTheDocument()
    await unmount()
  })
})

// Headless UI shields Escape and nothing else — every other key still bubbles
// to the document the registry listens on. Without the explicit suppression
// this test is the only thing standing between the reader and an editor that
// changes state behind the panel hiding the result.
describe('the dialog is a mode', () => {
  it('leaves the tool alone when a tool key is pressed', async () => {
    const { unmount } = await setupEditor()
    const select = page.getByLabelText('Select')
    // The initial state follows no dispatch of ours, so it is polled rather
    // than read once.
    await expect.element(select).toHaveAttribute('aria-pressed', 'true')

    await key('?', { shiftKey: true })
    await key('2')

    expect(select.element().getAttribute('aria-pressed')).toBe('true')
    await unmount()
  })
})

// That a registered action reaches the screen at all. The stronger half of the
// guarantee is in the type — an entry with no section does not compile — so
// what is left to check is that the dialog actually renders what the registry
// hands it. Esc appears under two sections, hence first().
describe('every shortcut is documented', () => {
  it('shows the hint of every registered action', async () => {
    const { unmount } = await setupEditor()
    await key('?', { shiftKey: true })

    for (const action of SHORTCUT_ACTIONS)
      await expect.element(page.getByText(keyHint(action), { exact: true }).first()).toBeVisible()
    await unmount()
  })
})

// Escape and right-click both leave a tool. Listed as two rows carrying the
// same words they read as a rendering fault, so the label is what identifies
// an action and the ways to reach it gather on its row.
describe('two ways to one action', () => {
  it('gives them a single row, not one each', async () => {
    const { unmount } = await setupEditor()
    await key('?', { shiftKey: true })

    const label = page.getByText('Back to the Select tool', { exact: true })
    await expect.element(label).toBeVisible()
    expect(label.elements()).toHaveLength(1)

    const row = label.element().closest('.help-row')!
    const keys = [...row.querySelectorAll('.help-key')].map((el) => el.textContent)
    expect(keys).toEqual([keyHint('cancel'), 'Right-click'])
    await unmount()
  })
})

// A dialog with no visible way out is a trap on a touch screen, where there is
// no Escape to press — this app is a PWA.
describe('the close button', () => {
  it('shuts the dialog', async () => {
    const { unmount } = await setupEditor()
    await key('?', { shiftKey: true })

    await userEvent.click(page.getByLabelText('Close'))
    await expect.element(dialog()).not.toBeInTheDocument()
    await unmount()
  })
})
