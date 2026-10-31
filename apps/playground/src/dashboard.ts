import { css, html, LitElement, unsafeCSS, type PropertyValues } from 'lit';
import type { HomeAssistant } from '../../../packages/core/src/ha/types.js';
import { ICON_PATHS } from '../../../packages/core/src/icons/generated.js';
import { mdiPath } from './ha-icons.js';
import {
  FLAT_ATTRIBUTE,
  patchViewRoots,
  SIDEBAR_LOGO_ATTRIBUTE,
  type Chrome,
  type TabsFor,
  type ViewTabs,
} from '../../../packages/core/src/look/tabs.js';
import {
  frameCss,
  NO_FRAME,
  sidebarCss,
  sidebarFlatCss,
  sidebarIconsCss,
  sidebarLogoCss,
  sidebarSeparatorsCss,
} from '../../../packages/core/src/shell/css/chrome.js';
import { startZoom } from '../../../packages/core/src/look/zoom.js';
import { editBarCss } from '../../../packages/core/src/shell/css/dashboard.js';
import { viewTabsCss } from '../../../packages/core/src/shell/css/tabs.js';
import { subpageCss } from '../../../packages/core/src/shell/css/tables.js';
import { deviceZoomCss } from '../../../packages/core/src/shell/css/zoom.js';
import {
  wallDashboardCss,
  wallSubviewBackCss,
  wallSubviewHeaderCss,
} from '../../../packages/core/src/shell/css/wall.js';
import {
  WALL_ATTRIBUTE,
  WALL_BACK_ATTRIBUTE,
  WALL_HEADER_ATTRIBUTE,
} from '../../../packages/core/src/look/attributes.js';

/*
 * A dashboard's frame outside Home Assistant, `?dashboard=<sheet>`: `hui-root` with its header and view tabs as Home
 * Assistant 2026.9 renders them (the markup, the parts and the rules read from a live instance: `.toolbar >
 * ha-menu-button, ha-tab-group | .main-title, .action-items`, each tab an `ha-tab-group-tab[aria-label]` holding its
 * `ha-icon` or its name), the shell's sheets for `hui-root` adopted as the shell adopts them, and the real marks
 * (`look/tabs.ts`). The sheet's frames are the view (`#view > hui-view`).
 *
 *   &tabs=fluvy|pills|ha|hidden  &content=names|icons|both  &tabtitle=0   the house's choice (default: Fluvy's)
 *   &views=8      how many views (1: Home Assistant shows the title, no tabs)
 *   &icons=0      views without icons (Home Assistant then writes their names) · &icons=mixed every other one
 *   &edit=1       the edit mode · &subview=1 a subview open · &scope=other a dashboard that does not wear the look
 *   &title=Home   the dashboard's name in the sidebar · &long=1 long view names · &names=Overview,Rooms the views
 *                 named (in place of &views)
 *   &frame=1      Home Assistant's sidebar beside the dashboard (wide) · the corner: &logo=1 Home Assistant's logo,
 *                 &flat=1 no hairlines, &header=page the header on the page's colour, &actions=menu one menu ·
 *                 &floating=1 the app in Fluvy's floating frame (the shell's `frame` sheet, 1024 wide or more)
 *   &zoom=125     this device's size, as the bundle reads it (`look/zoom.ts`: remembered, dropped from the address,
 *                 the view zoomed by the shell's `device-zoom` sheet; `&zoom=off` back to 100)
 *   &wall=1       the page a wall (main.ts mounts the real controller): the shell's wall sheets for `hui-root` fill as
 *                 the shell fills them on `<html>`'s marks · &wallsub=header Home Assistant's header in a subview
 *                 (the floating way back is the default); the root's `_goBack` closes the subview (`__wentBack`)
 */

interface View {
  readonly title: string;
  readonly path: string;
  readonly icon?: string;
  readonly subview?: boolean;
}

const NAMES: ReadonlyArray<readonly [string, string]> = [
  ['Home', 'home'],
  ['Rooms', 'rooms'],
  ['Lights', 'bulb'],
  ['Climate', 'thermo'],
  ['Energy', 'bolt'],
  ['Media', 'speaker'],
  ['Security', 'shield'],
  ['Garden', 'leaf'],
  ['Cameras', 'camera'],
  ['Car', 'car'],
];
const LONG: ReadonlyArray<readonly [string, string]> = [
  ['Living room and kitchen', 'home'],
  ['Upstairs bedrooms', 'rooms'],
  ['Every light in the house', 'bulb'],
  ['Heating and cooling', 'thermo'],
];

