import { walkShadow } from '../shell/dom.js';
import { always, guard, inUse, wrap } from '../shell/patches.js';
import { markView, SUBVIEW_ATTRIBUTE } from './view.js';

/**
 * A dashboard's view tabs (Home Assistant's own, in its header): how the dashboards that wear the look draw them.
 * `fluvy` — text tabs on the page, the active one in ink with the accent under its name, the dashboard's name before
 * them (as Fluvy's screenshots show); `pills` — each tab a pill, the active one filled; `ha` — Home Assistant's own,
 * untouched; `hidden` — no tabs, the dashboard's name alone (the views are reached from the dashboard itself).
 */
export type TabStyle = 'fluvy' | 'pills' | 'ha' | 'hidden';
export const TAB_STYLES: readonly TabStyle[] = ['fluvy', 'pills', 'ha', 'hidden'];

/** What a tab shows: the view's name, its icon, or both. A view without an icon shows its name whatever the choice. */
export type TabContent = 'names' | 'icons' | 'both';
export const TAB_CONTENTS: readonly TabContent[] = ['names', 'icons', 'both'];

export interface ViewTabs {
  readonly style: TabStyle;
  readonly content: TabContent;
  /** The dashboard's name before the tabs (on a wide screen; a phone keeps the room for the tabs). */
  readonly title: boolean;
}

export const TABS_DEFAULTS: ViewTabs = { style: 'fluvy', content: 'names', title: true };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Stored tabs, each field checked on its own (an unknown value takes the default); undefined when nothing is stored. */
export function parseTabs(raw: unknown): ViewTabs | undefined {
  if (!isRecord(raw)) return undefined;
  const d = TABS_DEFAULTS;
  return {
    style: (TAB_STYLES as readonly unknown[]).includes(raw['style'])
      ? (raw['style'] as TabStyle)
      : d.style,
    content: (TAB_CONTENTS as readonly unknown[]).includes(raw['content'])
      ? (raw['content'] as TabContent)
      : d.content,
    title: typeof raw['title'] === 'boolean' ? raw['title'] : d.title,
  };
}

export const sameTabs = (a: ViewTabs, b: ViewTabs): boolean =>
  a.style === b.style && a.content === b.content && a.title === b.title;

/**
 * The corner of every page: Home Assistant's logo in the sidebar's head in place of its menu glyph (the tap still opens
 * and closes the sidebar; the name at 16, as Fluvy's screenshots draw it), the hairlines under the sidebar's head and
 * under the header, and the header as a bar (the card's fill) or on the page's own colour.
 */
export interface Chrome {
  readonly logo: boolean;
  readonly dividers: boolean;
  readonly header: 'bar' | 'page';
  /** The header's actions (add, search, Assist, edit): Home Assistant's buttons, or its own one menu, as on a phone. */
  readonly actions: 'buttons' | 'menu';
  /**
   * The sidebar's items a line is drawn after (their url paths: a dashboard, a page, an app), to set a group apart;
   * the line follows its item wherever a person's own order puts it.
   */
  readonly separators: readonly string[];
}

export const CHROME_DEFAULTS: Chrome = {
  logo: false,
  dividers: true,
  header: 'bar',
  actions: 'buttons',
  separators: [],
};

/** A panel's url path as Home Assistant makes them (letters, digits, `-` and `_`): safe in an id selector as it is. */
const PANEL_PATH = /^[a-z0-9_-]+$/i;

/** A stored corner, field by field (an unknown value takes the default); undefined when nothing is stored. */
export function parseChrome(raw: unknown): Chrome | undefined {
  if (!isRecord(raw)) return undefined;
  const d = CHROME_DEFAULTS;
  const separators = raw['separators'];
  return {
    logo: typeof raw['logo'] === 'boolean' ? raw['logo'] : d.logo,
    dividers: typeof raw['dividers'] === 'boolean' ? raw['dividers'] : d.dividers,
    header: raw['header'] === 'bar' || raw['header'] === 'page' ? raw['header'] : d.header,
    actions: raw['actions'] === 'buttons' || raw['actions'] === 'menu' ? raw['actions'] : d.actions,
    separators: Array.isArray(separators)
      ? [
          ...new Set(
            separators.filter(
              (path): path is string => typeof path === 'string' && PANEL_PATH.test(path),
            ),
          ),
        ]
      : d.separators,
  };
}

