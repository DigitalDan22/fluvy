// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setWorn } from '../shell/patches.js';
import { SUBVIEW_ATTRIBUTE, VIEW_EVENT } from '../look/view.js';
import {
  CHROME_DEFAULTS,
  cssString,
  dashboardTitle,
  DASHBOARD_TITLE_VAR,
  markRoot,
  markRoots,
  marksFor,
  patchViewRoots,
  TAB_CONTENT_ATTRIBUTE,
  TAB_TITLE_ATTRIBUTE,
  TABS_ATTRIBUTE,
  TABS_DEFAULTS,
  type Chrome,
  type RootElement,
  type TabsFor,
  type ViewTabs,
} from '../look/tabs.js';

const root = (panelUrl: string, extra: Partial<RootElement> = {}): RootElement =>
  Object.assign(document.createElement('div'), {
    hass: {
      panelUrl,
      panels: { 'fluvy-home': { title: 'Home' }, lovelace: { title: null } },
      localize: (key: string) => (key === 'panel.states' ? 'Übersicht' : key),
    },
    lovelace: { editMode: false, config: {} },
    ...extra,
  }) as RootElement;

const only =
  (tabs: ViewTabs | null, path = 'fluvy-home', chrome: Chrome = CHROME_DEFAULTS): TabsFor =>
  (url) =>
    url === path && tabs ? { tabs, chrome } : null;

describe('the dashboard name before the tabs', () => {
  it('is its configuration’s title, else its sidebar name, else "Overview" in the person’s language', () => {
    expect(dashboardTitle(root('fluvy-home'))).toBe('Home');
    expect(dashboardTitle(root('fluvy-home', { lovelace: { config: { title: ' Casa ' } } }))).toBe(
      'Casa',
    );
    expect(dashboardTitle(root('lovelace'))).toBe('Übersicht');
    expect(dashboardTitle(root('unknown'))).toBe('');
  });

  it('is written as a CSS string that cannot break out of its quotes', () => {
    expect(cssString('Home')).toBe('"Home"');
    expect(cssString('A "b" \\ c\nd')).toBe('"A \\"b\\" \\\\ c d"');
  });
});