export interface DashboardOptions {
  readonly tabs: ViewTabs | null;
  /** The corner: Home Assistant's logo in the sidebar, the hairlines, the header's surface. */
  readonly chrome: Chrome;
  /** The app's frame: Home Assistant's sidebar beside the dashboard (a wide screen only). */
  readonly frame: boolean;
  /** The app in Fluvy's floating frame (the house's choice; drawn on a screen 1024 wide or more). */
  readonly floating: boolean;
  readonly views: readonly View[];
  readonly edit: boolean;
  readonly subview: boolean;
  readonly title: string;
}

/** The dashboard a page asks for. */
export function dashboardOptions(params: URLSearchParams): DashboardOptions {
  // views named by the page take the set's icon where it has their name
  const named = params
    .get('names')
    ?.split(',')
    .filter(Boolean)
    .map((title) => [title, NAMES.find(([name]) => name === title)?.[1] ?? 'home'] as const);
  const count = named?.length ?? Math.max(1, Math.min(10, Number(params.get('views') ?? 6)));
  const icons = params.get('icons') ?? '1';
  const names = named ?? (params.get('long') === '1' ? LONG : NAMES);
  const views = Array.from({ length: count }, (_, i) => {
    const [title, glyph] = names[i % names.length] as readonly [string, string];
    const withIcon = icons === '1' || (icons === 'mixed' && i % 2 === 0);
    return {
      title,
      path: title.toLowerCase().replace(/\W+/g, '-'),
      ...(withIcon ? { icon: `fluvy:${glyph}` } : {}),
    };
  });
  // a room's subview: hidden from the tabs, as Home Assistant hides every subview
  views.push({ title: 'Kitchen', path: 'room-kitchen', icon: 'fluvy:home', subview: true } as View);
  const style = params.get('tabs') ?? 'fluvy';
  const tabs: ViewTabs | null =
    params.get('scope') === 'other'
      ? null
      : {
          style: style as ViewTabs['style'],
          content: (params.get('content') ?? 'names') as ViewTabs['content'],
          title: params.get('tabtitle') !== '0',
        };
  const chrome: Chrome = {
    logo: params.get('logo') === '1',
    dividers: params.get('flat') !== '1',
    header: params.get('header') === 'page' ? 'page' : 'bar',
    actions: params.get('actions') === 'menu' ? 'menu' : 'buttons',
    // `separators=fluvy-home,history`: a line after each of those sidebar items
    separators: (params.get('separators') ?? '').split(',').filter(Boolean),
  };
  return {
    tabs,
    chrome,
    frame: params.get('frame') === '1',
    floating: params.get('floating') === '1',
    views,
    edit: params.get('edit') === '1',
    subview: params.get('subview') === '1',
    title: params.get('title') ?? 'Home',
  };
}

/* ---------- Home Assistant's elements, as far as the header needs them ---------- */

/**
 * `<ha-icon>` drawing the fluvy set (`fluvy:home`) and the mdi icons the sheets name (`ha-icons.ts`: a room's area
 * icon); any other icon is a neutral disc.
 */
class MockIcon extends LitElement {
  static override properties = { icon: {} };
  declare icon: string | undefined;
  static override styles = css`
    :host {
      display: inline-flex;
      width: var(--mdc-icon-size, 24px);
      height: var(--mdc-icon-size, 24px);
      flex: 0 0 auto;
    }
    /* Home Assistant's ha-svg-icon: its fill is the icon's own colour, else the text's */
    svg {
      width: 100%;
      height: 100%;
      fill: var(--icon-primary-color, currentColor);
    }
  `;
  override render() {
    const path = this.icon?.startsWith('fluvy:')
      ? ICON_PATHS[this.icon.slice(6)]
      : mdiPath(this.icon);
    return path
      ? html`<svg viewBox="0 0 24 24"><path d=${path}></path></svg>`
      : html`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle></svg>`;
  }
}

/**
 * Web Awesome's tab group as `ha-tab-group`: its shadow markup, the rules Home Assistant keeps of it, and its chevrons
 * at each end the row goes on (Home Assistant paints them over a gradient of the header's colour).
 */
