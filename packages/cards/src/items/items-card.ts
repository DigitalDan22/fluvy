import {
  localize,
  plural,
  resolveEntity,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceConfigForm,
} from '@fluvy/core';
import {
  activateKey,
  clickPress,
  head,
  ico,
  icon,
  listRow,
  startPress,
  type IconRef,
  type Tone,
} from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { HeadFit, ROW_NAME_MIN, type FittedHead } from '../energy/head.js';
import { itemsHeight, itemsList, maxRows, TILE_GAP } from '../items-family.js';
import { Card, type BaseKey, type HeadConfig } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import { lineCount } from '../shared/fit.js';
import {
  actionFields,
  boolField,
  choiceField,
  colourFields,
  editorLabels,
  editorLanguage,
  editorWord,
  emptyFields,
  entityField,
  fieldRow,
  iconField,
  numberField,
  onlyWhen,
  selectField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import { EMPTY } from '../shared/heights.js';
import { EMPTY_KEYS, emptyPanel, type EmptyList } from '../shared/lists.js';
import type { EditorChoices, EditorDefaults, FormHelper } from '../shared/rows-editor.js';
import { isTemplate, PENDING_LINE, TemplateTexts } from '../shared/templates.js';
import {
  asItems,
  fitSegments,
  listAttribute,
  listAttributes,
  present,
  sortItems,
  valueAt,
  type Item,
  type SortOrder,
} from './fields.js';
import {
  mappingOf,
  presetOf,
  rowOf,
  sheetOf,
  type Preset,
  type PresetName,
  type SheetRow,
  type Shown,
} from './presets.js';
import type { FluvyItemsSheet, ItemsSheetHost, SheetItem } from './sheet/items-sheet.js';

const s = strings('items');

export type ItemsVariant = 'rows' | 'compact' | 'tiles';

export interface ItemsCardConfig extends FluvyCardConfig, HeadConfig, EmptyList {
  title?: string;
  subtitle?: string;
  /** The list attribute (`auto`, the default: the first that holds a list of items). */
  attribute?: string;
  /** `auto` (the default): flights for a FlightRadar24 sensor, else the mapped fields; `none`; `flights`. */
  preset?: PresetName;
  /** A field of the item (`altitude`, `airport.city`), or words with `{field}`; `{a|b}` takes b where a is empty. */
  item_name?: string;
  item_secondary?: string;
  item_value?: string;
  item_unit?: string;
  item_icon?: string;
  item_image?: string;
  item_url?: string;
  /** A template that gives the list (as JSON), in place of the attribute: any sensor becomes a list. */
  items_template?: string;
  /** The field the list is sorted by; none keeps the sensor's order. */
  sort?: string;
  sort_order?: SortOrder;
  /** The rows the card declares (1–20, five by default): its height, never the list's length. */
  max_rows?: number;
  /** `rows` (60, the default), `compact` (48, the name and the value) or `tiles` (76, two a row from 288). */
  variant?: ItemsVariant;
  /** The head's line counts the items from the sensor's state (`subtitle` wins). */
  show_count?: boolean;
  /** An item's picture as its circle, where it has one. */
  show_image?: boolean;
  /** What a tap on an item does: its sheet (the default), or nothing. */
  item_tap?: 'sheet' | 'none';
  /** Test hook: the first item's sheet docked in the card's place (the playground). Undocumented. */
  _sheet?: boolean;
}

/** The fields a config maps an item by, hidden under a preset. */
const FIELD_KEYS = [
  'item_name',
  'item_secondary',
  'item_value',
  'item_unit',
  'item_icon',
  'item_image',
  'item_url',
] as const;

/** The tiles a row: two from a 288 content column (a phone's card: its 328 less the card's 20s), one under it. */
const TWO_TILES = 288;
/** A tile's two sides (16 each); its circle (44) and the gap after it. */
const TILE_SIDES = 32;
const CIRCLE = 56;
/**
 * The least a name keeps: a tile's beside its circle (where an inner tile gives its icon away: 104 inside, less 56), a
 * compact row's beside its value.
 */
const NAME_MIN = 48;
/** A compact tile's words, as the ruler lays them out. */
const TILE_NAME = 'fv-tile fv-tile--compact > fv-tile__name';
const TILE_STATE = 'fv-tile fv-tile--compact > fv-tile__state';
/** A value's glyph (16) and the gap after it. */
const GLYPH = 20;
/** The empty panel: its 16 on either side, its 44 ring and the 8 under it, a line of its words. */
const PANEL_SIDES = 32;
const PANEL_RING = 52;
const PANEL_LINE = 20;

/** An item as the card draws it, with where it came from. */
interface Drawn {
  readonly item: Item;
  readonly shown: Shown;
}

/** The list as it stands this render. */
interface Listing {
  readonly view: EntityView;
  readonly usable: boolean;
  /** The template has not answered yet: no rows, no panel, the box keeps its size. */
  readonly pending: boolean;
  readonly preset: Preset | undefined;
  /** Every item, in the order asked: the rows are its first `max_rows`, the sheet finds its item among all. */
  readonly items: Item[];
}

/**
 * The preset each list was last drawn by while its sensor could be read, by the list (its sensor, its attribute, its
 * template): out of reach, a card keeps the anatomy it had — a flights card stays "Flights nearby" with its plane —
 * on this view or another the house opens later.
 */
const lastPreset = new Map<string, Preset | undefined>();
const listKey = (config: ItemsCardConfig): string =>
  [config.entity ?? '', config.attribute ?? '', config.items_template ?? ''].join('\n');

/** How the tiles share their room: the item's circle, and the value's arrow. */
interface TileLayout {
  readonly circles: boolean;
  readonly glyphs: boolean;
}

/** How the compact rows share their room with their values: the value's arrow and its unit, or its place. */
interface RowShare {
  readonly glyphs: boolean;
  readonly units: boolean;
  /** The value under the name, in the row's 48. */
  readonly under: boolean;
}

const WHOLE: RowShare = { glyphs: true, units: true, under: false };
/** What a compact row's value gives a name under its least, in turn: its arrow, then its unit. */
const GIVING: readonly RowShare[] = [
  WHOLE,
  { glyphs: false, units: true, under: false },
  { glyphs: false, units: false, under: false },
];
/** Where not even the bare figure leaves a name its least: the value under the name, whole again. */
const UNDER: RowShare = { glyphs: true, units: true, under: true };

/** What tells an item from the others while the list moves under its sheet: its `id`, else its name. */
const keyOf = ({ item, shown }: Drawn): string => {
  const id = valueAt(item, 'id');
  return present(id) ? String(id) : shown.name;
};

/**
 * The Items card (#66): the items of a sensor's list attribute — flights overhead, departures, deliveries — a row
 * each (60), a compact row (48) or a tile (76, two a row), each named, lined and valued by the fields the config maps
 * (`item_name`, `item_value` …: a field of the item, or words with `{field}` in them) or by a preset that knows the
 * integration's shape: the flights of FlightRadar24, detected or asked for. `items_template` lets a template give the
 * list instead, so any sensor becomes one. The head counts the items from the sensor's state; `max_rows` is the
 * card's height, not the list's length — fewer items, the empty panel and a sensor out of reach keep the size. A tap
 * on an item opens its sheet (its fields in order, a link where it has one), fetched the first time.
 */
export class FluvyItemsCard extends Card<ItemsCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: ItemsCardConfig): number {
    return itemsHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    css`
      /* the list keeps the card's declared height: fewer items, the empty panel and a sensor out of reach too */
      .it-list {
        margin-top: 16px;
        min-height: var(--it-min);
      }
      /* the empty panel in the box's middle, on the 4 grid; in a box shorter than the panel, its words alone at the
         box's height */
      .it-list.is-empty {
        padding-top: var(--it-inset);
      }
      .it-list.is-short > .fv-empty-state {
        min-height: var(--it-min);
        padding: 0 16px;
      }
      .it-list.is-short .fv-empty-state__ring {
        display: none;
      }
      .it-tiles {
        display: grid;
        grid-template-columns: repeat(var(--it-cols, 2), minmax(0, 1fr));
        gap: ${TILE_GAP}px;
        align-content: start;
      }
      .it-tile {
        height: 76px;
      }
      .fv-tile__state > svg {
        display: inline-block;
        width: 16px;
        height: 16px;
        margin-right: 4px;
        vertical-align: -3px;
      }
      /* an item's picture in its circle's place */
      .it-pic {
        position: relative;
        flex: 0 0 44px;
        width: 44px;
        height: 44px;
        overflow: hidden;
        border-radius: 50%;
        background: var(--fluvy-inset, var(--fluvy-page));
      }
      .it-pic img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      /* where the widest value the card can show would leave a name under its room, every row puts its value under
         its name, in the line's place: the row keeps its 60 (the name's 20, 4, the value's 20) */
      .fv-row--stack {
        flex-wrap: wrap;
        align-content: center;
        row-gap: 4px;
      }
      .fv-row--stack > .fv-row__text {
        flex-basis: 100%;
      }
      .fv-row--stack > .fv-row__value.fv-row__value {
        max-width: 100%;
        text-align: start;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    broken_: { state: true },
    sheetReady_: { state: true },
  };
  /** Pictures that failed to load: those items show their glyph instead of a broken image. */
  declare broken_: ReadonlySet<string>;
  /** The sheet's chunk has landed. */
  declare sheetReady_: boolean;
  /** The item whose sheet is open, by its key (`keyOf`): the list may reorder under it, the sheet keeps its item. */
  private opened = '';

  constructor() {
    super();
    this.broken_ = new Set();
    this.sheetReady_ = false;
  }

  /** The sensor and the head's icon, colours and actions are the base fields it honours. */
  static override base: readonly BaseKey[] = [
    'entity',
    'icon',
    'tone',
    'color',
    'card_color',
    'card_opacity',
    'unavailable',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<ItemsCardConfig>()([
    'title',
    'subtitle',
    'attribute',
    'preset',
    ...FIELD_KEYS,
    'items_template',
    'sort',
    'sort_order',
    'max_rows',
    'variant',
    'show_count',
    'show_image',
    'item_tap',
    ...EMPTY_KEYS,
  ]);
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    attribute: 'auto',
    preset: 'auto',
    sort_order: 'ascending',
    variant: 'rows',
    max_rows: 5,
    show_count: true,
    show_image: true,
    item_tap: 'sheet',
  });
  /** The attribute's choices: the sensor's lists, after `auto`. */
  static override choices: EditorChoices = (config, hass) => {
    const lists = listAttributes(viewOf(config, hass));
    return lists.length
      ? {
          attribute: [
            { value: 'auto', label: editorWord('option.auto') },
            ...lists.map((value) => ({ value, label: value })),
          ],
        }
      : {};
  };
  static override getConfigForm(): LovelaceConfigForm {
    // the mapped fields act only where no preset draws the items
    const mapped = (data: Readonly<Record<string, unknown>>, hass?: HomeAssistant): boolean =>
      found(data, hass) === undefined;
    const notCompact = (data: Readonly<Record<string, unknown>>): boolean =>
      data['variant'] !== 'compact';
    const helper: FormHelper = (schema, _localize, data, hass) => {
      const lang = editorLanguage();
      if (schema.name === 'attribute') return s(lang, 'editor.attribute_helper');
      if (schema.name === 'items_template') return s(lang, 'editor.items_template_helper');
      if (schema.name === 'sort') return s(lang, 'editor.sort_helper');
      if (schema.name === 'preset')
        return (data?.['preset'] ?? 'auto') === 'auto'
          ? s(
              lang,
              found(data ?? {}, hass)
                ? 'editor.preset_helper_flights'
                : 'editor.preset_helper_none',
            )
          : undefined;
      return (FIELD_KEYS as readonly string[]).includes(schema.name)
        ? s(lang, 'editor.field_helper')
        : undefined;
    };
    return {
      schema: [
        entityField(['sensor']),
        titleFields(),
        fieldRow(iconField(), showIconField()),
        fieldRow(
          selectField('attribute', ['auto'], { custom: true }),
          choiceField('preset', [
            ['auto', 'option.auto'],
            ['none', 'option.none'],
            ['flights', 'items.editor.preset_flights'],
          ]),
        ),
        onlyWhen(mapped, fieldRow(textField('item_name'), textField('item_secondary'))),
        onlyWhen(mapped, fieldRow(textField('item_value'), textField('item_unit'))),
        onlyWhen(mapped, fieldRow(textField('item_icon'), textField('item_image'))),
        onlyWhen(mapped, textField('item_url')),
        textField('items_template'),
        fieldRow(
          textField('sort'),
          choiceField('sort_order', [
            ['ascending', 'items.editor.ascending'],
            ['descending', 'items.editor.descending'],
          ]),
        ),
        fieldRow(
          selectField('variant', ['rows', 'compact', 'tiles']),
          numberField('max_rows', 1, 20),
        ),
        fieldRow(boolField('show_count'), onlyWhen(notCompact, boolField('show_image'))),
        choiceField('item_tap', [
          ['sheet', 'items.editor.sheet'],
          ['none', 'option.none'],
        ]),
        ...colourFields(),
        emptyFields(),
        actionFields(),
      ],
      ...editorLabels(s, {
        attribute: 'editor.attribute',
        preset: 'editor.preset',
        item_name: 'editor.item_name',
        item_secondary: 'editor.item_secondary',
        item_value: 'editor.item_value',
        item_unit: 'editor.item_unit',
        item_icon: 'editor.item_icon',
        item_image: 'editor.item_image',
        item_url: 'editor.item_url',
        items_template: 'editor.items_template',
        sort: 'editor.sort',
        sort_order: 'editor.sort_order',
        show_image: 'editor.show_image',
        item_tap: 'editor.item_tap',
      }),
      computeHelper: helper,
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): ItemsCardConfig {
    const entity =
      entities.find((id) => /^sensor\..*flight/.test(id)) ??
      entities.find((id) => id.startsWith('sensor.')) ??
      '';
    return { type: 'custom:fluvy-items-card', entity };
  }

  /** The head's fitting and the rows' words, measured in the card's own classes. */
  private readonly headFit = new HeadFit(this);
  /** The items' template, rendered by Home Assistant and kept live. */
  private readonly texts = new TemplateTexts(this);

  override getCardSize(): number {
    return this.config ? Math.round(itemsHeight(this.config) / 50) : 8;
  }

  /* ---------- the list ---------- */

  /**
   * The list this render: the template's answer where one is asked (pending until Home Assistant speaks), else the
   * attribute's; its preset; the items sorted as asked (the preset's order where the config says nothing).
   */
  private listing(): Listing {
    const config = this.config ?? { type: '' };
    const view = this.entity();
    // a sensor out of reach — unavailable, unknown, gone — cannot say what it lists: the rows rest
    const usable = view.status === 'ok';
    const template = config.items_template;
    let pending = false;
    let attribute = '';
    let items: Item[] = [];
    if (usable && template && isTemplate(template)) {
      const line = this.texts.line(template, config.entity);
      pending = line === PENDING_LINE;
      items = pending ? [] : asItems(parseList(line));
    } else if (usable) ({ name: attribute, items } = listAttribute(view, config.attribute));
    const preset = usable ? presetOf(config, attribute, items) : this.restingPreset(view);
    if (usable && !pending) lastPreset.set(listKey(config), preset);
    const sort = config.sort ?? preset?.sort;
    const order = config.sort_order ?? preset?.order ?? 'ascending';
    return { view, usable, pending, preset, items: sortItems(items, sort, order) };
  }

  /**
   * The preset of a list out of reach, so the card keeps its anatomy and its words: the one the config asks for or
   * names (`preset`, an `attribute: flights`), else what the sensor's attributes still say, else the one the list was
   * last drawn by. Where nothing is known the card stays the plain list it would be — never a guess the words would
   * take back once the sensor answers.
   */
  private restingPreset(view: EntityView): Preset | undefined {
    const config = this.config ?? { type: '' };
    const still = listAttribute(view, config.attribute);
    return (
      presetOf(config, still.name, still.items) ??
      ((config.preset ?? 'auto') === 'auto' ? lastPreset.get(listKey(config)) : undefined)
    );
  }

  /** Items as they are drawn: by the preset, or by the config's mapping. */
  private drawn(listing: Listing, items: readonly Item[]): Drawn[] {
    const { preset } = listing;
    if (preset) return items.map((item) => ({ item, shown: preset.row(item, this.hass) }));
    const mapping = mappingOf(this.config ?? { type: '' });
    const glyph = this.glyph(preset);
    return items.map((item) => ({ item, shown: rowOf(item, mapping, this.hass, glyph) }));
  }

  /** The card's glyph: its own, else the preset's, else the list. */
  private glyph(preset: Preset | undefined): IconRef {
    return (this.config?.icon as IconRef | undefined) ?? preset?.icon ?? 'list';
  }

  /** A picture's URL as the browser fetches it: Home Assistant's own paths through `hassUrl`. */
  private picture(url: string): string {
    return url.startsWith('/') && this.hass ? this.hass.hassUrl(url) : url;
  }

  /** A row's or a tile's circle: the item's picture while it loads, else its glyph in the tone. */
  private circle(shown: Shown, tone: Tone, small = false): TemplateResult {
    const picture = this.config?.show_image === false ? '' : this.picture(shown.image);
    return picture && !this.broken_.has(picture)
      ? html`<span class="it-pic" data-icon
          ><img
            src=${picture}
            alt=""
            draggable="false"
            @error=${() => {
              this.broken_ = new Set([...this.broken_, picture]);
            }}
        /></span>`
      : ico(shown.icon, tone, { small });
  }

  /** What ends a row: its value (bare where its unit gave way), and the glyph before it where it keeps it. */
  private valueEnd(shown: Shown, { glyphs, units }: RowShare = WHOLE): number {
    const value = units ? shown.value : (shown.bare ?? shown.value);
    return value
      ? this.headFit.ruler.width('fv-row__value', value) + (glyphs && shown.glyph ? GLYPH : 0)
      : 0;
  }

  /**
   * The values every row and tile is laid out by, so that what the list holds now never decides one's anatomy: the
   * widest a preset can show ("On ground", a five-figure altitude and its arrow), else those of the whole list.
   */
  private widest(listing: Listing): readonly Shown[] {
    return listing.preset
      ? listing.preset.widest(this.hass)
      : this.drawn(listing, listing.items).map(({ shown }) => shown);
  }

  /* ---------- the sheet ---------- */

  /** What the sheet asks of the card: the item open, as it stands now, and the card's colours. */
  private readonly sheetHost: ItemsSheetHost = {
    title: () => this.heading(this.listing()),
    item: () => this.sheetItem(),
    adopt: (root) => this.accents.adopt(root),
  };

  /**
   * The item whose sheet is open, as the sheet draws it: its fields in order, its link; none once it has left the
   * list. The playground's docked sheet is the first item's.
   */
  private sheetItem(): SheetItem | undefined {
    const listing = this.listing();
    const all = this.drawn(listing, listing.items);
    const drawn = this.config?._sheet ? all[0] : all.find((one) => keyOf(one) === this.opened);
    if (!drawn) return undefined;
    const { item, shown } = drawn;
    const rows: SheetRow[] = listing.preset
      ? listing.preset.sheet(item, this.hass)
      : sheetOf(item, this.hass);
    const picture = this.config?.show_image === false ? '' : this.picture(shown.image);
    return {
      name: shown.name || s(this.hass, 'details'),
      secondary: shown.secondary,
      picture: this.broken_.has(picture) ? '' : picture,
      icon: shown.icon,
      tone: toneOf(this.config, 'accent'),
      rows,
      ...(shown.url
        ? {
            link: listing.preset
              ? { url: shown.url, label: this.t(listing.preset.link), short: s(this.hass, 'link') }
              : { url: shown.url, label: s(this.hass, 'link') },
          }
        : {}),
    };
  }

  /** An item's sheet, its chunk fetched the first time: a dashboard that only lists never pays for it. */
  private async openSheet(key: string): Promise<void> {
    const openedBy = (this.renderRoot as ShadowRoot).activeElement as HTMLElement | null;
    this.opened = key;
    if (!this.sheetReady_) {
      await import('./sheet/items-sheet.js');
      this.sheetReady_ = true;
    }
    await this.updateComplete;
    this.renderRoot.querySelector<FluvyItemsSheet>('fluvy-items-sheet')?.open(openedBy ?? this);
  }

  /** The playground's docked sheet (`_sheet`), opened once its chunk is here. */
  private demo = false;

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    if (this.config?._sheet && !this.demo) {
      this.demo = true;
      void import('./sheet/items-sheet.js').then(async () => {
        this.sheetReady_ = true;
        await this.updateComplete;
        this.renderRoot.querySelector<FluvyItemsSheet>('fluvy-items-sheet')?.open();
      });
    }
  }

  /* ---------- render ---------- */

  /** The head's title: the card's, else the preset's, else the sensor's name. */
  private heading(listing: Listing): string {
    return (
      this.config?.title ?? (listing.preset ? this.t(listing.preset.title) : listing.view.name)
    );
  }

  /** The head's line: the count from the sensor's state (the whole list's length where the state is no number). */
  private count(listing: Listing): string {
    if (this.config?.show_count === false) return '';
    const n = listing.view.number ?? listing.items.length;
    return plural(this.hass, listing.preset?.count ?? 'items.count', n);
  }

  /**
   * A row an item (60), or a compact one (48, the name and the value); out of reach, rows of dashes at rest. Every
   * row is laid out alike, by the column and the widest value the card can show (`widest`): where that value would
   * leave a name under its least even without the circle, every value goes under its name in the line's place, and
   * the rows keep their 60; else the circles give way together where a name needs their room. A compact row without
   * its circle gives the names their room from its value, every row's together — the arrow, then the unit ("12,500"),
   * then the value goes under the name, whole again, the row keeping its 48 — until each name keeps itself (up to 96,
   * as `rowNameRoom` asks) and never less than 48: three callsigns whole in half a section.
   */
  private renderRows(
    items: readonly Drawn[],
    widest: readonly Shown[],
    compact: boolean,
    dead: boolean,
  ): TemplateResult {
    const width = this.contentWidth;
    const shown = items.map(({ shown }) => shown);
    const ends = (share: RowShare): number =>
      Math.max(0, ...[...shown, ...widest].map((one) => this.valueEnd(one, share)));
    const end = ends(WHOLE);
    const stack = !compact && this.headFit.rowRoom(width, '', { icon: false, end }) < ROW_NAME_MIN;
    const keepIcon =
      !stack &&
      this.headFit.rowsKeepIcon(
        width,
        shown.map((one) => ({
          title: one.name,
          value: one.value,
          end,
          sub: compact ? '' : (one.secondary.split(' · ')[0] ?? ''),
        })),
        compact,
      );
    const room = this.headFit.rowRoom(width, '', { icon: keepIcon, compact, end });
    const least = Math.max(NAME_MIN, ...shown.map((one) => this.headFit.rowNameRoom(one.name)));
    const share =
      compact && !keepIcon
        ? (GIVING.find(
            (one) =>
              this.headFit.rowRoom(width, '', { icon: false, compact, end: ends(one) }) >= least,
          ) ?? UNDER)
        : WHOLE;
    const taps = !dead && this.config?.item_tap !== 'none';
    return html`${shown.map((one, i) =>
      listRow({
        icon: keepIcon ? (compact ? one.icon : this.circle(one, dead ? 'off' : 'neutral')) : null,
        tone: dead ? 'off' : 'neutral',
        title: one.name,
        name: true,
        sub: compact || stack ? '' : this.headFit.fitRowSub(one.secondary, room),
        trailing: 'value',
        value: share.units ? one.value : (one.bare ?? one.value),
        valueGlyph: share.glyphs ? one.glyph : undefined,
        ...(one.quiet ? { quiet: true } : {}),
        compact,
        stack: stack || share.under,
        unavailable: dead,
        onTap: taps ? () => void this.openSheet(keyOf(items[i]!)) : undefined,
      }),
    )}`;
  }

  /** The tiles a row: two from a 288 content column (a phone's card), one under it. */
  private get tileColumns(): number {
    return this.contentWidth >= TWO_TILES ? 2 : 1;
  }

  /** A tile's words' room: half the column less the gap, or all of it, less the tile's sides. */
  private get tileRoom(): number {
    return (
      (this.tileColumns === 2 ? (this.contentWidth - TILE_GAP) / 2 : this.contentWidth) - TILE_SIDES
    );
  }

  /**
   * How the tiles share their room, every tile's together: the circle where each name keeps its least beside it and
   * each value the card can show (`widest` among them) or its line's first segment holds whole — the value's arrow
   * giving way first; where not even then, the circle gives its room to the words and the arrows are back.
   */
  private tileLayout(items: readonly Shown[]): TileLayout {
    const ruler = this.headFit.ruler;
    const holds = ({ circles, glyphs }: TileLayout): boolean => {
      const room = this.tileRoom - (circles ? CIRCLE : 0);
      return items.every(
        (shown) =>
          room >= Math.min(NAME_MIN, ruler.width(TILE_NAME, shown.name)) &&
          room >=
            (shown.value
              ? ruler.width(TILE_STATE, shown.value) + (glyphs && shown.glyph ? GLYPH : 0)
              : ruler.width(TILE_STATE, shown.secondary.split(' · ')[0] ?? '')),
      );
    };
    const layouts: readonly TileLayout[] = [
      { circles: true, glyphs: true },
      { circles: true, glyphs: false },
      { circles: false, glyphs: true },
    ];
    return layouts.find(holds) ?? { circles: false, glyphs: false };
  }

  /**
   * A tile an item (76): its circle, its name over its value (its line where it has no value, its segments giving way
   * from the end); two a row from 288. The tiles share their room as `tileLayout` says: in half a section the words
   * take the whole tile, as a compact tile squeezed gives its name the circle's room.
   */
  private renderTiles(
    items: readonly Drawn[],
    widest: readonly Shown[],
    dead: boolean,
  ): TemplateResult {
    const taps = !dead && this.config?.item_tap !== 'none';
    const { circles, glyphs } = this.tileLayout([...items.map(({ shown }) => shown), ...widest]);
    const room = this.tileRoom - (circles ? CIRCLE : 0);
    return html`${items.map((one) => {
      const { shown } = one;
      const tap = taps ? (): void => void this.openSheet(keyOf(one)) : undefined;
      const state =
        shown.value || fitSegments(this.headFit.ruler, TILE_STATE, shown.secondary, room);
      return html`<article
        class="fv-tile fv-tile--compact fv-tile--inner it-tile ${tap ? 'fv-tile--tap' : ''} ${
          dead ? 'is-unavailable fv-tile--off' : ''
        }"
        role=${tap ? 'button' : nothing}
        tabindex=${tap ? 0 : nothing}
        aria-label=${[shown.name, shown.value || shown.secondary].filter(Boolean).join(' · ')}
        .fvTap=${tap}
        @pointerdown=${tap ? startPress : nothing}
        @click=${tap ? clickPress : nothing}
        @keydown=${activateKey(tap)}
      >
        ${circles ? this.circle(shown, dead ? 'off' : 'neutral') : nothing}
        <div class="fv-tile__text">
          <h3 class="fv-tile__name" data-name>${shown.name}</h3>
          <p class="fv-tile__state">
            ${glyphs && shown.glyph && shown.value ? icon(shown.glyph) : nothing}${state}
          </p>
        </div>
      </article>`;
    })}`;
  }

  /**
   * The empty panel's height as its words lay out across the card: its ring, the 8 under it and its lines of 20 within
   * its 16s, 120 at least — a German "Keine Flugzeuge in der Nähe" takes four lines in half a section. A box shorter
   * than that holds the words alone.
   */
  private panelHeight(text: string): number {
    const width = this.contentWidth - PANEL_SIDES;
    const measure = (words: string): number =>
      this.headFit.ruler.width('fv-empty-state__text', words);
    const lines = lineCount(text, width, measure);
    // words that break anywhere (Japanese) fill their lines
    const count = Number.isFinite(lines) ? lines : Math.ceil(measure(text) / width);
    return Math.max(EMPTY, PANEL_SIDES + PANEL_RING + PANEL_LINE * count);
  }

  /** Out of reach, the card keeps its rows: dashes in the resting rings, as many as it declares. */
  private resting(listing: Listing): Drawn[] {
    const glyph = this.glyph(listing.preset);
    const shown: Shown = { name: '—', secondary: '', value: '—', icon: glyph, image: '', url: '' };
    return Array.from({ length: maxRows(this.config ?? { type: '' }) }, () => ({
      item: {},
      shown,
    }));
  }

  protected renderCard(): TemplateResult {
    const config = this.config;
    if (config?._sheet)
      return html`<fluvy-items-sheet
        docked
        ?dark=${this.dark}
        ?no-theme=${this.noTheme}
        .hass=${this.hass}
        .card=${this.sheetHost}
      ></fluvy-items-sheet>`;
    const listing = this.listing();
    const dead = !listing.usable;
    const items = dead
      ? this.resting(listing)
      : this.drawn(listing, listing.items.slice(0, maxRows(config ?? { type: '' })));
    const empty = !dead && !listing.pending && !items.length;
    const emptyKey = listing.preset?.empty ?? 'items.empty';
    const panel = emptyPanel(this, empty, this.glyph(listing.preset), emptyKey);
    const sub = dead
      ? stateText(this.hass, listing.view)
      : (config?.subtitle ?? this.count(listing));
    const fit = (title: string): FittedHead =>
      this.headFit.fit({ width: this.contentWidth, title, sub, shorter: [''] });
    let title = this.heading(listing);
    let fitted = fit(title);
    // the preset's title is the card's own words, not a name: where even the circle's room would leave it cut, its
    // short form ("Flüge in der Nähe" → "Flüge"); a title of the person's own keeps a name's ellipsis
    if (fitted.cut && config?.title === undefined && listing.preset) {
      title = this.t(listing.preset.short);
      fitted = fit(title);
    }
    const variant = config?.variant ?? 'rows';
    const tiles = variant === 'tiles';
    // the box the config declares at this column, whatever the list holds: its tiles' rows as many a row as it lays
    const min = itemsList(config ?? { type: '' }, this.tileColumns);
    const widest = this.widest(listing);
    const tall = panel ? this.panelHeight(config?.empty_text ?? localize(this.hass, emptyKey)) : 0;
    const short = panel !== undefined && min < tall;
    const inset = panel && !short ? Math.floor((min - tall) / 8) * 4 : 0;
    return html`<article class="fv-card ${dead ? 'is-unavailable' : ''}" data-card>
      ${head({
        icon: fitted.icon ? this.glyph(listing.preset) : null,
        small: fitted.small,
        tone: dead ? 'off' : toneOf(config, 'accent'),
        title,
        name: config?.title !== undefined || !listing.preset,
        sub: fitted.sub,
        cut: fitted.cut,
        ...this.headActions(),
      })}
      <div
        class="it-list ${tiles && !panel ? 'it-tiles' : ''} ${panel ? 'is-empty' : ''} ${short ? 'is-short' : ''}"
        style="--it-min:${min}px;--it-inset:${inset}px;--it-cols:${this.tileColumns}"
      >
        ${panel ?? (tiles ? this.renderTiles(items, widest, dead) : this.renderRows(items, widest, variant === 'compact', dead))}
      </div>
      ${
        this.sheetReady_
          ? html`<fluvy-items-sheet
              ?dark=${this.dark}
              ?no-theme=${this.noTheme}
              .hass=${this.hass}
              .card=${this.sheetHost}
            ></fluvy-items-sheet>`
          : nothing
      }
    </article>`;
  }
}

/** A template's answer as the list it gives: JSON, else nothing listed. */
function parseList(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return [];
  }
}

/** The sensor the editor's form reads, from what it holds. */
const viewOf = (
  config: Readonly<Record<string, unknown>>,
  hass: HomeAssistant | undefined,
): EntityView =>
  resolveEntity(hass, typeof config['entity'] === 'string' ? config['entity'] : undefined);

/** The preset the editor's form would draw by: what `auto` finds on the sensor picked. */
function found(data: Readonly<Record<string, unknown>>, hass?: HomeAssistant): Preset | undefined {
  const attribute = typeof data['attribute'] === 'string' ? data['attribute'] : undefined;
  const { name, items } = listAttribute(viewOf(data, hass), attribute);
  return presetOf(data, name, items);
}
