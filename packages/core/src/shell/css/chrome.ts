import { HA_LOGO_URL } from '../../icons/ha-logo.js';
import { mask } from './shared.js';

/*
 * The app's chrome: the floating frame, the drawer, the sidebar.
 */

/**
 * The app root on wide screens: a rounded panel floating 16 px inside the page, as the sheet draws it.
 * The app keeps the whole window — Home Assistant sizes its pages from the viewport (tables, history,
 * logbook, calendar, add-on panels: `100vh` minus the safe-area insets) and scrolls them natively —
 * and is told that 16 px on every side are taken, through the same safe-area insets it honours for a
 * phone's notch and rounded corners. Header, sidebar, content, dialogs and floating buttons step
 * inside by themselves; a fixed, click-through layer then paints the page around a 24-radius opening
 * with a hairline. No page scrolls twice and nothing is clipped.
 *
 * The insets are declared twice on `:host` (the app root, above the dialogs too): as HA's input
 * (`--app-safe-area-inset-*`, which it re-derives from wherever it writes a theme — a view's `theme:`
 * rewrites `--safe-area-inset-*` from it) and as the derived values themselves, with the sums HA
 * computes once at `<html>` (`-x`, `-y`, `--safe-width`, `--safe-height`).
 */
const GAP = '16px';
/** On `<home-assistant>`: the house turned the frame off (fluvy's settings); the app then fills the window. */
export const NO_FRAME = 'fluvy-no-frame';
/** On `<html>`: the house keeps Home Assistant's own icons in its menus (fluvy's settings). */
export const ORIGINAL_ICONS = 'fluvy-original-icons';
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const inset = (side: (typeof SIDES)[number]): string =>
  `calc(${GAP} + env(safe-area-inset-${side}, 0px))`;
export const frameCss = `@media (min-width: 1024px) {
  :host(:not([${NO_FRAME}])) {
${SIDES.map(
  (side) => `    --app-safe-area-inset-${side}: ${inset(side)};
    --safe-area-inset-${side}: ${inset(side)};`,
).join('\n')}
    --safe-area-inset-x: calc(var(--safe-area-inset-left) + var(--safe-area-inset-right));
    --safe-area-inset-y: calc(var(--safe-area-inset-top) + var(--safe-area-inset-bottom));
    --safe-width: calc(100vw - var(--safe-area-inset-x));
    --safe-height: calc(100vh - var(--safe-area-inset-y));
    /* the frame itself, for what opens above the app (a drawer comes out of the frame, in its shape) */
    --fluvy-frame: ${GAP};
    --fluvy-frame-radius: var(--fluvy-radius-xl);
  }
  :host(:not([${NO_FRAME}])) home-assistant-main::after {
    content: "";
    position: fixed;
    inset: var(--safe-area-inset-top) var(--safe-area-inset-right) var(--safe-area-inset-bottom) var(--safe-area-inset-left);
    z-index: 100;
    pointer-events: none;
    border-radius: var(--fluvy-radius-xl);
    box-shadow: 0 0 0 1px var(--fluvy-border), 0 0 0 100vmax var(--fluvy-page-alt);
  }
}`;

/**
 * The drawer: no hairline between the white sidebar and the linen content. A modal drawer (notifications) opens
 * inside the floating frame, in its shape: 16 from the window, the frame's corners on its side, its hairline.
 */
export const drawerCss = `.sidebar-shell { border-inline-end: 0; }
wa-drawer::part(dialog) { top: var(--fluvy-frame, 0px); bottom: var(--fluvy-frame, 0px); inset-inline-start: var(--fluvy-frame, 0px); height: calc(100% - 2 * var(--fluvy-frame, 0px)); max-height: none; border-start-start-radius: var(--fluvy-frame-radius, 0px); border-end-start-radius: var(--fluvy-frame-radius, 0px); overflow: hidden; }
:host([type="modal"]) wa-drawer::part(dialog) { box-shadow: 0 0 0 1px var(--fluvy-border), var(--fluvy-shadow-lift); }`;

/** Built-in panels (their sidebar ids) and the glyph each takes; a dashboard keeps the icon its owner chose. */
const PANEL_GLYPHS: Readonly<Record<string, string>> = {
  lovelace: 'home',
  energy: 'bolt',
  map: 'map',
  logbook: 'list',
  history: 'clock',
  'media-browser': 'speaker',
  todo: 'check',
  calendar: 'calendar',
  config: 'sliders',
  'developer-tools': 'script',
  // the area dashboards Home Assistant builds by itself
  home: 'home',
  light: 'bulb',
  security: 'shield',
  climate: 'thermo',
  maintenance: 'wrench',
};

