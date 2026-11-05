import {
  dateFormat,
  houseZone,
  localize,
  strings,
  wallClock,
  type FluvyCardConfig,
  type HaFormSchemaItem,
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { chips, glyph, sideScroll, toggle, type ChipItem } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { periodHeight } from '../energy-family.js';
import {
  CollectionFollower,
  collectionKeyOf,
  COLLECTION_PREFIX,
  findCollection,
  type EnergyCollectionLike,
} from '../energy-model/collection.js';
import { rangeWords } from '../energy-model/range-words.js';
import {
  COLLECTION_LABEL,
  collectionChoices,
  collectionField,
  collectionHelper,
} from '../energy/collection-field.js';
import { Card, type BaseKey } from '../shared/base.js';
import { chipRow, fitsOneRow } from '../shared/chips.js';
import { toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import type { DatesDetail, PickerString } from '../shared/date-picker.js';
import { TextRuler } from '../shared/fit.js';
import {
  boolField,
  colourFields,
  editorLabels,
  editorLanguage,
  editorWord,
  fieldRow,
  onlyWhen,
  orderedField,
} from '../shared/form.js';
import { LaidWidth } from '../shared/laid.js';
import type { EditorChoices, EditorDefaults } from '../shared/rows-editor.js';
import {
  chosenDays,
  GRAIN_PRESET,
  grainOf,
  gridDays,
  holdsNow,
  PERIOD_KEYS,
  presetSpan,
  sameSpan,
  shiftSpan,
  storageKey,
  type Grain,
  type PeriodKey,
  type Preset,
  type Span,
} from './picker.js';

const p = strings('energy-period-card');
/** The period's words the followers share (yesterday), the energy family's. */
const period = strings('energy-period');
const flow = strings('energy-flow');
/** The date grid's words: the pages' shared ones (core's). */
const page = strings('page');

export type PeriodVariant = 'row' | 'compact' | 'stacked';
const VARIANTS: readonly PeriodVariant[] = ['row', 'compact', 'stacked'];

export interface EnergyPeriodCardConfig extends FluvyCardConfig {
  /** The date picker's key (`energy_…`); unset, the dashboard's own (`energy_<its url>`), as Home Assistant's cards take it. */
  collection_key?: string;
  /** A row (the default), a compact pill row, or the row over the periods' chips. */
  variant?: PeriodVariant;
  /** The periods offered, in order: the stacked chips (custom stays in the sheet) and the sheet's presets. */
  periods?: readonly PeriodKey[];
  /** The Today button (default true). */
  show_today?: boolean;
  /** The Compare button: the period before, beside the span, on the cards that draw it (default false). */
  show_compare?: boolean;
  /** The tests' clock. */
  _now?: string;
  /** The playground: the sheet drawn open in the card's place (`custom`: with the date grid). */
  _sheet?: boolean | 'custom';
}

/** What Home Assistant's card helpers make (`window.loadCardHelpers`): its date card, hidden in ours. */
type HelperCard = HTMLElement & { hass?: HomeAssistant | undefined };
interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): HelperCard;
}

/** How the strip says the span, and what stands beside it: words, a glyph alone, or nothing. */
type Shown = 'words' | 'glyph' | 'none';
interface Form {
  readonly arrows: boolean;
  readonly date: 'long' | 'short';
  readonly today: Shown;
  readonly compare: Shown;
}

/**
 * The strip's forms, widest first, the first that holds its column chosen: Compare and Today give their words for their
 * glyphs, the span its short words, Today then Compare go, and last the arrows (the span keeping its words where they
 * hold alone) — the sheet behind the span's pill has them all.
 */
const FORMS: readonly Form[] = [
  { arrows: true, date: 'long', today: 'words', compare: 'words' },
  { arrows: true, date: 'long', today: 'words', compare: 'glyph' },
  { arrows: true, date: 'long', today: 'glyph', compare: 'glyph' },
  { arrows: true, date: 'short', today: 'glyph', compare: 'glyph' },
  { arrows: true, date: 'short', today: 'none', compare: 'glyph' },
  { arrows: true, date: 'short', today: 'none', compare: 'none' },
  { arrows: false, date: 'long', today: 'none', compare: 'none' },
  { arrows: false, date: 'short', today: 'none', compare: 'none' },
];

