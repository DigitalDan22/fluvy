// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../controls/select.js';
import type { FluvySelect, SelectChangeDetail, SelectOption } from '../controls/select.js';
import { setMotionPreference } from '../motion.js';

const LANGUAGES: readonly SelectOption[] = [
  { value: 'auto', label: 'Automatic', hint: 'English' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch', hint: 'German' },
  { value: 'es', label: 'Español', hint: 'Spanish' },
  { value: 'fr', label: 'Français', hint: 'French' },
  { value: 'it', label: 'Italiano', hint: 'Italian' },
  { value: 'nl', label: 'Nederlands', hint: 'Dutch' },
  { value: 'pt-BR', label: 'Português', hint: 'Portuguese (Brazil)' },
];

/** The test DOM has no top layer (`showPopover` is absent): the fixed fallback runs natively. */
async function select(value = 'en', options: Partial<FluvySelect> = {}) {
  const node = document.createElement('fluvy-select');
  node.value = value;
  node.options = LANGUAGES;
  node.label = 'Language';
  Object.assign(node, options);
  document.body.append(node);
  await node.updateComplete;
  const changes: string[] = [];
  node.addEventListener('fluvy-change', (event) =>
    changes.push((event as CustomEvent<SelectChangeDetail>).detail.value),
  );
  const haptics: string[] = [];
  node.addEventListener('haptic', (event) => haptics.push(String((event as CustomEvent).detail)));
  const field = () => node.shadowRoot!.querySelector<HTMLButtonElement>('.fv-select')!;
  const menu = () => node.shadowRoot!.querySelector<HTMLElement>('.fv-menu');
  const rows = () => [...node.shadowRoot!.querySelectorAll<HTMLElement>('.fv-menu__item')];
  const active = () =>
    rows()
      .find((row) => row.classList.contains('is-active'))
      ?.textContent?.trim();
  const key = async (name: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    field().dispatchEvent(event);
    await node.updateComplete;
    return event;
  };
  return { node, changes, haptics, field, menu, rows, active, key };
}

describe('the dropdown', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setMotionPreference('system');
    vi.useRealTimers();
  });

  it('shows the chosen label, closed, with the field’s accessible name', async () => {
    const { field, menu } = await select('es');
    expect(field().textContent?.trim()).toBe('Español');
    expect(field().getAttribute('aria-expanded')).toBe('false');
    expect(field().getAttribute('aria-label')).toBe('Language');
    expect(menu()).toBeNull();
  });

  it('opens on ↓ with the chosen row active, and on Enter, Space, Home and End', async () => {
    const { node, key, menu, active, field } = await select('es');
    await key('ArrowDown');
    expect(menu()).not.toBeNull();
    expect(node.open).toBe(true);
    expect(active()).toContain('Español');
    expect(field().getAttribute('aria-activedescendant')).toBe('opt-3');
    await key('Escape');
    for (const name of ['Enter', ' ', 'Home', 'End']) {
      await key(name);
      expect(node.open, name).toBe(true);
      await key('Escape');
    }
    await key('Home');
    expect(active()).toContain('Automatic');
    await key('Escape');
    await key('End');
    expect(active()).toContain('Português');
  });

  it('moves without wrapping, jumps by page, and skips what cannot be chosen', async () => {
    const { node, key, active } = await select('en', {
      options: [
        ...LANGUAGES.slice(0, 2),
        { value: 'off', label: 'Off', disabled: true },
        ...LANGUAGES.slice(3),
      ],
    });
    await key('ArrowDown');
    expect(active()).toContain('English');
    await key('ArrowUp');
    expect(active()).toContain('Automatic');
    await key('ArrowUp');
    expect(active()).toContain('Automatic'); // no wrap
    await key('ArrowDown');
    await key('ArrowDown');
    expect(active()).toContain('Español'); // Off is skipped
    await key('PageDown');
    expect(active()).toContain('Português');
    await key('PageDown');
    expect(active()).toContain('Português'); // clamped
    await key('PageUp');
    expect(active()).toContain('English');
    expect(node.open).toBe(true);
  });

  it('chooses with Enter once, says so once, ticks the haptics, and never for the same value', async () => {
    const { node, key, changes, haptics } = await select('en');
    await key('ArrowDown');
    await key('ArrowDown');
    await key('Enter');
    expect(changes).toEqual(['de']);
    expect(node.value).toBe('de');
    expect(node.open).toBe(false);
    expect(haptics).toEqual(['selection']);
    await key('ArrowDown');
    await key('Enter'); // Deutsch again
    expect(changes).toEqual(['de']);
    expect(haptics).toEqual(['selection']);
  });

  it('closes on Escape without a change, keeps the focus on the field, and tells nobody else', async () => {
    const { node, key, changes, field } = await select('en');
    field().focus();
    await key('ArrowDown');
    await key('ArrowDown');
    const escape = await key('Escape');
    expect(node.open).toBe(false);
    expect(changes).toEqual([]);
    expect(escape.defaultPrevented).toBe(true);
    expect(node.shadowRoot!.activeElement).toBe(field());
  });

  it('chooses on Tab without holding the focus back', async () => {
    const { node, key, changes } = await select('en');
    await key('ArrowDown');
    await key('ArrowDown');
    const tab = await key('Tab');
    expect(changes).toEqual(['de']);
    expect(tab.defaultPrevented).toBe(false);
    expect(node.open).toBe(false);
  });

  it('finds a name from letters, without diacritics, and cycles on a repeated letter', async () => {
    vi.useFakeTimers();
    const { node, key, active } = await select('en');
    await key('e'); // opens on the next name after English that starts so
    expect(node.open).toBe(true);
    expect(active()).toContain('Español');
    await key('s'); // the word grows on the row it is on
    expect(active()).toContain('Español');
    vi.advanceTimersByTime(600);
    await key('p');
    expect(active()).toContain('Português');
    vi.advanceTimersByTime(600);
    for (const letter of 'espan') await key(letter); // no ñ needed
    expect(active()).toContain('Español');
    vi.advanceTimersByTime(600);
    await key('i');
    expect(active()).toContain('Italiano');
    vi.advanceTimersByTime(600);
    await key('e'); // round to English
    expect(active()).toContain('English');
    await key('e'); // the same letter again: the next such name
    expect(active()).toContain('Español');
  });

  it('activates the row under the pointer, chooses on click, and ignores a resting pointer', async () => {
    const { node, key, rows, active, changes } = await select('en');
    await key('ArrowDown');
    const move = (row: HTMLElement, x: number) =>
      row.dispatchEvent(
        new PointerEvent('pointermove', { clientX: x, clientY: 10, bubbles: true }),
      );
    move(rows()[4]!, 20);
    await node.updateComplete;
    expect(active()).toContain('Français');
    await key('ArrowDown'); // the keys move on…
    expect(active()).toContain('Italiano');
    move(rows()[4]!, 20); // …and a pointer that has not moved does not take the row back
    await node.updateComplete;
    expect(active()).toContain('Italiano');
    rows()[6]!.click();
    await node.updateComplete;
    expect(changes).toEqual(['nl']);
    expect(node.open).toBe(false);
  });

  it('closes on a tap outside, on a scroll and on a resize, never on a tap inside', async () => {
    const { node, key, rows } = await select('en');
    await key('ArrowDown');
    rows()[1]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    await node.updateComplete;
    expect(node.open).toBe(true);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await node.updateComplete;
    expect(node.open).toBe(false);
    await key('ArrowDown');
    document.dispatchEvent(new Event('scroll'));
    await node.updateComplete;
    expect(node.open).toBe(false);
    await key('ArrowDown');
    window.dispatchEvent(new Event('resize'));
    await node.updateComplete;
    expect(node.open).toBe(false);
  });

  it('places the menu under the field, as wide as it, and over it near the foot of the page', async () => {
    const { node, key, menu, field } = await select('en');
    const box = (top: number, height = 44, left = 100, width = 300) =>
      ({ top, bottom: top + height, left, right: left + width, width, height }) as DOMRect;
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    field().getBoundingClientRect = () => box(200);
    await key('ArrowDown');
    expect(menu()!.style.getPropertyValue('--fv-menu-top')).toBe('248px'); // 200 + 44 + 4
    expect(menu()!.style.getPropertyValue('--fv-menu-left')).toBe('100px');
    expect(menu()!.style.getPropertyValue('--fv-menu-w')).toBe('300px');
    expect(menu()!.style.getPropertyValue('--fv-menu-h')).toBe('360px'); // 8 + 8 × 44
    expect(menu()!.dataset['placement']).toBe('below');
    await key('Escape');
    // ten rows: eight whole and 24 of the ninth, on the 4 grid, the cut row saying there is more
    node.options = [
      ...LANGUAGES,
      { value: 'tr', label: 'Türkçe', hint: 'Turkish' },
      { value: 'ja', label: '日本語', hint: 'Japanese' },
    ];
    await node.updateComplete;
    await key('ArrowDown');
    expect(menu()!.style.getPropertyValue('--fv-menu-h')).toBe('384px'); // 8 + 8 × 44 + 24
    await key('Escape');
    node.options = LANGUAGES;
    await node.updateComplete;
    // eight rows are 360 tall: from 700 down there is no room, so the menu opens over the field
    field().getBoundingClientRect = () => box(700);
    await key('ArrowDown');
    expect(menu()!.dataset['placement']).toBe('above');
    expect(menu()!.style.getPropertyValue('--fv-menu-top')).toBe('336px'); // 700 − 4 − 360
    await key('Escape');
    // a short viewport: the side with more room, and only as tall as it allows
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true });
    field().getBoundingClientRect = () => box(200);
    await key('ArrowDown');
    expect(menu()!.dataset['placement']).toBe('above'); // 180 above, 136 below
    expect(menu()!.style.getPropertyValue('--fv-menu-h')).toBe('180px');
    expect(menu()!.style.getPropertyValue('--fv-menu-top')).toBe('16px'); // 200 − 4 − 180
    await key('Escape');
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    // a narrow field still gets 192; a field wider than the viewport less its margins is clamped
    field().getBoundingClientRect = () => box(200, 44, 10, 120);
    await key('ArrowDown');
    expect(menu()!.style.getPropertyValue('--fv-menu-w')).toBe('192px');
    expect(menu()!.style.getPropertyValue('--fv-menu-left')).toBe('16px');
    await key('Escape');
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
    field().getBoundingClientRect = () => box(200, 44, 0, 360);
    await key('ArrowDown');
    expect(menu()!.style.getPropertyValue('--fv-menu-w')).toBe('328px');
    expect(node.open).toBe(true);
  });

  it('opens from outside on the chosen row, and forgets the row once the menu has gone', async () => {
    const { node, active, key, menu } = await select('es');
    node.open = true;
    await node.updateComplete;
    expect(active()).toContain('Español');
    await key('ArrowDown');
    expect(active()).toContain('Français');
    node.open = false;
    await node.updateComplete;
    expect(menu()).not.toBeNull(); // on its way out, the row it left on still lit
    await vi.waitFor(() => expect(menu()).toBeNull());
    node.open = true;
    await node.updateComplete;
    expect(active()).toContain('Español');
  });

  it('reflects open, never opens disabled, and uses the top layer when the browser has one', async () => {
    const { node, key, field } = await select('en', { disabled: true });
    await key('ArrowDown');
    expect(node.open).toBe(false);
    field().click();
    expect(node.open).toBe(false);
    node.disabled = false;
    await node.updateComplete;
    const shown = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      value: shown,
      configurable: true,
    });
    try {
      setMotionPreference('reduced'); // no leave animation: the menu hides at once
      await key('ArrowDown');
      expect(node.hasAttribute('open')).toBe(true);
      expect(shown).toHaveBeenCalledTimes(1);
      await key('Escape');
      expect(node.hasAttribute('open')).toBe(false);
    } finally {
      delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
    }
  });

  /*
   * #96: a card row's value opens the list itself; the element draws no field, opens from the button before it, takes
   * the keys while open and gives the focus back.
   */
  describe('anchored to a button before it', () => {
    async function anchored(value = 'en') {
      const row = document.createElement('div');
      const button = document.createElement('button');
      button.setAttribute('aria-expanded', 'false');
      const node = document.createElement('fluvy-select');
      node.anchored = true;
      node.value = value;
      node.options = LANGUAGES;
      node.label = 'Language';
      row.append(button, node);
      document.body.append(row);
      await node.updateComplete;
      const changes: string[] = [];
      node.addEventListener('fluvy-change', (event) =>
        changes.push((event as CustomEvent<SelectChangeDetail>).detail.value),
      );
      const menu = () => node.shadowRoot!.querySelector<HTMLElement>('.fv-menu');
      const key = async (name: string) => {
        const event = new KeyboardEvent('keydown', {
          key: name,
          bubbles: true,
          composed: true,
          cancelable: true,
        });
        menu()!.dispatchEvent(event);
        await node.updateComplete;
        return event;
      };
      return { node, button, changes, menu, key };
    }

    it('draws no field of its own, and lays out as nothing', async () => {
      const { node, menu } = await anchored();
      expect(node.shadowRoot!.querySelector('.fv-select')).toBeNull();
      expect(menu()).toBeNull();
      expect(node.hasAttribute('anchored')).toBe(true);
    });

    it('opens with the focus and the keys, says so on its button, and gives the focus back', async () => {
      const { node, button, menu, key, changes } = await anchored('es');
      button.focus();
      node.open = true;
      await node.updateComplete;
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(node.shadowRoot!.activeElement).toBe(menu());
      expect(menu()!.getAttribute('aria-activedescendant')).toBe('opt-3');
      const down = await key('ArrowDown');
      expect(menu()!.getAttribute('aria-activedescendant')).toBe('opt-4');
      await key('Enter');
      expect(changes).toEqual(['fr']);
      expect(node.open).toBe(false);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button);
      expect(down.defaultPrevented).toBe(true);
    });

    it('keeps its keys from the page, Escape too, and closes with nothing changed', async () => {
      const { node, button, key, changes } = await anchored();
      const heard: string[] = [];
      document.addEventListener('keydown', (event) => heard.push(event.key));
      node.open = true;
      await node.updateComplete;
      await key('d');
      await key('Escape');
      expect(heard).toEqual([]);
      expect(node.open).toBe(false);
      expect(changes).toEqual([]);
      expect(document.activeElement).toBe(button);
    });

    it("leaves its button's own tap to the button (which closes it), and closes on a tap elsewhere", async () => {
      const { node, button } = await anchored();
      node.open = true;
      await node.updateComplete;
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      expect(node.open).toBe(true);
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(node.open).toBe(false);
    });
  });
});
