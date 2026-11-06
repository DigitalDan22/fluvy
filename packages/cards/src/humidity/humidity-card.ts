import {
  chartDefaults,
  fetchHistory,
  formatNumber,
  isUsable,
  plural,
  stateText,
  strings as words,
  toggleEntity,
  valueParts,
  type FluvyCardConfig,
  type GaugePreset,
  type LovelaceGridOptions,
  type Series,
} from '@fluvy/core';

import { head, listRow, readout, rulerLabels, sheetStyles, type Tone } from '@fluvy/ui';

import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { HeadFit, SWITCH_SLOT } from '../energy/head.js';
import { ChartLoader } from '../shared/chart-load.js';

import { Card, type CardEditor } from '../shared/base.js';

import { iconOf } from '../shared/domain.js';
import { Refresher } from '../shared/refresh.js';
import type { AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { ROW } from '../shared/heights.js';
import { sideStacked } from '../shared/value-row.js';

const strings = words('humidity');

export interface HumidityCardConfig extends FluvyCardConfig {
  subtitle?: string;
  /** Bottom of the comfort band (30 %). */
  low?: number;
  /** Top of the comfort band (60 %). */
  high?: number;
  /** Room temperature; with it the card can say the dew point. */
  temperature_entity?: string;
  /** Hours the Trend row looks back (6). */
  hours?: number;
  /** The Trend row (default). */
  show_trend?: boolean;
  /** A humidifier, dehumidifier or plain switch shown as a row with its switch. */
  humidifier_entity?: string;
  /**
   * The comfort band's style: the ruler's ticks with the reading's marker (1.10's, `ticks`), the ruler read, lit to
   * the reading with Fluvy's knob on it (`ruler`), or the liquid, its level the reading (`liquid`); none: the house's
   * — any other has no room here, and reads ticks.
   */
  gauge?: GaugePreset;
  /** Whether the liquid moves; none: the house's (still, it rests on its first frame). */
  animate?: boolean;
}

/** The comfort band's style: its own `gauge`, else the house's, where it is the ruler or the liquid; else the ticks. */
export const bandOf = (
  config: Readonly<Record<string, unknown>> | undefined,
): 'ticks' | 'ruler' | 'liquid' => {
  const wanted = (config?.['gauge'] as GaugePreset | undefined) ?? chartDefaults().settings.gauge;
  return wanted === 'ruler' || wanted === 'liquid' ? wanted : 'ticks';
};

/** The history cache in core lives five minutes; asking again sooner would only return the same window. */
/** The band opens this far outside the ticks that bound it, so neither tick is bitten by its edge. */
const BAND_MARGIN = 1; // the band ends on the 30 / 60 ticks; 1 px covers the tick stroke, no more

/** Magnus-Tetens, the formula Home Assistant's own dew-point helpers use. */
function dewPoint(celsius: number, humidity: number): number {
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * celsius) / (b + celsius) + Math.log(Math.max(0.01, humidity / 100));
  return (b * alpha) / (a - alpha);
}

const toCelsius = (value: number, unit: string): number =>
  unit === '°F' ? ((value - 32) * 5) / 9 : value;
const fromCelsius = (value: number, unit: string): number =>
  unit === '°F' ? (value * 9) / 5 + 32 : value;
const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

/**
 * A humidity sensor on the comfort ruler: the pastel band between the two thresholds drawn behind
 * the ticks, the reading as a read-only marker riding them, the state said once in the badge, and
 * underneath where it is heading and the humidifier that answers it.
 */