class MockTabGroup extends LitElement {
  static override properties = { ends: { state: true } };
  /** Where the row goes on: Web Awesome draws a chevron at each such end. */
  declare ends: { start: boolean; end: boolean };
  constructor() {
    super();
    this.ends = { start: false, end: false };
  }
  static override styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      --track-width: 2px;
      --track-color: var(--ha-tab-track-color, var(--divider-color));
      --indicator-color: var(--ha-tab-indicator-color, var(--primary-color));
    }
    :host *,
    :host ::before,
    :host ::after {
      box-sizing: inherit;
    }
    .tab-group {
      display: flex;
      flex-direction: column;
      border-radius: 0;
    }
    .nav-container {
      order: 1;
    }
    .tab-group-has-scroll-controls .nav-container {
      position: relative;
      padding: 0 1.5em;
    }
    .nav {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .nav::-webkit-scrollbar {
      width: 0;
      height: 0;
    }
    .tabs {
      display: flex;
      position: relative;
      flex: 1 1 auto;
      flex-direction: row;
      border-bottom: solid var(--track-width) var(--track-color);
    }
    .scroll-button {
      position: absolute;
      top: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.5em;
      cursor: pointer;
      --mdc-icon-size: 20px;
    }
    .scroll-button-start {
      inset-inline-start: 0;
    }
    .scroll-button-end {
      inset-inline-end: 0;
    }
    .body {
      display: block;
      order: 2;
    }
    ::slotted(ha-tab-group-tab[active]) {
      border-block-end: solid var(--track-width) var(--indicator-color);
      margin-block-end: calc(-1 * var(--track-width));
    }
  `;
  private get nav(): HTMLElement | null {
    return this.renderRoot.querySelector('.nav');
  }
  private measure = (): void => {
    const nav = this.nav;
    if (!nav) return;
    const start = nav.scrollLeft > 1;
    const end = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
    if (start !== this.ends.start || end !== this.ends.end) this.ends = { start, end };
  };
  protected override firstUpdated(): void {
    const nav = this.nav;
    if (!nav) return;
    nav.addEventListener('scroll', this.measure, { passive: true });
    new ResizeObserver(this.measure).observe(nav);
  }
  private page(direction: 1 | -1): void {
    const nav = this.nav;
    nav?.scrollBy({ left: direction * nav.clientWidth, behavior: 'smooth' });
  }
  override render() {
    const { start, end } = this.ends;
    return html`<div
      part="base"
      class=${`tab-group tab-group-top ${start || end ? 'tab-group-has-scroll-controls' : ''}`}
    >
      <div class="nav-container" part="nav">
        ${
          start
            ? html`<span
                part="scroll-button scroll-button-start"
                class="scroll-button scroll-button-start"
                @click=${() => this.page(-1)}
                ><ha-icon .icon=${'fluvy:chevron-left'}></ha-icon
              ></span>`
            : ''
        }
        <div class="nav">
          <div part="tabs" class="tabs" role="tablist"><slot name="nav"></slot></div>
        </div>
        ${
          end
            ? html`<span
                part="scroll-button scroll-button-end"
                class="scroll-button scroll-button-end"
                @click=${() => this.page(1)}
                ><ha-icon .icon=${'fluvy:chevron'}></ha-icon
              ></span>`
            : ''
        }
      </div>
      <div part="body" class="body"><slot></slot></div>
    </div>`;
  }
}

/** `ha-tab-group-tab`: a slot in its `base` part, Web Awesome's tab rules with Home Assistant's on top. */
class MockTab extends LitElement {
  static override properties = { active: { type: Boolean, reflect: true } };
  declare active: boolean;
  static override styles = css`
    :host {
      box-sizing: border-box;
      display: inline-block;
      font-size: var(--ha-font-size-m, 14px);
      font-weight: 500;
      color: inherit;
      opacity: 0.8;
      --wa-color-brand-on-quiet: var(--ha-tab-active-text-color, var(--primary-color));
    }
    :host([active]) {
      opacity: 1;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      padding: 1em 1.5em;
      font: inherit;
      white-space: nowrap;
      user-select: none;
      cursor: pointer;
    }
    :host(:hover:not([active])) .tab {
      color: var(--wa-color-brand-on-quiet);
    }
  `;
  override render() {
    return html`<div part="base" class="tab"><slot></slot></div>`;
  }
}

/** The view's frames (`#view > hui-view`). */
class MockView extends HTMLElement {}

/**
 * `hui-root`: the header and the view. The rules are Home Assistant's (as far as the header goes); the shell's
 * `dashboard-root` and `view-tabs` sheets follow, as the shell adds them to the element's styles.
 */
class MockRoot extends LitElement {
  static override properties = {
    narrow: { type: Boolean },
    current: { state: true },
  };
  declare narrow: boolean;
  declare current: number;
  options!: DashboardOptions;
  hass!: {
    panelUrl: string;
    panels: Record<string, { title: string | null }>;
    localize: (key: string) => string;
  };
  lovelace!: {
    editMode: boolean;
    config: { title?: string; views?: ReadonlyArray<{ title: string; subview?: boolean }> };
  };

  /** The view shown, as Home Assistant's root keeps it (its index in the configuration). */
  get _curView(): number {
    return this.options.subview ? this.options.views.findIndex((v) => v.subview) : this.current;
  }

  /** Home Assistant's way back from a subview: here, the subview closes (and the page counts it). */
  _goBack(): void {
    const w = window as Window & { __wentBack?: number };
    w.__wentBack = (w.__wentBack ?? 0) + 1;
    this.options = { ...this.options, subview: false };
    this.requestUpdate();
  }

  static override styles = [
    css`
      :host {
        display: block;
        --header-height: 56px;
        /* Home Assistant's own line under the header (its default theme's) */
        --app-header-border-bottom: 1px solid var(--divider-color);
        --ha-font-size-m: 14px;
        --ha-font-size-xl: 20px;
      }
      /* as hui-root lays it: the header fixed over the page at the app bar's width (beside the sidebar when there is
         one), the view padded by its height; both inside the app's safe area (the floating frame's 16 a side) */
      .header {
        position: fixed;
        top: 0;
        width: var(--ha-top-app-bar-width, 100%);
        z-index: 4;
        padding-top: var(--safe-area-inset-top, 0px);
        background-color: var(--app-header-background-color);
        color: var(--app-header-text-color, white);
      }
      .edit-mode .header {
        background-color: var(--app-header-edit-background-color, #455a64);
        color: var(--app-header-edit-text-color, white);
      }
      .toolbar {
        display: flex;
        align-items: center;
        box-sizing: border-box;
        height: var(--header-height);
        padding: 0 calc(12px + var(--safe-area-inset-right, 0px)) 0 12px;
        border-bottom: var(--app-header-border-bottom, none);
        font-size: var(--ha-font-size-xl);
        font-weight: 400;
      }
      .narrow .toolbar {
        padding: 0 4px;
      }
      .main-title {
        flex-grow: 1;
        min-width: 0;
        margin-inline-start: 24px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        line-height: 1.5;
      }
      .narrow .main-title {
        margin-inline-start: 8px;
      }
      .action-items {
        display: flex;
        align-items: center;
        white-space: nowrap;
      }
      ha-tab-group {
        --ha-tab-indicator-color: var(
          --app-header-selection-bar-color,
          var(--app-header-text-color, white)
        );
        --ha-tab-active-text-color: var(--app-header-text-color, white);
        --ha-tab-track-color: transparent;
        flex-grow: 1;
        align-self: flex-end;
        min-width: 0;
        height: 100%;
      }
      ha-tab-group::part(nav) {
        padding: 0;
      }
      ha-tab-group::part(scroll-button) {
        z-index: 1;
        background: linear-gradient(90deg, var(--app-header-background-color), transparent);
      }
      ha-tab-group::part(scroll-button-end) {
        background: linear-gradient(270deg, var(--app-header-background-color), transparent);
      }
      .tab-bar {
        display: flex;
      }
      .edit-mode ha-tab-group {
        flex-grow: 0;
        --ha-tab-active-text-color: var(--app-header-edit-text-color, #fff);
        --ha-tab-indicator-color: var(--app-header-edit-text-color, #fff);
      }
      ha-tab-group-tab {
        --ha-tab-group-tab-height: var(--header-height, 56px);
        height: var(--ha-tab-group-tab-height);
      }
      .tab-bar ha-tab-group-tab {
        --ha-tab-group-tab-height: var(--tab-bar-height, 56px);
      }
      ha-tab-group-tab::part(base) {
        padding-inline: 16px;
        padding-top: calc((var(--ha-tab-group-tab-height) - 20px) / 2);
      }
      ha-tab-group-tab.icon-only::part(base),
      ha-tab-group-tab.icon-and-title::part(base) {
        padding-top: calc((var(--ha-tab-group-tab-height) - 20px) / 2 - 2px);
        padding-bottom: calc((var(--ha-tab-group-tab-height) - 20px) / 2 - 4px);
      }
      .hide-tab {
        display: none;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        --mdc-icon-size: 24px;
      }
      ha-menu-button {
        display: none;
      }
      .narrow ha-menu-button {
        display: inline-flex;
      }
      .done {
        height: 36px;
        padding: 0 16px;
        border-radius: 18px;
        border: 1px solid currentColor;
        font: 500 14px/1 inherit;
        display: inline-flex;
        align-items: center;
      }
      #view {
        position: relative;
        display: flex;
        box-sizing: border-box;
        min-height: 100vh;
        padding: calc(var(--header-height) + var(--safe-area-inset-top, 0px))
          var(--safe-area-inset-right, 0px) var(--safe-area-inset-bottom, 0px) 0;
      }
      /* the edit mode's tab row under the toolbar: Home Assistant pads by both, less the 2 they share */
      .edit-mode #view {
        padding-top: calc(
          var(--header-height) + var(--tab-bar-height, 56px) - 2px + var(--safe-area-inset-top, 0px)
        );
      }
      hui-view {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        align-content: flex-start;
        gap: 16px;
        flex: 1 1 auto;
        min-width: 0;
        padding: 16px;
        box-sizing: border-box;
      }
    `,
    unsafeCSS(`${subpageCss}\n${editBarCss}`),
    unsafeCSS(viewTabsCss),
    unsafeCSS(deviceZoomCss),
  ];

  constructor() {
    super();
    this.narrow = false;
    this.current = 0;
  }

  private tabs(views: readonly View[]) {
    const edit = this.options.edit;
    return html`<ha-tab-group>
      ${views.map(
        (view, index) =>
          html`<ha-tab-group-tab
            slot="nav"
            panel=${index}
            aria-label=${view.title}
            data-path=${view.path}
            class=${`${view.icon ? 'icon-only' : ''} ${view.subview && !edit ? 'hide-tab' : ''}`}
            role="tab"
            ?active=${index === this.current}
            ?disabled=${view.subview && !edit}
            @click=${() => {
              if (!view.subview) this.current = index;
            }}
            >${
              view.icon
                ? html`<ha-icon .icon=${view.icon} title=${view.title}></ha-icon>`
                : view.title
            }</ha-tab-group-tab
          >`,
      )}
    </ha-tab-group>`;
  }

  private button(name: string) {
    return html`<span class="button"><ha-icon .icon=${`fluvy:${name}`}></ha-icon></span>`;
  }

  override render() {
    const { views, edit, subview } = this.options;
    const shown = views.filter((view) => !view.subview);
    const title = this.lovelace.config.title ?? this.hass.panels[this.hass.panelUrl]?.title ?? '';
    const head = edit
      ? html`<div class="toolbar">
            <div class="main-title">Edit dashboard</div>
            <div class="action-items">${this.button('plus')}<span class="done">Done</span></div>
          </div>
          <div class="tab-bar">${this.tabs(views)}</div>`
      : subview
        ? html`<div class="toolbar">
            ${this.button('chevron-left')}
            <div class="main-title">Kitchen</div>
            <div class="action-items">${this.button('dots-vertical')}</div>
          </div>`
        : html`<div class="toolbar">
            <ha-menu-button slot="navigationIcon">${this.button('menu')}</ha-menu-button>
            ${shown.length > 1 ? this.tabs(views) : html`<div class="main-title">${title}</div>`}
            <div class="action-items">${this._renderActionItems()}</div>
          </div>`;
    return html`<div class=${`${this.narrow ? 'narrow' : ''} ${edit ? 'edit-mode' : ''}`}>
      <div class="header">${head}</div>
      <hui-view-container id="view"
        ><hui-view><slot></slot></hui-view
      ></hui-view-container>
    </div>`;
  }

  /**
   * The header's actions as Home Assistant draws them: add, search, Assist and edit as their own buttons, or on a
   * phone (`narrow`) its one menu (the button that opens it, `#dashboardmenu`). The bundle wraps this method.
   */
  _renderActionItems() {
    return this.narrow
      ? html`<span class="button" id="dashboardmenu"
          ><ha-icon .icon=${'fluvy:dots-vertical'}></ha-icon
        ></span>`
      : html`${this.button('plus')}${this.button('search')}${this.button('chat')}${this.button('pencil')}`;
  }

  // what the shell's patch wraps (as Home Assistant's hui-root has one)
  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
  }
}

