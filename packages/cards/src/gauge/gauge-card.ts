import {
  chartDefaults,
  fetchHistory,
  formatNumber,
  isUsable,
  strings as words,
  type EntityView,
  type FluvyCardConfig,
  type GaugePreset,
  type HomeAssistant,
  type LovelaceGridOptions,
  type MessageKey,
  type Series,
} from '@fluvy/core';

import { dialLabelTop, head, readout, rulerLabels, sheetStyles, type Tone } from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  svg,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { HeadFit } from '../energy/head.js';
import { ChartLoader } from '../shared/chart-load.js';

import { Card, type CardEditor } from '../shared/base.js';

import { iconOf, stateWord } from '../shared/domain.js';
import type { TextRuler } from '../shared/fit.js';
import { statsRow, statsSize, type StatsRow, type StatText } from '../shared/readouts.js';
import { Refresher } from '../shared/refresh.js';

import {
  baseOf,
  ceilingFor,
  figure,
  figuresOf,
  scaleFor,
  scaleNamed,
  toBase,
  writeFigure,
  type Figures,
  type NumberKeys,
} from '../shared/units.js';
import type { Reading } from '../shared/value-row.js';
import {
  fractionOf,
  labelRoom,
  signedGeometry,
  valueBox,
  valueRoom,
  type ValueSize,
} from './signed.js';
import { toneOf } from '../shared/colour.js';

const strings = words('gauge');
const ways = words('energy-flow');

export type GaugeVariant = 'ring' | 'bar' | 'signed';
export const GAUGE_VARIANTS: readonly GaugeVariant[] = ['ring', 'bar', 'signed'];

/** A figure of the window's row. */
export type GaugeStat = 'min' | 'max' | 'average';
export const GAUGE_STATS: readonly GaugeStat[] = ['min', 'max', 'average'];

export interface GaugeCardConfig extends FluvyCardConfig, NumberKeys {
  subtitle?: string;
  /**
   * `ring` (default): the dial. `bar`: the reading over a level bar, for a half column. `signed`: a value that can
   * be negative (a grid meter) on a ring with zero at the top, lit from zero to the value; a power meter says its
   * direction in the unit ("1.8 kW out").
   */
  variant?: GaugeVariant;
  /** Bottom of the ring, in the sensor's unit (signed: the left end, `-max` by default). */
  min?: number;
  /** Top of the ring, in the sensor's unit. Without it: the entity's `max` attribute, `max_entity`, or the window's peak rounded up. */
  max?: number;
  /** An entity that carries the ceiling (an inverter's rated power, a tank's capacity), in any unit of the same family. */
  max_entity?: string;
  /** The word in the open centre of the ring. Defaults to the device class ("Power"). */
  label?: string;
  /** Window the Min / Max / Average row summarises. */
  hours?: number;
  /** The Min / Max / Average row under the gauge (default true). */
  show_stats?: boolean;
  /** The row's figures, in their order (default all three); none listed: no row. */
  stats?: readonly GaugeStat[];
  /** Head badge. Defaults to "Producing" / "Idle", read from the value. */
  badge?: string;
  /**
   * The ring's style: its ticks (1.10's), the thermostat's dial read, a ring with its knob, or a gauge that moves with
   * what the sensor reads (a liquid, the sky, a tank, a battery, a pulse, the air, the sun); none: the house's.
   */
  gauge?: GaugePreset;
  /** Whether a moving gauge moves; none: the house's (still, it rests on its first frame). */
  animate?: boolean;
}

/**
 * The style a config's ring wants: its own, else the house's — any but the ruler, which has no room there; a moving
 * one is drawn where it reads the sensor (the engine's `resolveGauge`), else the ticks.
 */
export const dialOf = (config: Readonly<Record<string, unknown>> | undefined): GaugePreset => {
  const wanted = (config?.['gauge'] as GaugePreset | undefined) ?? chartDefaults().settings.gauge;
  return wanted === 'ruler' ? 'ticks' : wanted;
};

/** The sheet's ring: R 96 with 12 px ticks needs a 240 box, which a 300 px card still holds. */
const RADIUS = 96;
const TICK = 12;
/** The history cache in core lives five minutes; asking again sooner would only return the same window. */
/** Below this share of the range the source is resting: the badge says so and the head goes neutral. */
const IDLE = 0.02;

/** A unit of heat: its figures go below zero, whatever range the card is given. */
const COLD = /^°[CF]$/;

