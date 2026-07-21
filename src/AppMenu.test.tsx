import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import AppMenu, { type AppMenuProps } from './AppMenu';
import { mouse, pointer } from './editor/testKit';
import { useThemePreference } from './theme/useThemePreference';

// Browser mode has a real matchMedia, answering for the host machine.
const stubMatchMedia = (systemDark: boolean) => {
  window.matchMedia = ((query: string) =>
    ({
      matches: systemDark && query.includes('dark'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
};

const noop = () => {};

// ADR 0012: the theme preference is App's, the menu is passed it.
// This harness stands in for that owner.
function MenuWithTheme(props: Partial<AppMenuProps>) {
  const [themePreference, setThemePreference] = useThemePreference();
  return (
    <AppMenu
      onOpen={noop}
      onSaveAs={noop}
      onExportImage={noop}
      onReset={noop}
      resetDisabled={false}
      themePreference={themePreference}
      setThemePreference={setThemePreference}
      {...props}
    />
  );
}

const renderMenu = (props: Partial<AppMenuProps> = {}) => render(<MenuWithTheme {...props} />);

const openMenu = () => userEvent.click(page.getByTitle('Menu'));
const themeOption = (title: string) => page.getByTitle(title);
// Accessible name is the label alone: the shortcut hint is aria-hidden.
// Role is `button`, not the ARIA menu pattern's `menuitem`.
const action = (name: string) => page.getByRole('button', { name, exact: true });

const clickOutside = async () => {
  await pointer(document.body, 'pointerdown');
  await pointer(document.body, 'pointerup');
  await mouse(document.body, 'click');
};

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia(false);
  delete document.documentElement.dataset.theme;
});

describe('the burger menu', () => {
  it('stays shut until the burger is pressed', async () => {
    await renderMenu();
    await expect.element(action('Open')).not.toBeInTheDocument();
    await openMenu();
    await expect.element(action('Open')).toBeInTheDocument();
  });

  it.for([
    ['Open', 'onOpen'],
    ['Save as…', 'onSaveAs'],
    ['Export image…', 'onExportImage'],
    ['Reset', 'onReset'],
  ] as const)('runs %s and shuts', async ([name, prop]) => {
    const spy = vi.fn();
    await renderMenu({ [prop]: spy });
    await openMenu();
    await userEvent.click(action(name));
    expect(spy).toHaveBeenCalledOnce();
    await expect.element(action(name)).not.toBeInTheDocument();
  });

  it('shuts on Escape', async () => {
    await renderMenu();
    await openMenu();
    await userEvent.keyboard('{Escape}');
    await expect.element(action('Open')).not.toBeInTheDocument();
  });

  it('shuts when the click lands outside', async () => {
    await renderMenu();
    await openMenu();
    await clickOutside();
    await expect.element(action('Open')).not.toBeInTheDocument();
  });

  // floating-ui anchors on the button, the design on the card around it;
  // --anchor-offset reconciles the two. Positioning lands post-commit, hence poll.
  it('lines its left edge up with the burger card', async () => {
    await renderMenu();
    await openMenu();
    const gapUnderCard = () => {
      const card = document.querySelector('.floating:not(.menu)')!.getBoundingClientRect();
      const dropdown = document.querySelector('.menu')!.getBoundingClientRect();
      return { left: dropdown.left - card.left, top: dropdown.top - card.bottom };
    };
    await expect.poll(gapUnderCard).toEqual({ left: 0, top: 6 });
  });

  it('offers no Reset to run on an empty plan', async () => {
    await renderMenu({ resetDisabled: true });
    await openMenu();
    await expect.element(action('Reset')).toBeDisabled();
  });
});

describe('theme picker', () => {
  it('offers the three options with system active by default', async () => {
    await renderMenu();
    await openMenu();
    expect(themeOption('System theme').element().className).toContain('active');
    expect(themeOption('Light theme').element().className).not.toContain('active');
    expect(themeOption('Dark theme').element().className).not.toContain('active');
  });

  it('applies dark when the dark option is clicked, and persists it', async () => {
    await renderMenu();
    await openMenu();
    await userEvent.click(themeOption('Dark theme'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(themeOption('Dark theme').element().className).toContain('active');
    expect(localStorage.getItem('plan-maker:theme')).toBe('dark');
  });

  it('follows the OS again when switching back to system', async () => {
    stubMatchMedia(true);
    await renderMenu();
    await openMenu();
    await userEvent.click(themeOption('Light theme'));
    expect(document.documentElement.dataset.theme).toBe('light');
    await userEvent.click(themeOption('System theme'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('plan-maker:theme')).toBeNull();
  });

  it('keeps the menu open while picking a theme', async () => {
    await renderMenu();
    await openMenu();
    await userEvent.click(themeOption('Dark theme'));
    await expect.element(themeOption('Light theme')).toBeInTheDocument();
  });
});