/** A step's 44, the gap between the strip's parts, the span's words' least air on each side, a pill's sides. */
const STEP = 44;
const GAP = 8;
const DATE_SIDES = 12;
const PILL_SIDES = 32;
/** The widest the capsule and the periods' chips run: a band across a view keeps them on its start, never stretched. */
const CAP = 360;
/** A scrolling row's fades, at a side with more behind it. */
const FADE = 24;
/** The sheet's presets for each period. */
const PRESETS: Readonly<Record<PeriodKey, readonly (Preset | 'custom')[]>> = {
  day: ['today', 'yesterday'],
  week: ['this_week'],
  month: ['this_month'],
  year: ['this_year'],
  custom: ['custom'],
};
/** A tap must clear the scrim's own opening tap; how long the sheet takes to leave. */
const GUARD_MS = 350;
const LEAVE_MS = 200;

const keepEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') event.stopPropagation();
};

/**
 * The Energy dashboard's date picker as a strip: ‹ the span › (its words open the sheet), Today and, asked for,
 * Compare. It drives an Energy date picker's collection — the dashboard's own unless a key is given — that Home
 * Assistant makes and feeds by its own code: found on the connection when a picker is already there, else made by
 * Home Assistant's date card, hidden inside this one. Every energy card following the key (Fluvy's, and Home
 * Assistant's own without a key of theirs) moves with it, and Home Assistant's date card on the view moves it too.
 */
export class FluvyEnergyPeriodCard extends Card<EnergyPeriodCardConfig> {
  static override layoutHeight(config: EnergyPeriodCardConfig): number {
    return periodHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    css`
      .ep-card--compact {
        padding: 12px;
      }
      .ep-row {
        display: flex;
        align-items: center;
        gap: ${GAP}px;
        height: 44px;
      }
      /* ‹ the span ›: one capsule, the steps at its ends */
      .ep-walk {
        position: relative;
        display: flex;
        flex: 1 1 auto;
        align-items: center;
        min-width: 0;
        max-width: ${CAP}px;
        height: 44px;
      }
      .ep-walk::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: var(--fluvy-radius-pill, 9999px);
        background: var(--fluvy-inset, var(--fluvy-page));
      }
      /* compact: a 36 capsule in the 12 of its card, its parts a finger's 44 reaching 4 past it */
      .ep-card--compact .ep-row {
        margin: -4px 0;
      }
      .ep-card--compact .ep-walk::before {
        inset: 4px 0;
      }
      .ep-step,
      .ep-date {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 44px;
        border-radius: var(--fluvy-radius-pill, 9999px);
      }
      .ep-step {
        flex: none;
        width: ${STEP}px;
        color: var(--fluvy-text-secondary);
      }
      .ep-step svg {
        width: 20px;
        height: 20px;
      }
      .ep-date {
        flex: 1 1 auto;
        /* a target at least: a date one word long ("Ma", Hungarian's today) keeps its 44 */
        min-width: ${STEP}px;
        padding: 0 ${DATE_SIDES}px;
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
        white-space: nowrap;
        color: var(--fluvy-text);
      }
      .ep-card--compact .ep-date {
        font-size: 13px;
      }
      /* a page that is no dashboard: the strip says so, across its capsule */
      .ep-date.is-note {
        white-space: normal;
        text-align: center;
        text-wrap: balance;
        font-size: 13px;
        font-weight: 500;
        line-height: 16px;
        color: var(--fluvy-text-secondary);
      }
      .ep-pill {
        background: var(--fluvy-inset, var(--fluvy-page));
        color: var(--fluvy-text);
      }
      .ep-pill.is-on {
        background: var(--tone-fill);
        box-shadow: inset 0 0 0 1px var(--tone-border);
        color: var(--tone-on);
      }
      .ep-owner {
        display: none;
      }
      /* the periods' chips, under the capsule and no wider */
      .ep-card > .fv-chips {
        max-width: ${CAP}px;
      }
      /* a column too narrow for them on one line: they keep it and scroll, as a tab row does (the 4 each side keep a
         chip's focus ring whole), fading at a side with more behind it */
      .ep-grains {
        position: relative;
        max-width: ${CAP + 8}px;
        margin: 8px -4px 0;
        padding: 0 4px;
        overflow: auto hidden;
        overscroll-behavior-x: contain;
        scroll-padding: 0 ${FADE + 4}px;
        scrollbar-width: none;
        -webkit-mask-image: linear-gradient(
          to right,
          transparent,
          var(--fluvy-text) var(--fade-start, 0px),
          var(--fluvy-text) calc(100% - var(--fade-end, 0px)),
          transparent
        );
        mask-image: linear-gradient(
          to right,
          transparent,
          var(--fluvy-text) var(--fade-start, 0px),
          var(--fluvy-text) calc(100% - var(--fade-end, 0px)),
          transparent
        );
      }
      .ep-grains::-webkit-scrollbar {
        display: none;
      }
      .ep-grains > .fv-chips {
        flex-wrap: nowrap;
        width: max-content;
        margin-top: 0;
      }
      .ep-grains.is-dragging .fv-chip {
        pointer-events: none;
      }
      /* the sheet: a modal bottom sheet, as the cameras' */
      dialog {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        flex-direction: column;
        justify-content: flex-end;
        align-items: center;
        overflow: hidden;
        padding: 0;
        border: 0;
        background: color-mix(in srgb, var(--fluvy-neutral-05) 48%, transparent);
        color: inherit;
        overscroll-behavior: contain;
        animation: fv-fade 240ms var(--fv-ease) both;
      }
      dialog[open] {
        display: flex;
      }
      dialog::backdrop {
        background: none;
      }
      @keyframes ep-up {
        from {
          transform: translateY(100%);
        }
      }
      @keyframes ep-down {
        to {
          transform: translateY(100%);
        }
      }
      @keyframes ep-out {
        to {
          opacity: 0;
        }
      }
      dialog .fv-sheet {
        max-width: 392px;
        max-height: 100%;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding-bottom: max(16px, env(safe-area-inset-bottom));
        animation: ep-up 320ms var(--fv-ease-out) both;
      }
      dialog.is-leaving {
        animation: ep-out 200ms var(--fv-ease) both;
      }
      dialog.is-leaving .fv-sheet {
        animation: ep-down 200ms var(--fv-ease) both;
      }
      .ep-sheet {
        width: 100%;
        text-align: start;
      }
      /* the sheet's line wraps at its words, as its title does, and the head grows with it */
      .ep-sheet .fv-sheet__head {
        height: auto;
        min-height: 44px;
      }
      .ep-sheet .fv-card__sub {
        margin-top: 0;
        white-space: normal;
        text-wrap: balance;
      }
      .ep-turn {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 16px;
      }
      .ep-turn__span {
        flex: 1 1 auto;
        min-width: 0;
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        line-height: 20px;
        text-align: center;
        text-wrap: balance;
      }
      .ep-dates {
        margin-top: 16px;
      }
      /* Compare: its words, wrapping at them, and the switch at the row's end */
      .ep-compare-row {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 44px;
        margin-top: 16px;
        font-size: 15px;
        font-weight: 500;
        line-height: 20px;
      }
      .ep-compare-row > span:first-child {
        flex: 1 1 auto;
        min-width: 0;
      }
      .ep-close {
        display: grid;
        margin-top: 24px;
      }
      .ep-close .fv-btn {
        width: 100%;
      }
    `,
  ];