/**
 * The unit each sensor was last read in, by its id: a sensor gone from the house says no unit, and its card keeps the
 * layout it had — on this view or another the house opens later.
 */
const unitsSeen = new Map<string, string>();

/**
 * The widest figure the card can write: three figures and a separator where it writes its decimals by the figure's
 * size (`figure`: 0.25 · 3.2 · 142), else `whole` figures at the decimals it fixes; `whole` figures where they are
 * more (a range of 1 000 L); the minus where its figures can go below zero. Tabular figures: every one as wide.
 */
export function widestFigure(
  hass: HomeAssistant | undefined,
  digits: number | undefined,
  whole: number,
  minus: boolean,
): string {
  const decimals = digits ?? (whole > 3 ? 0 : 1);
  const figures = digits === undefined && whole <= 3 ? 2 : whole;
  const shown = formatNumber(hass, Number(`${'8'.repeat(figures)}.${'8'.repeat(decimals)}`), {
    digits: decimals,
    minDigits: decimals,
  });
  return minus ? `−${shown}` : shown;
}

/**
 * The window's row (min, max, average), laid out by its labels and the widest figure the card can write (`widest`),
 * never by the figures it writes now — they come and go with the sensor and the recorder (out of reach and
 * unrecorded, "—"), and the card keeps one height through them (the owner's rule): one a row in a half card (under
 * 171 of content), else as many columns as hold the labels and that figure (`statsRow`).
 */
const windowRow = (
  ruler: TextRuler,
  width: number,
  labels: readonly string[],
  widest: Reading,
): StatsRow => {
  const stats: StatText[] = labels.map((label) => ({ label, ...widest }));
  return width < 171
    ? { columns: 1, size: statsSize(ruler, width, stats, 1), odd: false }
    : statsRow(ruler, width, stats);
};

const XS = 'fv-readout fv-readout--xs > fv-readout__value';

/** The row's figures a config asks for, in its order, each once: none where `show_stats` is false. */
export const statsOf = (config: Readonly<GaugeCardConfig> | undefined): GaugeStat[] =>
  config?.show_stats === false
    ? []
    : Array.isArray(config?.stats)
      ? config.stats.filter((stat, i, all) => GAUGE_STATS.includes(stat) && all.indexOf(stat) === i)
      : [...GAUGE_STATS];

const STAT_WORD = { min: 'common.min', max: 'common.max', average: 'common.average' } as const;

/**
 * The whole figures a unit no prefix shortens reaches in a house, where the card names no top: daylight (an outdoor
 * sensor's 83,000 lx), the air's pressure (1,013 hPa; 101,325 Pa), the sun on a panel (1,050 W/m²), the air's carbon
 * dioxide and its compounds (5,000 ppm; 12,000 ppb). Any other unit, three.
 */
const REACH: Readonly<Record<string, number>> = {
  lx: 6,
  hPa: 4,
  mbar: 4,
  Pa: 6,
  'W/m²': 4,
  ppm: 4,
  ppb: 5,
};

/** The window's row under the gauge at a 360 column, as measured: one line of readouts and the room above it. */
const STATS_ROW = 60;

/** The widest of the readings a card can write, as a readout of the row draws it. */
const widestOf = (ruler: TextRuler, readings: readonly Reading[]): Reading =>
  readings.reduce((wide, one) =>
    ruler.width(XS, one.value, 'fv-unit', one.unit ?? '') >
    ruler.width(XS, wide.value, 'fv-unit', wide.unit ?? '')
      ? one
      : wide,
  );

type LabelKey =
  'energy' | 'temperature' | 'pressure' | 'speed' | 'illuminance' | 'current' | 'voltage';

const CLASS_LABEL: Record<string, LabelKey> = {
  energy: 'energy',
  temperature: 'temperature',
  pressure: 'pressure',
  atmospheric_pressure: 'pressure',
  speed: 'speed',
  wind_speed: 'speed',
  illuminance: 'illuminance',
  current: 'current',
  voltage: 'voltage',
};

const SHARED_LABEL: Record<string, MessageKey> = {
  power: 'energy.power',
  humidity: 'climate.humidity',
  battery: 'energy.battery',
};

const PRODUCES = new Set(['power', 'energy', 'current']);

/**
 * A numeric sensor as the read-only ring gauge: the tick ring lit to its fraction, the figure in the
 * open centre under an uppercase label, the range under the ring, and Min / Max / Average of the
 * window below — centred in their columns, so the row mirrors the ring above it.
 */