/**
 * The apps people add most (a sidebar id carries the app's slug after its repository's prefix:
 * `5c53de3b_esphome`), each by a word of its slug, and the glyph it takes.
 */
const APP_GLYPHS: readonly (readonly [slug: string, glyph: string])[] = [
  ['hacs', 'store'],
  ['esphome', 'chip'],
  ['vscode', 'code'],
  ['configurator', 'fileCode'],
  ['_ssh', 'terminal'],
  ['terminal', 'terminal'],
  ['zigbee2mqtt', 'zigbee'],
  ['zwave', 'zwave'],
  ['nodered', 'nodes'],
  ['frigate', 'camera'],
  ['go2rtc', 'camera'],
  ['music_assistant', 'note'],
  ['adguard', 'shield'],
  ['grafana', 'chart'],
  ['glances', 'chart'],
  ['influxdb', 'database'],
  ['phpmyadmin', 'database'],
  ['hamh', 'hub'],
  ['matter', 'hub'],
  ['tailscale', 'globe'],
  ['nginxproxymanager', 'globe'],
  ['bitwarden', 'key'],
  ['vaultwarden', 'key'],
  ['logviewer', 'text'],
  ['portainer', 'box'],
];

const iconRule = (item: string, glyph: string): string =>
  `${item} > [slot="start"] { color: transparent; background-color: var(--sidebar-icon-color); -webkit-mask: ${mask(glyph)} center / 24px 24px no-repeat; mask: ${mask(glyph)} center / 24px 24px no-repeat; }
${item}.selected > [slot="start"] { background-color: var(--sidebar-selected-icon-color); }`;

/** The sidebar: the accent pill (radius 12), 14/500 labels, a 600 title. */
export const sidebarCss = [
  ':host { --ha-border-radius-sm: var(--fluvy-radius-control); }',
  'ha-list-item-button.selected::before { background-color: var(--fluvy-accent-fill); opacity: 1; }',
  'ha-list-item-button .item-text { font-weight: 500; letter-spacing: 0; }',
  '.title { font-weight: 600; letter-spacing: -0.01em; }',
].join('\n');

/**
 * Home Assistant's logo in the sidebar's head, in place of its menu glyph (the corner as Fluvy's screenshots draw it):
 * the house in Home Assistant's blue on the menu button, which still opens and closes the sidebar; the name at 16.
 */
export const sidebarLogoCss = [
  `.menu ha-icon-button { --icon-primary-color: transparent; background: ${HA_LOGO_URL} center / 24px 24px no-repeat; }`,
  '.title { font-size: 16px; letter-spacing: 0.01em; }',
].join('\n');

/** No hairline under the sidebar's head (the header loses its own with the same choice: `fluvy-flat` on `hui-root`). */
export const sidebarFlatCss = '.menu { border-bottom-color: transparent; }';

/**
 * A line after each item the house chose (`paths`, url paths checked by `parseChrome`), as the hairline under the
 * sidebar's head: the item's 4 below it grows to 21, the line in its middle from the icon's edge to the text's end, in
 * the collapsed sidebar under the icon alone. Home Assistant draws a selected item's pill as its `::before`; the line
 * is its `::after`.
 */
export const sidebarSeparatorsCss = (paths: readonly string[]): string => {
  const items = paths.map((path) => `#sidebar-panel-${path}`).join(', ');
  return items
    ? `:is(${items}) { margin-block-end: 21px; }
:is(${items})::after { content: ""; position: absolute; inset-inline: var(--ha-row-item-padding-inline, 12px); inset-block-start: calc(100% + 10px); height: 1px; background-color: var(--divider-color); pointer-events: none; }`
    : '';
};

/**
 * The sidebar's icons (an icon choice of the house's): our glyphs on Home Assistant's own panels, the
 * notifications and the apps people add most. A dashboard keeps the icon its owner chose.
 */
export const sidebarIconsCss = [
  ...Object.entries(PANEL_GLYPHS).map(([panel, glyph]) =>
    iconRule(panel === 'config' ? '#sidebar-config' : `#sidebar-panel-${panel}`, glyph),
  ),
  iconRule('#sidebar-notifications', 'bell'),
  ...APP_GLYPHS.map(([slug, glyph]) => iconRule(`[id^="sidebar-panel-"][id*="${slug}"]`, glyph)),
].join('\n');