  static override base: readonly BaseKey[] = ['tone', 'color', 'card_color', 'card_opacity'];
  static override keys = configKeys<EnergyPeriodCardConfig>()([
    'collection_key',
    'variant',
    'periods',
    'show_today',
    'show_compare',
  ]);
  /** The dashboard's own key, unwritten: the picker the strip makes when none is named. */
  static override defaults: EditorDefaults = (_config, hass) => ({
    collection_key: hass?.panelUrl ? `${COLLECTION_PREFIX}${hass.panelUrl}` : '',
    variant: 'row',
    periods: [...PERIOD_KEYS],
    show_today: true,
    show_compare: false,
  });
  static override choices: EditorChoices = (_config, hass) => ({
    collection_key: collectionChoices(hass),
  });
  static override getConfigForm(): LovelaceConfigForm {
    const language = editorLanguage();
    const notCompact = (data: Readonly<Record<string, unknown>>): boolean =>
      data['variant'] !== 'compact';
    const variant: HaFormSchemaItem = {
      name: 'variant',
      selector: {
        select: {
          mode: 'dropdown',
          options: [
            { value: 'row', label: editorWord('option.row') },
            { value: 'compact', label: editorWord('option.compact') },
            { value: 'stacked', label: p(language, 'variant_stacked') },
          ],
        },
      },
    };
    return {
      schema: [
        fieldRow(variant, collectionField()),
        orderedField(
          'periods',
          PERIOD_KEYS.map((value) => ({ value, label: periodWord(language, value) })),
        ),
        fieldRow(
          onlyWhen(notCompact, boolField('show_today')),
          onlyWhen(notCompact, boolField('show_compare')),
        ),
        ...colourFields(),
      ],
      ...editorLabels(
        p,
        {
          periods: 'editor_periods',
          show_today: 'editor_show_today',
          show_compare: 'editor_show_compare',
        },
        COLLECTION_LABEL,
      ),
      computeHelper: collectionHelper,
    };
  }