export class FluvyHumidityCard extends Card<HumidityCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: HumidityCardConfig): number {
    const trend = config.show_trend === false || config.hours === 0 ? 0 : 1;
    const rows = trend + (config.humidifier_entity ? 1 : 0);
    return 236 + (rows ? 16 + ROW * rows : 0);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
    css`
      /* the sheet's rule reaches the ruler through its host: nothing to cut here, the band stays whole behind the marker */
      .so-band fluvy-ruler {
        display: block;
        position: relative;
        --knob-halo: transparent;
      }
    `,
  ];

  static override properties = { ...Card.properties, series_: { state: true } };

  /** The trend window: undefined while it loads, null when the recorder has nothing. */
  declare series_: Series | null | undefined;

  private readonly history = new Refresher<Series | null>();
  private readonly head = new HeadFit(this);
  /** The chart engine, for the liquid: the ruler is the card's own and waits for nothing. */
  private readonly charts = new ChartLoader(this);

  constructor() {
    super();
    this.series_ = undefined;
  }

  static override editor(): Promise<CardEditor> {
    return import('./humidity-editor.js');
  }
  /** `trend_hours` was the window's older name; `trend_hours: 0` still hides the row. */
  static override aliases: AliasSpec = { keys: [{ from: 'trend_hours', to: 'hours' }] };

  static getStubConfig(
    hass: { states?: Record<string, { attributes: { device_class?: string } }> } | undefined,
    entities: readonly string[],
  ): HumidityCardConfig {
    const sensors = entities.filter((id) => id.startsWith('sensor.'));
    return {
      type: 'custom:fluvy-humidity-card',
      entity:
        sensors.find((id) => hass?.states?.[id]?.attributes.device_class === 'humidity') ??
        sensors.find((id) => /humid/.test(id)) ??
        sensors[0] ??
        '',
    };
  }

  protected override prepare(config: HumidityCardConfig): HumidityCardConfig {
    if (!config.entity) throw new Error('fluvy-humidity-card: "entity" is required');
    return config;
  }

  override getCardSize(): number {
    return 5 + (this.trendHours > 0 ? 1 : 0) + (this.config?.humidifier_entity ? 1 : 0);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    return [
      this.config?.entity ?? '',
      this.config?.temperature_entity ?? '',
      this.config?.humidifier_entity ?? '',
    ].filter(Boolean);
  }

  /** The Trend window; 0 when the row is not shown. */
  private get trendHours(): number {
    if (this.config?.show_trend === false) return 0;
    const hours = this.config?.hours;
    return typeof hours === 'number' && hours >= 0 ? Math.min(48, hours) : 6;
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.loadTrend();
  }

  private loadTrend(): void {
    const hass = this.hass;
    const id = this.config?.entity;
    const hours = this.trendHours;
    if (!hass || !id || hours === 0) return;
    const key = `${id}|${hours}`;
    const previous = this.history.request(
      key,
      () => fetchHistory(hass, id, hours, 12),
      (series) => (this.series_ = series),
    );
    if (previous !== null && previous !== key) this.series_ = undefined;
  }

  /** "+3 %": where the reading stands against the start of the window. */
  private trendText(value: number | null): string {
    const first = this.series_?.values[0];
    const delta = value !== null && first !== undefined ? value - first : null;
    const size = delta === null ? 0 : Math.abs(delta);
    return delta === null
      ? '—'
      : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatNumber(this.hass, size, { digits: size < 10 ? 1 : 0 })} %`;
  }

  /** The trend's window, "Last 6 h": a figure with its unit, so its row's circle gives way before it is cut. */
  private trendWindow(): string {
    return plural(this.hass, 'humidity.last_hours', this.trendHours, {
      hours: formatNumber(this.hass, this.trendHours, { digits: 1 }),
    });
  }

  /** The trend's row. `keep`: the rows keep their circles (the rows' rule, decided for the list at once). */
  private trendRow(
    value: number | null,
    unusable: boolean,
    keep: boolean,
    onTap: () => void,
  ): TemplateResult {
    const first = this.series_?.values[0];
    const delta = value !== null && first !== undefined ? value - first : null;
    const text = this.trendText(value);
    return listRow({
      icon: !keep ? null : delta !== null && delta < 0 ? 'trendDown' : 'trendUp',
      tone: unusable ? 'off' : 'neutral',
      title: strings(this.hass, 'trend'),
      sub: this.trendWindow(),
      trailing: 'value',
      value: text,
      onTap,
    });
  }

  private humidifierRow(entityId: string, keep: boolean): TemplateResult {
    const view = this.entity(entityId);
    const usable = view.status === 'ok' || view.status === 'unknown';
    const on = this.stateOf(view) === 'on';
    const target = view.attr<number | null>('humidity');
    const context = [
      view.areaName,
      typeof target === 'number' && Number.isFinite(target)
        ? `${formatNumber(this.hass, target, { digits: 0 })} %`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const room = this.head.rowRoom(this.contentWidth, '', { icon: keep }) - SWITCH_SLOT;
    return listRow({
      icon: keep ? iconOf(view) : null,
      tone: !usable ? 'off' : on ? 'water' : 'neutral',
      title: view.name,
      name: true,
      sub: this.head.fitRowSub(usable ? context : stateText(this.hass, view), room),
      trailing: 'switch',
      on,
      unavailable: !usable,
      onTap: () => this.tap(view.id, { action: 'more-info' }),
      onToggle: (next) => {
        if (!this.hass) return;
        this.expect(view.id, next ? 'on' : 'off');
        void toggleEntity(this.hass, view.id);
      },
    });
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.nameFor(view, this.config?.name);
    // out of reach (unavailable, missing) it keeps its anatomy and its size, its controls disabled: only the colours
    // change (1.9)
    const unusable = !isUsable(view);
    const value = view.number;
    const low = clampPercent(this.config?.low ?? 30);
    const high = Math.max(low, clampPercent(this.config?.high ?? 60));
    const dry = value !== null && value < low;
    const humid = value !== null && value > high;
    const markerTone: Tone = toneOf(this.config, 'water');
    const tone: Tone = unusable
      ? 'off'
      : value === null
        ? 'neutral'
        : dry || humid
          ? 'warning'
          : markerTone;
    const badgeText =
      value === null
        ? stateText(this.hass, view)
        : dry
          ? this.t('humidity.dry')
          : humid
            ? this.t('humidity.humid')
            : strings(this.hass, 'comfortable');

    // the band is placed from the very pixels the ruler puts its ticks on, whatever the column measures
    const width = this.contentWidth;
    const tick = (percent: number): number => Math.round((percent / 100) * width);
    const bandLeft = Math.max(0, tick(low) - BAND_MARGIN);
    const bandRight = Math.min(width, tick(high) + BAND_MARGIN);

    // a threshold too close to an end would print over "Dry" or "Humid": the band itself still says where it is
    const labels: Array<readonly [number, string]> = [[0, this.t('humidity.dry')]];
    if (tick(low) >= 56) labels.push([low / 100, formatNumber(this.hass, low, { digits: 0 })]);
    if (width - tick(high) >= 64 && tick(high) - tick(low) >= 40)
      labels.push([high / 100, formatNumber(this.hass, high, { digits: 0 })]);
    labels.push([1, this.t('humidity.humid')]);

    const temperature = this.config?.temperature_entity
      ? this.entity(this.config.temperature_entity)
      : null;
    let side: { label: string; value: string; unit: string } | null = null;
    if (temperature && temperature.number !== null) {
      const unit = temperature.unit || this.hass?.config.unit_system.temperature || '°C';
      side =
        value === null
          ? { label: strings(this.hass, 'temperature'), ...valueParts(this.hass, temperature) }
          : {
              label: strings(this.hass, 'dew_point'),
              value: formatNumber(
                this.hass,
                fromCelsius(dewPoint(toCelsius(temperature.number, unit), value), unit),
                { digits: 1 },
              ).replace(/^-/, '−'),
              unit,
            };
    }

    // `dark` on the ruler: its lit ticks glow in dark mode, and nothing else tells a control which mode it is in; it
    // is read with its marker (the classic ruler) or lit to the reading with Fluvy's knob
    const parts = valueParts(this.hass, view);
    const band = bandOf(this.config);
    const engine = this.charts.engine;
    // the dew point beside the humidity in the longest of its words that leaves the dew point its room ("Humidity"
    // where "Relative humidity" would wrap), else under it: measured at the widest humidity and under both of the
    // side's words, so the humidity going unknown never moves the row; alone, the longest the column holds (de's
    // "Relative Luftfeuchtigkeit" does not hold half a column, "Luftfeuchte" does)
    const named = [strings(this.hass, 'relative'), strings(this.hass, 'relative_short')] as const;
    const beside = side
      ? named.find(
          (label) =>
            !sideStacked(
              this.head.ruler,
              width,
              [parts.value, '100'].map((value) => ({ label, value, unit: '%' })),
              (['dew_point', 'temperature'] as const).map((key) => ({
                ...side,
                label: strings(this.hass, key),
              })),
            ),
        )
      : undefined;
    const stacked = side !== null && beside === undefined;
    const relative =
      beside ??
      named.find(
        (label) => this.head.ruler.width('fv-readout > fv-readout__label', label) <= width,
      ) ??
      named[1];
    const openInfo = (): void => this.tap(view.id, { action: 'more-info' });
    const humidifier = this.config?.humidifier_entity;
    // a column too narrow for a row's words beside its figure or its switch gives every row's circle to the words,
    // as every list does
    const keepRows = this.head.rowsKeepIcon(this.contentWidth, [
      ...(this.trendHours > 0
        ? [
            {
              title: strings(this.hass, 'trend'),
              value: this.trendText(value),
              sub: this.trendWindow(),
            },
          ]
        : []),
      ...(humidifier ? [{ title: this.entity(humidifier).name, value: '', end: SWITCH_SLOT }] : []),
    ]);
    const fitted = this.head.fit({
      width,
      title: name,
      sub: this.config?.subtitle ?? view.areaName,
      badge: { text: badgeText, tone },
    });

    return html`<article
      class="fv-card so-card ${unusable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({
        icon: fitted.icon ? iconOf(view, this.config?.icon) : null,
        tone,
        title: name,
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(view.id),
        name: true,
      })}
      <div class="so-top fv-value-row ${stacked ? 'is-stacked' : ''}">
        ${readout({ label: relative, value: parts.value, unit: value === null ? '' : parts.unit || '%', size: 'l' })}
        ${side ? html`<div class="so-top__side">${readout({ label: side.label, value: side.value, unit: side.unit, size: 's' })}</div>` : nothing}
      </div>
      ${
        band === 'liquid'
          ? // the liquid takes the ruler's room and its labels' (64), its level the reading
            html`<div class="so-band">
              ${engine?.drawGauge({
                style: engine.resolveGauge('liquid', this.config ?? {}),
                size: width,
                height: 64,
                min: 0,
                max: 100,
                value: unusable ? null : value,
                format: String,
                tone: markerTone,
                bare: true,
              })}
            </div>`
          : html`<div class="so-band">
                <span
                  class="so-band__zone"
                  data-measure="value"
                  style="left:${bandLeft}px;width:${bandRight - bandLeft}px"
                ></span>
                <fluvy-ruler
                  ?marker=${band === 'ticks'}
                  ?readonly=${band === 'ruler'}
                  ?dark=${this.dark}
                  .value=${value ?? 0}
                  .min=${0}
                  .max=${100}
                  .step=${1}
                  .length=${width}
                  .knob=${36}
                  .tone=${unusable ? 'neutral' : markerTone}
                  ?inactive=${value === null}
                  unit="%"
                  .label=${`${name} · ${strings(this.hass, 'relative')}`}
                  .format=${(raw: number) => formatNumber(this.hass, raw, { digits: 0 })}
                ></fluvy-ruler>
              </div>
              ${rulerLabels(labels)}`
      }
      ${
        this.trendHours > 0 || humidifier
          ? html`<div class="so-rows">
              ${this.trendHours > 0 ? this.trendRow(value, unusable, keepRows, openInfo) : nothing}
              ${humidifier ? this.humidifierRow(humidifier, keepRows) : nothing}
            </div>`
          : nothing
      }
    </article>`;
  }
}