describe('the marks on a dashboard’s header', () => {
  it('follow the house’s choice on the dashboards that wear the look', () => {
    const el = root('fluvy-home');
    expect(markRoot(el, marksFor(el, only(TABS_DEFAULTS)))).toBe(true);
    expect(el.getAttribute(TABS_ATTRIBUTE)).toBe('fluvy');
    expect(el.getAttribute(TAB_CONTENT_ATTRIBUTE)).toBe('names');
    expect(el.hasAttribute(TAB_TITLE_ATTRIBUTE)).toBe(true);
    expect(el.style.getPropertyValue(DASHBOARD_TITLE_VAR)).toBe('"Home"');
    // nothing moved: nothing is written again
    expect(markRoot(el, marksFor(el, only(TABS_DEFAULTS)))).toBe(false);
    markRoot(el, marksFor(el, only({ style: 'pills', content: 'both', title: false })));
    expect(el.getAttribute(TABS_ATTRIBUTE)).toBe('pills');
    expect(el.hasAttribute(TAB_TITLE_ATTRIBUTE)).toBe(false);
    expect(el.style.getPropertyValue(DASHBOARD_TITLE_VAR)).toBe('');
  });

  it('leave Home Assistant’s header alone: another dashboard, the edit mode, its own tabs without the name', () => {
    const el = root('fluvy-home');
    markRoot(el, marksFor(el, only(TABS_DEFAULTS)));
    expect(marksFor(root('lovelace'), only(TABS_DEFAULTS))).toBeNull();
    expect(marksFor(el, only({ ...TABS_DEFAULTS, style: 'ha', title: false }))).toBeNull();
    el.lovelace = { editMode: true, config: {} };
    expect(markRoot(el, marksFor(el, only(TABS_DEFAULTS)))).toBe(true);
    expect([...el.attributes].map((a) => a.name).filter((n) => n.startsWith('fluvy'))).toEqual([]);
    expect(el.style.getPropertyValue(DASHBOARD_TITLE_VAR)).toBe('');
  });

  it('put the name before the tabs in every style, as its own choice', () => {
    const el = root('fluvy-home');
    // Home Assistant's own tabs, untouched, with the name before them
    markRoot(el, marksFor(el, only({ style: 'ha', content: 'names', title: true })));
    expect(el.hasAttribute(TABS_ATTRIBUTE)).toBe(false);
    expect(el.hasAttribute(TAB_CONTENT_ATTRIBUTE)).toBe(false);
    expect(el.hasAttribute(TAB_TITLE_ATTRIBUTE)).toBe(true);
    // hidden tabs: the name only when it is asked for
    markRoot(el, marksFor(el, only({ style: 'hidden', content: 'names', title: false })));
    expect(el.getAttribute(TABS_ATTRIBUTE)).toBe('hidden');
    expect(el.hasAttribute(TAB_TITLE_ATTRIBUTE)).toBe(false);
    markRoot(el, marksFor(el, only({ style: 'hidden', content: 'names', title: true })));
    expect(el.hasAttribute(TAB_TITLE_ATTRIBUTE)).toBe(true);
  });

  it('follow each update of hui-root, after Home Assistant’s own, and every root when the settings change', async () => {
    class Root extends HTMLElement {
      updates = 0;
      redraws = 0;
      #narrow = false;
      // Home Assistant's: a reactive property on the prototype, read by the actions' render
      get narrow(): boolean {
        return this.#narrow;
      }
      set narrow(value: boolean) {
        this.#narrow = value;
        this.redraws += 1;
      }
      updated(): void {
        this.updates += 1;
      }
      requestUpdate(): void {
        this.redraws += 1;
      }
      _renderActionItems(): string {
        return this.narrow ? 'one menu' : 'buttons';
      }
    }
    customElements.define('hui-root', Root);
    let tabs: ViewTabs | null = TABS_DEFAULTS;
    let chrome: Chrome = CHROME_DEFAULTS;
    const tabsFor: TabsFor = (url) => (url === 'fluvy-home' && tabs ? { tabs, chrome } : null);
    expect(await patchViewRoots(customElements, tabsFor)).toBe(true);
    const { hass, lovelace } = root('fluvy-home');
    const el = Object.assign(document.createElement('hui-root'), { hass, lovelace }) as Root &
      RootElement;
    document.body.append(el);
    el.updated();
    expect(el.updates).toBe(1);
    expect(el.getAttribute(TABS_ATTRIBUTE)).toBe('fluvy');
    tabs = { style: 'pills', content: 'icons', title: true };
    markRoots(document, tabsFor);
    expect(el.getAttribute(TABS_ATTRIBUTE)).toBe('pills');
    // the actions in one menu: the root draws them again, as on a phone, and its own `narrow` stays as it was
    chrome = { ...CHROME_DEFAULTS, actions: 'menu' };
    expect(el._renderActionItems()).toBe('buttons');
    markRoots(document, tabsFor);
    expect(el.hasAttribute('fluvy-actions-menu')).toBe(true);
    expect(el.redraws).toBe(1);
    expect(el._renderActionItems()).toBe('one menu');
    expect(el.narrow).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(el, 'narrow')).toBe(false);
    expect(el.redraws).toBe(1);
    tabs = null;
    markRoots(document, tabsFor);
    expect(el.hasAttribute(TABS_ATTRIBUTE)).toBe(false);
    expect(el._renderActionItems()).toBe('buttons');
    el.remove();
  });

  it('mark the header’s corner: on the page’s colour, without its hairline, in every style', () => {
    const el = root('fluvy-home');
    const corner = {
      logo: true,
      dividers: false,
      header: 'page',
      actions: 'buttons',
      separators: [],
    } as const;
    markRoot(
      el,
      marksFor(el, only({ style: 'ha', content: 'names', title: false }, 'fluvy-home', corner)),
    );
    expect(el.hasAttribute('fluvy-header-page')).toBe(true);
    expect(el.hasAttribute('fluvy-flat')).toBe(true);
    expect(el.hasAttribute(TABS_ATTRIBUTE)).toBe(false);
    markRoot(el, marksFor(el, only(TABS_DEFAULTS)));
    expect(el.hasAttribute('fluvy-header-page')).toBe(false);
    expect(el.hasAttribute('fluvy-flat')).toBe(false);
  });
});