  static getStubConfig(): EnergyPeriodCardConfig {
    return { type: 'custom:fluvy-energy-period-card' };
  }

  static override properties = {
    ...Card.properties,
    helper_: { state: true },
    sheetOpen_: { state: true },
    leaving_: { state: true },
    custom_: { state: true },
    datesReady_: { state: true },
  };

  /** Home Assistant's date card, made by its helpers when no picker holds the key yet; hidden, it keeps the collection fed. */
  declare helper_: HelperCard | undefined;
  declare sheetOpen_: boolean;
  declare leaving_: boolean;
  /** The sheet shows the date grid (custom). */
  declare custom_: boolean;
  /** The date grid's file (the pages') has landed. */
  declare datesReady_: boolean;

  private readonly follower = new CollectionFollower(this);
  private readonly ruler = new TextRuler(() => this.renderRoot as ParentNode | undefined);
  /** The key Home Assistant's date card was made for; a page without its helpers says so. */
  private helperKey: string | undefined;
  private helpless = false;
  private openedAt = 0;
  private leaveTimer = 0;

  constructor() {
    super();
    this.helper_ = undefined;
    this.sheetOpen_ = false;
    this.leaving_ = false;
    this.custom_ = false;
    this.datesReady_ = false;
    // the sheet is drawn for the design's 360 before it is laid out: drawn again for the width it was given
    new LaidWidth(
      this,
      () => this.renderRoot.querySelector('.ep-sheet'),
      () => this.sheetRoom,
    );
  }

