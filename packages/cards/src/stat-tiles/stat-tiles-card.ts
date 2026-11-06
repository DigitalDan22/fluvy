import {
  actionRuns,
  isUsable,
  stateText,
  strings as words,
  type ActionConfig,
  type EntityName,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceGridOptions,
  entriesOf,
} from '@fluvy/core';

import {
  head,
  listRow,
  optionColumns,
  options,
  readout,
  sheetStyles,
  type OptionItem,
  type Tone,
} from '@fluvy/ui';

import { html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { HeadFit } from '../energy/head.js';

import {
  askedParts,
  baseOf,
  figuresOf,
  figureText,
  writeFigure,
  type Figures,
  type NumberKeys,
} from '../shared/units.js';

import { Card, type CardEditor } from '../shared/base.js';

import { DETAILS } from '../lock/rows.js';
import { iconOf, stateWord } from '../shared/domain.js';
import { ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { optionColumnsFor } from '../shared/options.js';
import {
  EMPTY,
  entryCount,
  HEAD,
  rowsOf,
  ROW,
  ROW_COMPACT,
  textWidth,
  type NameOf,
} from '../shared/heights.js';
import { emptyPanel, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import { TemplateTexts } from '../shared/templates.js';

const strings = words('stat-tiles');

export type StatTilesVariant = 'full' | 'compact';
/** Tiles a row: two, three, or as many as the labels and values allow (three when they fit, else two). */
export type StatColumns = 2 | 3 | 'auto';

/** A `columns` as written (a number, a numeral in quotes, "auto", nonsense) to one the card lays out. */
function statColumns(raw: unknown, fallback: StatColumns): StatColumns {
  if (raw === 'auto') return 'auto';
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return n === 2 || n === 3 ? n : fallback;
}

export interface StatTileConfig extends NumberKeys {
  entity: string;
  name?: EntityName;
  icon?: string;
  tone?: Tone;
  /** Fills the tile with its tone — the one figure of the set that matters more than the rest. */
  highlight?: boolean;
  /** The tile's tap: its entity's details (Home Assistant's dialog, with its history) by default. */
  tap_action?: ActionConfig;
  /** A still press on the tile: nothing by default. */
  hold_action?: ActionConfig;
}

export interface StatRowConfig {
  entity: string;
  name?: EntityName;
  icon?: string;
  /** The line under the name ("This month"), or a template rendered live. Defaults to the entity's area. */
  secondary?: string;
  tone?: Tone;
  color?: string;
  tap_action?: ActionConfig;
}

export interface StatTilesCardConfig extends FluvyCardConfig, EmptyList, NumberKeys {
  title?: string;
  subtitle?: string;
  /** Head badge: the entity's value, with `badge_label` in front of it ("Health 92 %"). */
  badge_entity?: string;
  badge_label?: string;
  /** Two to six figures, two per row. */
  tiles?: ReadonlyArray<string | StatTileConfig>;
  /** Plain 60 px rows under the tiles, value at the right ("CO₂ avoided · 142 kg"). */
  rows?: ReadonlyArray<string | StatRowConfig>;
  /** `full` (default): 84 px tiles with their glyph, 60 px rows. `compact`: 64 px tiles of label over value, 48 px rows. */
  variant?: StatTilesVariant;
  /** Tiles a row: `2` (the full default), `3`, or `auto` (the compact default: three while every label and value fits). */
  columns?: StatColumns;
}

const MAX_TILES = 6;
const TILE_HEIGHT = 84;
const TILE_COMPACT = 64;
/** A tile's two sides (12 px of padding each), which its words sit between. */
const TILE_SIDES = 24;
/** The narrowest a tile is laid: a finger's target, whatever little its figure takes (#71). */
const TILE_MIN = 44;
/** The room a tile's figure takes when none can be read: "88.8 kWh" in its 16/600 type, about 76 px. */
const STAND_IN = 76;
/** The big readout above the tiles (`.fv-value-row`: 64 tall, 16 above it). */
const LEAD = 80;

/**
 * The gap that lets equal tiles land on the 4 px grid; 8 when no gap does. Two stats sit 8 apart (2 × 156 + 8 = 320,
 * 2 × 124 + 12 = 260); three share the mode row's rhythm (3 × 104 + 2 × 4 = 320, 3 × 96 + 2 × 12 = 312).
 */
function tileGap(width: number, count: number): number {
  for (let gap = count === 3 ? 4 : 8; gap <= 16; gap += 4)
    if ((width - gap * (count - 1)) % (count * 4) === 0) return gap;
  return 8;
}

/**
 * Tiles a row: as asked, or measured — as many as the count suggests (three, four as two by two) while the widest
 * label and the widest value fit a cell's content; else two — and fewer than that, down to one a row, where the
 * cells would not hold the widest value or would be narrower than a finger's 44: a figure never wraps, a tile is
 * always a target. A figure that cannot be read (`null`) is laid out as the widest the others show, or as `standIn`
 * where none can be read, so the tiles keep their rows while a sensor is away (the owner's rule, 1.9). The widths are
 * the words' as the tile's own classes draw them.
 */
export function statTileColumns(
  asked: StatColumns,
  width: number,
  labels: readonly number[],
  values: ReadonlyArray<number | null>,
  standIn: number,
): number {
  // the widest figure: a figure that cannot be read is as wide as the widest read, or the stand-in where none is
  const figure = Math.max(0, ...values.map((value) => value ?? 0)) || standIn;
  const gap = (columns: number): number => tileGap(width, columns);
  let columns =
    asked === 'auto'
      ? optionColumnsFor(labels.map(String), width, gap, () => Math.max(figure, ...labels))
      : asked;
  // the narrowest cell that holds the widest figure between its sides and is still a target
  const cell = Math.max(figure + TILE_SIDES, TILE_MIN);
  while (columns > 1 && cell > (width - gap(columns) * (columns - 1)) / columns)
    columns = columns > 2 ? 2 : 1;
  return columns;
}

/**
 * The card's height at a 360 column, for the automatic dashboard's columns: the lead readout, the tiles and the rows
 * 16 under them. `auto` is laid out by the words (`statTileColumns`): three a row while the widest label holds a
 * cell, four as two by two, else two — the names the config's or the house's (`nameOf`, read by `house-heights.ts`),
 * the figures the stand-in's width; the count alone where the house is not there to say.
 */
export function statTilesHeight(config: StatTilesCardConfig, nameOf?: NameOf): number {
  const compact = config.variant === 'compact';
  // auto-entities hands its figures over as `entities` (read as `tiles` once the card has them)
  const items = entriesOf<{ readonly entity: string; readonly name?: string }>(
    config.tiles ?? config.entities,
  )
    .slice(0, MAX_TILES)
    .map((item) => (typeof item === 'string' ? { entity: item } : item));
  const count = items.length;
  const rows = entryCount(config, ['rows']);
  const lead = config.entity ? LEAD : 0;
  if (!count && !rows) return HEAD + lead + EMPTY;
  const asked = statColumns(config.columns, compact ? 'auto' : 2);
  const labels = nameOf
    ? items.map((item) => {
        const name = item.name ?? nameOf(item.entity);
        return textWidth(typeof name === 'string' ? name : '', 'option');
      })
    : undefined;
  const perRow = Math.max(
    1,
    Math.min(
      count,
      asked !== 'auto'
        ? asked
        : labels
          ? statTileColumns(asked, 320, labels, [], STAND_IN)
          : optionColumns(count),
    ),
  );
  const gap = tileGap(320, perRow);
  const tiles = count
    ? rowsOf(count, perRow) * ((compact ? TILE_COMPACT : TILE_HEIGHT) + gap) - gap
    : 0;
  // the rows sit 16 under the tiles, or where the tiles would be
  return HEAD + lead + tiles + (rows ? (count ? 16 : 0) + (compact ? ROW_COMPACT : ROW) * rows : 0);
}

/**
 * A set of figures as tiles: the option-tile anatomy (glyph top-left, label, value), two per row, one of them
 * optionally filled with its tone — or, compact, 64 px tiles of label over value, three a row when they fit. A tile
 * that can be read is a button: its tap opens its details, a hold runs only where it asks for one. An optional big
 * readout sits above them, optional plain rows below.
 */
export class FluvyStatTilesCard extends Card<StatTilesCardConfig> {
  /** The card's height at a 360 column from its config alone: the tiles a row by their count (`statTilesHeight`). */
  static override layoutHeight(config: StatTilesCardConfig): number {
    return statTilesHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.solar,
  ];

  private readonly head = new HeadFit(this);
  /** A row's second line when it is a template: rendered by Home Assistant, live. */
  private readonly texts = new TemplateTexts(this);

  static override editor(): Promise<CardEditor> {
    return import('./stat-tiles-editor.js');
  }
  static override aliases: AliasSpec = {
    keys: [{ from: 'entities', to: 'tiles' }],
    items: { rows: ITEM_ALIASES, tiles: ITEM_ALIASES },
  };

  static getStubConfig(_hass: unknown, entities: readonly string[]): StatTilesCardConfig {
    return {
      type: 'custom:fluvy-stat-tiles-card',
      title: strings(undefined, 'stats'),
      tiles: entities.filter((id) => id.startsWith('sensor.')).slice(0, 4),
    };
  }

  private tiles(): StatTileConfig[] {
    return itemsOf<StatTileConfig>(this.config?.tiles).slice(0, MAX_TILES);
  }

  private rows(): StatRowConfig[] {
    return itemsOf(this.config?.rows);
  }

  private compact(): boolean {
    return this.config?.variant === 'compact';
  }

  protected override prepare(config: StatTilesCardConfig): StatTilesCardConfig {
    listOf(config, 'tiles');
    listOf(config, 'rows');
    return config;
  }

  override getCardSize(): number {
    return Math.ceil((this.config ? FluvyStatTilesCard.layoutHeight(this.config) : HEAD) / 50);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override watched(): readonly string[] {
    return [
      ...this.tiles().map((tile) => tile.entity),
      ...this.rows().map((row) => row.entity),
      this.config?.entity ?? '',
      this.config?.badge_entity ?? '',
    ].filter(Boolean);
  }

  /** Tiles that measure the same thing share one unit, so the set reads as one figure (3.2 kW · 0.25 kW · 1.1 kW). */
  private scales(views: readonly EntityView[]): Map<string, Figures> {
    const peaks = new Map<string, number>();
    for (const view of views) {
      const quantity = baseOf(view);
      if (quantity)
        peaks.set(quantity.unit, Math.max(peaks.get(quantity.unit) ?? 0, Math.abs(quantity.value)));
    }
    return new Map(
      [...peaks].map(([unit, peak]) => [unit, figuresOf(this.hass, this.config, unit, peak)]),
    );
  }

  /**
   * "3.2 kW": a scaled figure for power and energy, in the set's unit or the one asked, Home Assistant's own
   * formatting (precision included) for the rest unless decimals are asked; a tile that asks for its own unit or
   * decimals (`own`) reads as it asks.
   */
  private text(view: EntityView, scales?: Map<string, Figures>, own?: NumberKeys): string {
    const asked =
      own?.unit !== undefined || own?.decimals !== undefined
        ? { ...this.config, ...own }
        : this.config;
    const quantity = view.status === 'ok' ? baseOf(view) : null;
    const scale = quantity
      ? (asked === this.config && scales?.get(quantity.unit)) ||
        figuresOf(this.hass, asked, quantity.unit, quantity.value, view)
      : null;
    if (quantity && scale && (scale.unit !== view.unit || scale.digits !== undefined))
      return figureText(this.hass, quantity.value, scale, scale.digits);
    const parts = askedParts(this.hass, view, asked);
    return parts.unit ? `${parts.value} ${parts.unit}` : parts.value;
  }

  protected renderCard(): TemplateResult {
    const tiles = this.tiles();
    const views = tiles.map((tile) => this.entity(tile.entity));
    const lead = this.config?.entity ? this.entity(this.config.entity) : null;
    const tone: Tone = toneOf(this.config, 'accent');
    const gone = (view: EntityView): boolean => !isUsable(view);
    // every figure gone: the card is; a card with no figure at all is only empty
    const figures = lead ? [...views, lead] : views;
    const unusable = figures.length > 0 && figures.every(gone);
    const headTone: Tone = unusable ? 'off' : tone;

    const badgeView = this.config?.badge_entity ? this.entity(this.config.badge_entity) : null;
    const badgeText = badgeView
      ? [this.config?.badge_label, this.text(badgeView)].filter(Boolean).join(' ')
      : '';

    const scales = this.scales(views);
    const items = tiles.map((tile, index): OptionItem => {
      const view = views[index] as EntityView;
      return {
        key: tile.entity,
        label: this.nameFor(view, tile.name),
        name: true,
        value: this.text(view, scales, tile),
        glyph: iconOf(view, tile.icon),
        tone: tile.tone ?? tone,
        active: !gone(view) && (tile.highlight ?? false),
        unavailable: gone(view),
        // its own tap (its details by default) and hold (none by default), each where it runs; a figure that cannot
        // be read has neither (`options()`)
        onTap: actionRuns(tile.tap_action, view.id)
          ? () => this.tap(view.id, tile.tap_action ?? DETAILS)
          : undefined,
        onHold:
          tile.hold_action && actionRuns(tile.hold_action, view.id)
            ? () => this.hold(view.id, tile.hold_action)
            : undefined,
      };
    });

    const leadBase = lead && lead.status === 'ok' ? baseOf(lead) : null;
    const leadScale = leadBase
      ? figuresOf(this.hass, this.config, leadBase.unit, leadBase.value, lead ?? undefined)
      : null;
    const leadParts =
      leadBase && leadScale && (leadScale.unit !== lead?.unit || leadScale.digits !== undefined)
        ? { value: writeFigure(this.hass, leadBase.value, leadScale), unit: leadScale.unit }
        : lead
          ? askedParts(this.hass, lead, this.config)
          : null;

    const width = this.contentWidth;
    const compact = this.compact();
    const columns = this.columns(items, views, width);
    const gap = tileGap(width, Math.min(columns, items.length));
    // every row's value first: whether the rows keep their circles is decided over all of them; a compact row has
    // no second line to say why there is no figure, so the state's word is its value where it leaves the name its room
    const rows = this.rows().map((row) => {
      const view = this.entity(row.entity);
      const title = this.nameFor(view, row.name);
      const figure = this.text(view);
      const value =
        compact && view.status !== 'ok'
          ? this.head.rowWord(width, title, stateWord(this.hass, view), figure)
          : figure;
      return { row, view, title, value };
    });
    const keepIcon = this.head.rowsKeepIcon(width, rows, compact);
    const panel = emptyPanel(this, !items.length && !rows.length, 'grid', 'common.no_readings');
    const title = this.config?.title ?? lead?.name ?? strings(this.hass, 'stats');
    const fitted = this.head.fit({
      width,
      title,
      sub: this.config?.subtitle ?? lead?.areaName ?? '',
      badge: badgeText ? { text: badgeText, tone: headTone } : null,
    });

    return html`<article
      class="fv-card so-card ${unusable ? 'is-unavailable is-off' : ''}"
      data-card
    >
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? (lead ? iconOf(lead) : 'grid')) : null,
        tone: headTone,
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        ...this.headActions(lead?.id),
        name: Boolean(this.config?.title),
        cut: fitted.cut,
      })}
      ${lead && leadParts ? html`<div class="so-top fv-value-row">${readout({ label: this.nameFor(lead, this.config?.name), value: leadParts.value, unit: leadParts.unit, size: 'l' })}</div>` : nothing}
      ${
        // the rows alone sit where the tiles would; nothing at all, the panel does
        panel || items.length
          ? html`<div class="so-tiles">
              ${panel ?? options(items, null, gap, compact ? TILE_COMPACT : TILE_HEIGHT, columns, compact)}
            </div>`
          : nothing
      }
      ${
        rows.length
          ? html`<div class="so-rows">
              ${rows.map(({ row, view, title, value }) => {
                const usable = isUsable(view);
                // a compact row is the name and the value alone: its second line is not laid out
                return listRow({
                  icon: keepIcon ? iconOf(view, row.icon) : null,
                  tone: usable ? toneOf(row, 'neutral') : 'off',
                  accent: this.accents.item(row.color),
                  title,
                  name: true,
                  sub: compact
                    ? ''
                    : this.head.fitRowSub(
                        !usable
                          ? stateText(this.hass, view)
                          : row.secondary === undefined
                            ? view.areaName
                            : this.texts.resolve(row.secondary, row.entity),
                        this.head.rowRoom(width, value, { icon: keepIcon }),
                      ),
                  trailing: 'value',
                  value,
                  compact,
                  unavailable: !usable,
                  onTap: () => this.tap(view.id, row.tap_action),
                });
              })}
            </div>`
          : nothing
      }
    </article>`;
  }

  /** Tiles a row (`statTileColumns`), from the tiles' words measured in their own classes. */
  private columns(
    items: readonly OptionItem[],
    views: readonly EntityView[],
    width: number,
  ): number {
    const r = this.head.ruler;
    return statTileColumns(
      statColumns(this.config?.columns, this.compact() ? 'auto' : 2),
      width,
      items.map((item) => r.width('fv-option__label', item.label)),
      items.map((item, index) =>
        views[index]?.status === 'ok' ? r.width('fv-option__value', item.value ?? '') : null,
      ),
      STAND_IN,
    );
  }
}
