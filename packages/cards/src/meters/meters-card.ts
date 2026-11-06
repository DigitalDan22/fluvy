import { metersHeight } from '../energy-family.js';
import {
  formatTime,
  isActive,
  isEntityId,
  stateText,
  strings,
  toggleService,
  valueParts,
  type EntityName,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { activateKey, barRow, head, listRow, readout, round } from '@fluvy/ui';
import { energyStyles } from '@fluvy/ui/styles/energy';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { CollectionFollower, collectionKeyOf, followedMoment } from '../energy-model/collection.js';
import { fetchPrefs } from '../energy-model/house.js';
import { houseMidnight } from '../energy-model/period.js';
import { readPrefs, type EnergyPrefs } from '../energy-model/prefs.js';
import { rangeWords } from '../energy-model/range-words.js';
import { RecordedSensors } from '../energy-model/recorded.js';
import {
  COLLECTION_LABEL,
  collectionChoices,
  collectionField,
  collectionHelper,
} from '../energy/collection-field.js';
import { HeadFit, SWITCH_SLOT } from '../energy/head.js';
import { shortName } from '../energy/power.js';
import { Card, type BaseKey } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { iconOf, stateWord } from '../shared/domain.js';
import { fitLine, type Segment } from '../shared/fit.js';
import {
  actionFields,
  colourFields,
  editorLabels,
  entityField,
  fieldRow,
  iconField,
  nameIconFields,
  NUMBER_DEFAULTS,
  numberField,
  numberFields,
  selectField,
  showIconField,
  titleFields,
} from '../shared/form.js';
import type { EditorChoices, EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { convert, convertible } from '../history-bars/units.js';
import { decimalsOf, LADDERS, type NumberKeys } from '../shared/units.js';
import {
  fetchToday,
  fetchWeek,
  fractionOf,
  kindOf,
  meterFigure,
  METER_KINDS,
  todayOf,
  typicalOf,
  type MeterKind,
  type StatRow,
} from './today.js';

const s = strings('meters');

export type MetersVariant = 'full' | 'rows';
export const METERS_VARIANTS: readonly MetersVariant[] = ['full', 'rows'];

export interface MeterConfig extends NumberKeys {
  /** A growing meter (`total_increasing`): m³, L, ft³, gal, CCF — or kWh for gas. */
  entity: string;
  /** What flows right now ("6 L/min"): a flow sensor, optional. */
  rate?: string;
  /** A day's typical use, in the meter's unit. Without it: the mean of the last 7 full days. */
  typical?: number;
  name?: EntityName;
  icon?: string;
  /** `water` or `gas`; by default from the meter's device class. */
  kind?: MeterKind;
}

export interface MeterRowConfig {
  entity: string;
  name?: EntityName;
  icon?: string;
}

export interface MetersCardConfig extends FluvyCardConfig, NumberKeys {
  title?: string;
  subtitle?: string;
  /** The meters. Empty: the Energy dashboard's gas and water meters. */
  meters?: ReadonlyArray<string | MeterConfig>;
  /** Rows under the meters: a leak sensor says its state, a valve or a switch gets its switch. */
  rows?: ReadonlyArray<string | MeterRowConfig>;
  /** `full`: each meter's figure beside its bar (the default). `rows`: a bar row per meter, with its icon. */
  variant?: MetersVariant;
  /** An Energy date picker's key (`energy_…`): the meters' use over the last day of its range (the day so far while it holds today). */
  collection_key?: string;
  /** The tests' clock: "now" for today's midnight. */
  _now?: string;
}

/** The bar and its note need this much beside the figure; below it they go under it. */
const BARS_MIN = 96;
const FIGURE_MIN = 120;
const GAP = 16;

/** Rows that get a switch: what is safe to flip from a list (a valve, a switch), never a lock or a scene. */
const SWITCHED = new Set([
  'valve',
  'switch',
  'input_boolean',
  'fan',
  'light',
  'humidifier',
  'siren',
]);

interface Meter {
  readonly key: string;
  readonly id: string;
  readonly kind: MeterKind;
  readonly label: string;
  readonly glyph: string;
  readonly view: EntityView;
  readonly unit: string;
  /** The figures' decimals, where the meter or the card asks for them. */
  readonly decimals: number | undefined;
  readonly today: number | null;
  readonly typical: number | null;
  /** The note's first words when the meter cannot give a figure: its state, or that it has no statistics. */
  readonly trouble: string;
  /** `undefined`: no flow sensor; `null`: one that cannot be read. */
  readonly rate: string | null | undefined;
  /** It has a line under its figure, read or not: a typical day, a flow, or the recorder holding nothing of it. */
  readonly lined: boolean;
}

/**
 * Water and gas, today: each meter's use since the house's midnight — its long-term statistics' change, plus what it
 * has gained since the last hour was compiled — against a typical day, and what flows right now. Rows under the
 * meters carry what goes with them: a leak sensor's state, a main valve's switch. With no meters given, the Energy
 * dashboard's own water and gas meters are read.
 */
export class FluvyMetersCard extends Card<MetersCardConfig> {
  static override layoutHeight(config: MetersCardConfig): number {
    return metersHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    energyStyles,
    css`
      .ef-card {
        width: 100%;
      }
      .ef-meter .fv-readout {
        flex: 0 0 var(--figure, 120px);
        min-width: 0;
      }
      .ef-meter .fv-readout__label {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .ef-meter__bars {
        min-width: 0;
      }
      /* one line, fitted in segments; a trouble word longer than its box (fr's "Pas encore de statistiques" by a
         pixel at 412) ends in an ellipsis rather than leave the card, its whole text in the title */
      .ef-meter__note {
        display: block;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* too narrow for the bar beside the figure: under it */
      .ef-meter--stack {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        height: auto;
      }
      .ef-meter--stack .fv-readout {
        flex: none;
      }
      .ef-meter.is-dead .ef-meter__note {
        color: var(--fluvy-text-secondary);
      }
    `,
  ];

  /** A card of several sensors has no entity of its own: its head's icon, tone and colour, and its actions on the head. */
  static override base: readonly BaseKey[] = [
    'icon',
    'tone',
    'color',
    'card_color',
    'card_opacity',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<MetersCardConfig>()([
    'title',
    'subtitle',
    'meters',
    'rows',
    'variant',
    'collection_key',
    'unit',
    'decimals',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'meters',
      title: 'meters.editor_meters',
      domains: ['sensor'],
      keys: ['entity', 'rate', 'typical', 'name', 'icon', 'kind', 'unit', 'decimals'],
      schema: [
        entityField(['sensor']),
        fieldRow(entityField(['sensor'], 'rate', false), numberField('typical', 0, 1_000_000, 0.1)),
        nameIconFields(),
        selectField('kind', METER_KINDS),
        numberFields({ units: LADDERS.volume }),
      ],
      computeLabel: editorLabels(s, {
        rate: 'editor_rate',
        typical: 'editor_typical',
        kind: 'editor_kind',
      }).computeLabel,
    },
    {
      key: 'rows',
      title: 'meters.editor_rows',
      domains: ['binary_sensor', 'sensor', 'valve', 'switch', 'input_boolean'],
      keys: ['entity', 'name', 'icon'],
      schema: [
        entityField(['binary_sensor', 'sensor', 'valve', 'switch', 'input_boolean']),
        nameIconFields(),
      ],
    },
  ];
  static override aliases: AliasSpec = { items: { meters: ITEM_ALIASES, rows: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'full',
    collection_key: '',
    ...NUMBER_DEFAULTS,
  });
  /** The date pickers on the dashboard, for the key. */
  static override choices: EditorChoices = (_config, hass) => ({
    collection_key: collectionChoices(hass),
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), selectField('variant', METERS_VARIANTS)),
        fieldRow(showIconField(), collectionField()),
        ...colourFields(),
        numberFields({ units: LADDERS.volume }),
        actionFields(),
      ],
      ...editorLabels(s, {}, COLLECTION_LABEL),
      computeHelper: collectionHelper,
    };
  }

  protected override prepare(config: MetersCardConfig): MetersCardConfig {
    collectionKeyOf(config, 'fluvy-meters-card');
    return config;
  }

  static getStubConfig(
    hass: HomeAssistant | undefined,
    entities: readonly string[],
  ): MetersCardConfig {
    const meters = entities.filter((id) => {
      const attributes = hass?.states[id]?.attributes;
      return (
        id.startsWith('sensor.') &&
        (attributes?.device_class === 'water' || attributes?.device_class === 'gas') &&
        attributes['state_class'] === 'total_increasing'
      );
    });
    // none recognisable: the Energy dashboard's own meters
    return { type: 'custom:fluvy-meters-card', ...(meters.length ? { meters } : {}) };
  }

  private readonly head = new HeadFit(this);
  private readonly follower = new CollectionFollower(this);
  private prefs: EnergyPrefs | null | undefined;
  private prefsAsked = false;
  /** The statistics each meter's today and week came from, by the question asked (a new hour asks again). */
  private readonly days = new Map<
    string,
    { readonly rows: readonly StatRow[] | null; readonly midnight: number }
  >();
  private readonly weeks = new Map<string, readonly StatRow[] | null>();
  private readonly asked = new Map<string, string>();
  /** The meters missing from the house: as the recorder describes them (their unit), so their day is still read. */
  private readonly recorded = new RecordedSensors(this);
  private ticker: number | undefined;
  private shownHour = 0;

  override getCardSize(): number {
    return Math.ceil(FluvyMetersCard.layoutHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- configuration ---------- */

  private configured(): MeterConfig[] {
    const own = (this.config?.meters ?? [])
      .map((m) => (typeof m === 'string' ? { entity: m } : m))
      .filter((m) => typeof m.entity === 'string' && m.entity !== '');
    if (own.length) return own;
    // the Energy dashboard's meters: an entity each (an imported statistic has no reading to show)
    const house = readPrefs(this.prefs);
    return [
      ...house.water.map((entity) => ({ entity, kind: 'water' as const })),
      ...house.gas.map((entity) => ({ entity, kind: 'gas' as const })),
    ].filter((m) => !m.entity.includes(':'));
  }

  private rowList(): MeterRowConfig[] {
    return (this.config?.rows ?? [])
      .map((r) => (typeof r === 'string' ? { entity: r } : r))
      .filter((r) => typeof r.entity === 'string' && r.entity !== '');
  }

  protected override watched(): readonly string[] {
    return [
      ...this.configured().flatMap((m) => [m.entity, m.rate]),
      ...this.rowList().map((r) => r.entity),
    ].filter((id): id is string => !!id);
  }

  /** The clock (a test's, `_now`). */
  private clock(): Date {
    const pinned = this.config?._now ? Date.parse(this.config._now) : NaN;
    return new Date(Number.isFinite(pinned) ? pinned : Date.now());
  }

  /** The moment the day is read up to: the clock, or the end of the last day a date picker holds. */
  private now(): Date {
    const range = this.follower.range();
    return range ? followedMoment(range, this.clock()) : this.clock();
  }

  /** The day read is over (a picker on a past day): a meter's reading now is not part of it. */
  private get closed(): boolean {
    return this.now().getTime() < this.clock().getTime();
  }

  /* ---------- lifecycle ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    // "today" turns at the house's midnight, and a new hour's statistics are asked for: checked every minute
    this.ticker = window.setInterval(() => {
      if (this.config && Math.floor(this.now().getTime() / 3_600_000) !== this.shownHour)
        this.requestUpdate();
    }, 60_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.ticker);
    this.ticker = undefined;
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (!this.config || !this.hass) return;
    this.follower.attach(this.hass, this.config.collection_key || undefined);
    this.shownHour = Math.floor(this.now().getTime() / 3_600_000);
    if (!(this.config.meters ?? []).length && !this.prefsAsked) {
      this.prefsAsked = true;
      void fetchPrefs(this.hass).then((prefs) => {
        this.prefs = prefs;
        this.requestUpdate();
      });
    }
    this.askStatistics(this.hass);
  }

  /** Each meter's hours since midnight (again each hour) and, when no typical day is given, its last seven days. */
  private askStatistics(hass: HomeAssistant): void {
    const now = this.now();
    const midnight = houseMidnight(hass, now).getTime();
    for (const m of this.configured()) {
      const view = this.meterView(m.entity);
      if (!this.recorded.ready(view)) continue;
      const unit = this.unitOf(m, view);
      const hour = `${m.entity}|${unit}|${Math.floor(now.getTime() / 3_600_000)}`;
      if (this.asked.get(`day|${m.entity}`) !== hour) {
        this.asked.set(`day|${m.entity}`, hour);
        void fetchToday(hass, m.entity, unit, now).then((rows) => {
          if (this.asked.get(`day|${m.entity}`) !== hour) return;
          this.days.set(m.entity, { rows, midnight });
          this.requestUpdate();
        });
      }
      if (typeof m.typical === 'number') continue;
      const day = `${m.entity}|${unit}|${midnight}`;
      if (this.asked.get(`week|${m.entity}`) !== day) {
        this.asked.set(`week|${m.entity}`, day);
        void fetchWeek(hass, m.entity, unit, now).then((rows) => {
          if (this.asked.get(`week|${m.entity}`) !== day) return;
          this.weeks.set(m.entity, rows);
          this.requestUpdate();
        });
      }
    }
  }

  /* ---------- the meters ---------- */

  private kindWord(kind: MeterKind): string {
    return s(this.hass, `kind_${kind}`);
  }

  /** A meter as it is read: one missing from the house as the recorder describes it. */
  private meterView(id: string): EntityView {
    return this.recorded.view(this.entity(id));
  }

  private meters(): Meter[] {
    const list = this.configured();
    const midnight = this.hass ? houseMidnight(this.hass, this.now()).getTime() : 0;
    const kinds = list.map((m) => {
      const view = this.meterView(m.entity);
      return m.kind ?? kindOf(view.deviceClass, view.unit);
    });
    return list.map((m, i): Meter => {
      const view = this.meterView(m.entity);
      const kind = kinds[i] as MeterKind;
      const same = kinds.filter((k) => k === kind).length;
      const label =
        m.name == null
          ? same > 1 && view.status !== 'missing'
            ? shortName(view)
            : this.kindWord(kind)
          : this.nameFor(view, m.name);
      // yesterday's hours are no longer today's: the meter waits for its new day
      const asked = this.days.get(m.entity);
      const day = asked?.midnight === midnight ? asked : undefined;
      // the day in the unit the meter reads in: the statistics were asked in it, the reading and the typical day are
      // brought to it
      const unit = this.unitOf(m, view);
      const live =
        view.status === 'ok' && view.number !== null ? convert(view.number, view.unit, unit) : null;
      const today = day?.rows ? todayOf(day.rows, day.midnight, live, this.closed) : null;
      const typical =
        typeof m.typical === 'number' && Number.isFinite(m.typical) && m.typical >= 0
          ? convert(m.typical, view.unit, unit)
          : (() => {
              const week = this.weeks.get(m.entity);
              return week ? typicalOf(week) : null;
            })();
      const trouble =
        view.status !== 'ok'
          ? stateText(this.hass, view)
          : day !== undefined && today === null
            ? s(this.hass, 'no_statistics')
            : '';
      let rate: string | null | undefined;
      if (m.rate) {
        const flow = this.entity(m.rate);
        const parts = valueParts(this.hass, flow);
        rate =
          flow.status === 'ok' && flow.number !== null
            ? [parts.value, parts.unit].filter(Boolean).join(' ')
            : null;
      }
      return {
        key: `${m.entity}#${i}`,
        id: m.entity,
        kind,
        label,
        glyph: m.icon ?? (kind === 'gas' ? 'flame' : 'drop'),
        view,
        unit,
        decimals: decimalsOf(m.decimals) ?? decimalsOf(this.config?.decimals),
        today: view.status === 'ok' ? today : null,
        typical,
        trouble,
        rate,
        lined: typical !== null || rate !== undefined || (day !== undefined && !day.rows?.length),
      };
    });
  }

  /**
   * "6 L/min now · typical 150 L": what flows now first, the typical day after it (the first to go when narrow); the
   * rate alone where even "6 L/min now" would not fit — a figure per minute says it is now. Measured in the class that
   * draws it: the block's note, or a row's second line.
   */
  private note(m: Meter, room: number, cls = 'ef-meter__note'): string {
    const segments: Segment[] = [];
    if (m.trouble) segments.push({ text: m.trouble });
    else if (m.rate !== undefined)
      segments.push({ text: s(this.hass, 'now', { value: m.rate ?? '—' }) });
    if (!m.trouble && m.typical !== null)
      segments.push({
        text: s(this.hass, 'typical', { value: this.amount(m.typical, m.unit, m.decimals) }),
        optional: segments.length > 0,
      });
    if (!segments.length) return '';
    const width = (text: string): number => this.head.ruler.width(cls, text);
    const line = fitLine(segments, room, width);
    return width(line) > room && !m.trouble && m.rate !== undefined
      ? fitLine([{ text: m.rate ?? '—' }], room, width)
      : line;
  }

  private amount(value: number, unit: string, decimals: number | undefined): string {
    return [meterFigure(this.hass, value, decimals), unit].filter(Boolean).join(' ');
  }

  /** The unit a meter reads in: its own, else the card's, where the sensor's converts to it; else the sensor's. */
  private unitOf(m: MeterConfig, view: EntityView): string {
    const asked = [m.unit, this.config?.unit].find(
      (unit): unit is string => typeof unit === 'string' && convertible(view.unit, unit),
    );
    return asked ?? view.unit;
  }

  /* ---------- render ---------- */

  protected renderCard(): TemplateResult {
    const meters = this.meters();
    const rows = this.rowList();
    const w = this.contentWidth;
    const kinds = new Set(meters.map((m) => m.kind));
    const only = kinds.size === 1 ? [...kinds][0] : undefined;
    const title = this.config?.title ?? (only ? this.kindWord(only) : s(this.hass, 'title'));
    const typical = meters.some((m) => m.typical !== null);
    const first = meters[0]?.id;
    const now = this.now();
    const today = this.follower.range()
      ? rangeWords(this.hass, { start: houseMidnight(this.hass, now), end: now }, this.clock())
      : this.t('common.today');
    const sub =
      this.config?.subtitle ?? (typical ? `${today} · ${s(this.hass, 'vs_typical')}` : today);
    const fit = (round: boolean) =>
      this.head.fit({ width: w, title, sub, ...(round ? { trailing: 44 } : {}) });
    // the "…" round opens the first meter's details, as the energy card's does (fig-029); it gives way before the
    // title or the day ("Aujourd'hui" in half a column) is cut, after the icon
    let more = isEntityId(first);
    let fitted = fit(more);
    const r = this.head.ruler;
    if (
      more &&
      !fitted.icon &&
      (r.width('fv-card__title', title) > w - 44 - 12 ||
        r.width('fv-card__sub', sub.split(' · ')[0] ?? '') > w - 44 - 12)
    ) {
      more = false;
      fitted = fit(false);
    }
    const waiting = !(this.config?.meters ?? []).length && this.prefs === undefined;
    const empty = !meters.length && !rows.length && !waiting;
    const variant = this.config?.variant === 'rows' ? 'rows' : 'full';
    // a column too narrow for a row's name beside its figure or its switch gives every row's circle to the names, as
    // every list does (the full card's rows are its entity rows alone)
    const keep = this.head.rowsKeepIcon(w, [
      ...(variant === 'rows' ? meters : []).map((m) => ({
        title: m.label,
        value: m.today === null ? '—' : this.amount(m.today, m.unit, m.decimals),
        // what flows now is the note's figure, whole or gone with its circle
        sub: m.trouble ? '' : (m.rate ?? ''),
      })),
      ...rows.map((r) => this.rowEnd(r)),
    ]);
    const list = `ef-rows ${keep ? '' : 'ef-rows--bare'}`;
    return html`<article class="fv-card ef-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? (only === 'gas' ? 'flame' : 'drop')) : null,
        small: fitted.small,
        tone: toneOf(this.config, only === 'gas' ? 'gas' : 'water'),
        title,
        sub: fitted.sub,
        ...(more
          ? {
              trailing: round('dots', 'quiet', this.t('common.more'), () =>
                this.tap(first, { action: 'more-info' }),
              ),
            }
          : {}),
        name: Boolean(this.config?.title),
        cut: fitted.cut,
        ...this.headActions(first),
      })}
      ${
        empty
          ? this.head.empty(
              'drop',
              s(this.hass, 'no_meters'),
              s(this.hass, 'no_meters_hint'),
              this.contentWidth,
            )
          : variant === 'rows'
            ? html`<div class=${list}>
                ${meters.map((m) => this.meterRow(m, w, keep))}${rows.map((r) => this.entityRow(r, w, keep))}
              </div>`
            : html`${meters.map((m) => this.meterBlock(m, w))}
              ${rows.length ? html`<div class=${list}>${rows.map((r) => this.entityRow(r, w, keep))}</div>` : nothing}`
      }
    </article>`;
  }

  /** The approved block: the figure (label over value) and, beside it, the bar against a typical day over its note. */
  private meterBlock(m: Meter, w: number): TemplateResult {
    const known = m.today !== null;
    const value = known ? meterFigure(this.hass, m.today as number, m.decimals) : '—';
    const unit = known ? m.unit : '';
    const measured = this.head.ruler.width('fv-readout__value', value, 'fv-unit', unit);
    const figure = Math.max(FIGURE_MIN, Math.ceil(measured / 4) * 4);
    const stacked = w - figure - GAP < BARS_MIN;
    // one under: the figure's width is rounded up to the 4 grid, the note's measure is not (fr's "Pas encore de
    // statistiques" left its box by a pixel at 412)
    const room = (stacked ? w : w - figure - GAP) - 1;
    // out of reach, the row keeps its lines (the owner's rule, 1.9): the bar, empty, where the meter has a typical day,
    // and its state in the note; a stacked row with no line of its own says its state beside the dash, in the short
    // word a figure's line has room for ("— Not found")
    const away = m.view.status !== 'ok';
    const aside = stacked && away && !m.lined;
    const note = aside ? '' : this.note(m, room);
    const after = aside ? stateWord(this.hass, m.view) : unit;
    const bar = m.typical !== null && (away || !m.trouble);
    const open = (): void => this.tap(m.id, { action: 'more-info' });
    return html`<div
      class="ef-meter fv-row--tap ${stacked ? 'ef-meter--stack' : ''} ${m.trouble ? 'is-dead' : ''}"
      style="--figure:${figure}px"
      role="button"
      tabindex="0"
      aria-label=${m.label}
      @click=${open}
      @keydown=${activateKey(open)}
    >
      ${readout({ label: m.label, value, unit: after, name: true })}
      <div class="ef-meter__bars">
        ${
          bar
            ? html`<span class="ef-bar"
                ><span
                  class="ef-bar__fill ef-bar__fill--${m.kind}"
                  data-measure="value"
                  style="width:${Math.round(fractionOf(m.today, m.typical) * 100)}%"
                ></span
              ></span>`
            : nothing
        }
        ${note ? html`<span class="ef-meter__note" data-name title=${note}>${note}</span>` : nothing}
      </div>
    </div>`;
  }

  /** The `rows` layout: a bar row per meter — its icon, its name, the note, the bar and today's figure. */
  private meterRow(m: Meter, w: number, keep: boolean): TemplateResult {
    const value = m.today === null ? '—' : this.amount(m.today, m.unit, m.decimals);
    return barRow({
      icon: keep ? m.glyph : null,
      tone: m.trouble ? 'off' : m.kind,
      title: m.label,
      name: true,
      sub: this.note(m, this.rowRoom(w, value, keep), 'fv-row__sub'),
      value,
      fraction: fractionOf(m.today, m.typical),
      barTone: m.kind,
      onTap: () => this.tap(m.id, { action: 'more-info' }),
    });
  }

  /**
   * What ends an entity's row, for the rows' rule: its switch's slot, or its value's words — and what of its second
   * line must stay whole beside them (a state's short word, the time it last checked in; a room's name may end in
   * its ellipsis).
   */
  private rowEnd(r: MeterRowConfig): { title: string; value: string; end?: number; sub: string } {
    const view = this.entity(r.entity);
    const title = this.nameFor(view, r.name);
    if (SWITCHED.has(view.domain)) return { title, value: '', end: SWITCH_SLOT, sub: '' };
    return { title, value: this.rowValue(view), sub: this.rowSub(view)[0]?.short ?? '' };
  }

  /** An entity row's figure or state: "3.1 bar", "Dry", a dash while it cannot be read. */
  private rowValue(view: EntityView): string {
    if (view.status !== 'ok') return '—';
    const parts = valueParts(this.hass, view);
    return view.number !== null
      ? [parts.value, parts.unit].filter(Boolean).join(' ')
      : stateText(this.hass, view);
  }

  /** A row under the meters: a valve or a switch gets its switch; anything else says its state ("Dry", "3.1 bar"). */
  private entityRow(r: MeterRowConfig, w: number, keep: boolean): TemplateResult {
    const view = this.entity(r.entity);
    const usable = view.status === 'ok';
    const title = this.nameFor(view, r.name);
    const glyph = keep ? iconOf(view, r.icon) : null;
    const open = (): void => this.tap(view.id, { action: 'more-info' });
    if (SWITCHED.has(view.domain)) {
      const state = this.stateOf(view);
      const on =
        state === view.state ? isActive(view) : !['off', 'closed', 'closing'].includes(state);
      // a row that cannot be read: the dashed ring at full strength (the energy cards' unreadable row), its switch
      // still
      return listRow({
        icon: glyph,
        tone: usable ? 'neutral' : 'off',
        title,
        name: true,
        sub: stateText(this.hass, view),
        trailing: 'switch',
        on,
        readonly: !usable,
        onTap: open,
        onToggle: (next) => this.flip(view, next),
      });
    }
    const value = this.rowValue(view);
    // a leak said out loud: a moisture or water sensor that is on
    const alarm =
      usable &&
      view.domain === 'binary_sensor' &&
      view.state === 'on' &&
      ['moisture', 'water', 'problem', 'safety', 'gas'].includes(view.deviceClass);
    return listRow({
      icon: glyph,
      tone: alarm ? 'warning' : usable ? 'neutral' : 'off',
      title,
      name: true,
      sub: this.head.fitRowSegments(this.rowSub(view), this.rowRoom(w, value, keep)),
      trailing: 'value',
      value,
      valueTone: alarm ? 'warning' : '',
      onTap: open,
    });
  }

  /** Room for a row's second line beside its value: the circle's too, when the rows have none. */
  private rowRoom(w: number, value: string, keep: boolean): number {
    return this.head.rowRoom(w, value, { icon: keep });
  }

  /**
   * "Kitchen · checked 21:40": where it is and when it last reported (a sensor that stays dry still checks in), the
   * time alone where its words would be cut ("21:40"); a state's short word where its long one would ("Not found").
   */
  private rowSub(view: EntityView): Segment[] {
    if (view.status !== 'ok')
      return [{ text: stateText(this.hass, view), short: stateWord(this.hass, view) }];
    const state = view.stateObj as { last_reported?: string; last_updated?: string } | undefined;
    const at = Date.parse(state?.last_reported ?? state?.last_updated ?? '');
    if (!Number.isFinite(at)) return view.areaName ? [{ text: view.areaName }] : [];
    const time = formatTime(this.hass, new Date(at));
    const checked = s(this.hass, 'checked', { time });
    return view.areaName
      ? [{ text: view.areaName }, { text: checked, short: time, optional: true }]
      : [{ text: checked.charAt(0).toUpperCase() + checked.slice(1), short: time }];
  }

  /** The switch flips at once; the valve or switch is called through the card's own helper. */
  private flip(view: EntityView, next: boolean): void {
    if (!this.hass) return;
    const valve = view.domain === 'valve';
    this.expect(view.id, next ? (valve ? 'open' : 'on') : valve ? 'closed' : 'off');
    const [domain, service] = toggleService(this.hass, view.id);
    this.call(domain, service, {}, view.id);
  }
}