export class FluvyGaugeCard extends Card<GaugeCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: GaugeCardConfig): number {
    const height = config.variant === 'bar' ? 256 : config.variant === 'signed' ? 372 : 384;
    return statsOf(config).length ? height : height - STATS_ROW;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    css`
      /* the signed ring: its size fitted to the column, its lit ticks in the card's tone (the grid's by default) */
      .en-gauge .en-tick.is-lit {
        stroke: var(--tone-ink);
      }
      .en-gauge__zero,
      .en-gauge__label,
      .en-gauge__value {
        left: 0;
        width: 100%;
        text-align: center;
        white-space: nowrap;
      }
      .en-gauge__value--m {
        font-size: 24px;
        line-height: 28px;
      }
      .en-gauge__unit {
        margin-left: 3px;
        font-size: 16px;
        color: var(--fluvy-text-secondary);
      }
      .en-gauge__value--m .en-gauge__unit {
        font-size: 12px;
      }
      .en-gauge__end {
        white-space: nowrap;
      }
      /* a label longer than the ring's opening is a name: it ends in an ellipsis inside it */
      .en-gauge__label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* the ring is placed on a whole pixel (its ticks stay crisp in an odd column) instead of centred on a half */
      .so-gauge {
        justify-content: flex-start;
      }
      fluvy-dial {
        flex: 0 0 auto;
      }
      .so-cols .fv-readout__label {
        white-space: nowrap;
      } /* a label never drops onto its value */
    `,
  ];

  static override properties = { ...Card.properties, series_: { state: true } };

  /** The window in the sensor's own unit: undefined while it loads, null when the recorder has nothing. */
  declare series_: Series | null | undefined;

  private readonly history = new Refresher<Series | null>();
  private readonly head = new HeadFit(this);
  /** The chart engine, for a ring drawn in a style: its ticks are the card's own and wait for nothing. */
  private readonly charts = new ChartLoader(this);

  constructor() {
    super();
    this.series_ = undefined;
  }

  static override editor(): Promise<CardEditor> {
    return import('./gauge-editor.js');
  }

  static getStubConfig(
    hass: { states?: Record<string, { attributes: { device_class?: string } }> } | undefined,
    entities: readonly string[],
  ): GaugeCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    const entity =
      sensors.find((id) => hass?.states?.[id]?.attributes.device_class === 'power') ??
      sensors[0] ??
      entities[0] ??
      '';
    return { type: 'custom:fluvy-gauge-card', entity };
  }

  protected override prepare(config: GaugeCardConfig): GaugeCardConfig {
    if (!config.entity) throw new Error('fluvy-gauge-card: "entity" is required');
    if (typeof config.max === 'number' && config.max <= (config.min ?? 0))
      throw new Error('fluvy-gauge-card: "max" must be greater than "min"');
    if (config.variant === 'signed' && typeof config.min === 'number' && config.min >= 0)
      throw new Error('fluvy-gauge-card: a signed gauge’s "min" is below 0 (or left out: −max)');
    if (config.variant === 'signed' && typeof config.max === 'number' && config.max <= 0)
      throw new Error('fluvy-gauge-card: a signed gauge’s "max" is above 0');
    return config;
  }

  private get bar(): boolean {
    return this.config?.variant === 'bar';
  }

  private get signed(): boolean {
    return this.config?.variant === 'signed';
  }

  override getCardSize(): number {
    return this.bar ? 5 : 8;
  }
  /** The ring takes a section; the bar half of one (in a third its readouts ran into each other). */
  override getGridOptions(): LovelaceGridOptions {
    return this.bar
      ? { columns: 6, rows: 'auto', min_columns: 6 }
      : { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    return [this.config?.entity ?? '', this.config?.max_entity ?? ''].filter(Boolean);
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.loadSeries();
  }

  private get hours(): number {
    const hours = this.config?.hours;
    return typeof hours === 'number' && hours > 0 ? Math.min(168, hours) : 24;
  }

  /** One history read per entity and window (core shares it between cards), asked again once it has gone stale. */
  private loadSeries(): void {
    const hass = this.hass;
    const id = this.config?.entity;
    if (!hass || !id) return;
    const key = `${id}|${this.hours}`;
    const hours = this.hours;
    const previous = this.history.request(
      key,
      () => fetchHistory(hass, id, hours),
      (series) => (this.series_ = series),
    );
    // a refresh keeps the figures on screen until the new ones arrive
    if (previous !== null && previous !== key) this.series_ = undefined;
  }

  /**
   * Top of the ring in the base unit: the config, the entity's own `max`, a companion entity, or the
   * window's peak rounded up. Null while that window is still loading — the ring waits unlit rather
   * than fill against a ceiling that is about to move.
   */
  private ceiling(view: EntityView, min: number, factor: number): number | null {
    const configured = this.config?.max;
    if (typeof configured === 'number' && Number.isFinite(configured)) return configured * factor;
    const own = view.attr<number | null>('max');
    if (typeof own === 'number' && Number.isFinite(own) && own * factor > min) return own * factor;
    const rated = this.config?.max_entity ? baseOf(this.entity(this.config.max_entity)) : null;
    if (rated && rated.value > min) return rated.value;
    if (this.series_ === undefined) return null;
    const peak = Math.max(this.series_?.max ?? -Infinity, view.number ?? -Infinity) * factor;
    return peak > min ? min + ceilingFor(peak - min) : null;
  }

  /**
   * The unit the card lays its figures out in: its sensor's; for a sensor that is not there, the one it was last read
   * in, else a power meter's, what the card is most often for.
   */
  private unitOf(view: EntityView): string {
    if (view.status === 'missing') return unitsSeen.get(view.id) ?? 'W';
    unitsSeen.set(view.id, view.unit);
    return view.unit;
  }

  /**
   * What the card's figures can be, from its config and its sensor's unit alone (`unitOf`), each with the unit it reads
   * in (`widestFigure`): a W, Wh or VA figure in its own and in the larger one a house reads (kW, or the range's where
   * the config gives a larger), each under a thousand; one in the unit the config asks, as many whole figures as the
   * range the config gives — where it gives no top, three, and a house's five in the ladder's own unit, which is never
   * scaled up ("88,888 W"); any other in the sensor's own, alike, a unit whose readings pass a thousand as many as it
   * reaches (`REACH`: "1,013 hPa"). `way` follows the unit (a power meter's direction, its wider word).
   */
  private readings(view: EntityView, minus: boolean, way = ''): Reading[] {
    const config = this.config;
    const base = toBase(1, this.unitOf(view));
    const range = [config?.min, config?.max]
      .filter((v): v is number => typeof v === 'number')
      .map((v) => Math.abs(v * base.value));
    const asked = typeof config?.unit === 'string' && scaleNamed(config.unit, base.unit);
    const scaled = scaleFor(1e3, base.unit).divisor > 1;
    const ladder = scaled && !asked;
    const peaks = ladder ? [1, Math.max(1e3, ...range)] : [Math.max(1, ...range)];
    return peaks.map((peak) => {
      const scale = figuresOf(this.hass, config, base.unit, peak, view);
      const wholes = range.map((v) => String(Math.round(v / scale.divisor)).length);
      const whole = ladder
        ? 3
        : typeof config?.max === 'number'
          ? Math.max(1, ...wholes)
          : Math.max(scaled && scale.divisor < 1e3 ? 5 : (REACH[base.unit] ?? 3), ...wholes);
      return {
        value: widestFigure(this.hass, scale.digits, whole, minus),
        unit: way ? `${scale.unit} ${way}` : scale.unit,
      };
    });
  }

  private innerLabel(view: EntityView): string {
    const configured = this.config?.label;
    if (configured !== undefined) return configured;
    const deviceClass = view.deviceClass;
    if (!deviceClass) return strings(this.hass, 'value');
    const key = `component.sensor.entity_component.${deviceClass}.name`;
    const native = this.hass?.localize(key);
    if (native && native !== key) return native;
    const shared = SHARED_LABEL[deviceClass];
    if (shared) return this.t(shared);
    const local = CLASS_LABEL[deviceClass];
    if (local) return strings(this.hass, local);
    const words = deviceClass.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /**
   * Unavailable, unknown or missing, the gauge is the live one in the off skin (the owner's rule, 1.9): its ring or
   * bar, its range, its label and its row of the window, the value "—"; the window is history and stays.
   */
  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    if (this.signed) return this.renderSigned(view, name);

    const unusable = !isUsable(view);
    const base = toBase(1, view.unit);
    const value = view.number === null ? null : view.number * base.value;
    const min = (this.config?.min ?? 0) * base.value;
    const max = this.ceiling(view, min, base.value);
    const series = this.series_;

    const scale = figuresOf(
      this.hass,
      this.config,
      base.unit,
      Math.max(
        Math.abs(min),
        Math.abs(max ?? 0),
        Math.abs(value ?? 0),
        Math.abs((series?.max ?? 0) * base.value),
      ),
      view,
    );
    const shown = (raw: number): string => writeFigure(this.hass, raw, scale);
    const edgeDigits =
      Number.isInteger(min / scale.divisor) &&
      (max === null || Number.isInteger(max / scale.divisor))
        ? 0
        : 1; // "0.0 · 5.4", but "0 · 120"
    const edge = (raw: number): string =>
      formatNumber(this.hass, raw / scale.divisor, { digits: edgeDigits, minDigits: edgeDigits });

    const active = value !== null && value > min + (max === null ? 0 : (max - min) * IDLE);
    const engine = this.charts.engine;
    const dial = dialOf(this.config);
    const reads = { deviceClass: view.deviceClass, unit: base.unit };
    // a style's ring is the engine's: a moving one where it reads the sensor (else the ticks), in its own tone
    const style =
      dial === 'ticks'
        ? undefined
        : engine?.resolveGauge(dial, this.config ?? {}, undefined, reads);
    const tone: Tone = toneOf(this.config, style?.tone ?? 'solar');
    const headTone: Tone = unusable ? 'off' : active ? tone : 'neutral';
    const badgeText =
      unusable || value === null
        ? stateWord(this.hass, view)
        : (this.config?.badge ??
          (!active
            ? this.t('energy.idle')
            : PRODUCES.has(view.deviceClass)
              ? this.t('energy.producing')
              : strings(this.hass, 'active')));

    const width = this.contentWidth;
    const radius = Math.min(RADIUS, Math.max(48, Math.floor((width / 2 - TICK - 12) / 4) * 4));
    const box = Math.ceil((radius + TICK + 12) / 4) * 8; // the dial's own box: twice its half, which sits on the 4 grid
    const inset = Math.max(0, Math.floor((width - box) / 2));
    // the room a style's ring is drawn in: the dial's box, centred; a moving gauge's, the column's width
    const [left, room] = style?.motion ? [0, width] : [inset, box];
    // the dial's height, down to its range's labels: the room a style's ring keeps
    const tall = dialLabelTop(radius, TICK) + 16;

    const stats = statsOf(this.config).map((stat) => {
      const raw = series?.[stat];
      return {
        label: this.t(STAT_WORD[stat]),
        value: raw === undefined ? '—' : shown(raw * base.value),
        unit: raw === undefined ? '' : scale.unit,
      };
    });
    // a range below zero, or a temperature, writes its minus
    const minus = (this.config?.min ?? 0) < 0 || COLD.test(this.unitOf(view).trim());
    const row = windowRow(
      this.head.ruler,
      width,
      stats.map(({ label }) => label),
      widestOf(this.head.ruler, this.readings(view, minus)),
    );
    const fitted = this.head.fit({
      width,
      title: name,
      sub: this.config?.subtitle ?? view.areaName,
      badge: { text: badgeText, tone: headTone },
    });

    return html`<article
      class="fv-card so-card ${unusable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({
        icon: fitted.icon ? iconOf(view, this.config?.icon) : null,
        tone: headTone,
        title: name,
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(view.id),
        name: true,
      })}
      ${
        this.bar
          ? html`<div class="so-top fv-value-row">
                ${readout({ label: this.innerLabel(view), value: value === null ? '—' : shown(value), unit: value === null ? '' : scale.unit, size: 'l' })}
              </div>
              <div class="so-level">
                <span class="fv-bar"
                  ><span
                    class="fv-bar__fill fv-bar--${unusable || !active ? 'neutral' : tone}"
                    data-measure="value"
                    style="width:${value === null || max === null ? 0 : Math.round(Math.min(1, Math.max(0, (value - min) / (max - min))) * 100)}%"
                  ></span
                ></span>
              </div>
              ${rulerLabels([
                [0, edge(min)],
                [1, max === null ? '—' : edge(max)],
              ])}`
          : style?.preset !== 'ticks' && dial !== 'ticks'
            ? // a style's ring in the dial's room (its box, the height down to its range): the engine's, once here
              html`<div class="so-gauge">
                <div style="margin-left:${left}px;width:${room}px;height:${tall}px">
                  ${
                    style &&
                    engine?.drawGauge({
                      style,
                      // a ring as tall as the dial's room, a dial its box, a moving gauge its room
                      size: dial === 'ring' ? tall : room,
                      height: tall,
                      reads,
                      // how fast it moves an hour, over the window's last two slots (an hour of a day's), in the
                      // sensor's unit: a volume's or a percentage's, which no unit is scaled from
                      rise:
                        series &&
                        ((series.values.at(-1)! - series.values.at(-3)!) * 24) / this.hours,
                      hass: this.hass,
                      min,
                      max: max ?? min,
                      value: max === null || unusable ? null : value,
                      format: shown,
                      unit: scale.unit,
                      label: this.innerLabel(view),
                      minLabel: edge(min),
                      maxLabel: max === null ? '—' : edge(max),
                      tone,
                    })
                  }
                </div>
              </div>`
            : html`<div class="so-gauge">
                <fluvy-dial
                  gauge
                  style="margin-left:${inset}px"
                  .radius=${radius}
                  .tick=${TICK}
                  .large=${true}
                  .stepper=${false}
                  .tone=${unusable ? 'neutral' : tone}
                  .min=${min}
                  .max=${max ?? min + 1}
                  .fill=${value === null || max === null ? 0 : (value - min) / (max - min)}
                  .value=${value ?? undefined}
                  .unit=${value === null ? '' : scale.unit}
                  .label=${this.innerLabel(view)}
                  .text=${value === null ? '—' : undefined}
                  .minLabel=${edge(min)}
                  .maxLabel=${max === null ? '—' : edge(max)}
                  ?disabled=${value === null}
                  .format=${shown}
                ></fluvy-dial>
              </div>`
      }
      ${
        stats.length
          ? html`<div
              class="so-cols fv-cols so-cols--center ${row.odd ? 'fv-cols--odd' : ''}"
              style="grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))"
              data-align="center"
            >
              ${stats.map((stat) => readout({ ...stat, size: row.size }))}
            </div>`
          : nothing
      }
    </article>`;
  }

  /* ---------- signed ---------- */

  /**
   * The signed ring's ends in the base unit: `max` from the config, the entity's own, a companion entity, or the
   * window's largest swing either way rounded up; `min` from the config, else `-max`. Null while that window loads.
   */
  private extent(
    view: EntityView,
    factor: number,
    value: number | null,
  ): { min: number; max: number } | null {
    const named = this.namedRange(factor);
    if (named) return named;
    const positive = (v: unknown): v is number =>
      typeof v === 'number' && Number.isFinite(v) && v > 0;
    const own = view.attr<number | null>('max');
    const rated = this.config?.max_entity ? baseOf(this.entity(this.config.max_entity)) : null;
    let max: number | null = positive(own)
      ? own * factor
      : rated && positive(rated.value)
        ? rated.value
        : null;
    if (max === null) {
      if (this.series_ === undefined) return null;
      const swing = Math.max(
        Math.abs((this.series_?.min ?? 0) * factor),
        Math.abs((this.series_?.max ?? 0) * factor),
        Math.abs(value ?? 0),
      );
      if (!(swing > 0)) return null;
      max = ceilingFor(swing);
    }
    const min = this.config?.min;
    return { min: typeof min === 'number' && min < 0 ? min * factor : -max, max };
  }

  /** The signed ring's ends as the config names them (`max`; `min` below zero, else `-max`), in the base unit. */
  private namedRange(factor: number): { min: number; max: number } | null {
    const { min, max } = this.config ?? {};
    if (!(typeof max === 'number' && Number.isFinite(max) && max > 0)) return null;
    return {
      min: typeof min === 'number' && min < 0 ? min * factor : -max * factor,
      max: max * factor,
    };
  }

  /**
   * A value that can be negative, on a ring with zero at the top: lit from zero to the value in the card's tone (the
   * grid's by default: a meter cannot know where its energy came from); a power meter says its direction in the unit
   * slot ("1.8 kW out"), any other unit its sign.
   */
  private renderSigned(view: EntityView, name: string): TemplateResult {
    const unusable = !isUsable(view);
    const base = toBase(1, view.unit);
    const value = view.number === null || unusable ? null : view.number * base.value;
    // a meter that is not there says no unit: it is laid out in the one it was last read in, else as the grid meter
    // this gauge is for (`unitOf`)
    const power = toBase(1, this.unitOf(view)).unit === 'W';
    const ends = this.extent(view, base.value, value);
    const series = this.series_;
    const scale: Figures = figuresOf(
      this.hass,
      this.config,
      base.unit,
      Math.max(
        Math.abs(ends?.min ?? 0),
        Math.abs(ends?.max ?? 0),
        Math.abs(value ?? 0),
        Math.abs((series?.min ?? 0) * base.value),
        Math.abs((series?.max ?? 0) * base.value),
      ),
      view,
    );
    const way = (v: number): string =>
      v > 0 ? ways(this.hass, 'way_in') : v < 0 ? ways(this.hass, 'way_out') : '';
    // one precision for the value and its min / max / average — the entity's own, else the largest figure's — so
    // "1.0 kW out" stands beside "2.2 kW out" and "−0.9 °C" beside "−4.2 °C"
    const largest = Math.max(
      0,
      ...[
        value,
        ...[series?.min, series?.max, series?.average].map((v) =>
          typeof v === 'number' ? v * base.value : null,
        ),
      ]
        .filter((v): v is number => typeof v === 'number')
        .map((v) => Math.abs(v) / scale.divisor),
    );
    const digits = scale.digits ?? (largest >= 100 ? 0 : largest >= 1 ? 1 : 2);
    // a power meter: the magnitude, its direction after the unit (`ways`); anything else: the signed figure
    const said = (v: number | null, ways: boolean): { value: string; unit: string } => {
      if (v === null) return { value: '—', unit: '' };
      if (!ways) return { value: figure(this.hass, v, scale, digits), unit: scale.unit };
      const direction = way(v);
      return {
        value: figure(this.hass, Math.abs(v), scale, digits),
        unit: direction ? `${scale.unit} ${direction}` : scale.unit,
      };
    };
    // an end in a scale: whole where both ends are ("−5 kW · 5 kW"), else at one decimal ("2.5 kW out")
    const endDigits = (range: { min: number; max: number }, at: Figures): number =>
      Number.isInteger(range.min / at.divisor) && Number.isInteger(range.max / at.divisor) ? 0 : 1;
    const endOf = (v: number, ways: boolean, at: Figures, digits: number): string => {
      const shown = formatNumber(this.hass, (ways ? Math.abs(v) : v) / at.divisor, {
        digits,
        minDigits: digits,
      }).replace(/^-/, '−');
      return [shown, at.unit, ways ? way(v) : ''].filter(Boolean).join(' ');
    };
    const edgeDigits = ends ? endDigits(ends, scale) : 1;
    const edge = (v: number, ways: boolean): string => endOf(v, ways, scale, edgeDigits);

    const fraction = value === null || !ends ? null : fractionOf(value, ends.min, ends.max);
    const active = fraction !== null && Math.abs(fraction) > IDLE;
    const tone: Tone = toneOf(this.config, 'grid');
    const headTone: Tone = unusable ? 'off' : active ? tone : 'neutral';
    // "Importing" / "Exporting" say a power's way; any other signed value (a temperature) has no state to name:
    // only a badge the card is given shows
    const badgeText =
      unusable || value === null
        ? stateWord(this.hass, view)
        : (this.config?.badge ??
          (!power
            ? ''
            : !active
              ? this.t('energy.idle')
              : value > 0
                ? this.t('energy.importing')
                : this.t('energy.exporting')));

    const width = this.contentWidth;
    const r = this.head.ruler;
    const config = this.config;
    const wider = [way(1), way(-1)].reduce((a, b) =>
      r.width('en-gauge__end', b) > r.width('en-gauge__end', a) ? b : a,
    );
    // the ring's ends as the config names them, written as the card writes them; else the widest a range read from
    // the sensor or its window can write (a ceiling: three figures at most, "888 kW out")
    const named = this.namedRange(base.value);
    const namedAt =
      named && figuresOf(this.hass, config, base.unit, Math.max(-named.min, named.max), view);
    const unit = widestOf(r, this.readings(view, false)).unit ?? '';
    const ceiling = formatNumber(this.hass, 888, { digits: 0 });
    const laidEnd = (v: -1 | 1, ways: boolean): string =>
      named && namedAt
        ? endOf(v < 0 ? named.min : named.max, ways, namedAt, endDigits(named, namedAt))
        : [ways || v > 0 ? ceiling : `−${ceiling}`, unit, ways ? way(v) : '']
            .filter(Boolean)
            .join(' ');
    // the gauge with its power's directions in words, or signed: everything in one way, the needle saying which —
    // decided, as its ring and its row are laid out, by what the card can write, never by what it writes now: the
    // card keeps one height live, at any value and out of reach (the owner's rule), its ends "—" while it is away
    const lay = (ways: boolean) => {
      const [left, right] = ends ? [edge(ends.min, ways), edge(ends.max, ways)] : ['—', '—'];
      const widest = widestOf(r, this.readings(view, !ways, ways ? wider : ''));
      const leftW = r.width('en-gauge__end', laidEnd(-1, ways));
      const rightW = r.width('en-gauge__end', laidEnd(1, ways));
      const g = signedGeometry(width, Math.max(leftW, rightW));
      const shown = said(value, ways);
      const fits = (reading: Reading, size: ValueSize): boolean =>
        r.width(
          size === 'l' ? 'en-gauge__value' : 'en-gauge__value en-gauge__value--m',
          reading.value,
          'en-gauge__unit',
          reading.unit ?? '',
        ) <= valueRoom(g, size);
      const stats = statsOf(this.config).map((stat) => {
        const raw = series?.[stat];
        return {
          label: this.t(STAT_WORD[stat]),
          ...said(raw === undefined ? null : raw * base.value, ways),
        };
      });
      // the words hold while the widest figure fits its ring, the two ends their line and a statistic the column
      const holds =
        fits(widest, 'm') &&
        leftW + 8 + rightW <= width &&
        r.width(XS, widest.value, 'fv-unit', widest.unit ?? '') <= width;
      const size: ValueSize = fits(shown, 'l') ? 'l' : 'm';
      return { left, right, g, shown, size, stats, widest, holds };
    };
    const worded = lay(power);
    const { left, right, g, shown, size, stats, widest } = worded.holds ? worded : lay(false);
    const box = valueBox(g, size);
    const label = this.innerLabel(view);
    const room = labelRoom(g, size);
    const labelFits = r.width('en-gauge__label', label) <= room;

    // the directions make the figures long: as many columns as hold them and their labels, two and one before one a line
    const row = windowRow(
      r,
      width,
      stats.map(({ label }) => label),
      widest,
    );
    const fitted = this.head.fit({
      width,
      title: name,
      sub: this.config?.subtitle ?? view.areaName,
      badge: badgeText ? { text: badgeText, tone: headTone } : null,
    });

    return html`<article
      class="fv-card so-card ${unusable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({
        icon: fitted.icon ? iconOf(view, this.config?.icon) : null,
        tone: headTone,
        title: name,
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(view.id),
        name: true,
      })}
      <div class="en-gauge fv-tone--${tone}" style="height:${g.height}px">
        <svg
          width=${width}
          height=${g.height}
          viewBox="0 0 ${width} ${g.height}"
          aria-hidden="true"
        >
          ${// the ticks are the engine's (its rule for every dial's), there the moment it is
          this.charts.engine
            ?.signedTicks(g, unusable ? null : fraction)
            .map(
              (t) =>
                svg`<line x1=${t.x1.toFixed(1)} y1=${t.y1.toFixed(1)} x2=${t.x2.toFixed(1)} y2=${t.y2.toFixed(1)} class="en-tick ${t.lit ? 'is-lit' : ''}"></line>`,
            )}
        </svg>
        <span class="en-gauge__zero" data-align="center" style="top:0">0</span>
        ${
          // a label someone wrote is a name and may end in an ellipsis; Home Assistant's own word ("Temperature") is
          // never cut: it leaves the ring when it does not fit
          labelFits || this.config?.label !== undefined
            ? html`<span
                class="en-gauge__label"
                data-align="center"
                data-name=${labelFits ? nothing : ''}
                style=${labelFits ? `top:${box.label}px` : `top:${box.label}px;left:${g.cx - room / 2}px;width:${room}px`}
                >${label}</span
              >`
            : nothing
        }
        <span
          class="en-gauge__value ${size === 'm' ? 'en-gauge__value--m' : ''}"
          data-align="center"
          style="top:${box.value}px"
          >${shown.value}${shown.unit ? html`<span class="en-gauge__unit">${shown.unit}</span>` : nothing}</span
        >
        <span class="en-gauge__end" style="left:${g.endsLeft}px;top:${g.endsTop}px">${left}</span>
        <span class="en-gauge__end" style="right:${g.endsRight}px;top:${g.endsTop}px"
          >${right}</span
        >
      </div>
      ${
        stats.length
          ? html`<div
              class="so-cols fv-cols so-cols--center ${row.odd ? 'fv-cols--odd' : ''}"
              style="grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))"
              data-align="center"
            >
              ${stats.map((stat) => readout({ ...stat, size: row.size }))}
            </div>`
          : nothing
      }
    </article>`;
  }
}
