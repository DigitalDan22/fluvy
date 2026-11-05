import {
  isActive,
  isUsable,
  numberAttr,
  plural,
  stateText,
  strings,
  type ActionConfig,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceGridOptions,
} from '@fluvy/core';

import {
  activateKey,
  clickPress,
  head,
  ico,
  listRow,
  preventMenu,
  sheetStyles,
  startPress,
} from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { agoShort, durationShort } from '../helpers/datetime.js';

import { HeadFit, type FittedHead } from '../energy/head.js';
import { Card, type CardEditor } from '../shared/base.js';

import { iconOf } from '../shared/domain.js';
import { byState, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { EMPTY, entryCount, HEAD, ROW } from '../shared/heights.js';
import { emptyPanel, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import { changedAt, sinceIds, sinceOf } from '../shared/since.js';

const s = strings('openings');
/** A tile's state line as the tile sets it (13 px in a compact tile, not the large tile's 14). */
const TILE_STATE = 'fv-tile fv-tile--compact > fv-tile__state';
/** A tile's name as the tile sets it (its larger size: a narrow tile's 14 only leaves more room). */
const TILE_NAME = 'fv-tile fv-tile--compact > fv-tile__name';

/** A sensor on the card with a name, an icon, a colour or a tap of its own. */
export interface OpeningItem {
  readonly entity: string;
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  /** Where its last change is read from (#67): a timestamp sensor, or `attribute:<name>` of its own; else Home Assistant's. */
  readonly since?: string;
  readonly tap_action?: ActionConfig;
  readonly hold_action?: ActionConfig;
  /**
   * The class it is read as, in place of its own or none (#102): its words, its icon, and whether its on is something
   * to act on (a window's counts as open, a leak's as an alert).
   */
  readonly device_class?: string;
  /** Its own words for a state (`on: Tilted`), before its class's. */
  readonly states?: Readonly<Record<string, string>>;
}

export const OPENINGS_VARIANTS = ['rows', 'compact', 'tiles'] as const;

export interface OpeningsCardConfig extends FluvyCardConfig, EmptyList {
  title?: string;
  subtitle?: string;
  /** The sensors, in order: ids, or entries with their own name, icon, colour and tap (`entities` reads too). */
  rows?: ReadonlyArray<string | OpeningItem>;
  /**
   * `rows` (60, the time under each name), `compact` (48, the name and the state on one line) or `tiles` (two a row,
   * 84 inner tiles: the circle, the name, the state and its time).
   */
  variant?: (typeof OPENINGS_VARIANTS)[number];
  /** Rows before the "All sensors" row takes over (default 4). */
  max_rows?: number;
  /** The count in the head's badge ("2 open"). */
  show_count?: boolean;
  /** How long it has been open, or since it last was, under each name (rows only). */
  show_time?: boolean;
  /**
   * Where every row's last change is read from, unless the row says (#67): a sensor id with `{id}` for the row's
   * object id or `{entity}` for its whole id (`sensor.{id}_real_last_changed`); none by default.
   */
  since_pattern?: string;
  /** Test hook: an ISO date that freezes "now" (the times in the sub lines). Undocumented. */
  _now?: string;
}

/** Device classes whose "on" is something to act on (warning tone), and the ones that read open / closed. */
const OPENING = new Set(['door', 'garage_door', 'window', 'opening', 'garage', 'gate']);

/** Whether an entity opens and closes: a cover, a lock (the domain or the class), or an opening by its class. */
const isOpening = (view: EntityView): boolean =>
  view.domain === 'cover' ||
  view.domain === 'lock' ||
  view.deviceClass === 'lock' ||
  OPENING.has(view.deviceClass ?? '');

/**
 * The entity read as the row's class (#102), where the row names one: its words (Home Assistant's formatter is handed
 * the class too), its icon and its alert are the class's.
 */
function classed(view: EntityView, item: OpeningItem): EntityView {
  const dc = item.device_class;
  if (typeof dc !== 'string' || !dc) return view;
  const attributes = { ...view.stateObj?.attributes, device_class: dc };
  return {
    ...view,
    deviceClass: dc,
    stateObj: view.stateObj && { ...view.stateObj, attributes },
    attr: <T>(key: string) => (key === 'device_class' ? (dc as T) : view.attr<T>(key)),
  };
}

/**
 * Whether it is on: a sensor's on, a lock's unlocked; a cover (a blind, a curtain, a garage door…) whenever it is not
 * shut — open, on its way, or a position above 0 (a blind a third up is open, #105).
 */
const isOn = (view: EntityView): boolean =>
  isActive(view) ||
  (view.domain === 'cover' &&
    view.status === 'ok' &&
    (numberAttr(view, 'current_position') ?? 0) > 0);
const ALERT = new Set([
  ...OPENING,
  'lock',
  'moisture',
  'problem',
  'safety',
  'smoke',
  'gas',
  'carbon_monoxide',
  'tamper',
]);
const MOTION = new Set(['motion', 'occupancy', 'presence', 'moving', 'vibration', 'sound']);
const HAZARD = new Set(['smoke', 'gas', 'carbon_monoxide']);

/** Rows before the "All sensors" row takes over: four, else the config's whole number from 1, as many as it asks. */
const maxRowsOf = (config: Pick<OpeningsCardConfig, 'max_rows'>): number =>
  Math.max(1, Math.round(config.max_rows ?? 4));

/**
 * The house's binary sensors on one card: how many are open in the head, then a row each — the
 * state once at the right, the time in the sub ("14 min" while it is open, "2 h ago" once it is
 * over). Long lists collapse to the first few and an "All sensors" row that opens the rest in place.
 *
 * Home Assistant translates binary states by device class, but only for integrations that register
 * the translation; the four families this card is about (openings, detection, moisture, problems)
 * carry fluvy's own wording so a door never reads "On".
 */
export class FluvyOpeningsCard extends Card<OpeningsCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: OpeningsCardConfig): number {
    const n = entryCount(config, ['rows', 'entities']);
    if (!n) return HEAD + EMPTY;
    const max = maxRowsOf(config);
    // one extra sensor is a row, not a "1 more" row (as the card lays them out)
    const more = n > max + 1 ? 1 : 0;
    const shown = more ? max : n;
    // tiles: two a row (84 inner tiles, 8 apart) where the head's rows would be, then 16 and the "all sensors" row (48);
    // a state too long for two a row lays one a row, measured at its width (the grid's height is an estimate of two)
    if (config.variant === 'tiles') {
      const rows = Math.ceil(shown / 2);
      return HEAD + rows * 84 + (rows - 1) * 8 + more * (16 + 48);
    }
    return HEAD + (config.variant === 'compact' ? 48 : ROW) * (shown + more);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.ambient,
    css`
      /* the lab fixes the sheet at 360; a dashboard column decides here */
      .am-card {
        width: 100%;
      }
      /* tiles: two a row on the card, the inner tiles' page fill */
      .op-tiles {
        margin-top: 16px;
      }
    `,
  ];

  static override properties = { ...Card.properties, expanded_: { state: true } };

  /** The head's fitting and the rows' (what gives way, in its order), its words measured as the card sets them. */
  private readonly headFit = new HeadFit(this);

  declare expanded_: boolean;

  constructor() {
    super();
    this.expanded_ = false;
  }

  static override editor(): Promise<CardEditor> {
    return import('./openings-editor.js');
  }
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };

  static getStubConfig(_hass: unknown, entities: readonly string[]): OpeningsCardConfig {
    return {
      type: 'custom:fluvy-openings-card',
      entities: entities.filter((id) => id.startsWith('binary_sensor.')).slice(0, 4),
    };
  }

  protected override prepare(config: OpeningsCardConfig): OpeningsCardConfig {
    listOf(config, 'rows', ['entities']);
    return config;
  }

  /** The sensors as entries (a bare id is an entry with nothing of its own), in their order. */
  private items(): OpeningItem[] {
    return itemsOf(this.config?.rows ?? this.config?.entities);
  }

  /** The sensors, and what their last change is read from (`since`, the card's pattern). */
  protected override watched(): readonly string[] {
    const items = this.items();
    return [...items.map((item) => item.entity), ...sinceIds(items, this.config?.since_pattern)];
  }

  private maxRows(): number {
    return maxRowsOf(this.config ?? {});
  }

  override getCardSize(): number {
    return 2 + Math.min(this.items().length || 1, this.maxRows() + 1);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /**
   * Open, wet, smoke, a problem: on AND of a class that is a warning, as a cover of any class is (#105). Motion is an
   * event, not an alert.
   */
  private alert(view: EntityView): boolean {
    return (
      isOn(view) &&
      (view.domain === 'cover' || ALERT.has(view.domain === 'lock' ? 'lock' : view.deviceClass))
    );
  }

  /** "3 sensors", "2 rooms": a count of the card's own. */
  private count(key: 'sensors' | 'rooms', n: number): string {
    return plural(this.hass, `openings.${key}`, n, { count: n });
  }

  /** What is alerting, counted: "2 open" when every one of them is an opening, else "2 alerts" (a leak, smoke). */
  private alerts(n: number, openOnly: boolean): string {
    return plural(this.hass, openOnly ? 'openings.open' : 'openings.alerts', n, { count: n });
  }

  /** The state, said once: in the row's own words for it, else in those the device class deserves. */
  private valueText(view: EntityView, item: OpeningItem): string {
    if (view.status !== 'ok') return stateText(this.hass, view);
    const own: unknown = byState(item.states, view.state);
    if (typeof own === 'string' && own) return own;
    const on = isOn(view);
    const dc = view.deviceClass;
    if (view.domain === 'lock') return stateText(this.hass, view); // locking, jammed, open: Home Assistant's own words
    if (dc === 'lock') return this.t(on ? 'lock.unlocked' : 'lock.locked');
    if (view.domain === 'cover' || OPENING.has(dc))
      return this.t(on ? 'common.open' : 'common.closed');
    if (MOTION.has(dc)) return s(this.hass, on ? 'detected' : 'clear');
    if (HAZARD.has(dc)) return s(this.hass, on ? 'detected' : 'ok');
    if (dc === 'moisture') return s(this.hass, on ? 'wet' : 'dry');
    if (dc === 'problem' || dc === 'safety' || dc === 'tamper')
      return s(this.hass, on ? 'problem' : 'ok');
    return stateText(this.hass, view);
  }

  /**
   * The tiles' column gap in pixels: the laid-out grid's, else the dashboard's variable where it is in pixels (a value
   * in other units is read from the grid once it is laid out), else the sheet's 8.
   */
  private gridGap(): number {
    const grid = this.renderRoot.querySelector<HTMLElement>('.op-tiles');
    const laid = grid ? Number.parseFloat(getComputedStyle(grid).columnGap) : Number.NaN;
    if (Number.isFinite(laid)) return laid;
    const raw = getComputedStyle(this).getPropertyValue('--ha-section-grid-column-gap').trim();
    return raw.endsWith('px') ? Number.parseFloat(raw) : 8;
  }

  /** The tiles: two a row, each its circle, its name, its state and (when shown) its time; tap and hold as a row's. */
  private renderTiles(
    rows: ReadonlyArray<{ item: OpeningItem; view: EntityView }>,
    tone: NonNullable<OpeningsCardConfig['tone']>,
    timed: boolean,
    now: Date,
  ): TemplateResult {
    // a tile's words: its share of the row less its sides (16), its circle (44) and the gap (12). Where a state would not
    // fit even alone (a long word in a narrow tile), every tile gives its circle's room to its words, as rows do; where
    // it still would not, one tile a row. A sensor that cannot be read — gone, or unknown — says a dash (its word is the
    // tile's label, and a gone one's skin): its state never lays the tiles out otherwise (1.9: a card keeps its size)
    const words = (item: OpeningItem, view: EntityView): string =>
      view.status === 'ok' ? this.valueText(view, item) : '—';
    const widest = Math.max(
      ...rows.map(({ item, view }) => this.headFit.ruler.width(TILE_STATE, words(item, view))),
    );
    // the grid's gap is the dashboard's (Fluvy's theme sets 16)
    const gap = this.gridGap();
    const half = (this.contentWidth - gap) / 2 - 32;
    const columns = widest <= half ? 2 : 1;
    const share = columns === 2 ? half : this.contentWidth - 32;
    // a tile under 136 (104 inside) hides its circle by its own rule (tiles.css): its words have that room; and as the
    // rows do, every tile gives its circle where a name beside it would end before it had begun (96, or the name)
    const named = rows.some(
      ({ item, view }) =>
        share - 56 < Math.min(96, this.headFit.ruler.width(TILE_NAME, item.name ?? view.name)),
    );
    const bare = widest > share - 56 || share < 104 || named;
    const room = bare ? share : share - 56;
    return html`<div class="fv-tiles fv-tiles--${columns} op-tiles">
      ${rows.map(({ item, view }) => {
        const warn = this.alert(view);
        const dead = !isUsable(view);
        const name = item.name ?? view.name;
        const value = words(item, view);
        // the state stays; its time goes, whole, where the tile cannot hold both
        const timedLine = !dead && timed ? `${value} · ${this.when(item, view, warn, now)}` : '';
        const when =
          timedLine && this.headFit.ruler.width(TILE_STATE, timedLine) <= room
            ? this.when(item, view, warn, now)
            : '';
        const tap = (): void => this.tap(view.id, item.tap_action ?? { action: 'more-info' });
        const hold = (): void => this.hold(view.id, item.hold_action ?? { action: 'more-info' });
        return html`<article
          class="fv-tile fv-tile--compact fv-tile--inner fv-tile--tap ${
            warn ? `is-on fv-tile--${tone}` : item.color && !dead ? 'is-tinted' : ''
          } ${dead ? 'is-unavailable fv-tile--off' : ''}"
          data-accent=${this.accents.item(item.color) ?? nothing}
          role="button"
          tabindex="0"
          aria-label=${`${name} · ${view.status === 'ok' ? value : stateText(this.hass, view)}`}
          .fvTap=${tap}
          .fvHold=${hold}
          @pointerdown=${startPress}
          @click=${clickPress}
          @contextmenu=${preventMenu}
          @keydown=${activateKey(tap)}
        >
          ${
            bare
              ? nothing
              : ico(
                  iconOf(view, item.icon),
                  dead ? 'off' : warn ? tone : item.color ? 'accent' : 'neutral',
                )
          }
          <div class="fv-tile__text">
            <h3 class="fv-tile__name" data-name>${name}</h3>
            <p class="fv-tile__state">${when ? `${value} · ${when}` : value}</p>
          </div>
        </article>`;
      })}
    </div>`;
  }

  /**
   * The row that unfolds the rest: "All sensors", what it hides (folded) and its chevron (turned up, open). Folded, an
   * alert among it is said first ("2 more · 1 open", "+2 · 1 open", the alert alone); a compact row's count is its value
   * ("+3", in the warning's ink over an alert). Its circle goes with the rows' (under tiles, where its own name would
   * not hold beside it).
   */
  private renderMore(
    compact: boolean,
    more: number,
    keep: boolean,
    hidden: { readonly count: number; readonly openOnly: boolean },
  ): TemplateResult {
    const title = s(this.hass, 'all_sensors');
    const open = this.expanded_;
    const bare =
      !keep ||
      this.headFit.ruler.width('fv-row__title', title) >
        this.contentWidth - (compact ? 52 : 56) - 12 - 44;
    const alert = hidden.count === 0 ? '' : this.alerts(hidden.count, hidden.openOnly);
    const folded = s(this.hass, 'more', { count: more });
    // folded, the line says the alert it hides before anything else: "2 more · 1 alert", else "+2 · 1 alert", else the
    // alert alone — never the count without it
    const room = this.contentWidth - (bare ? 0 : 56) - 12 - 44;
    const fits = (text: string): boolean => this.headFit.ruler.width('fv-row__sub', text) <= room;
    const line = !alert
      ? this.headFit.fitRowSub(folded, room)
      : ([`${folded} · ${alert}`, `+${more} · ${alert}`].find(fits) ?? alert);
    const label = alert ? { label: `${title} · ${folded} · ${alert}` } : {};
    return listRow({
      icon: bare ? null : 'list',
      tone: 'neutral',
      title,
      ...(compact && !open
        ? {
            trailing: 'value' as const,
            quiet: hidden.count === 0,
            value: `+${more}`,
            ...(hidden.count ? { valueTone: 'warning', ...label } : {}),
          }
        : {
            trailing: 'chevron' as const,
            ...(alert ? { subTone: 'warning' as const } : {}),
            ...(compact
              ? {}
              : {
                  sub: open ? s(this.hass, 'less') : line,
                  ...(open ? {} : label),
                }),
          }),
      compact,
      open,
      onTap: () => {
        this.expanded_ = !this.expanded_;
      },
    });
  }

  /** A row's time where it fits beside its value; else none, whole (the value is what the row is for). */
  private timeFitted(
    when: string,
    item: OpeningItem,
    view: EntityView,
    compact: boolean,
    keep: boolean,
  ): string {
    const room = this.headFit.rowRoom(this.contentWidth, this.valueText(view, item), {
      compact,
      icon: keep,
    });
    return when && this.headFit.ruler.width('fv-row__sub', when) <= room ? when : '';
  }

  /**
   * "14 min" for something still open (a duration), "2 h ago" for something that happened (an event) — from when it
   * really changed, where the row or the card says where that is read (#67).
   */
  private when(item: OpeningItem, view: EntityView, ongoing: boolean, now: Date): string {
    const changed =
      view.status === 'ok'
        ? changedAt(this.hass, view, sinceOf(item, this.config?.since_pattern))
        : null;
    if (!changed || Number.isNaN(changed.getTime())) return '';
    return ongoing ? durationShort(this.hass, changed, now) : agoShort(this.hass, changed, now);
  }

  protected renderCard(): TemplateResult {
    const frozen = this.config?._now ? new Date(this.config._now) : null;
    const now = frozen && !Number.isNaN(frozen.getTime()) ? frozen : new Date();
    // each row with its own entry, by position: the same sensor listed twice keeps both names
    const rows = this.items().map((item) => ({
      item,
      view: classed(this.entity(item.entity), item),
    }));
    const views = rows.map(({ view }) => view);
    const alerts = views.filter((view) => this.alert(view));
    const tone = this.config?.tone ?? 'warning';

    // the rooms are counted where there are several: one says nothing a room's own page or card does not
    const rooms = new Set(views.map((view) => view.areaName).filter(Boolean));
    const countText = this.count('sensors', views.length);
    const roomText = rooms.size > 1 ? this.count('rooms', rooms.size) : '';

    // "1 open" when everything alerting is an opening; a leak or smoke makes it "1 alert"
    const openOnly = alerts.every((view) => isOpening(view));
    const badgeText =
      alerts.length === 0 ? s(this.hass, 'all_clear') : this.alerts(alerts.length, openOnly);

    const max = this.maxRows();
    const collapsible = views.length > max + 1; // one extra sensor is a row, not a "1 more" row
    const shown = collapsible && !this.expanded_ ? rows.slice(0, max) : rows;
    const variant = this.config?.variant ?? 'rows';
    const compact = variant === 'compact' || variant === 'tiles';
    const timed = variant !== 'compact' && this.config?.show_time !== false;

    // nothing listed: the panel says so where the rows would be, and the head counts nothing
    const panel = emptyPanel(this, !rows.length, 'door', 'common.no_sensors');
    const counted = this.config?.show_count !== false && !panel;
    // the head gives way in its order: the sub's last part (the badge is the card's alert), the badge, the circle. The
    // sheet's "Openings & motion" where it keeps the circle and the badge whole, else the shorter default; a typed
    // title is the user's
    const fit = (title: string): FittedHead =>
      this.headFit.fit({
        width: this.contentWidth,
        title,
        sub:
          this.config?.subtitle ??
          (panel ? '' : roomText ? `${countText} · ${roomText}` : countText),
        badge: counted ? { text: badgeText, tone: alerts.length > 0 ? tone : 'neutral' } : null,
        badgeFirst: true,
      });
    let title = this.config?.title ?? s(this.hass, 'title');
    let fitted = fit(title);
    const kept = (f: FittedHead): boolean => f.icon && !f.cut && (!counted || f.badge !== nothing);
    if (this.config?.title === undefined && !kept(fitted)) {
      title = s(this.hass, 'title_short');
      fitted = fit(title);
    }
    // a column too narrow for a name beside its state gives every row's circle to its words (the "all sensors" row's
    // with them), as every list does
    const keep = this.headFit.rowsKeepIcon(
      this.contentWidth,
      [
        ...shown.map(({ item, view }) => ({
          title: item.name ?? view.name,
          value: isUsable(view) ? this.valueText(view, item) : '—',
        })),
        ...(collapsible && variant !== 'tiles'
          ? [{ title: s(this.hass, 'all_sensors'), value: '', end: 44 }]
          : []),
      ],
      compact,
    );
    // what the fold hides that is alerting: the "all sensors" row says it
    const hiddenAlerts =
      collapsible && !this.expanded_
        ? rows
            .slice(max)
            .filter(({ view }) => this.alert(view))
            .map(({ view }) => view)
        : [];
    const hidden = {
      count: hiddenAlerts.length,
      openOnly: hiddenAlerts.every((view) => isOpening(view)),
    };
    return html`<article class="fv-card am-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'door') : null,
        tone: alerts.length > 0 ? tone : 'neutral',
        title,
        name: true, // a typed title, or the card's own: a name, as the list rows' are
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${variant === 'tiles' && !panel ? this.renderTiles(shown, tone, timed, now) : nothing}
      ${
        panel || variant !== 'tiles' || collapsible
          ? html`<div class="am-rows">
              ${panel}
              ${(variant === 'tiles' ? [] : shown).map(({ item, view }) => {
                const warn = this.alert(view);
                const dead = !isUsable(view);
                const title = item.name ?? view.name;
                return listRow({
                  icon: keep ? iconOf(view, item.icon) : null,
                  // what needs acting on is filled in the warning tone, circle and state alike; a row's own colour is who
                  // it is, so its circle wears it the rest of the time; events (motion) and the rest stay neutral
                  tone: dead ? 'off' : warn ? tone : item.color ? 'accent' : 'neutral',
                  accent: this.accents.item(item.color),
                  title,
                  name: true,
                  compact,
                  // "Unavailable" is said once, where the time would be — where it fits beside the dash; else the dashed
                  // skin says it and the word is the row's label
                  sub: dead
                    ? this.headFit.ruler.width('fv-row__sub', stateText(this.hass, view)) <=
                      this.headFit.rowRoom(this.contentWidth, '—', { compact, icon: keep })
                      ? stateText(this.hass, view)
                      : ''
                    : timed
                      ? this.timeFitted(this.when(item, view, warn, now), item, view, compact, keep)
                      : '',
                  trailing: 'value',
                  // a value never wraps: a sensor that cannot be read is a dash (its word is the row's sub, or its label)
                  value: dead ? '—' : this.valueText(view, item),
                  valueTone: warn ? 'warning' : '',
                  unavailable: dead,
                  ...(dead ? { label: `${title} · ${stateText(this.hass, view)}` } : {}),
                  onTap: () => this.tap(view.id, item.tap_action ?? { action: 'more-info' }),
                  onHold: () => this.hold(view.id, item.hold_action ?? { action: 'more-info' }),
                });
              })}
              ${collapsible ? this.renderMore(compact, views.length - max, variant === 'tiles' || keep, hidden) : nothing}
            </div>`
          : nothing
      }
    </article>`;
  }
}
