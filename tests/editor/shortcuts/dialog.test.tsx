import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import AppMenu from '../../../src/AppMenu';
import { EditorWithHotkeys } from '../../harness';
import ShortcutsDialog from '../../../src/editor/ShortcutsDialog';
import { closeHelp } from '../../../src/editor/helpStore';
import { key } from '../../kit';
import { SHORTCUT_ACTIONS, keyHint } from '../../../src/editor/useAppHotkeys';

// The help store outlives the tree: a dialog left open leaks into the next test.
beforeEach(() => {
  localStorage.clear();
  closeHelp();
});

const dialog = () => page.getByRole('dialog');
const noop = () => {};

const setupEditor = () =>
  render(
    <>
      <EditorWithHotkeys />
      <ShortcutsDialog />
    </>,
  );

describe('opening the help dialog', () => {
  it('opens on ? and closes on ?', async () => {
    const { unmount } = await setupEditor();
    await expect.element(dialog()).not.toBeInTheDocument();

    await key('?', { shiftKey: true });
    await expect.element(dialog()).toBeInTheDocument();

    await key('?', { shiftKey: true });
    await expect.element(dialog()).not.toBeInTheDocument();
    await unmount();
  });

  it('closes on Escape', async () => {
    const { unmount } = await setupEditor();
    await key('?', { shiftKey: true });
    await expect.element(dialog()).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog()).not.toBeInTheDocument();
    await unmount();
  });

  it('opens from the burger menu', async () => {
    const { unmount } = await render(
      <>
        <AppMenu onOpen={noop} onSaveAs={noop} onExportImage={noop} onReset={noop} resetDisabled={false} />
        <ShortcutsDialog />
      </>,
    );
    await userEvent.click(page.getByTitle('Menu'));
    // exact: the item's accessible name carries its shortcut too
    await userEvent.click(page.getByRole('button', { name: 'Help', exact: true }));
    await expect.element(dialog()).toBeInTheDocument();
    await unmount();
  });
});

// Headless UI shields Escape only; every other key still bubbles to the
// document the registry listens on.
describe('the dialog is a mode', () => {
  it('leaves the tool alone when a tool key is pressed', async () => {
    const { unmount } = await setupEditor();
    const select = page.getByLabelText('Select');
    // No dispatch precedes this state, so poll rather than read once.
    await expect.element(select).toHaveAttribute('aria-pressed', 'true');

    await key('?', { shiftKey: true });
    await key('2');

    expect(select.element().getAttribute('aria-pressed')).toBe('true');
    await unmount();
  });
});

// Esc appears under two sections, hence first().
describe('every shortcut is documented', () => {
  it('shows the hint of every registered action', async () => {
    const { unmount } = await setupEditor();
    await key('?', { shiftKey: true });

    for (const action of SHORTCUT_ACTIONS)
      await expect.element(page.getByText(keyHint(action), { exact: true }).first()).toBeVisible();
    await unmount();
  });
});

describe('the gestures are documented beside the keys', () => {
  it('lists the two things Shift does, one row each', async () => {
    const { unmount } = await setupEditor();
    await key('?', { shiftKey: true });

    await expect.element(page.getByText('Add to the selection', { exact: true })).toBeVisible();
    await expect.element(page.getByText('Lock the move to one axis', { exact: true })).toBeVisible();
    await unmount();
  });
});

describe('two ways to one action', () => {
  it('gives them a single row, not one each', async () => {
    const { unmount } = await setupEditor();
    await key('?', { shiftKey: true });

    const label = page.getByText('Back to the Select tool', { exact: true });
    await expect.element(label).toBeVisible();
    expect(label.elements()).toHaveLength(1);

    const row = label.element().closest('.help-row')!;
    const keys = [...row.querySelectorAll('.help-key')].map((el) => el.textContent);
    expect(keys).toEqual([keyHint('cancel'), 'Right-click']);
    await unmount();
  });
});

describe('the close button', () => {
  it('shuts the dialog', async () => {
    const { unmount } = await setupEditor();
    await key('?', { shiftKey: true });

    await userEvent.click(page.getByLabelText('Close'));
    await expect.element(dialog()).not.toBeInTheDocument();
    await unmount();
  });
});