/**
 * `ha-list-item-button`: a row of Home Assistant's lists, its icon in the start slot and its words in the headline,
 * spaced by the `--ha-row-item-*` properties (the sidebar's: 12 in, the words 16 after a 24 icon, 40 tall).
 */
class MockListItem extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    .base {
      display: flex;
      align-items: center;
      box-sizing: border-box;
      height: 100%;
      min-height: var(--ha-row-item-min-height, 40px);
      gap: var(--ha-row-item-gap, 16px);
      padding-inline: var(--ha-row-item-padding-inline, 12px);
    }
    .start {
      display: flex;
      flex: none;
    }
    .content {
      flex: 1 1 auto;
      min-width: 0;
    }
  `;
  override render() {
    return html`<div part="base" class="base">
      <div part="start" class="start"><slot name="start"></slot></div>
      <div part="content" class="content"><slot name="headline"></slot></div>
    </div>`;
  }
}

/** Home Assistant's own panels in the sidebar, by their ids (`#sidebar-panel-<id>`), as it names them. */
const PANELS: ReadonlyArray<readonly [id: string, name: string]> = [
  ['energy', 'Energy'],
  ['map', 'Map'],
  ['logbook', 'Activity'],
  ['history', 'History'],
  ['media-browser', 'Media'],
  ['todo', 'To-do lists'],
];

