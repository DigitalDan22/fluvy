import {
  clock12,
  dateFormat,
  houseZone,
  isEntityId,
  isPaletteRef,
  localize,
  strings,
  wallClock,
  type FluvyCardConfig,
  type HaFormSchemaItem,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { axis, head, linesNeeded } from '@fluvy/ui';
import { energyStyles } from '@fluvy/ui/styles/energy';
import {
  css,
  html,
  nothing,
  svg,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import {
  barGeometry,
  barPath,
  chartDefaultsFor,
  chartKeysOf,
  chartSection,
  chartStyles,
  drawChart,
  labelsApart,
  plotOf,
  resolveStyle,
  refInk,
  scrub,
  ScrubController,
  seriesColourField,
  styleOf,
  thinStep,
  tickText,
  UNIT_COLUMN,
  unitLabel,
  yOf,
  type ChartSeries,
  type ChartSpec,
  type Placed,
  type PlotBox,
  type ResolvedStyle,
  type SeriesColour,
  type Ticks,
} from '../chart/engine/index.js';
import { usageHeight, usagePlot } from '../energy-family.js';
import {
  CollectionFollower,
  collectionKeyOf,
  type EnergyDataLike,
} from '../energy-model/collection.js';
import { fetchPrefs } from '../energy-model/house.js';
import { meterOutage } from '../energy-model/outage.js';
import { allocatePeriod, fetchRange, stepFor, type Range } from '../energy-model/period.js';
import {
  readPrefs,
  type EnergyPrefs,
  type PrefSource,
  type SourceKind,
} from '../energy-model/prefs.js';
import { rangeWords } from '../energy-model/range-words.js';
import {
  COLLECTION_LABEL,
  collectionChoices,
  collectionField,
  collectionHelper,
  following,
} from '../energy/collection-field.js';
import { HeadFit } from '../energy/head.js';
import { energyLegend, type LegendEntry } from '../energy/legend-row.js';
import {
  GRAIN_PRESET,
  presetSpan,
  shiftSpan,
  type Grain as Period,
} from '../energy-period/picker.js';
import { axisHolds } from '../shared/axis.js';
import { Card, type BaseKey } from '../shared/base.js';
import type { ChartCaps, ChartKeys } from '../shared/chart-config.js';
import { chipRow } from '../shared/chips.js';
import { toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  editorLanguage,
  editorWord,
  fieldRow,
  iconField,
  NUMBER_DEFAULTS,
  numberField,
  numberFields,
  onlyWhen,
  selectField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import type {
  EditorChoices,
  EditorDefaults,
  FormHelper,
  RowsListSpec,
} from '../shared/rows-editor.js';
import { figuresOf, writeFigure, type Figures, type NumberKeys } from '../shared/units.js';
import {
  drawnTotal,
  fallOf,
  isReturn,
  riseOf,
  slotEnergy,
  usageTicks,
  slotsOf,
  USAGE_KINDS,
  usageSeries,
  type Grain,
  type SeriesKey,
  type SlotEnergy,
  type UsageKind,
  type UsageMode,
  type UsageSeries,
  type UsageSource,
} from './series.js';

const u = strings('energy-usage');
const flow = strings('energy-flow');
const sankey = strings('energy-sankey');
const periodCard = strings('energy-period-card');

/**
 * How a series is painted: its columns' colour, and its squares' — its source's ink (`en-ink--<ink>`), the person's own
 * colour (the card's accent sheet keys it), or one of the palette's by its token (`own`: it follows the palette and the
 * mode), worn as the squares' ink.
 */
interface Paint {
  readonly ink: string;
  readonly colour: SeriesColour;
  readonly accent?: string | undefined;
  readonly own?: string;
}

/** A square's ink class: its source's, or none where it wears a colour of the palette's of its own. */
const inkOf = (paint: Paint | undefined): string =>
  paint?.own ? '' : `en-ink--${paint?.ink ?? 'home'}`;

export type UsageVariant = 'full' | 'compact' | 'mini';
const VARIANTS: readonly UsageVariant[] = ['full', 'compact', 'mini'];
const PERIODS: readonly Period[] = ['day', 'week', 'month', 'year'];
const MODES: readonly UsageMode[] = ['usage', 'flows'];
/**
 * The slots of the card's own span: its grain says them, on the house's clock. Home Assistant's rule (`stepFor`) reads
 * the span's edges on the browser's clock, so a year from the house's 1 January read as days where the browser's zone
 * is not the house's (it starts on 31 December there); it stays for a span a date picker hands over, as Home
 * Assistant reads that one.
 */
const STEP: Readonly<Record<Period, 'hour' | 'day' | 'month'>> = {
  day: 'hour',
  week: 'day',
  month: 'day',
  year: 'month',
};

export interface EnergyUsageCardConfig
  extends
    FluvyCardConfig,
    NumberKeys,
    Pick<ChartKeys, 'chart' | 'show_grid' | 'show_axis' | 'animate'> {
  title?: string;
  subtitle?: string;
  /** The span drawn while no date picker is followed: today, this week, this month, this year (default day). */
  period?: Period;
  /** Day · Week · Month · Year chips (default true; the full layout's). */
  show_period?: boolean;
  /** An Energy date picker's key (`energy_…`): the card draws its range with Home Assistant's own figures, its chips gone. */
  collection_key?: string;
  /** The chart with its legend (default), the chart alone, or a strip under the head. */
  variant?: UsageVariant;
  /** What the columns stand for above the line: what the house used from each source (default), or what each meter measured. */
  mode?: UsageMode;
  /** The chart's plot in px, on the 4 grid (48 to 480): the full and compact layouts'; none, the layout's (160, 96). */
  plot_height?: number;
  /** The sources drawn, bottom of the stack first, with their names and colours; none: every one the Energy dashboard has. */
  sources?: readonly (UsageSource | UsageKind)[];
  /** Sources that keep their own name before the rest fold into "Other" (default 6). */
  max_sources?: number;
  /** What went into the battery and out to the grid, below the line (default true). */
  show_returns?: boolean;
  /** The legend under the chart: each series and its total (default true; the full layout's). */
  show_legend?: boolean;
  /** The period before as ghost columns behind the bars (default false); a followed picker's own Compare governs. */
  compare?: boolean;
  /** The tests' clock: "now" for the period. */
  _now?: string;
}

/**
 * What the chart can draw: stacked columns on a scale through zero, several series, the scale beside them. Every style
 * draws one column a slot, its parts flush and only its outer ends rounded (classic's bar is one series' gradient, so
 * classic is the engine's columns here, and `columns` — the same look — is not offered: a config that names it draws
 * classic); soft draws the parts a step lighter.
 */
const CAPS: ChartCaps = {
  bars: true,
  several: true,
  axis: true,
  styles: ['classic', 'soft'],
  keys: ['show_grid', 'show_axis', 'animate'],
};
/** The mini strip: the same columns with no room for a scale or its gridlines. */
const STRIP_CAPS: ChartCaps = { ...CAPS, axis: false, keys: ['animate'] };
const capsIn = (data: Readonly<Record<string, unknown>>): ChartCaps =>
  data['variant'] === 'mini' ? STRIP_CAPS : CAPS;

/** The room over the plot and under its floor (`usagePlot` says the plot's own height). */
const HEADROOM = 12;
const PAD = 8;
/** The ghost of the period before: this much wider than its bar, never wider than its slot less 2. */
const GHOST = 1.8;
/** The room above the chart in the card (its padding, the head and 16 under it): the bubble may rise into it, 4 short. */
const ABOVE = 76;
/** How far the bubble may lean into the card's padding where the content's width does not hold it: 4 short of its edge. */
const LEAN = 16;
/** The bubble's padding (8 · 12), its lines (18), the square and its gap, the gap before a figure. */
const BUBBLE_X = 24;
const BUBBLE_Y = 16;
const LINE = 18;
const SQUARE = 16;
const FIGURE_GAP = 16;

/** What the card draws of its range: its slots, each slot's energy, and the period before's beside them. */
interface Drawn {
  readonly grain: Grain;
  readonly slots: readonly number[];
  readonly energy: readonly SlotEnergy[];
  readonly before?: {
    readonly range: Range;
    readonly slots: readonly number[];
    readonly energy: readonly SlotEnergy[];
  };
}

/** Where the plot lies in the chart's width, for the pointer and the keys: its start, a slot's width, the slots. */
interface Plot {
  readonly left: number;
  readonly slot: number;
  readonly count: number;
}

/** A source's kind, among the three an Energy dashboard meters, in the flow's words: the list's add picker. */
const KIND_FIELD: HaFormSchemaItem = {
  name: 'type',
  selector: {
    select: {
      mode: 'dropdown',
      options: USAGE_KINDS.map((value) => ({
        value,
        label: editorWord(`energy-flow.kind_${value}`),
      })),
    },
  },
};

/** A source's editor fields: its kind, its name and colour, and whether it is drawn. */
const SOURCE_FIELDS: HaFormSchemaItem[] = [
  KIND_FIELD,
  fieldRow(textField('name'), seriesColourField('energy-usage.editor_color_helper')),
  boolField('show'),
];

/** Under the mode, what the chosen one draws; under the date picker's key and the period, what they do. */
const usageHelper: FormHelper = (schema, localize, data) =>
  schema.name === 'mode'
    ? u(editorLanguage(), data?.['mode'] === 'flows' ? 'editor_mode_flows' : 'editor_mode_usage')
    : collectionHelper(schema, localize, data);

/**
 * The house's energy over a day, a week, a month or a year as Home Assistant's usage graph draws it: a column a slot
 * (an hour, a day, a month), stacked from the line up by where the house took it from — the sun, the battery, the grid
 * — and down by what it charged and exported, each in its source's colour, from the Energy dashboard's statistics
 * allocated the dashboard's own way. The range's use in the head, each series' total in the legend, a slot's whole
 * stack in the bubble under a finger; the period before as ghost columns behind. Given a date picker's key it draws
 * the picker's range with Home Assistant's own figures.
 */
export class FluvyEnergyUsageCard extends Card<EnergyUsageCardConfig> {
  static override layoutHeight(config: EnergyUsageCardConfig): number {
    return usageHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    energyStyles,
    chartStyles,
    css`
      .eu-card {
        width: 100%;
      }
      .eu-chart {
        position: relative;
        margin-top: 16px;
        outline-offset: 2px;
        border-radius: 4px;
        touch-action: pan-y;
        --eu-other: color-mix(in srgb, var(--fluvy-text) 62%, var(--fluvy-card));
      }
      .eu-chart > svg {
        position: absolute;
        top: 0;
        left: 0;
        display: block;
      }
      /* a column's parts rise from their own foot, what went out falls from the line; what went out a step lighter */
      .eu-chart .fc-bar {
        transform-box: fill-box;
      }
      .eu-chart .fc-bar--hanging {
        transform-origin: 50% 0;
        fill-opacity: 0.6;
      }
      /* soft: every part a step lighter, as the soft style's fills are */
      .eu-chart.is-soft .fc-bar {
        fill: color-mix(in srgb, var(--tone-ink, var(--fluvy-accent)) 72%, var(--fluvy-card));
      }
      /* the period before: one quiet column a slot, behind the bars */
      .eu-ghost {
        fill: color-mix(in srgb, var(--fluvy-text) 9%, transparent);
      }
      :host([dark]) .eu-ghost,
      [data-mode='dark'] .eu-ghost {
        fill: color-mix(in srgb, var(--fluvy-text) 14%, transparent);
      }
      .eu-axis > .fv-axis {
        margin-top: 8px;
      }
      .eu-chart.is-scaled + .eu-axis > .fv-axis {
        color: var(--fluvy-text-secondary);
      }
      .eu-legend {
        margin-top: 16px;
      }
      .eu-legend > .en-legend {
        margin-top: 0;
      }
      /* nothing in the range yet: a quiet line across the plot */
      .eu-nothing {
        position: absolute;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 16px;
        font-size: 13px;
        font-weight: 500;
        line-height: 18px;
        text-align: center;
        text-wrap: balance;
        color: var(--fluvy-text-secondary);
      }
      /* a slot's whole stack: its time and what it used, each series' part, the period before */
      .eu-bubble {
        position: absolute;
        z-index: 2;
        box-sizing: border-box;
        padding: 8px 12px;
        border-radius: 10px;
        background: var(--fluvy-text);
        color: var(--fluvy-page);
        font-size: 12px;
        font-weight: 500;
        line-height: ${LINE}px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        box-shadow: 0 6px 16px -6px rgb(0 0 0 / 0.35);
        pointer-events: none;
      }
      .eu-bubble__line {
        display: flex;
        align-items: center;
        gap: ${FIGURE_GAP}px;
      }
      .eu-bubble__line > span:first-child {
        display: flex;
        flex: 1 1 auto;
        align-items: center;
        gap: 8px;
      }
      .eu-bubble__head {
        font-size: 13px;
        font-weight: 600;
      }
      /* a line whose words and figure do not hold side by side in a narrow card: the figure under its words, at the end */
      .eu-bubble__line.is-stacked {
        flex-direction: column;
        align-items: stretch;
        gap: 0;
      }
      .eu-bubble__line.is-stacked > span:first-child {
        align-items: flex-start;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .eu-bubble__line.is-stacked > span:last-child {
        align-self: flex-end;
      }
      .eu-bubble__line.is-stacked .en-sq {
        margin-top: 5px;
      }
      .eu-bubble .en-sq {
        width: 8px;
        height: 8px;
        flex-basis: 8px;
        border-radius: 2px;
      }
      .eu-bubble .eu-sq--ghost {
        background: color-mix(in srgb, var(--fluvy-page) 45%, transparent);
      }
    `,
  ];

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
  static override keys = configKeys<EnergyUsageCardConfig>()([
    'title',
    'subtitle',
    'variant',
    'mode',
    'plot_height',
    'period',
    'show_period',
    'collection_key',
    'sources',
    'max_sources',
    'show_returns',
    'show_legend',
    'compare',
    'chart',
    'show_grid',
    'show_axis',
    'animate',
    'unit',
    'decimals',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'sources',
      title: 'energy-usage.editor_sources',
      idKey: 'type',
      picker: KIND_FIELD,
      keys: ['type', 'show', 'name', 'color'],
      schema: SOURCE_FIELDS,
      computeLabel: editorLabels(flow, { type: 'editor_type', show: 'editor_show' }).computeLabel,
    },
  ];
  static override defaults: EditorDefaults = (config) => ({
    variant: 'full',
    mode: 'usage',
    plot_height: usagePlot(config),
    period: 'day',
    show_period: true,
    collection_key: '',
    max_sources: 6,
    show_returns: true,
    show_legend: true,
    compare: false,
    ...chartDefaultsFor(config, CAPS),
    ...NUMBER_DEFAULTS,
  });
  /** The date pickers on the dashboard, for the key. */
  static override choices: EditorChoices = (_config, hass) => ({
    collection_key: collectionChoices(hass),
  });
  static override getConfigForm(): LovelaceConfigForm {
    const language = editorLanguage();
    const full = (data: Readonly<Record<string, unknown>>): boolean =>
      (data['variant'] ?? 'full') === 'full';
    const own = (data: Readonly<Record<string, unknown>>): boolean => !following(data);
    const period: HaFormSchemaItem = {
      name: 'period',
      selector: {
        select: {
          mode: 'dropdown',
          options: PERIODS.map((value) => ({
            value,
            label:
              value === 'year' ? periodCard(language, 'chip_year') : editorWord(`option.${value}`),
          })),
        },
      },
    };
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), selectField('variant', VARIANTS)),
        showIconField(),
        // what the columns stand for, and the plot's height where the layout has a scale
        fieldRow(
          selectField('mode', MODES),
          onlyWhen((data) => data['variant'] !== 'mini', numberField('plot_height', 48, 480, 4)),
        ),
        period,
        // a date picker to follow; the chips and the period before while none is followed
        fieldRow(
          collectionField(),
          onlyWhen((data) => own(data) && full(data), boolField('show_period')),
        ),
        fieldRow(boolField('show_returns'), onlyWhen(full, boolField('show_legend'))),
        fieldRow(onlyWhen(own, boolField('compare')), numberField('max_sources', 2, 6)),
        chartSection([CAPS, STRIP_CAPS], capsIn),
        ...colourFields(),
        numberFields({ units: ['Wh', 'kWh', 'MWh'] }),
        actionFields(),
      ],
      ...editorLabels(
        u,
        {
          mode: 'editor_mode',
          plot_height: 'editor_plot_height',
          max_sources: 'editor_max_sources',
          show_returns: 'editor_show_returns',
          show_legend: 'editor_show_legend',
          show_period: 'editor_show_period',
          compare: 'editor_compare',
        },
        {
          period: 'energy-sankey.editor_period',
          ...COLLECTION_LABEL,
        },
      ),
      computeHelper: usageHelper,
    };
  }

  protected override prepare(config: EnergyUsageCardConfig): EnergyUsageCardConfig {
    collectionKeyOf(config, 'fluvy-energy-usage-card');
    return config;
  }

  static getStubConfig(): EnergyUsageCardConfig {
    // the Energy dashboard's own sources, today
    return { type: 'custom:fluvy-energy-usage-card' };
  }

  private readonly head = new HeadFit(this);
  private readonly follower = new CollectionFollower(this);
  /** Reading the chart: the pointer's place snapped to a slot's middle, or the keys walking the slots. */
  private readonly scrubber = new ScrubController(this, (fraction) => this.slotMiddle(fraction));
  private ticker: number | undefined;
  private prefs: EnergyPrefs | null | undefined;
  private prefsAsked = false;
  private chosen: Period | undefined;
  /** What is drawn: undefined while it loads, null where the statistics cannot be read. */
  private drawn: Drawn | null | undefined;
  private dataKey = '';
  /** The picker's answer the chart was last drawn from. */
  private followed: EnergyDataLike | undefined;
  private plot: Plot = { left: 0, slot: 1, count: 0 };

  override getCardSize(): number {
    return Math.ceil(usageHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- configuration ---------- */

  private get variant(): UsageVariant {
    const own = this.config?.variant;
    return own && VARIANTS.includes(own) ? own : 'full';
  }

  private period(): Period {
    const own = this.config?.period;
    return this.chosen ?? (own && PERIODS.includes(own) ? own : 'day');
  }

  /** The house's sources with meters: a followed picker's preferences once they are there, else the house's own. */
  private sources(): PrefSource[] {
    const prefs = this.follower.data()?.prefs ?? this.prefs;
    return readPrefs(prefs).sources.filter((p) => p.energyIn.length || p.energyOut.length);
  }

  protected override watched(): readonly string[] {
    return this.sources()
      .flatMap((p) => [...p.energyIn, ...p.energyOut])
      .filter(isEntityId);
  }

  /* ---------- lifecycle ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    // the range's figures are asked for again when their five minutes run out
    this.ticker = window.setInterval(() => {
      if (this.config) this.requestUpdate();
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
    if (!this.prefsAsked) {
      this.prefsAsked = true;
      void fetchPrefs(this.hass).then((prefs) => {
        this.prefs = prefs;
        this.requestUpdate();
      });
    }
    this.askData();
  }

  private now(): Date {
    const pinned = this.config?._now ? Date.parse(this.config._now) : NaN;
    return new Date(Number.isFinite(pinned) ? pinned : Date.now());
  }

  /** Whether the period before is drawn: the card's own `compare`, or a followed picker's. */
  private comparing(): boolean {
    return this.follower.range()
      ? Boolean(this.follower.range()?.compare)
      : this.config?.compare === true;
  }

  /** A range drawn in its slots, with the period before's where it is given. */
  private drawnOf(
    range: Range,
    buckets: Parameters<typeof slotEnergy>[0],
    before?: { readonly range: Range; readonly buckets: Parameters<typeof slotEnergy>[0] },
    step?: 'hour' | 'day' | 'month',
  ): Drawn {
    const now = this.now();
    const grain = step ?? stepFor(range, now);
    const slots = slotsOf(this.hass, range, grain, now);
    const end = (range.end ?? now).getTime();
    const beforeSlots = before ? slotsOf(this.hass, before.range, grain, now) : [];
    return {
      grain,
      slots,
      energy: slotEnergy(buckets, slots, end),
      ...(before
        ? {
            before: {
              range: before.range,
              slots: beforeSlots,
              energy: slotEnergy(before.buckets, beforeSlots, (before.range.end ?? now).getTime()),
            },
          }
        : {}),
    };
  }

  /**
   * The figures: a followed picker's (Home Assistant's statistics for its range, and the period before's where it
   * compares), once per answer; else the card's own period and, asked for, the one before it, fetched again every five
   * minutes.
   */
  private askData(): void {
    const hass = this.hass;
    if (!hass) return;
    const followed = this.follower.range();
    if (followed) {
      const data = this.follower.data();
      if (!data || data === this.followed) return;
      this.followed = data;
      const sources = this.sources();
      const before =
        followed.compare && data.statsCompare && data.startCompare
          ? {
              range: { start: data.startCompare, end: data.endCompare },
              buckets: allocatePeriod(data.statsCompare, sources).buckets,
            }
          : undefined;
      this.drawn = this.drawnOf(
        { start: data.start, end: data.end },
        allocatePeriod(data.stats, sources).buckets,
        before,
      );
      return;
    }
    if (this.prefs === undefined) return;
    const sources = this.sources();
    if (!sources.length) return;
    const now = this.now();
    const span = presetSpan(hass, GRAIN_PRESET[this.period()], now);
    const before = this.config?.compare === true ? shiftSpan(hass, span, -1) : undefined;
    const key = `${this.period()}|${span.start.getTime()}|${before ? 1 : 0}|${Math.floor(now.getTime() / 300_000)}`;
    if (key === this.dataKey) return;
    this.dataKey = key;
    void Promise.all([
      fetchRange(hass, sources, span, [], STEP[this.period()]),
      before ? fetchRange(hass, sources, before, [], STEP[this.period()]) : undefined,
    ]).then(([data, earlier]) => {
      if (this.dataKey !== key) return;
      this.drawn = data
        ? this.drawnOf(
            span,
            data.buckets,
            before && earlier ? { range: before, buckets: earlier.buckets } : undefined,
            STEP[this.period()],
          )
        : null;
      this.requestUpdate();
    });
  }

  /* ---------- the series ---------- */

  /** The series of a range's slots, as the card's sources, mode and returns ask. */
  private series(energy: readonly SlotEnergy[]): UsageSeries[] {
    const sources = this.sources();
    const kinds = (side: 'energyIn' | 'energyOut'): Set<SourceKind> =>
      new Set(sources.filter((p) => p[side].length).map((p) => p.kind));
    return usageSeries(energy, {
      ins: kinds('energyIn'),
      outs: kinds('energyOut'),
      sources: this.config?.sources,
      max: this.config?.max_sources,
      returns: this.config?.show_returns,
      mode: this.config?.mode,
    });
  }

  /**
   * A series' name: the one it was given, its kind's (by what its meter measured in the `flows` mode: "Solar
   * production"), "Other", or what went out.
   */
  private nameOf(series: UsageSeries): string {
    if (series.name) return series.name;
    const key: SeriesKey = series.key;
    if (key === 'other') return u(this.hass, 'other');
    if (key === 'charged' || key === 'exported') return localize(this.hass, `energy.${key}`);
    return this.config?.mode === 'flows'
      ? u(this.hass, `flows_${key}`)
      : flow(this.hass, `kind_${key}`);
  }

  /** How a series is painted (`Paint`). */
  private paintOf(series: UsageSeries): Paint {
    const accent = series.color ? this.accents.item(series.color) : undefined;
    if (accent) return { ink: 'accent', colour: 'accent', accent };
    if (series.color && isPaletteRef(series.color)) {
      const own = refInk(series.color);
      return { ink: '', colour: own as SeriesColour, own };
    }
    if (!series.kind) return { ink: 'home', colour: 'var(--eu-other)' };
    return { ink: series.kind, colour: `var(--fluvy-state-energy-${series.kind})` };
  }

  /* ---------- the words of a slot ---------- */

  private format(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const zone = houseZone(this.hass);
    return dateFormat(this.hass?.language ?? 'en', {
      ...options,
      ...(zone ? { timeZone: zone } : {}),
    });
  }

  /** A slot as the bubble says it: its hour ("10:00 – 11:00"), its day ("Mon 14 Sep"), its month ("September 2026"). */
  private slotWords(
    drawn: { readonly slots: readonly number[] },
    grain: Grain,
    index: number,
  ): string {
    const start = drawn.slots[index] ?? 0;
    if (grain === 'hour') {
      const clock = this.format({ hour: '2-digit', minute: '2-digit', hour12: clock12(this.hass) });
      return `${clock.format(start)} – ${clock.format(start + 3_600_000)}`;
    }
    return this.format(
      grain === 'day'
        ? { weekday: 'short', day: 'numeric', month: 'short' }
        : { month: 'long', year: 'numeric' },
    ).format(start);
  }

  /** A mark of a day's axis: the hour, "06:00" (a 12-hour clock's "6 AM"). */
  private hourMark(hour: number): string {
    if (!clock12(this.hass)) return `${String(hour).padStart(2, '0')}:00`;
    return dateFormat(this.hass?.language ?? 'en', {
      hour: 'numeric',
      hour12: true,
      timeZone: 'UTC',
    }).format(Date.UTC(2026, 0, 1, hour % 24));
  }

  /**
   * The axis under the plot, on the plot's width: a day's hours at 0 · 6 · 12 · 18 · 24 (0 · 12 · 24, or its ends,
   * where they do not stand apart); else a label centred under each column, the days of a week by name, the rest by
   * number, the months by name — every n-th from the first where they would crowd, kept inside the plot; never fewer
   * than two: the first and the middle (Jan · Jul) at the most, else the ends (Jan · Dec, J · D), as a day keeps its.
   */
  private axisMarks(drawn: Drawn, width: number): ReadonlyArray<readonly [number, string]> {
    const { slots, grain } = drawn;
    const count = slots.length;
    if (!count) return [];
    if (grain === 'hour') {
      const zone = houseZone(this.hass);
      const at = (hour: number): number => {
        if (hour === 24) return 1;
        const index = slots.findIndex((t) => wallClock(new Date(t), zone).hour === hour);
        return index < 0 ? hour / 24 : index / count;
      };
      const five = [0, 6, 12, 18, 24].map((h) => [at(h), this.hourMark(h)] as const);
      const three = [five[0], five[2], five[4]] as (readonly [number, string])[];
      return (
        [five, three].find((marks) => axisHolds(this.head.ruler, width, marks)) ?? [
          three[0] as readonly [number, string],
          three[2] as readonly [number, string],
        ]
      );
    }
    const words = (options: Intl.DateTimeFormatOptions): string[] =>
      slots.map((t) => this.format(options).format(t));
    const slot = width / count;
    const widths = (texts: readonly string[]): number[] =>
      texts.map((text) => this.head.ruler.width('fv-axis', text));
    // a week's days by name where each holds its column, else by their initial; any other run of days by number
    const named = grain === 'month' ? { month: 'short' as const } : { weekday: 'short' as const };
    let texts = grain === 'day' && count > 7 ? words({ day: 'numeric' }) : words(named);
    if (count <= 7 && grain === 'day' && Math.max(...widths(texts)) + 12 > slot)
      texts = words({ weekday: 'narrow' });
    // each label centred under its column, kept inside the plot
    const centred = (words: readonly string[]): (Placed & { readonly text: string })[] =>
      widths(words).map((size, i) => ({
        text: words[i] ?? '',
        x: Math.min(width - size / 2, Math.max(size / 2, (i + 0.5) * slot)),
        width: size,
      }));
    const labels = centred(texts);
    const every = (step: number) => labels.filter((_label, i) => i % step === 0);
    const middle = Math.ceil(count / 2);
    let step = thinStep(Math.max(...labels.map((label) => label.width)), slot);
    while (step <= middle && !labelsApart(every(step))) step++;
    // never fewer than two: where not even the first and the middle stand apart, the ends — the months by their
    // initials where their names would crowd even there, as a week's days take theirs
    const ends = (all: typeof labels) => all.filter((_label, i) => i === 0 || i === count - 1);
    const kept =
      step <= middle
        ? every(step)
        : grain === 'month' && !labelsApart(ends(labels))
          ? ends(centred(words({ month: 'narrow' })))
          : ends(labels);
    return kept.map((label) => [label.x / width, label.text] as const);
  }

  /* ---------- reading ---------- */

  /** The slot a pointer at `fraction` of the chart's width is over, as the middle of that slot. */
  private slotMiddle(fraction: number): number {
    const { left, slot, count } = this.plot;
    const width = this.contentWidth;
    if (!count || !(width > 0)) return fraction;
    const index = Math.max(0, Math.min(count - 1, Math.floor((fraction * width - left) / slot)));
    return (left + (index + 0.5) * slot) / width;
  }

  /** The slot read, or null at rest. */
  private readSlot(): number | null {
    const value = this.scrubber.value;
    const { left, slot, count } = this.plot;
    if (value === null || !count) return null;
    return Math.max(0, Math.min(count - 1, Math.floor((value * this.contentWidth - left) / slot)));
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (this.plot.count) this.scrubber.key(event, this.plot.slot / Math.max(1, this.contentWidth));
  };

  /* ---------- render ---------- */

  /** The chart's frame: its plot and the 20 of room round it. */
  private frameHeight(): number {
    return HEADROOM + usagePlot(this.config ?? { type: '' }) + PAD;
  }

  protected renderCard(): TemplateResult {
    const w = this.contentWidth;
    const variant = this.variant;
    const followed = this.follower.range();
    const now = this.now();
    const sources = this.sources();
    // the preferences the card reads (a followed picker's, else the house's) are on their way, or name a meter
    const configured =
      (this.follower.data()?.prefs ?? this.prefs) === undefined || sources.length > 0;
    const drawn = configured ? this.drawn : undefined;
    const series = drawn ? this.series(drawn.energy) : [];
    // what the columns above the line add up to: the sources drawn, in the card's mode
    const used = drawnTotal(series);
    // one unit for the range's totals (the head's and the legend's), one for the slots (the scale and the bubble)
    const totals = figuresOf(
      this.hass,
      this.config,
      'Wh',
      Math.max(used, ...series.map((s) => s.total)) * 1000,
    );
    const own = this.config?.subtitle ?? this.outage(sources);
    const range = followed ?? presetSpan(this.hass, GRAIN_PRESET[this.period()], now);
    const sub = own ?? rangeWords(this.hass, range, now);
    const fit = (title: string) =>
      this.head.fit({
        width: w,
        title,
        sub,
        badge:
          drawn && used > 0
            ? {
                text: `${writeFigure(this.hass, used * 1000, totals)} ${totals.unit}`,
                tone: toneOf(this.config, 'accent'),
              }
            : null,
      });
    let titleWord = this.config?.title ?? u(this.hass, 'title');
    let fitted = fit(titleWord);
    // the card's own title where it holds whole, else its short one ("Consommation d’énergie" in half a section); a
    // typed title is the person's
    if (this.config?.title === undefined && fitted.cut) {
      titleWord = u(this.hass, 'title_short');
      fitted = fit(titleWord);
    }
    const chips =
      variant === 'full' && this.config?.show_period !== false && !this.follower.following;
    return html`<article class="fv-card en-card eu-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'chart') : null,
        small: fitted.small,
        tone: toneOf(this.config, 'accent'),
        title: titleWord,
        sub: fitted.sub,
        trailing: fitted.badge,
        name: Boolean(this.config?.title),
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${
        chips
          ? html`<div class="en-period">
              ${chipRow(
                PERIODS.map((p) => ({
                  key: p,
                  label:
                    p === 'year'
                      ? periodCard(this.hass, 'chip_year')
                      : flow(this.hass, `chip_${p}`),
                  active: p === this.period(),
                  tone: toneOf(this.config, 'accent'),
                })),
                (key) => {
                  this.chosen = key as Period;
                  this.scrubber.set(null);
                  this.requestUpdate();
                },
                'full',
                { ruler: this.head.ruler, width: w },
              )}
            </div>`
          : nothing
      }
      ${this.renderBody(configured, drawn, series, totals)}
    </article>`;
  }

  /** The body under the head (and the chips): the chart, its axis and its legend, or what stands in their place. */
  private renderBody(
    configured: boolean,
    drawn: Drawn | null | undefined,
    series: readonly UsageSeries[],
    totals: Figures,
  ): TemplateResult {
    const variant = this.variant;
    const height = this.frameHeight();
    const legendRoom = this.legendRoom();
    if (!configured)
      return this.panel(flow(this.hass, 'no_period'), flow(this.hass, 'no_period_hint'));
    if (drawn === null)
      return this.panel(
        sankey(this.hass, 'no_statistics'),
        sankey(this.hass, 'no_statistics_hint'),
      );
    if (drawn === undefined)
      return html`<div class="eu-chart" style="height:${height}px">
          <div class="fv-skeleton" style="height:${height}px"></div>
        </div>
        ${variant === 'mini' ? nothing : html`<div class="eu-axis">${axis([])}</div>`}
        ${legendRoom ? html`<div class="eu-legend" style="min-height:${legendRoom - 16}px"></div>` : nothing}`;
    return this.renderChart(drawn, series, totals, legendRoom);
  }

  /** The legend's room: 16 over its rows, as the card declares it (what the house lacks of it stays empty). */
  private legendRoom(): number {
    if (this.variant !== 'full' || this.config?.show_legend === false) return 0;
    const declared = usageHeight({ ...(this.config ?? { type: '' }), show_period: false });
    return declared - (100 + this.frameHeight() + 24);
  }

  /**
   * What stands in the chart's place where there is nothing to draw (no Energy dashboard, statistics that cannot be
   * read): the energy family's panel, or in the mini strip its words alone, at the strip's height.
   */
  private panel(text: string, hint: string): TemplateResult {
    const w = this.contentWidth;
    if (this.variant !== 'mini') return this.head.empty('bolt', text, hint, w);
    return html`<div class="eu-chart" style="height:${this.frameHeight()}px">
      <div class="eu-nothing" style="top:0;bottom:0">${this.head.emptyText(text, w)}</div>
    </div>`;
  }

  private renderChart(
    drawn: Drawn,
    series: readonly UsageSeries[],
    totals: Figures,
    legendRoom: number,
  ): TemplateResult {
    const w = this.contentWidth;
    const variant = this.variant;
    const height = this.frameHeight();
    const box: PlotBox = { top: HEADROOM, bottom: height - PAD };
    const count = drawn.slots.length;
    const before = this.comparing() ? drawn.before : undefined;
    // the period before drawn as this range is: the same sources, in the same mode
    const past = before ? this.series(before.energy) : undefined;
    const ghostUp = past ? drawn.slots.map((_t, i) => riseOf(past, i)) : [];
    const ghostDown = past ? drawn.slots.map((_t, i) => fallOf(past, i)) : [];
    // what the columns reach, the ghosts with them: the tallest rise and the deepest fall
    const rise = Math.max(0, ...ghostUp, ...drawn.slots.map((_t, i) => riseOf(series, i)));
    const fall = Math.max(0, ...ghostDown, ...drawn.slots.map((_t, i) => fallOf(series, i)));
    // the slots' unit: the larger of the two's
    const figures = figuresOf(this.hass, this.config, 'Wh', Math.max(rise, fall) * 1000);
    const shown = (kWh: number): number => (kWh * 1000) / figures.divisor;
    const caps = capsIn(this.config ?? {});
    const chosen = styleOf(this.config, caps);
    // drawn as the engine's columns whatever the style's name (classic's bar is one series' gradient): one column a
    // slot, its parts flush, rounded only at its outermost end on each side of the line whatever the house says of a
    // bar's ends; the strip has no gridlines but the zero line
    const resolved = resolveStyle('columns', chartKeysOf(this.config), {
      ...caps,
      styles: ['columns'],
    });
    const style: ResolvedStyle = {
      ...resolved,
      caps: 'top',
      ...(variant === 'mini' ? { grid: { ...resolved.grid, axes: 'none' as const } } : {}),
    };
    const paints = series.map((s) => this.paintOf(s));
    const chartSeries: ChartSeries[] = series.map((s, i) => ({
      values: s.values.map(shown),
      colour: paints[i]?.colour as SeriesColour,
      ...(paints[i]?.accent ? { accent: paints[i]?.accent } : {}),
    }));
    const hovered = this.readSlot();
    const base: ChartSpec = {
      frame: { width: w, height, headroom: HEADROOM, pad: PAD },
      series: chartSeries,
      style,
      kind: 'bars',
      zero: true,
      ticks: usageTicks(-shown(fall), shown(rise)),
      cursor: hovered === null || !count ? null : (hovered + 0.5) / count,
      tick: (value, decimals) => tickText(this.hass, value, decimals),
      measure: (text) => this.head.ruler.width('ax-tick', text),
      id: 'eu',
    };
    // the scale's column: its ticks, 8 to the plot, and the unit rotated beyond them
    const first = plotOf(base);
    const scaled = first.left > 0;
    const spec: ChartSpec = scaled
      ? { ...base, frame: { ...base.frame, left: first.left + UNIT_COLUMN } }
      : base;
    const plot = plotOf(spec);
    const ticks = plot.ticks as Ticks | null;
    const slotWidth = count ? plot.width / count : plot.width;
    this.plot = { left: plot.left, slot: slotWidth, count };
    const nothingYet = series.every((s) => s.total === 0);
    const reading =
      hovered === null ? null : this.bubble(drawn, series, paints, hovered, figures, ghostUp);
    const at = (v: number): number => (ticks ? yOf(v, ticks, box) : box.bottom);
    const ghosts =
      before && ticks
        ? this.ghosts(plot.left, plot.width, count, ghostUp.map(shown), ghostDown.map(shown), at)
        : nothing;
    const label =
      reading?.label ??
      `${this.config?.title ?? u(this.hass, 'title')}: ${writeFigure(this.hass, drawnTotal(series) * 1000, totals)} ${totals.unit}`;
    return html`<div
        class="eu-chart fv-tone--${toneOf(this.config, 'accent')} ${scaled ? 'is-scaled' : ''} ${chosen.preset === 'soft' ? 'is-soft' : ''} ${style.animate ? '' : 'is-still'}"
        style="height:${height}px"
        role="img"
        tabindex="0"
        aria-label=${label}
        @keydown=${this.onKey}
        ${scrub(this.scrubber)}
      >
        <svg width=${w} height=${height} viewBox="0 0 ${w} ${height}" aria-hidden="true">
          ${ghosts}${scaled ? unitLabel(figures.unit, box.top, box.bottom) : nothing}
        </svg>
        ${drawChart(spec)}
        ${
          nothingYet
            ? html`<div
                class="eu-nothing"
                style="top:${box.top}px;height:${box.bottom - box.top}px;left:${plot.left}px"
              >
                ${sankey(this.hass, 'nothing_yet')}
              </div>`
            : nothing
        }
        ${reading?.template ?? nothing}
      </div>
      ${
        variant === 'mini'
          ? nothing
          : html`<div class="eu-axis" style="padding-left:${plot.left}px">
              ${axis(this.axisMarks(drawn, plot.width))}
            </div>`
      }
      ${
        legendRoom
          ? html`<div class="eu-legend" style="min-height:${legendRoom - 16}px">
              ${energyLegend(this.legend(series, paints, totals), w, this.head.ruler)}
            </div>`
          : nothing
      }`;
  }

  /**
   * The period before: one quiet column a slot, what its columns rose to up and what went out down, behind the bars,
   * rounded at its outer ends as the columns are.
   */
  private ghosts(
    left: number,
    width: number,
    count: number,
    up: readonly number[],
    down: readonly number[],
    at: (value: number) => number,
  ): TemplateResult {
    const { slot, bar } = barGeometry(count, width);
    const ghost = Math.max(2, Math.min(slot - 2, Math.round(bar * GHOST)));
    const radius = Math.min(4, ghost / 2);
    const zero = at(0);
    return svg`${up.map((value, i) => {
      const x = left + i * slot + (slot - ghost) / 2;
      const rise = value > 0 ? zero - at(value) : 0;
      const fall = (down[i] ?? 0) > 0 ? at(-(down[i] ?? 0)) - zero : 0;
      return svg`${rise >= 1 ? svg`<path class="eu-ghost" d=${barPath(x, zero - rise, ghost, rise, radius, 'top')}></path>` : nothing}${
        fall >= 1
          ? svg`<path class="eu-ghost" d=${barPath(x, zero, ghost, fall, radius, 'bottom')}></path>`
          : nothing
      }`;
    })}`;
  }

  /**
   * The bubble of the slot read: its time and what its columns rose to, each series' part (the top of the stack
   * first, then what went out from the line down), and the same slot of the period before — beside the cursor where it
   * holds, kept inside the card. Each line holds its words and its figure side by side; in a card too narrow for that
   * the parts' figures go bare, their unit said once by the slot's total (as the scale says it beside its ticks), and a
   * line that still does not hold puts its figure under its words.
   */
  private bubble(
    drawn: Drawn,
    series: readonly UsageSeries[],
    paints: readonly Paint[],
    index: number,
    figures: Figures,
    earlierRise: readonly number[],
  ): { readonly template: TemplateResult; readonly label: string } {
    const bare = (kWh: number): string => writeFigure(this.hass, Math.abs(kWh) * 1000, figures);
    const value = (kWh: number): string => `${bare(kWh)} ${figures.unit}`;
    const heading = this.slotWords(drawn, drawn.grain, index);
    const used = value(riseOf(series, index));
    const parts = series.map((s, i) => [s, s.values[index] ?? 0, i] as const);
    const rows = [
      ...parts.filter(([, v]) => v > 0).reverse(),
      ...parts.filter(([, v]) => v < 0),
    ].map(([s, v, i]) => ({
      name: this.nameOf(s),
      kWh: v,
      paint: paints[i],
      out: isReturn(s),
    }));
    const before = this.comparing() ? drawn.before : undefined;
    const earlier =
      before && index < before.slots.length
        ? {
            name:
              drawn.grain === 'hour'
                ? rangeWords(this.hass, before.range, this.now())
                : this.slotWords(before, drawn.grain, index),
            kWh: earlierRise[index] ?? 0,
          }
        : undefined;
    // the room the card gives it: the content's width and up to 16 of its padding each side
    const w = this.contentWidth;
    const room = w + 2 * LEAN - BUBBLE_X;
    const ruler = this.head.ruler;
    // a line side by side where it holds the room, else its figure under its words (which wrap where alone they do not)
    const lay = (face: string, lead: number, words: string, figure: string) => {
      const measure = (text: string): number => ruler.width(face, text);
      const name = lead + measure(words);
      const side = name + FIGURE_GAP + measure(figure);
      return side <= room
        ? { figure, width: side, lines: 1, stacked: false }
        : {
            figure,
            width: Math.min(room, Math.max(name, measure(figure))),
            lines: linesNeeded(words, room - lead, measure) + 1,
            stacked: true,
          };
    };
    const laidOut = (figure: (kWh: number) => string) => {
      const lines = [
        lay('eu-bubble eu-bubble__head', 0, heading, used),
        ...rows.map((row) => lay('eu-bubble', SQUARE, row.name, figure(row.kWh))),
        ...(earlier ? [lay('eu-bubble', SQUARE, earlier.name, figure(earlier.kWh))] : []),
      ];
      return { lines, count: lines.reduce((sum, line) => sum + line.lines, 0) };
    };
    const whole = laidOut(value);
    const laid = whole.lines.slice(1).some((line) => line.stacked) ? laidOut(bare) : whole;
    const [first, ...lines] = laid.lines;
    const width = Math.ceil(BUBBLE_X + Math.max(...laid.lines.map((line) => line.width)));
    const height = BUBBLE_Y + LINE * laid.count;
    const x = this.plot.left + (index + 0.5) * this.plot.slot;
    const right = x + 12;
    const beside = right + width <= w ? right : x - 12 - width;
    // inside the content's width where it holds the bubble, else into the padding by what it lacks
    const lean = Math.min(LEAN, Math.max(0, width - w));
    const left = Math.min(w + lean - width, Math.max(-lean, beside));
    const top = Math.max(-ABOVE, Math.min(0, this.frameHeight() - height));
    const line = (
      laidLine: { readonly figure: string; readonly stacked: boolean } | undefined,
      words: unknown,
      head = false,
    ): TemplateResult =>
      html`<div
        class="eu-bubble__line ${head ? 'eu-bubble__head' : ''} ${laidLine?.stacked ? 'is-stacked' : ''}"
      >
        <span>${words}</span><span>${laidLine?.figure}</span>
      </div>`;
    const template = html`<div
      class="eu-bubble"
      data-measure="value"
      style="left:${left}px;top:${top}px;width:${width}px"
    >
      ${line(first, heading, true)}
      ${rows.map((row, i) =>
        line(
          lines[i],
          html`<i
              class="en-sq ${inkOf(row.paint)} ${row.out ? 'is-out' : ''}"
              data-accent=${row.paint?.accent ?? nothing}
              style=${row.paint?.own ? `--ink:${row.paint.own}` : nothing}
            ></i
            >${row.name}`,
        ),
      )}
      ${
        earlier
          ? line(lines[rows.length], html`<i class="en-sq eu-sq--ghost"></i>${earlier.name}`)
          : nothing
      }
    </div>`;
    const label = [
      `${heading}: ${used}`,
      ...rows.map((row) => `${row.name} ${value(row.kWh)}`),
      ...(earlier ? [`${earlier.name} ${value(earlier.kWh)}`] : []),
    ].join(', ');
    return { template, label };
  }

  /** The legend: each series in its ink with its total over the range, what went out in its square at 60 %. */
  private legend(
    series: readonly UsageSeries[],
    paints: readonly Paint[],
    totals: Figures,
  ): LegendEntry[] {
    return series.map((s, i) => ({
      ink: inkOf(paints[i]),
      accent: paints[i]?.accent,
      ...(paints[i]?.own ? { paint: paints[i]?.own } : {}),
      name: this.nameOf(s),
      value: writeFigure(this.hass, s.total * 1000, totals),
      unit: totals.unit,
      ...(isReturn(s) ? { square: 'out' as const } : {}),
    }));
  }

  /** A meter that cannot be read now: the head says so. */
  private outage(sources: readonly PrefSource[]): string | undefined {
    return meterOutage(
      this.hass,
      sources.flatMap((p) =>
        [...p.energyIn, ...p.energyOut].map((id) => ({
          id,
          name: p.name ?? flow(this.hass, `kind_${p.kind}`),
        })),
      ),
    );
  }
}
