import {
  actionRuns,
  areaEntities,
  areaOf,
  haptic,
  isUsable,
  strings,
  type ActionConfig,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { glyph, head, icon, listRow, pressCover, round, sheetStyles, type Tone } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';

import { CAMERA_RATIOS, camerasHeight, cameraRatio, plateHeight } from '../devices-family.js';
import { HeadFit } from '../energy/head.js';
import { DETAILS } from '../lock/rows.js';
import { Card, type BaseKey, type HeadConfig } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import {
  columnsOf,
  configKeys,
  ITEM_ALIASES,
  type AliasSpec,
  type Columns,
} from '../shared/config.js';
import { iconOf } from '../shared/domain.js';
import {
  accentField,
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  listed,
  nameIconFields,
  numberField,
  onlyWhen,
  selectField,
  showIconField,
  titleFields,
  toneField,
} from '../shared/form.js';
import { EMPTY_KEYS, hideEmpty, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { CameraFeed } from './feed.js';
import { plateLayout, plateStyles, renderPlate } from './plate.js';
import type { CamerasSheetHost, FluvyCamerasSheet } from './sheet/cameras-sheet.js';
import {
  cameraRowStyles,
  cameraStatus,
  fitLines,
  motionSensor,
  renderStatus,
  stateLine,
  STATUS_GLYPH,
  statusWords,
  streamLine,
  type CameraStatus,
  type StatusLine,
} from './status.js';

const s = strings('cameras');
const c = strings('camera');

export type CamerasVariant = 'grid' | 'list' | 'compact';

/** A camera of the card: its entity, and the name, icon, line, picture, colours and actions it is shown with. */
export interface CameraItem {
  readonly entity: string;
  readonly name?: string;
  readonly icon?: string;
  /** The motion sensor its line reads (default: the one on the camera's device). */
  readonly motion?: string;
  readonly status?: CameraStatus;
  readonly camera_view?: 'auto' | 'live';
  readonly refresh?: number;
  /** The whole picture (`contain`) in the card's shape, or the shape filled (`cover`, the card's default). */
  readonly fit_mode?: 'cover' | 'contain';
  /** The circle's tone and colour while it sees someone (neutral where it asks neither). */
  readonly tone?: Tone;
  readonly color?: string;
  /** What a tap on its picture does (default: its details); a still press, where it says. */
  readonly tap_action?: ActionConfig;
  readonly hold_action?: ActionConfig;
}

export interface CamerasCardConfig extends FluvyCardConfig, HeadConfig, EmptyList {
  title?: string;
  subtitle?: string;
  /** The cameras, in order: ids, or entries with options of their own (`entities` reads too). */
  cameras?: ReadonlyArray<string | CameraItem>;
  /** Where the card lists none: the cameras of this area. */
  area?: string;
  /** `grid` (the default): pictures with their names and lines; `list`: a row each; `compact`: the pictures alone. */
  variant?: CamerasVariant;
  /** Tiles a row: `auto` (one under 320, two from 320, up to four on a wide band), or a count. */
  columns?: Columns;
  /** `live`: Home Assistant's stream in the first `max_live` pictures, the rest stills. */
  camera_view?: 'auto' | 'live';
  /** How many pictures stream at once (0–12, default 4). */
  max_live?: number;
  /** Seconds between two stills (0.5–300, default 10). */
  refresh?: number;
  /** Every picture's shape, so that a row of tiles is level (`native`: each camera's own, a row its tallest). */
  aspect_ratio?: string;
  fit_mode?: 'cover' | 'contain';
  /** What every camera's line says, where its own does not. */
  status?: CameraStatus;
  show_status?: boolean;
  show_live?: boolean;
  show_fullscreen?: boolean;
  /** Test hook: the cameras' sheet docked in the card's place (the playground). Undocumented. */
  _sheet?: boolean;
}

/** A tile at its least: a count of tiles a row asked for (`columns: 3`) holds fewer than would come under it. */
export const TILE_MIN = 120;

/**
 * How many tiles a row holds at content width `width`, for `n` cameras: `auto` one under 320, else as many tiles of
 * 240 as fit, two to four, never more than it has cameras; the pictures alone (`compact`) as many of 96 as fit, up to
 * six, 8 apart; a count asked for, held where its tiles would come under their least (64 for the pictures alone). The
 * declared height counts the same at its 320 (`camerasHeight`).
 */
export function cameraColumns(config: CamerasCardConfig, n: number, width: number): number {
  const compact = config.variant === 'compact';
  const gap = compact ? 8 : 16;
  const fit = (least: number): number => Math.max(1, Math.floor((width + gap) / (least + gap)));
  const asked = columnsOf(config.columns, 'auto');
  if (asked !== 'auto') return Math.min(asked, fit(compact ? 64 : TILE_MIN));
  const most = compact
    ? Math.min(6, fit(96))
    : width < 320
      ? 1
      : Math.min(4, Math.max(2, fit(240)));
  return Math.max(1, Math.min(most, n));
}

/** Seconds between two stills, half a second to five minutes (one request at a time all the same). */
const seconds = (value: unknown, fallback: number): number =>
  Math.min(300, Math.max(0.5, Number(value) || fallback));

/** A camera tile's least name beside its circle, as a row's (96, or the name itself when shorter). */
const NAME_MIN = 96;
/** The circle (44) and its gap; the head's round (44) and the gap before it. */
const CIRCLE = 56;
const ROUND = 56;
/** A list row's thumbnail (80) and its gap; its chevron (44) and the gap before it. */
const THUMB = 92;
const CHEVRON = 56;

/** One camera as the card draws it now. */
interface Shown {
  readonly item: CameraItem;
  readonly view: EntityView;
  readonly name: string;
  readonly line: StatusLine | null;
  /** Every word its line may say as it is drawn: the longest decides its room. */
  readonly words: readonly string[];
}

/**
 * Several cameras at a glance (#60): each a tile of its picture in its shape — "Live" at its top start, full screen at
 * its bottom end — over its circle, its name and its line (motion seen, none, online, offline); or a row each with a
 * thumbnail (`list`), or the pictures alone with their names (`compact`). Each picture is a feed of its own
 * (`feed.ts`): stills while it is on screen, or Home Assistant's stream in the first `max_live` of a live card. The
 * head's round opens the cameras' sheet: every camera with its line, and a switch that shows them all live for now.
 */
export class FluvyCamerasCard extends Card<CamerasCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: CamerasCardConfig): number {
    return camerasHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.devices,
    plateStyles,
    cameraRowStyles,
    css`
      .dv-card {
        width: auto;
      }
      .cm-grid,
      .cm-list {
        margin-top: 16px;
      }
      /* tiles of one width on whole pixels, 16 apart (8 for the pictures alone): what a third leaves is under a pixel */
      .cm-grid {
        --cm-gap: 16px;
        display: grid;
        grid-template-columns: repeat(
          var(--cm-columns, 2),
          round(
            down,
            calc((100% - (var(--cm-columns, 2) - 1) * var(--cm-gap)) / var(--cm-columns, 2)),
            1px
          )
        );
        align-items: start;
        gap: var(--cm-gap);
      }
      .cm-grid--compact {
        --cm-gap: 8px;
      }
      .cm-tile {
        position: relative;
        min-width: 0;
        border-radius: var(--fluvy-radius-control);
      }
      .cm-tile .dv-cam {
        margin-top: 0;
      }
      /* a camera's button over its tile (or its row): over its picture's frames, under "Live" and its round */
      .cm-tile > .fv-tile__tap,
      .cm-row > .fv-tile__tap {
        z-index: 3;
      }
      .cm-under {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 44px;
        margin-top: 16px;
        min-width: 0;
      }
      .cm-under > .fv-ico {
        flex: none;
      }
      .cm-under .fv-row__text {
        flex: 1 1 auto;
        min-width: 0;
      }
      .cm-caption {
        display: block;
        margin-top: 8px;
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cm-thumb .fv-skeleton {
        position: absolute;
        inset: 0;
        border-radius: 0;
      }
      .cm-row .fv-row__chevron {
        position: relative;
        pointer-events: none;
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    fullscreen_: { state: true },
    live_: { state: true },
    sheetReady_: { state: true },
  };
  /** The tile whose picture fills the screen, by its place; -1 for none. */
  declare fullscreen_: number;
  /** The sheet's switch: every camera live (or none) for now, whatever the config says; undefined: as it says. */
  declare live_: boolean | undefined;
  /** The sheet's chunk has landed. */
  declare sheetReady_: boolean;

  constructor() {
    super();
    this.fullscreen_ = -1;
    this.live_ = undefined;
    this.sheetReady_ = false;
  }

  /** The cameras have no entity of their own: the head's icon, the card's colours and actions are its base. */
  static override base: readonly BaseKey[] = [
    'entities',
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<CamerasCardConfig>()([
    'title',
    'subtitle',
    'cameras',
    'area',
    'variant',
    'columns',
    'camera_view',
    'max_live',
    'refresh',
    'aspect_ratio',
    'fit_mode',
    'status',
    'show_status',
    'show_live',
    'show_fullscreen',
    ...EMPTY_KEYS,
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'cameras',
      alias: 'entities',
      title: 'cameras.title',
      domains: ['camera'],
      keys: [
        'entity',
        'name',
        'icon',
        'motion',
        'status',
        'camera_view',
        'refresh',
        'fit_mode',
        'tone',
        'color',
        'tap_action',
        'hold_action',
      ],
      schema: [
        entityField(['camera']),
        nameIconFields(),
        fieldRow(
          entityField(['binary_sensor'], 'motion', false),
          selectField('status', ['auto', 'motion', 'state', 'none']),
        ),
        fieldRow(
          selectField('camera_view', ['auto', 'live']),
          numberField('refresh', 0.5, 300, 0.5),
        ),
        selectField('fit_mode', ['cover', 'contain']),
        fieldRow(toneField(), accentField('color', { item: 'own' })),
        actionFields(),
      ],
    },
  ];
  static override aliases: AliasSpec = { items: { cameras: ITEM_ALIASES } };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'grid',
    columns: 'auto',
    camera_view: 'auto',
    max_live: 4,
    refresh: 10,
    aspect_ratio: '16:9',
    fit_mode: 'cover',
    status: 'auto',
    show_status: true,
    show_live: true,
    show_fullscreen: true,
  });
  static override getConfigForm(): LovelaceConfigForm {
    const variant = (data: Readonly<Record<string, unknown>>): unknown => data['variant'];
    return {
      schema: [
        titleFields(),
        fieldRow(iconField(), showIconField()),
        { name: 'area', selector: { area: {} } },
        entitiesField('entities', ['camera']),
        fieldRow(
          selectField('variant', ['grid', 'list', 'compact']),
          onlyWhen(
            (data) => variant(data) !== 'list',
            selectField('columns', ['auto', '1', '2', '3', '4']),
          ),
        ),
        fieldRow(
          selectField('camera_view', ['auto', 'live']),
          // how many stream at once, only where some do: the card's own, or a camera's
          onlyWhen(
            (data) =>
              data['camera_view'] === 'live' ||
              listed(data, 'cameras', 'entities').some(
                (entry) => (entry as CameraItem | null)?.camera_view === 'live',
              ),
            numberField('max_live', 0, 12),
          ),
        ),
        numberField('refresh', 0.5, 300, 0.5),
        onlyWhen(
          (data) => variant(data) !== 'list',
          fieldRow(
            selectField('aspect_ratio', CAMERA_RATIOS, { custom: true }),
            selectField('fit_mode', ['cover', 'contain']),
          ),
        ),
        onlyWhen(
          (data) => variant(data) !== 'compact',
          fieldRow(
            boolField('show_status'),
            onlyWhen(
              (data) => data['show_status'] !== false,
              selectField('status', ['auto', 'motion', 'state', 'none']),
            ),
          ),
        ),
        fieldRow(
          boolField('show_live'),
          onlyWhen(
            (data) => variant(data) !== 'list' && variant(data) !== 'compact',
            boolField('show_fullscreen'),
          ),
        ),
        ...colourFields(),
        emptyFields(),
        actionFields(),
      ],
      ...editorLabels(
        s,
        {
          motion: 'editor_motion',
          status: 'editor_status',
          show_status: 'editor_show_status',
          max_live: 'editor_max_live',
          show_live: 'editor_show_live',
          show_fullscreen: 'editor_show_fullscreen',
        },
        { refresh: 'camera.refresh' },
      ),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): CamerasCardConfig {
    return {
      type: 'custom:fluvy-cameras-card',
      cameras: entities.filter((id) => id.startsWith('camera.')).slice(0, 4),
    };
  }

  /** The head's fitting and the tiles' words, measured in the card's own classes. */
  private readonly headFit = new HeadFit(this);
  /** One feed a place: the picture of the camera there (a place left empty fetches nothing). */
  private readonly feeds: CameraFeed[] = [];

  protected override prepare(config: CamerasCardConfig): CamerasCardConfig {
    listOf(config, 'cameras', ['entities']);
    return { ...config, refresh: seconds(config.refresh, 10) };
  }

  /** The cameras it shows: those it lists, else its area's. */
  private items(): CameraItem[] {
    const listed = itemsOf<CameraItem>(
      listOf(this.config ?? { type: '' }, 'cameras', ['entities']),
    );
    const area = this.config?.area;
    return listed.length || !area || !this.hass
      ? listed
      : areaEntities(this.hass, area, { domains: ['camera'] }).map((entity) => ({ entity }));
  }

  /** What a camera's line reads: its own say, else the card's; none where the card hides the lines. */
  private mode(item: CameraItem): CameraStatus {
    if (this.config?.show_status === false || this.config?.variant === 'compact') return 'none';
    return item.status ?? this.config?.status ?? 'auto';
  }

  protected override watched(): readonly string[] {
    return this.items().flatMap((item) => {
      const sensor = motionSensor(this.hass, item.entity, this.mode(item), item.motion);
      return sensor ? [item.entity, sensor] : [item.entity];
    });
  }

  override getCardSize(): number {
    return this.config ? Math.round(camerasHeight(this.config) / 50) : 6;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /* ---------- the pictures ---------- */

  /**
   * The places that stream: the first `max_live` of the cameras a live card (or a live camera) shows, or of every
   * camera while the sheet's switch says so; none while it says not.
   */
  private streaming(items: readonly CameraItem[]): ReadonlySet<number> {
    const most = this.mostLive();
    const live = items
      .map((item, i) => ({
        i,
        live: this.live_ ?? (item.camera_view ?? this.config?.camera_view) === 'live',
      }))
      .filter(({ live }) => live)
      .slice(0, most)
      .map(({ i }) => i);
    return new Set(live);
  }

  /** How many pictures may stream at once: `max_live`, 0 to 12; four by default, and where it is no number. */
  private mostLive(): number {
    const asked = Number(this.config?.max_live ?? 4);
    return Number.isFinite(asked) ? Math.min(12, Math.max(0, Math.round(asked))) : 4;
  }

  /** A tile's width in this column (a thumbnail's in `list`): what a still is asked at. */
  private tileWidth(n: number): number {
    if (!this.config || this.config.variant === 'list') return 80;
    const columns = cameraColumns(this.config, n, this.contentWidth);
    const gap = this.config.variant === 'compact' ? 8 : 16;
    return Math.floor((this.contentWidth - gap * (columns - 1)) / columns);
  }

  /** The feed at place `i`, made the first time a camera stands there. */
  private feed(i: number): CameraFeed {
    return (this.feeds[i] ??= new CameraFeed(
      this,
      () => {
        const items = this.items();
        const item = items[i];
        return {
          hass: this.hass,
          view: item ? this.entity(item.entity) : null,
          live: item !== undefined && this.streaming(items).has(i),
          refresh: seconds(item?.refresh, this.config?.refresh ?? 10),
          native: this.config?.aspect_ratio === 'native',
          // the screen's width in full screen: as sharp as the picture is wide
          width:
            this.fullscreen_ === i
              ? Math.max(screen.width, screen.height)
              : this.tileWidth(items.length),
        };
      },
      () => this.renderRoot.querySelector(`[data-feed="${i}"]`),
    ));
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    // a feed for every camera the card shows, before it is drawn
    const n = this.items().length;
    for (let i = this.feeds.length; i < n; i++) this.feed(i);
  }

  /* ---------- full screen ---------- */

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('fullscreenchange', this.onFullscreen);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('fullscreenchange', this.onFullscreen);
  }

  /** Full screen entered or left (by the round, Esc or the system): the round follows, the still is asked again. */
  private readonly onFullscreen = (): void => {
    const shown = this.renderRoot instanceof ShadowRoot ? this.renderRoot.fullscreenElement : null;
    const place = shown?.closest('[data-cam]')?.getAttribute('data-cam');
    this.fullscreen_ = place ? Number(place) : -1;
    for (const feed of this.feeds) feed.resized();
  };

  private fullscreen(i: number, item: CameraItem): void {
    haptic(this, 'light');
    if (this.renderRoot instanceof ShadowRoot && this.renderRoot.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const plate = this.renderRoot.querySelector<HTMLElement>(`[data-cam="${i}"] .dv-cam`);
    if (!plate || typeof plate.requestFullscreen !== 'function') {
      this.tap(item.entity, DETAILS);
      return;
    } // iPhone: Home Assistant's dialog has the player
    plate.requestFullscreen().catch(() => this.tap(item.entity, DETAILS));
  }

  /* ---------- the head's round and the sheet ---------- */

  /** The head's round: the card's own hold where it runs, else the cameras' sheet. */
  private more(): void {
    if (actionRuns(this.config?.hold_action)) this.hold(undefined);
    else void this.openSheet();
  }

  /** What the round says: "All cameras" for the sheet; "More", as every card's round, for the card's own hold. */
  private moreLabel(): string {
    return actionRuns(this.config?.hold_action) ? this.t('common.more') : s(this.hass, 'all');
  }

  /** The sheet, its chunk fetched the first time: a dashboard that only shows its cameras never pays for it. */
  private async openSheet(): Promise<void> {
    const openedBy = (this.renderRoot as ShadowRoot).activeElement as HTMLElement | null;
    if (!this.sheetReady_) {
      await import('./sheet/cameras-sheet.js');
      this.sheetReady_ = true;
    }
    await this.updateComplete;
    this.renderRoot.querySelector<FluvyCamerasSheet>('fluvy-cameras-sheet')?.open(openedBy ?? this);
  }

  /** What the sheet asks of the card: its cameras as it draws them, the switch, the details, its colours. */
  private readonly sheetHost: CamerasSheetHost = {
    title: () => this.config?.title ?? s(this.hass, 'title'),
    cameras: () => {
      const items = this.items();
      return this.shown(items).map(({ item, view, name, line }, i) => ({
        entity: item.entity,
        name,
        line,
        usable: isUsable(view),
        live: this.streaming(items).has(i),
        frame:
          this.renderRoot
            .querySelector(`[data-feed="${i}"] .fv-plate__img.is-on`)
            ?.getAttribute('src') ?? this.still(view),
      }));
    },
    live: () => this.streaming(this.items()).size > 0,
    liveable: () => this.mostLive() > 0,
    setLive: (on) => {
      this.live_ = on;
    },
    open: (entity) => this.tap(entity, DETAILS),
    adopt: (root) => this.accents.adopt(root),
  };

  /** A camera's still at a thumbnail's width, for a picture the card does not fetch (it streams). */
  private still(view: EntityView): string {
    const picture = view.status === 'ok' ? view.attr<string | null>('entity_picture') : null;
    if (!picture || !this.hass) return '';
    const base = this.hass.hassUrl(picture);
    return base.startsWith('data:')
      ? base
      : `${base}${base.includes('?') ? '&' : '?'}width=${Math.ceil(80 * (window.devicePixelRatio || 1))}`;
  }

  /** The playground's docked sheet (`_sheet`), opened once its chunk is here. */
  private demo = false;

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    if (this.config?._sheet && !this.demo) {
      this.demo = true;
      void import('./sheet/cameras-sheet.js').then(async () => {
        this.sheetReady_ = true;
        await this.updateComplete;
        this.renderRoot.querySelector<FluvyCamerasSheet>('fluvy-cameras-sheet')?.open();
      });
    }
  }

  /* ---------- render ---------- */

  /**
   * Each camera as it is drawn: its view, its name, its line and the words that line may say. A live picture whose
   * stream cannot play says so on its line, in place of what it would say: "Live" folds to its dot on a narrow tile.
   */
  private shown(items: readonly CameraItem[]): Shown[] {
    const live = this.streaming(items);
    return items.map((item, i) => {
      const view = this.entity(item.entity);
      const mode = this.mode(item);
      const said = cameraStatus(this.hass, view, mode, item.motion);
      const sensor =
        view.status === 'ok' ? motionSensor(this.hass, view.id, mode, item.motion) : undefined;
      return {
        item,
        view,
        name: item.name ?? view.name,
        line: said && isUsable(view) && this.feed(i).unplayable ? streamLine(this.hass) : said,
        words: statusWords(this.hass, said, sensor, live.has(i)),
      };
    });
  }

  /**
   * A camera's circle: its own icon, the one set for it, its area's, its glyph; `ban` out of reach. Neutral, as the
   * mockup draws it (the line's glyph and words say motion); in the camera's own tone or colour while it sees someone,
   * where it asks one.
   */
  private circle({ item, view, line }: Shown): TemplateResult {
    const area = this.hass?.areas?.[areaOf(this.hass, view.id) ?? '']?.icon ?? undefined;
    const usable = isUsable(view);
    const tone: Tone = !usable ? 'off' : line?.motion ? toneOf(item, 'neutral') : 'neutral';
    return html`<span
      class="fv-ico fv-ico--${tone}"
      data-icon
      data-accent=${line?.motion ? (this.accents.item(item.color) ?? nothing) : nothing}
      >${icon(usable ? iconOf(view, item.icon ?? view.registryIcon ?? area) : 'ban')}</span
    >`;
  }

  /** How the cameras' lines are drawn in `room` (`fitLines`), measured in the card's own classes. */
  private lines(shown: readonly Shown[], room: number): (line: StatusLine) => TemplateResult {
    const fit = fitLines(
      shown.map(({ words }) => words),
      room,
      (text) => this.headFit.ruler.width('fv-row__sub', text),
    );
    return (line) => renderStatus(line, fit(line));
  }

  /** What a press on a camera does: its tap (its details by default) and its hold where it has one. */
  private press(shown: Shown, label: string): TemplateResult {
    const { item, view } = shown;
    return pressCover(
      label,
      () => this.tap(view.id, item.tap_action ?? DETAILS),
      actionRuns(item.hold_action, view.id)
        ? () => this.hold(view.id, item.hold_action)
        : undefined,
    );
  }

  /**
   * Each place's shape: the card's for every tile; `native`, the tallest of its row's own (a camera's until its first
   * frame says, 16:9), so a row of tiles is level — a portrait doorbell beside a 16:9 camera gives the row its shape,
   * each picture filling it or held whole in it (`fit_mode`).
   */
  private shapes(n: number, columns: number): number[] {
    const own = Array.from({ length: n }, (_, i) =>
      cameraRatio(this.config?.aspect_ratio, this.feed(i).native),
    );
    return own.map((_, i) => {
      const start = i - (i % columns);
      return Math.min(...own.slice(start, start + columns));
    });
  }

  /** A camera's plate at a tile's width in its row's shape: its feed's picture, "Live", its round. */
  private plate(
    i: number,
    shown: Shown,
    width: number,
    ratio: number,
    rounds: boolean,
  ): TemplateResult {
    const { item, view } = shown;
    const feed = this.feed(i);
    const config = this.config;
    const height = plateHeight(width, ratio);
    const unusable = view.status !== 'ok';
    const off =
      unusable || (!feed.streaming && (feed.failed || !view.attr<string | null>('entity_picture')));
    // out of reach, the word its line says; reachable with no picture, why
    const offText = unusable ? stateLine(this.hass, view).text : c(this.hass, 'offline');
    // why, on one line or two across the plate where they hold its height; else the glyph alone, the tile's line
    // saying it
    const offLines = this.headFit.ruler.width('dv-cam__off p', offText) > width - 32 ? 2 : 1;
    const liveText = c(this.hass, feed.unplayable ? 'stream_failed' : 'live');
    const showLive = config?.show_live !== false;
    return renderPlate({
      feed,
      height,
      ratio,
      layout: plateLayout(
        width,
        height,
        showLive ? this.headFit.ruler.width('dv-cam__pill dv-cam__live', liveText) : 0,
        rounds ? 1 : 0,
      ),
      live: showLive ? liveText : undefined,
      off: off ? { text: offText, lines: height >= 52 + 24 * offLines ? offLines : 0 } : undefined,
      contain: (item.fit_mode ?? config?.fit_mode) === 'contain',
      quick: seconds(item.refresh, config?.refresh ?? 10) < 1,
      fullscreen: this.fullscreen_ === i,
      screen: rounds
        ? {
            enter: c(this.hass, 'fullscreen'),
            leave: c(this.hass, 'exit_fullscreen'),
            run: () => this.fullscreen(i, item),
          }
        : undefined,
    });
  }

  /**
   * The tiles: each its plate, then its circle, its name and its line. What gives way, every tile's together: first
   * the lines' glyphs (16, the line's words say it), so that the circles — the icons people choose for their cameras —
   * stand at more widths; then the circles, where a name would get less than its least or a line (the longest it may
   * say) would not hold whole beside one, the lines taking their glyphs back where they then hold; a line that still
   * would not hold says its glyph alone.
   */
  private renderGrid(shown: readonly Shown[], columns: number, width: number): TemplateResult {
    const rounds = this.config?.show_fullscreen !== false;
    const ruler = this.headFit.ruler;
    const keep = shown.every(
      ({ name, words }) =>
        width - CIRCLE >= Math.min(NAME_MIN, ruler.width('fv-row__title', name)) &&
        words.every((text) => width - CIRCLE >= ruler.width('fv-row__sub', text)),
    );
    const status = this.lines(shown, width - (keep ? CIRCLE : 0));
    const shapes = this.shapes(shown.length, columns);
    return html`<div class="cm-grid" data-fill-row style="--cm-columns:${columns}">
      ${shown.map(
        (one, i) =>
          html`<div class="cm-tile" data-cam=${i}>
            <div data-feed=${i}>${this.plate(i, one, width, shapes[i]!, rounds)}</div>
            <div class="cm-under">
              ${keep ? this.circle(one) : nothing}
              <span class="fv-row__text"
                ><span class="fv-row__title" data-name>${one.name}</span>${
                  one.line ? status(one.line) : nothing
                }</span
              >
            </div>
            ${this.press(one, [one.name, one.line?.text].filter(Boolean).join(' · '))}
          </div>`,
      )}
    </div>`;
  }

  /** The pictures alone, each with its name under it: "Live" folds to its dot where it must, no round. */
  private renderCompact(shown: readonly Shown[], columns: number, width: number): TemplateResult {
    const shapes = this.shapes(shown.length, columns);
    return html`<div class="cm-grid cm-grid--compact" data-fill-row style="--cm-columns:${columns}">
      ${shown.map(
        (one, i) =>
          html`<div class="cm-tile" data-cam=${i}>
            <div data-feed=${i}>${this.plate(i, one, width, shapes[i]!, false)}</div>
            <span class="cm-caption" data-name>${one.name}</span>
            ${this.press(one, one.name)}
          </div>`,
      )}
    </div>`;
  }

  /**
   * A row a camera: its thumbnail with the live dot, its name over its line, a chevron. Where a name would get less than
   * its least, or a line would not hold beside its glyph, the chevron gives way, then the thumbnail — every row's
   * together; then the lines as the tiles' do.
   */
  private renderList(shown: readonly Shown[]): TemplateResult {
    const ruler = this.headFit.ruler;
    const fits = (room: number): boolean =>
      shown.every(
        ({ name, words }) =>
          room >= Math.min(NAME_MIN, ruler.width('fv-row__title', name)) &&
          words.every((text) => room >= ruler.width('fv-row__sub', text) + STATUS_GLYPH),
      );
    const width = this.contentWidth;
    const chevron = fits(width - THUMB - CHEVRON);
    const thumb = chevron || fits(width - THUMB);
    const status = this.lines(shown, width - (thumb ? THUMB : 0) - (chevron ? CHEVRON : 0));
    const dot = this.config?.show_live !== false;
    return html`<div class="cm-list">
      ${shown.map((one, i) => {
        const feed = this.feed(i);
        const off = !isUsable(one.view) || (!feed.streaming && feed.failed);
        return html`<div class="fv-row cm-row ${thumb ? '' : 'fv-row--bare'}" data-cam=${i}>
          ${
            thumb
              ? html`<span class="fv-plate cm-thumb ${off ? 'is-off' : ''}" data-feed=${i}
                  >${
                    off
                      ? glyph('camera')
                      : html`${feed.render('cover', 80 / 44, 'dv-cam__stream')}${
                          !feed.stamp && !feed.streaming
                            ? html`<span class="fv-skeleton"></span>`
                            : dot
                              ? html`<i
                                  class="cm-thumb__live ${feed.stale && !feed.streaming ? 'is-stale' : ''}"
                                ></i>`
                              : nothing
                        }`
                  }</span
                >`
              : nothing
          }
          <span class="fv-row__text"
            ><span class="fv-row__title" data-name>${one.name}</span>${
              one.line ? status(one.line) : nothing
            }</span
          >
          ${chevron ? html`<span class="fv-row__chevron">${glyph('chevron')}</span>` : nothing}
          ${this.press(one, [one.name, one.line?.text].filter(Boolean).join(' · '))}
        </div>`;
      })}
    </div>`;
  }

  /** The head's round where it could not stand beside the title: "More", its circle by the rows' rule. */
  private renderMoreRow(): TemplateResult {
    const title = this.t('common.more');
    return html`<div class="cm-list">
      ${listRow({
        icon: this.headFit.rowsKeepIcon(this.contentWidth, [{ title, value: '', end: 0 }])
          ? 'dots'
          : null,
        tone: 'neutral',
        title,
        label: this.moreLabel(),
        compact: true,
        trailing: 'none',
        onTap: () => this.more(),
      })}
    </div>`;
  }

  protected renderCard(): TemplateResult {
    const config = this.config;
    if (config?._sheet)
      return html`<fluvy-cameras-sheet
        docked
        ?dark=${this.dark}
        ?no-theme=${this.noTheme}
        .hass=${this.hass}
        .card=${this.sheetHost}
      ></fluvy-cameras-sheet>`;
    const items = this.items();
    const shown = this.shown(items);
    hideEmpty(this, !items.length);
    const title = config?.title ?? s(this.hass, 'title');
    // the head's round where the title holds whole beside it; under that (half a phone's column), the round steps to a
    // row under the cameras: a control never goes
    const roundFits =
      this.headFit.ruler.width('fv-card__title', title) <= this.contentWidth - ROUND;
    const fitted = this.headFit.fit({
      width: this.contentWidth,
      title,
      sub: config?.subtitle ?? s(this.hass, 'sub'),
      // a line that would be cut beside the round goes, as a lesser element does
      shorter: [''],
      trailing: roundFits ? 44 : 0,
    });
    // a card of many has no entity to open: its head is a button only where its tap goes somewhere
    const tap = actionRuns(config?.tap_action) ? { onTap: () => this.tap(undefined) } : {};
    // out of reach, each camera keeps its tile; the card wears the off skin only when every one is
    const gone = shown.length > 0 && shown.every(({ view }) => !isUsable(view));
    const variant = config?.variant ?? 'grid';
    const columns = config ? cameraColumns(config, items.length, this.contentWidth) : 1;
    const width = this.tileWidth(items.length);
    return html`<article class="fv-card dv-card ${gone ? 'is-unavailable' : ''}" data-card>
      ${head({
        // the mockup's security camera; the camera card keeps its own
        icon: fitted.icon ? (config?.icon ?? 'cctv') : null,
        small: fitted.small,
        tone: gone ? 'off' : toneOf(config, 'accent'),
        title,
        name: config?.title !== undefined,
        sub: fitted.sub,
        trailing: roundFits ? round('dots', 'quiet', this.moreLabel(), () => this.more()) : nothing,
        cut: fitted.cut,
        ...tap,
      })}
      ${
        !shown.length
          ? html`<div class="cm-list">
              ${this.headFit.empty(
                'camera',
                config?.empty_text ?? s(this.hass, 'empty'),
                '',
                this.contentWidth,
              )}
            </div>`
          : variant === 'list'
            ? this.renderList(shown)
            : variant === 'compact'
              ? this.renderCompact(shown, columns, width)
              : this.renderGrid(shown, columns, width)
      }
      ${roundFits ? nothing : this.renderMoreRow()}
      ${
        this.sheetReady_
          ? html`<fluvy-cameras-sheet
              ?dark=${this.dark}
              ?no-theme=${this.noTheme}
              .hass=${this.hass}
              .card=${this.sheetHost}
            ></fluvy-cameras-sheet>`
          : nothing
      }
    </article>`;
  }
}