/** The person signed in, as `ha-user-badge` draws them: the picture of the person they are, else their initials. */
export interface SidebarUser {
  readonly name: string;
  readonly picture?: string;
}

/** A person's initials as Home Assistant writes them on their badge: the first letter of their first words. */
const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((word) => word[0] ?? '')
    .join('');

/**
 * `ha-sidebar` as Home Assistant 2026.9 draws it (its markup and rules read from a live instance): the menu button and
 * the title in `.menu`; the dashboard (open) and Home Assistant's panels in the list; Settings, the notifications and
 * the person signed in at its foot. The icons stand under the menu button's glyph, 16 from the edge (the person's
 * badge centred on them), the words 56. The sidebar steps inside the app's safe area as Home Assistant's does (the
 * floating frame's 16), then wears the shell's sheets for it: Fluvy's own and its icons, and the corner's as the shell
 * fills them on the house's choices.
 */
class MockSidebar extends LitElement {
  chrome!: Chrome;
  /** The dashboard shown: its name and its address. */
  dashboard!: { title: string; path: string };
  user!: SidebarUser;
  static override styles = [
    css`
      :host {
        position: sticky;
        top: 0;
        display: flex;
        flex-direction: column;
        flex: 0 0 calc(256px + var(--safe-area-inset-left, 0px));
        box-sizing: border-box;
        height: 100vh;
        padding-bottom: var(--safe-area-inset-bottom, 0px);
        background: var(--sidebar-background-color, var(--fluvy-card));
        color: var(--sidebar-text-color, var(--fluvy-text));
        --header-height: 56px;
      }
      .menu {
        display: flex;
        flex: none;
        align-items: center;
        box-sizing: border-box;
        height: calc(var(--header-height) + var(--safe-area-inset-top, 0px));
        padding-top: var(--safe-area-inset-top, 0px);
        padding-inline-start: calc(4px + var(--safe-area-inset-left, 0px));
        white-space: nowrap;
        font-size: 20px;
        font-weight: 400;
        color: var(--sidebar-menu-button-text-color, var(--primary-text-color));
        border-bottom: 1px solid var(--divider-color);
      }
      .menu ha-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        color: var(--sidebar-icon-color);
        --mdc-icon-size: 24px;
      }
      .title {
        flex: 1 1 0%;
        min-width: 0;
        margin-inline-start: 3px;
      }
      /* the panels fill the height; Settings, the notifications and the person keep to its foot */
      .panels-list {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-height: 0;
      }
      .wrapper {
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      }
      ha-list-nav {
        display: block;
        margin: 8px 0 8px var(--safe-area-inset-left, 0px);
      }
      ha-list-item-button {
        position: relative;
        isolation: isolate;
        height: 40px;
        margin: 0 4px 4px;
        border-radius: var(--ha-border-radius-sm, 4px);
        --mdc-icon-size: 24px;
      }
      ha-list-item-button::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: inherit;
        opacity: 0;
      }
      ha-list-item-button.selected::before {
        background-color: var(--sidebar-selected-icon-color);
        opacity: 0.12;
      }
      ha-list-item-button .item-text {
        display: block;
        overflow: hidden;
        font-size: 14px;
        line-height: 20px;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--sidebar-text-color);
      }
      ha-list-item-button.selected .item-text {
        color: var(--sidebar-selected-text-color);
      }
      ha-list-item-button > [slot='start'] {
        display: block;
        width: 24px;
        height: 24px;
        color: var(--sidebar-icon-color);
      }
      ha-list-item-button.selected > [slot='start'] {
        color: var(--sidebar-selected-icon-color);
      }
      /* the person's badge (40) on the icons' column: their row starts 4 in */
      .user {
        --ha-row-item-padding-inline: 4px 12px;
      }
      .user > ha-user-badge {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--light-primary-color) center / cover no-repeat;
        color: var(--text-light-primary-color, var(--primary-text-color));
        font-size: 14px;
        line-height: 40px;
        text-align: center;
      }
    `,
    unsafeCSS(sidebarCss),
    unsafeCSS(sidebarIconsCss),
  ];
  override connectedCallback(): void {
    super.connectedCallback();
    // the shell fills these on the house's choices; the mock adopts them as they would be filled
    const extra = [
      ...(this.chrome.logo ? [sidebarLogoCss] : []),
      ...(this.chrome.dividers ? [] : [sidebarFlatCss]),
      sidebarSeparatorsCss(this.chrome.separators),
    ].filter(Boolean);
    if (extra.length) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(extra.join('\n'));
      this.shadowRoot!.adoptedStyleSheets = [...this.shadowRoot!.adoptedStyleSheets, sheet];
    }
  }
  override render() {
    const { name, picture } = this.user;
    // a panel of Home Assistant's: its icon is the shell's (`sidebarIconsCss`) on Home Assistant's empty one
    const panel = (id: string, words: string) =>
      html`<ha-list-item-button id=${id}
        ><ha-svg-icon slot="start"></ha-svg-icon
        ><span class="item-text" slot="headline">${words}</span></ha-list-item-button
      >`;
    return html`<div class="menu">
        <ha-icon-button><ha-icon .icon=${'fluvy:menu'}></ha-icon></ha-icon-button>
        <div class="title">Home Assistant</div>
      </div>
      <div class="panels-list">
        <div class="wrapper">
          <ha-list-nav>
            <ha-list-item-button id=${`sidebar-panel-${this.dashboard.path}`} class="selected"
              ><ha-icon slot="start" .icon=${'fluvy:home'}></ha-icon
              ><span class="item-text" slot="headline"
                >${this.dashboard.title}</span
              ></ha-list-item-button
            >
            ${PANELS.map(([id, words]) => panel(`sidebar-panel-${id}`, words))}
          </ha-list-nav>
        </div>
        <ha-list-nav>
          ${panel('sidebar-config', 'Settings')} ${panel('sidebar-notifications', 'Notifications')}
          <ha-list-item-button id="sidebar-profile" class="user"
            ><ha-user-badge
              slot="start"
              style=${picture ? `background-image: url("${picture}")` : ''}
              >${picture ? '' : initials(name)}</ha-user-badge
            ><span class="item-text" slot="headline">${name}</span></ha-list-item-button
          >
        </ha-list-nav>
      </div>`;
  }
}