  override getCardSize(): number {
    return Math.ceil(periodHeight(this.config ?? { type: '' }) / 50);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected override prepare(config: EnergyPeriodCardConfig): EnergyPeriodCardConfig {
    collectionKeyOf(config, 'fluvy-energy-period-card');
    return config;
  }

  /* ---------- the collection ---------- */

  /** The key driven: the card's, else the dashboard's own (`energy_<url>`), as Home Assistant's cards default to. */
  private key(): string | undefined {
    const own = this.config ? collectionKeyOf(this.config, 'fluvy-energy-period-card') : undefined;
    return own ?? (this.hass?.panelUrl ? `${COLLECTION_PREFIX}${this.hass.panelUrl}` : undefined);
  }

  private collection(): EnergyCollectionLike | undefined {
    const key = this.key();
    return key && this.hass ? findCollection(this.hass, key) : undefined;
  }

  /** Until the collection is found, every `hass` may be the one it arrived with. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    return super.shouldUpdate(changed) || (changed.has('hass') && !this.collection());
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (!this.config || !this.hass) return;
    // the playground's open sheet, its date grid fetched when asked for
    if (!this.hasUpdated && this.config._sheet === 'custom') this.chooseCustom();
    const key = this.key();
    this.follower.attach(this.hass, key);
    if (this.helper_ && this.helperKey !== key) {
      this.helper_ = undefined;
      this.helperKey = undefined;
    }
    if (this.helper_) this.helper_.hass = this.rawHass;
    else if (key && !this.collection() && this.helperKey !== key) void this.makePicker(key);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.finishClose();
    this.grains?.stop();
    this.grains = undefined;
  }

  /**
   * Home Assistant's date card for the key, made once by its helpers and drawn hidden in the card: connected with its
   * `hass`, its selector asks for the collection (`getEnergyDataCollection`), which Home Assistant then makes and feeds.
   * Without the helpers (a page that is no dashboard) the strip says so.
   */
  private async makePicker(key: string): Promise<void> {
    this.helperKey = key;
    const helpers = (await window.loadCardHelpers?.().catch(() => undefined)) as
      CardHelpers | undefined;
    if (this.helperKey !== key) return;
    if (!helpers?.createCardElement) {
      this.helpless = true;
      this.requestUpdate();
      return;
    }
    const helper = helpers.createCardElement({
      type: 'energy-date-selection',
      collection_key: key,
      disable_compare: true,
    });
    helper.hass = this.rawHass;
    this.helpless = false;
    this.helper_ = helper;
    // its element may land later (Home Assistant loads it lazily): once it has drawn, the collection is there
    await customElements.whenDefined(helper.localName);
    await (helper as HelperCard & { updateComplete?: Promise<unknown> }).updateComplete;
    this.requestUpdate();
  }

  /* ---------- the span ---------- */

  private now(): Date {
    const pinned = this.config?._now ? Date.parse(this.config._now) : NaN;
    return new Date(Number.isFinite(pinned) ? pinned : Date.now());
  }

  /** What the collection holds now (it moves at once when picked; its figures follow), today until it is found. */
  private span(collection = this.collection()): Span {
    const today = presetSpan(this.hass, 'today', this.now());
    return collection ? { start: collection.start, end: collection.end ?? today.end } : today;
  }

  /** The span is today: the capsule says it, and the Today button has nothing to do. */
  private onToday(): boolean {
    return sameSpan(this.span(), presetSpan(this.hass, 'today', this.now()));
  }

  private periods(): readonly PeriodKey[] {
    const own = this.config?.periods;
    return Array.isArray(own)
      ? PERIOD_KEYS.filter((key) => own.includes(key)).sort(
          (a, b) => own.indexOf(a) - own.indexOf(b),
        )
      : PERIOD_KEYS;
  }

  private get variant(): PeriodVariant {
    const own = this.config?.variant;
    return own && VARIANTS.includes(own) ? own : 'row';
  }

  /** The collection to `span`, its figures fetched again; a preset is remembered where Home Assistant reads it. */
  private go(span: Span, preset?: Preset): void {
    const collection = this.collection();
    const key = this.key();
    if (!collection || !key) return;
    collection.setPeriod(span.start, span.end);
    void collection.refresh();
    if (preset)
      try {
        localStorage.setItem(storageKey(key), preset);
      } catch {
        // storage refused (a private window): the period still moves, Home Assistant reopens on its own default
      }
    this.requestUpdate();
  }

  private pick(preset: Preset): void {
    this.go(presetSpan(this.hass, preset, this.now()), preset);
  }

  private walk(direction: 1 | -1): void {
    this.go(shiftSpan(this.hass, this.span(), direction));
  }

  private comparing(): boolean {
    const compare = this.collection()?.compare;
    return compare !== undefined && compare !== '';
  }

  private setCompare(on: boolean): void {
    const collection = this.collection();
    if (!collection) return;
    collection.setCompare(on ? 'previous' : '');
    void collection.refresh();
    this.requestUpdate();
  }

  /* ---------- the sheet ---------- */

  private openSheet(): void {
    clearTimeout(this.leaveTimer);
    this.leaving_ = false;
    this.custom_ =
      grainOf(this.hass, this.span()) === 'custom' && this.periods().includes('custom');
    if (this.custom_) void this.loadDates();
    this.sheetOpen_ = true;
    this.openedAt = performance.now();
  }

  private closeSheet(): void {
    if (!this.sheetOpen_ || this.leaving_ || this.config?._sheet) return;
    this.leaving_ = true;
    this.leaveTimer = window.setTimeout(() => this.finishClose(), LEAVE_MS);
  }

  private finishClose(): void {
    clearTimeout(this.leaveTimer);
    const wasOpen = this.sheetOpen_;
    this.leaving_ = false;
    this.sheetOpen_ = false;
    const dialog = this.renderRoot.querySelector('dialog');
    if (dialog?.open) dialog.close();
    if (wasOpen) this.renderRoot.querySelector<HTMLElement>('.ep-date')?.focus();
  }

  /** The date grid, from the pages' file: fetched the first time a custom span is chosen. */
  private async loadDates(): Promise<void> {
    if (this.datesReady_) return;
    await import('../shared/date-picker.js');
    this.datesReady_ = true;
  }

  private chooseCustom(): void {
    this.custom_ = true;
    void this.loadDates();
  }

  private onDates(event: CustomEvent<DatesDetail>): void {
    const { start, end } = event.detail.range;
    this.go(chosenDays(this.hass, start, end));
    this.closeSheet();
  }

  /** The sheet's content width (its 16 sides off), the design's 360 before it is laid out. */
  private get sheetRoom(): number {
    const laid = this.renderRoot?.querySelector<HTMLElement>('.ep-sheet')?.clientWidth ?? 0;
    return laid > 0 ? laid - 32 : 360;
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    // after the pills are fitted: the stacked strip's scrolling periods
    if (this.variant === 'stacked') this.settleGrains(grainOf(this.hass, this.span()));
    const dialog = this.renderRoot.querySelector('dialog');
    if (dialog && !dialog.open && this.sheetOpen_ && !this.leaving_) {
      dialog.showModal();
      this.renderRoot.querySelector<HTMLElement>('.ep-sheet .is-active')?.focus();
    }
  }

  /* ---------- render ---------- */

  /** The strip's form for its column: the first of `FORMS` that holds it. */
  private form(room: number, long: string, short: string): Form {
    const compact = this.variant === 'compact';
    // Today only away from today: on it, the capsule says so and its room is the capsule's
    const today = !compact && this.config?.show_today !== false && !this.onToday();
    const compare = !compact && this.config?.show_compare === true;
    const date = compact ? 'ep-card--compact > ep-date' : 'ep-date';
    const pill = (word: string): number => this.ruler.pill('fv-btn fv-btn--pill', word, PILL_SIDES);
    const beside = (shown: Shown, on: boolean, word: string): number =>
      !on || shown === 'none' ? 0 : GAP + (shown === 'glyph' ? STEP : pill(word));
    const forms = FORMS.map((form) => ({
      ...form,
      today: today ? form.today : ('none' as const),
      compare: compare ? form.compare : ('none' as const),
    }));
    return (
      forms.find(
        (form) =>
          (form.arrows ? 2 * STEP : 0) +
            Math.max(
              STEP,
              this.ruler.width(date, form.date === 'long' ? long : short) + 2 * DATE_SIDES,
            ) +
            beside(form.today, today, localize(this.hass, 'common.today')) +
            beside(form.compare, compare, p(this.hass, 'compare')) <=
          room,
      ) ?? (forms.at(-1) as Form)
    );
  }

  protected renderCard(): TemplateResult {
    const hass = this.hass;
    const compact = this.variant === 'compact';
    const collection = this.collection();
    const ready = collection !== undefined;
    const span = this.span(collection);
    const now = this.now();
    const grain = grainOf(hass, span);
    const note = !ready && (this.helpless || !this.key()) ? p(hass, 'only_dashboard') : undefined;
    const long = note ?? rangeWords(hass, span, now);
    const short = note ?? shortWords(hass, span, grain, now);
    const form = this.form(this.width - (compact ? 24 : 40), long, short);
    const tone = toneOf(this.config, 'accent');
    const comparing = this.comparing();
    const pill = (
      shown: Shown,
      word: string,
      label: string,
      glyphName: 'clock' | 'chart',
      on: boolean,
      run: () => void,
      disabled: boolean,
      pressed?: boolean,
    ): TemplateResult | typeof nothing =>
      shown === 'none'
        ? nothing
        : shown === 'glyph'
          ? html`<button
              class="fv-round ep-pill ${on ? 'is-on' : ''}"
              data-control
              data-target
              aria-label=${label}
              title=${label}
              aria-pressed=${pressed === undefined ? nothing : String(pressed)}
              ?disabled=${disabled}
              @click=${run}
            >
              ${glyph(glyphName)}
            </button>`
          : html`<button
              class="fv-btn fv-btn--pill ep-pill ${on ? 'is-on' : ''}"
              data-control
              data-target
              data-fit=${PILL_SIDES}
              aria-label=${label === word ? nothing : label}
              aria-pressed=${pressed === undefined ? nothing : String(pressed)}
              ?disabled=${disabled}
              @click=${run}
            >
              ${word}
            </button>`;
    const today = localize(hass, 'common.today');
    const owner = this.helper_
      ? html`<div class="ep-owner" aria-hidden="true">${this.helper_}</div>`
      : nothing;
    if (this.config?._sheet)
      return html`<article class="fv-sheet ep-sheet fv-tone--${tone}" data-card>
        <div class="fv-sheet__grabber"><span></span></div>
        ${this.renderSheet(span, now)}${owner}
      </article>`;
    return html`<article
      class="fv-card ep-card ep-card--${this.variant} fv-tone--${tone}"
      data-card
      role="group"
      aria-label=${p(hass, 'name')}
    >
      <div class="ep-row">
        <div class="ep-walk" data-control>
          ${
            form.arrows
              ? html`<button
                  class="ep-step"
                  data-target
                  aria-label=${p(hass, 'previous')}
                  ?disabled=${!ready}
                  @click=${() => this.walk(-1)}
                >
                  ${glyph('chevronLeft')}
                </button>`
              : nothing
          }
          <button
            class="ep-date ${note ? 'is-note' : ''}"
            data-target
            aria-haspopup="dialog"
            ?disabled=${!ready}
            @click=${() => this.openSheet()}
          >
            ${form.date === 'long' ? long : short}
          </button>
          ${
            form.arrows
              ? html`<button
                  class="ep-step"
                  data-target
                  aria-label=${p(hass, 'next')}
                  ?disabled=${!ready || holdsNow(span, now)}
                  @click=${() => this.walk(1)}
                >
                  ${glyph('chevron')}
                </button>`
              : nothing
          }
        </div>
        ${pill(form.today, today, today, 'clock', true, () => this.pick('today'), false)}
        ${pill(
          form.compare,
          p(hass, 'compare'),
          p(hass, 'compare_help'),
          'chart',
          comparing,
          () => this.setCompare(!comparing),
          !ready,
          comparing,
        )}
      </div>
      ${this.variant === 'stacked' ? this.renderChips(grain, ready) : nothing} ${owner}
      ${this.renderDialog(span, now)}
    </article>`;
  }

  /** The stacked strip's periods: a chip a grain (custom is the sheet's), the span's own lit. */
  private renderChips(grain: PeriodKey, ready: boolean): TemplateResult | typeof nothing {
    const grains = this.periods().filter((key): key is Grain => key !== 'custom');
    if (!grains.length) return nothing;
    const tone = toneOf(this.config, 'accent');
    const items: ChipItem[] = grains.map((key) => ({
      key,
      label: periodWord(this.hass, key),
      active: ready && key === grain,
      tone,
      disabled: !ready,
    }));
    const select = (key: string): void => this.pick(GRAIN_PRESET[key as Grain]);
    const fit = { ruler: this.ruler, width: Math.min(this.contentWidth, CAP) };
    if (fitsOneRow(items, fit)) return chipRow(items, select, 'full', fit);
    // too narrow for them on one line (half a section): they keep it and scroll, the span's grain in view — the strip
    // keeps its height at every width
    return html`<div class="ep-grains" data-scroll-row @scroll=${() => this.settleGrains()}>
      ${chips(items, select)}
    </div>`;
  }

  /** The scrolling periods: bound to the mouse once, their grain brought into view when it changes, their fades. */
  private grains: { readonly el: HTMLElement; readonly stop: () => void } | undefined;
  private grainShown: PeriodKey | undefined;
  private settleGrains(grain?: PeriodKey): void {
    const row = this.renderRoot.querySelector<HTMLElement>('.ep-grains') ?? undefined;
    if (this.grains?.el !== row) {
      this.grains?.stop();
      this.grains = row ? { el: row, stop: sideScroll(row) } : undefined;
      this.grainShown = undefined;
    }
    if (!row) return;
    const active = row.querySelector<HTMLElement>('.fv-chip.is-active');
    if (grain !== undefined && grain !== this.grainShown && active) {
      this.grainShown = grain;
      row.scrollLeft = Math.max(0, active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2);
    }
    const hidden = row.scrollWidth - row.clientWidth;
    row.style.setProperty('--fade-start', `${row.scrollLeft > 1 ? FADE : 0}px`);
    row.style.setProperty('--fade-end', `${hidden - row.scrollLeft > 1 ? FADE : 0}px`);
  }

  private renderDialog(span: Span, now: Date): TemplateResult | typeof nothing {
    if (!this.sheetOpen_) return nothing;
    return html`<dialog
      class=${this.leaving_ ? 'is-leaving' : ''}
      aria-labelledby="ep-title"
      @cancel=${(event: Event) => {
        event.preventDefault();
        this.closeSheet();
      }}
      @close=${() => this.finishClose()}
      @click=${(event: MouseEvent) => {
        // only the scrim closes, and not on the tap that opened it
        if (event.target === event.currentTarget && performance.now() - this.openedAt >= GUARD_MS)
          this.closeSheet();
      }}
      @keydown=${keepEscape}
    >
      <div class="fv-sheet ep-sheet">
        <div class="fv-sheet__grabber"><span></span></div>
        ${this.renderSheet(span, now)}
      </div>
    </dialog>`;
  }

  /**
   * The sheet: what the strip is, ‹ the span ›, the presets of its periods (today and yesterday for the day, this
   * week, month and year, custom: the date grid in whole days), Compare where the card offers it, and Close.
   */
  private renderSheet(span: Span, now: Date): TemplateResult {
    const hass = this.hass;
    const tone = toneOf(this.config, 'accent');
    const presets = this.periods().flatMap((key) => PRESETS[key]);
    const chosen = presets.find(
      (preset) => preset !== 'custom' && sameSpan(presetSpan(hass, preset, now), span),
    );
    const items: ChipItem[] = presets.map((preset) => ({
      key: preset,
      label: presetWord(hass, preset),
      active: this.custom_ ? preset === 'custom' : preset === (chosen ?? 'custom'),
      tone,
    }));
    return html`<div class="fv-sheet__head">
        <div class="fv-card__titles">
          <h2 class="fv-sheet__title" id="ep-title">${p(hass, 'name')}</h2>
          <p class="fv-card__sub">${p(hass, 'description')}</p>
        </div>
      </div>
      <div class="ep-turn">
        <button
          class="fv-round fv-round--quiet"
          aria-label=${p(hass, 'previous')}
          @click=${() => this.walk(-1)}
        >
          ${glyph('chevronLeft')}
        </button>
        <p class="ep-turn__span" aria-live="polite">${rangeWords(hass, span, now)}</p>
        <button
          class="fv-round fv-round--quiet"
          aria-label=${p(hass, 'next')}
          ?disabled=${holdsNow(span, now)}
          @click=${() => this.walk(1)}
        >
          ${glyph('chevron')}
        </button>
      </div>
      ${chipRow(
        items,
        (key) => {
          if (key === 'custom') this.chooseCustom();
          else {
            this.pick(key as Preset);
            this.closeSheet();
          }
        },
        'full',
        { ruler: this.ruler, width: this.sheetRoom },
      )}
      ${
        this.custom_ && this.datesReady_
          ? html`<fluvy-date-picker
              class="ep-dates"
              whole-days
              no-presets
              ?reduced-motion=${this.hasAttribute('reduced-motion')}
              .hass=${hass}
              .range=${gridDays(hass, span)}
              .now=${now.getTime()}
              .language=${hass?.language ?? 'en'}
              .t=${(key: PickerString, values?: Record<string, string | number>) =>
                page(hass, key, values)}
              @fluvy-dates=${(event: CustomEvent<DatesDetail>) => this.onDates(event)}
            ></fluvy-date-picker>`
          : nothing
      }
      ${
        this.config?.show_compare === true
          ? html`<div class="ep-compare-row">
              <span aria-hidden="true">${p(hass, 'compare_help')}</span>${toggle(
                this.comparing(),
                tone,
                (on) => this.setCompare(on),
                p(hass, 'compare_help'),
              )}
            </div>`
          : nothing
      }
      ${
        this.config?._sheet
          ? nothing
          : html`<div class="ep-close">
              <button
                class="fv-btn fv-btn--quiet"
                data-control
                data-target
                @click=${() => this.closeSheet()}
              >
                ${localize(hass, 'keypad.close')}
              </button>
            </div>`
      }`;
  }
}

/** A period's chip word: the energy cards' Day · Week · Month, the year's and custom's own. */
function periodWord(hass: Pick<HomeAssistant, 'language'> | undefined, key: PeriodKey): string {
  return key === 'year'
    ? p(hass, 'chip_year')
    : key === 'custom'
      ? p(hass, 'custom')
      : flow(hass, `chip_${key}`);
}

/** A preset's word in the sheet. */
function presetWord(hass: HomeAssistant | undefined, preset: Preset | 'custom'): string {
  return preset === 'today'
    ? localize(hass, 'common.today')
    : preset === 'yesterday'
      ? period(hass, preset)
      : p(hass, preset);
}

/**
 * A span in its fewest words, for a narrow strip: a day's date ("24 Oct"), a month's short name ("Sep", with the year's
 * two figures when it is not this one), a year ("2026"), else its first and last days in figures.
 */
export function shortWords(
  hass: HomeAssistant | undefined,
  span: Span,
  grain: PeriodKey,
  now: Date,
): string {
  const zone = houseZone(hass);
  const format = (options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
    dateFormat(hass?.language ?? 'en', { ...options, ...(zone ? { timeZone: zone } : {}) });
  if (grain === 'year') return format({ year: 'numeric' }).format(span.start);
  if (grain === 'month') {
    const thisYear = wallClock(span.start, zone).year === wallClock(now, zone).year;
    return format({ month: 'short', ...(thisYear ? {} : { year: '2-digit' }) }).format(span.start);
  }
  if (grain === 'day') return format({ day: 'numeric', month: 'short' }).format(span.start);
  const days = format({ day: 'numeric', month: 'numeric' });
  return typeof days.formatRange === 'function'
    ? days.formatRange(span.start, span.end)
    : `${days.format(span.start)} – ${days.format(span.end)}`;
}

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-energy-period-card': FluvyEnergyPeriodCard;
  }
}