export const sameChrome = (a: Chrome, b: Chrome): boolean =>
  a.logo === b.logo &&
  a.dividers === b.dividers &&
  a.header === b.header &&
  a.actions === b.actions &&
  a.separators.join(' ') === b.separators.join(' ');

/** On `<html>`: Home Assistant's logo in the sidebar's head (the shell's `sidebar-logo` sheet fills on it). */
export const SIDEBAR_LOGO_ATTRIBUTE = 'fluvy-sidebar-logo';
/** On `<html>`: the sidebar's items a line follows, their url paths apart by spaces (the `sidebar-separators` sheet). */
export const SIDEBAR_SEPARATORS_ATTRIBUTE = 'fluvy-sidebar-separators';
/** On `<html>` and on a dashboard's `hui-root`: no hairline under the sidebar's head or the header. */
export const FLAT_ATTRIBUTE = 'fluvy-flat';
/** On `hui-root`: the header on the page's colour, no bar. */
export const HEADER_PAGE_ATTRIBUTE = 'fluvy-header-page';
/** On `hui-root`: the header's actions in Home Assistant's one menu (`patchViewRoots` asks it for its phone's render). */
export const ACTIONS_MENU_ATTRIBUTE = 'fluvy-actions-menu';

/* ---------- the marks on hui-root ---------- */

/** On `hui-root`: the style its tabs take (absent: Home Assistant's own). */
export const TABS_ATTRIBUTE = 'fluvy-tabs';
/** On `hui-root`: what each tab shows. */
export const TAB_CONTENT_ATTRIBUTE = 'fluvy-tab-content';
/** On `hui-root`: the dashboard's name goes before the tabs. */
export const TAB_TITLE_ATTRIBUTE = 'fluvy-tab-title';
/** On `hui-root`: the dashboard's name as a CSS string, for the header's `::before`. */
export const DASHBOARD_TITLE_VAR = '--fluvy-dashboard-title';

/** What a dashboard's root knows of itself (Home Assistant's own properties, read only). */
export type RootElement = HTMLElement & {
  hass?: {
    panelUrl?: string;
    panels?: Record<string, { title?: string | null } | undefined>;
    localize?: (key: string) => string;
  };
  lovelace?: {
    editMode?: boolean;
    config?: {
      title?: string;
      views?: ReadonlyArray<{ subview?: boolean; back_path?: string; title?: string } | undefined>;
    };
  };
  /** The view shown (its index in the configuration), Home Assistant's own state. */
  _curView?: number | string;
  /** Home Assistant's way back from a subview (its view's `back_path`, its history, the dashboard). */
  _goBack?: () => void;
};

/** What a dashboard's header wears: its tabs and the corner. */
export interface HeaderLook {
  readonly tabs: ViewTabs;
  readonly chrome: Chrome;
}

/** The header a dashboard wears, by its url path; null: it does not wear the look (its header stays Home Assistant's). */
export type TabsFor = (urlPath: string | undefined) => HeaderLook | null;

/**
 * The dashboard's name as Home Assistant shows it: its configuration's title, else its sidebar name; the default
 * dashboard has none of its own and is "Overview" in the person's language.
 */
export function dashboardTitle(root: RootElement): string {
  const own = root.lovelace?.config?.title?.trim();
  if (own) return own;
  const url = root.hass?.panelUrl;
  const title = url ? root.hass?.panels?.[url]?.title?.trim() : undefined;
  if (title) return title;
  if (url === 'lovelace') {
    const overview = root.hass?.localize?.('panel.states');
    if (overview && overview !== 'panel.states') return overview;
    return 'Overview';
  }
  return '';
}

/** A text as a CSS string (`content: var(…)`): quoted, its backslashes and quotes escaped, on one line. */
export const cssString = (text: string): string =>
  `"${text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]+/g, ' ')}"`;

interface Marks {
  /** The tabs' style; null: Home Assistant's own (the name may still stand before them). */
  readonly style: Exclude<TabStyle, 'ha'> | null;
  readonly content: TabContent | null;
  readonly title: string;
  /** The header on the page's colour, without its hairline, its actions in one menu. */
  readonly page: boolean;
  readonly flat: boolean;
  readonly menu: boolean;
}

/**
 * The marks a root takes; null keeps Home Assistant's header whole (another dashboard, the edit mode, Home
 * Assistant's own tabs without the name in its own bar). The name is a choice of its own, in every style.
 */