/**
 * `home-assistant`, the app's root, around `home-assistant-main` (the sidebar and the dashboard), with the shell's
 * `frame` sheet as the shell adopts it and the house's choice on the root (`fluvy-no-frame` when the frame is off).
 * On a screen 1024 wide or more the app then floats 16 inside the window: its insets tell the sidebar and the
 * dashboard where to stand, and the page is painted around a rounded opening.
 */
class MockApp extends LitElement {
  static override styles = [
    css`
      :host {
        display: block;
      }
      home-assistant-main {
        display: flex;
        /* the app bar beside the drawer, as home-assistant-main sets it */
        --ha-top-app-bar-width: calc(100% - (256px + var(--safe-area-inset-left, 0px)));
      }
      ::slotted(hui-root) {
        flex: 1 1 auto;
        min-width: 0;
      }
    `,
    unsafeCSS(frameCss),
  ];
  override render() {
    return html`<home-assistant-main><slot></slot></home-assistant-main>`;
  }
}

const NARROW = 870;

/**
 * Mounts the dashboard in `stage` and returns where the frames go. The marks are the bundle's own: `patchViewRoots`
 * wraps the root's update with the tabs the page asked for. The house (`hass`) says who is signed in, for the
 * sidebar's foot.
 */
export function mountDashboard(
  stage: HTMLElement,
  options: DashboardOptions,
  hass: HomeAssistant,
): HTMLElement {
  for (const [tag, element] of [
    ['ha-icon', MockIcon],
    ['ha-tab-group', MockTabGroup],
    ['ha-tab-group-tab', MockTab],
    ['hui-view', MockView],
    ['hui-root', MockRoot],
  ] as const)
    if (!customElements.get(tag)) customElements.define(tag, element);
  const tabsFor: TabsFor = () =>
    options.tabs ? { tabs: options.tabs, chrome: options.chrome } : null;
  // the house's choices on <html>, as the look puts them (the shell's sidebar sheets fill on them)
  document.documentElement.toggleAttribute(SIDEBAR_LOGO_ATTRIBUTE, options.chrome.logo);
  document.documentElement.toggleAttribute(FLAT_ATTRIBUTE, !options.chrome.dividers);
  void patchViewRoots(customElements, tabsFor);
  // the device's size, as the bundle starts it (the shell's sheet is in the root's styles above)
  startZoom();
  const root = document.createElement('hui-root') as MockRoot;
  root.options = options;
  root.hass = {
    panelUrl: 'fluvy-home',
    panels: { 'fluvy-home': { title: options.title } },
    localize: (key) => key,
  };
  root.lovelace = {
    editMode: options.edit,
    config: { views: options.views.map((v) => ({ title: v.title, subview: v.subview === true })) },
  };
  // a wall's sheets for `hui-root`, filled as the shell fills them on <html>'s marks
  const wallSheet = new CSSStyleSheet();
  const syncWall = (): void => {
    const marks = document.documentElement;
    wallSheet.replaceSync(
      marks.hasAttribute(WALL_ATTRIBUTE)
        ? [
            wallDashboardCss,
            marks.hasAttribute(WALL_HEADER_ATTRIBUTE) ? wallSubviewHeaderCss : '',
            marks.hasAttribute(WALL_BACK_ATTRIBUTE) ? wallSubviewBackCss : '',
          ].join('\n')
        : '',
    );
  };
  new MutationObserver(syncWall).observe(document.documentElement, { attributes: true });
  void root.updateComplete.then(() => {
    const shadow = root.shadowRoot as ShadowRoot;
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, wallSheet];
    syncWall();
  });
  const narrow = (): void => {
    root.narrow = innerWidth <= NARROW;
  };
  narrow();
  addEventListener('resize', narrow);
  stage.classList.add('pg-dashboard');
  if (options.frame && innerWidth > NARROW) {
    for (const [tag, element] of [
      ['home-assistant', MockApp],
      ['ha-sidebar', MockSidebar],
      ['ha-list-item-button', MockListItem],
    ] as const)
      if (!customElements.get(tag)) customElements.define(tag, element);
    const app = document.createElement('home-assistant');
    app.toggleAttribute(NO_FRAME, !options.floating);
    const sidebar = document.createElement('ha-sidebar') as MockSidebar;
    sidebar.chrome = options.chrome;
    sidebar.dashboard = { title: options.title, path: root.hass.panelUrl };
    sidebar.user = signedIn(hass);
    app.append(sidebar, root);
    stage.append(app);
  } else stage.append(root);
  return root;
}

/** The person signed in to the house, with the picture of the person they are (as `ha-user-badge` finds it). */
function signedIn(hass: HomeAssistant): SidebarUser {
  const user = hass.user;
  if (!user) return { name: '' };
  const person = Object.values(hass.states).find(
    (state) => state.entity_id.startsWith('person.') && state.attributes['user_id'] === user.id,
  );
  const picture = person?.attributes['entity_picture'];
  return { name: user.name, ...(typeof picture === 'string' ? { picture } : {}) };
}

/** For the suites: the root's own update again (another choice of tabs, the edit mode). */
export type DashboardRoot = HTMLElement & {
  options: DashboardOptions;
  lovelace: { editMode: boolean };
  requestUpdate(): void;
};
export const huiRoot = (): DashboardRoot | null => document.querySelector('hui-root');