describe('hui-root’s wraps', () => {
  /** A dashboard's root of its own (a fresh class: each is wrapped once), its `narrow` Home Assistant's property. */
  const rootClass = () =>
    class extends HTMLElement {
      updates = 0;
      renders = 0;
      get narrow(): boolean {
        return false;
      }
      updated(): void {
        this.updates += 1;
      }
      _renderActionItems(): string {
        this.renders += 1;
        return this.narrow ? 'one menu' : 'buttons';
      }
    };
  type Root = InstanceType<ReturnType<typeof rootClass>> & RootElement;
  /** Answers `hui-root` with `klass`, defined under a name of its own (the page has its `hui-root` already). */
  const registryOf = (klass: CustomElementConstructor, name: string): CustomElementRegistry => {
    customElements.define(name, klass);
    return {
      whenDefined: () => Promise.resolve(klass),
      get: (tag: string) => (tag === 'hui-root' ? klass : undefined),
    } as unknown as CustomElementRegistry;
  };
  const visit = (url: string): void =>
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
  afterEach(() => {
    setWorn(() => false);
    visit('http://localhost:3000/');
  });

  it('take the marks off a dashboard that does not wear the look, and tell a subview only where Fluvy is in use', async () => {
    const Root = rootClass();
    const tabsFor: TabsFor = (url) =>
      url === 'fluvy-home' ? { tabs: TABS_DEFAULTS, chrome: CHROME_DEFAULTS } : null;
    expect(await patchViewRoots(registryOf(Root, 'test-root-1'), tabsFor)).toBe(true);
    const el = document.body.appendChild(new Root()) as Root;
    Object.assign(el, {
      hass: { panelUrl: 'fluvy-home' },
      lovelace: { editMode: false, config: { views: [{ subview: true, title: 'Lamp' }] } },
      _curView: 0,
    });
    const told: unknown[] = [];
    window.addEventListener(VIEW_EVENT, (event) => told.push((event as CustomEvent).detail));
    setWorn((url) => url === 'fluvy-home');
    visit('http://localhost:3000/fluvy-home/lamp');
    el.updated();
    expect(el.updates).toBe(1);
    expect(el.getAttribute(TABS_ATTRIBUTE)).toBe('fluvy');
    expect(el.hasAttribute(SUBVIEW_ATTRIBUTE)).toBe(true);
    expect(told).toHaveLength(1);
    // Home Assistant keeps the root for the next dashboard, which does not wear the look
    el.hass = { panelUrl: 'lovelace' };
    visit('http://localhost:3000/lovelace/lamp');
    el.updated();
    expect(el.updates).toBe(2);
    expect(el.hasAttribute(TABS_ATTRIBUTE)).toBe(false);
    expect(el.hasAttribute(SUBVIEW_ATTRIBUTE)).toBe(false);
    expect(told).toHaveLength(1);
    expect([...el.attributes].filter((a) => a.name.startsWith('fluvy'))).toEqual([]);
  });

  // last in the file: a patch that stepped aside stays aside for the session
  it('step aside when ours throws: Home Assistant’s update and its actions’ render still run, once each', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Root = rootClass();
    const tabsFor = vi.fn((): null => {
      throw new TypeError('reshaped');
    });
    await patchViewRoots(registryOf(Root, 'test-root-2'), tabsFor);
    const el = document.body.appendChild(new Root()) as Root;
    el.hass = { panelUrl: 'fluvy-home' };
    el.updated();
    el.updated();
    expect(el.updates).toBe(2);
    expect(tabsFor).toHaveBeenCalledTimes(1);
    // the one menu cannot be lent (a root that takes no own value): Home Assistant's buttons, drawn once
    el.setAttribute('fluvy-actions-menu', '');
    Object.preventExtensions(el);
    expect(el._renderActionItems()).toBe('buttons');
    expect(el.renders).toBe(1);
    expect(warn.mock.calls.map(([text]) => String(text).split(':')[0])).toEqual([
      '[fluvy] viewRoots stepped aside',
      '[fluvy] actionsMenu stepped aside',
    ]);
    warn.mockRestore();
  });
});