export function marksFor(root: RootElement, tabsFor: TabsFor): Marks | null {
  if (root.lovelace?.editMode) return null;
  const look = tabsFor(root.hass?.panelUrl);
  if (!look) return null;
  const { tabs, chrome } = look;
  const title = tabs.title ? dashboardTitle(root) : '';
  const page = chrome.header === 'page';
  const flat = !chrome.dividers;
  const menu = chrome.actions === 'menu';
  if (tabs.style === 'ha')
    return title || page || flat || menu
      ? { style: null, content: null, title, page, flat, menu }
      : null;
  return { style: tabs.style, content: tabs.content, title, page, flat, menu };
}

/** On `hui-root`: how far the tab row fades at its start and its end (24px where it goes on, 0px where it ends). */
export const FADE_START_VAR = '--fluvy-tabs-fade-start';
export const FADE_END_VAR = '--fluvy-tabs-fade-end';

const watched = new WeakSet<Element>();
const waiting = new WeakSet<Element>();

/**
 * Follows a marked root's tab row as it scrolls (and as it grows or shrinks): the row fades only where it goes on.
 * The row is Web Awesome's own scroller inside `ha-tab-group`; when it cannot be found the sheet's default (the end
 * fades) stands.
 */
function watchRow(root: RootElement): void {
  const group = root.shadowRoot?.querySelector('ha-tab-group') as
    (Element & { updateComplete?: Promise<unknown> }) | null | undefined;
  const nav = group?.shadowRoot?.querySelector('.nav');
  // a group the root has just made draws its row a moment later: look again once it has
  if (group && !nav && !waiting.has(group)) {
    waiting.add(group);
    void group.updateComplete?.then(() => watchRow(root));
    return;
  }
  if (!(nav instanceof HTMLElement) || watched.has(nav)) return;
  watched.add(nav);
  const fade = (): void => {
    const start = nav.scrollLeft > 1;
    const end = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
    root.style.setProperty(FADE_START_VAR, start ? '24px' : '0px');
    root.style.setProperty(FADE_END_VAR, end ? '24px' : '0px');
  };
  nav.addEventListener('scroll', fade, { passive: true });
  // the row's box and its content (views added or renamed) both move the ends
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(fade);
    observer.observe(nav);
    if (nav.firstElementChild) observer.observe(nav.firstElementChild);
  }
  fade();
}

/** On a tab Home Assistant draws with words alone: the icon its view's name says (`--fluvy-tab-icon`, a mask image). */
export const VIEW_ICON_ATTRIBUTE = 'fluvy-icon';
export const VIEW_ICON_VAR = '--fluvy-tab-icon';

const read = new WeakSet<Element>();

/**
 * A row asked for icons whose views have none (Home Assistant then writes their names): each such tab gets the icon
 * its name says, from a table fetched the first time it is needed (`view-icons.ts`); a name it does not know keeps its
 * words. Each tab is read once.
 */
function giveIcons(root: RootElement): void {
  const tabs = [...(root.shadowRoot?.querySelectorAll('ha-tab-group-tab') ?? [])].filter(
    (tab) => !tab.querySelector('ha-icon') && !read.has(tab),
  ) as HTMLElement[];
  if (!tabs.length) return;
  for (const tab of tabs) read.add(tab);
  void import('./view-icons.js').then(({ viewIcon }) => {
    for (const tab of tabs) {
      const icon = viewIcon(
        tab.getAttribute('aria-label') ?? tab.textContent ?? '',
        tab.dataset['path'],
      );
      if (!icon) continue;
      tab.style.setProperty(VIEW_ICON_VAR, icon);
      tab.setAttribute(VIEW_ICON_ATTRIBUTE, '');
    }
  });
}

/** Puts the marks on a root (or takes them off); true when anything moved. */
export function markRoot(root: RootElement, marks: Marks | null): boolean {
  if (marks?.style) watchRow(root);
  if (marks?.style && marks.content !== 'names') giveIcons(root);
  const style = marks?.style ?? null;
  const content = marks ? marks.content : null;
  const title = marks?.title ? cssString(marks.title) : '';
  const page = marks?.page ?? false;
  const flat = marks?.flat ?? false;
  const menu = marks?.menu ?? false;
  if (
    root.getAttribute(TABS_ATTRIBUTE) === style &&
    root.getAttribute(TAB_CONTENT_ATTRIBUTE) === content &&
    root.hasAttribute(TAB_TITLE_ATTRIBUTE) === !!title &&
    root.style.getPropertyValue(DASHBOARD_TITLE_VAR) === title &&
    root.hasAttribute(HEADER_PAGE_ATTRIBUTE) === page &&
    root.hasAttribute(FLAT_ATTRIBUTE) === flat &&
    root.hasAttribute(ACTIONS_MENU_ATTRIBUTE) === menu
  )
    return false;
  const set = (name: string, value: string | null): void => {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  };
  set(TABS_ATTRIBUTE, style);
  set(TAB_CONTENT_ATTRIBUTE, content);
  root.toggleAttribute(TAB_TITLE_ATTRIBUTE, !!title);
  root.toggleAttribute(HEADER_PAGE_ATTRIBUTE, page);
  root.toggleAttribute(FLAT_ATTRIBUTE, flat);
  if (root.hasAttribute(ACTIONS_MENU_ATTRIBUTE) !== menu) {
    root.toggleAttribute(ACTIONS_MENU_ATTRIBUTE, menu);
    // the actions are drawn by the root's own render: it draws them again, as asked
    (root as RootElement & { requestUpdate?: () => void }).requestUpdate?.();
  }
  if (title) root.style.setProperty(DASHBOARD_TITLE_VAR, title);
  else root.style.removeProperty(DASHBOARD_TITLE_VAR);
  return true;
}

interface RootPrototype {
  _renderActionItems?: (...args: unknown[]) => unknown;
  /** The actions' render is wrapped (the update's wrap knows its own). */
  __fluvyTabs?: true;
}

type NarrowRoot = RootElement & { narrow?: boolean };

/**
 * Home Assistant's header actions in its one menu on a wide screen too: the root draws them as it does on a phone (it
 * reads `narrow` while it draws them), the rest of its header as it is. `narrow` is read through an own value laid over
 * the property for that one render (true: laid, and taken away after it), so nothing updates; a root that holds
 * `narrow` as its own value (another Home Assistant) is left as it is.
 */
function lendNarrow(root: NarrowRoot): boolean {
  if (root.narrow || Object.hasOwn(root, 'narrow')) return false;
  Object.defineProperty(root, 'narrow', { value: true, configurable: true });
  return true;
}

/**
 * Keeps every dashboard's header marked: `hui-root`'s update method is wrapped (it updates when the dashboard, the
 * view or the edit mode changes), so the marks follow at once — put on a dashboard that wears the look, taken off any
 * other (Home Assistant keeps the root from dashboard to dashboard) —; its actions' render is wrapped too, for the one
 * menu. Home Assistant's update runs first and always, ours caught (`patches.ts`); its actions' render always runs,
 * once, lent `narrow` before it only on our mark (`lendNarrow`, caught too). False if Home Assistant reshaped the
 * element: its header then stays its own (the sheet only styles marked roots).
 */
export async function patchViewRoots(
  registry: CustomElementRegistry,
  tabsFor: TabsFor,
): Promise<boolean> {
  await registry.whenDefined('hui-root');
  const proto = registry.get('hui-root')?.prototype as RootPrototype | undefined;
  const done = wrap(
    proto,
    'updated',
    'viewRoots',
    (root: RootElement) => {
      markRoot(root, marksFor(root, tabsFor));
      // whether it shows a subview, wherever Fluvy is in use: a wall draws its way back from it
      if (inUse(root.ownerDocument)) markView(root);
      else root.removeAttribute(SUBVIEW_ATTRIBUTE);
    },
    always,
  );
  const actions = proto?._renderActionItems;
  if (done && proto && typeof actions === 'function' && !proto.__fluvyTabs) {
    proto._renderActionItems = function (this: NarrowRoot, ...args: unknown[]): unknown {
      // on our mark alone; Home Assistant's render runs once, whatever ours does
      const lent =
        this.hasAttribute(ACTIONS_MENU_ATTRIBUTE) && guard('actionsMenu', () => lendNarrow(this));
      try {
        return actions.apply(this, args);
      } finally {
        if (lent) delete this.narrow;
      }
    };
    proto.__fluvyTabs = true;
  }
  return done;
}

/** Re-marks every dashboard header on the page now (the settings or the preview changed). */
export function markRoots(doc: Document, tabsFor: TabsFor): void {
  walkShadow(doc, (element) => {
    if (element.localName === 'hui-root')
      markRoot(element as RootElement, marksFor(element as RootElement, tabsFor));
  });
}
