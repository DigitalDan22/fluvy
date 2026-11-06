import {
  haptic,
  strings,
  type FluvyCardConfig,
  type HaFormSchemaItem,
  type LovelaceCardConfig,
  type LovelaceConfigForm,
} from '@fluvy/core';
import { glyph, head, round, sheetStyles } from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { keyed } from 'lit/directives/keyed.js';

import { cameraRatio, PLATE_FLOOR, plateHeight } from '../devices-family.js';
import { HeadFit } from '../energy/head.js';
import { Card, type BaseKey } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys, type AliasSpec } from '../shared/config.js';
import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  editorLanguage,
  fieldRow,
  iconField,
  numberField,
  onlyWhen,
  type OptionWord,
  selectField,
  showIconField,
  textField,
} from '../shared/form.js';
import type { EditorDefaults } from '../shared/rows-editor.js';
import { MINUTE, Ticker } from '../shared/ticker.js';
import { webHeight } from '../web-family.js';
import {
  roundsFit,
  sandboxOf,
  stateLayout,
  webUrl,
  type PlateRoom,
  type Round,
  type SandboxLevel,
  type WebUrl,
} from './url.js';

const s = strings('web');

/** `plate` (the default): the head and the page on the card. `frame`: the page alone on the card. `bare`: the page alone, no card. */
export type WebVariant = 'plate' | 'frame' | 'bare';
/** `page` (the default): the page's own colours. `dark`: inverted, pictures too. `auto`: inverted while the card is dark. */
export type WebLook = 'page' | 'dark' | 'auto';

export interface WebCardConfig extends FluvyCardConfig {
  /** The page's address: http or https, absolute or relative to the dashboard. */
  url: string;
  variant?: WebVariant;
  /** The head's title ("Web page" by default) and second line (the page's host by default); `icon` its circle (the globe). */
  title?: string;
  subtitle?: string;
  /**
   * The plate's shape: `16:9` (the default), `4:3`, `3:2`, `1:1`, `2:1`, `21:9`, Home Assistant's own forms (`56%`),
   * or `fill` — the view's height, in a panel or grid view.
   */
  aspect_ratio?: string;
  /** The plate's height in px (68 or more, on the 4 grid): wins over the shape. */
  height?: number;
  /** The page drawn smaller, 0.5–1: a dense map at 0.75 shows more of itself. */
  scale?: number;
  /** Minutes between two loads of the page (0, the default: never), while the tab is shown and the card on screen. */
  refresh?: number;
  look?: WebLook;
  /** What the page may do: Home Assistant's own set (`standard`, the default), less (`strict`), or no sandbox (`off`). */
  sandbox?: SandboxLevel;
  /** The page may send this tab elsewhere on a tap (Home Assistant's own key). */
  allow_open_top_navigation?: boolean;
  /** The frame's permissions policy (`allow`): `fullscreen` by default. */
  allow?: string;
  /** The plate's rounds: open in a new tab (true), full screen (true), reload (false). */
  show_open?: boolean;
  show_fullscreen?: boolean;
  show_reload?: boolean;
  /** Test hook: the dashboard read as served over https, as the playground's is not. Undocumented. */
  _https?: boolean;
  /** Test hook: a page that never answers, the plate saying so at once (the playground). Undocumented. */
  _slow?: boolean;
}

const VARIANTS: readonly WebVariant[] = ['plate', 'frame', 'bare'];
const LOOKS: readonly WebLook[] = ['page', 'dark', 'auto'];
const LEVELS: readonly SandboxLevel[] = ['standard', 'strict', 'off'];
/** The shapes the editor offers: the camera's, and the view's height in a panel or grid view. */
const RATIOS = [
  '16:9',
  '4:3',
  '3:2',
  '1:1',
  '2:1',
  '21:9',
  'fill',
] as const satisfies readonly OptionWord[];
/** Home Assistant's own default for the frame's permissions policy. */
const ALLOW = 'fullscreen';
/** A page that has not loaded after this long says so, and offers the tab. */
const SLOW = 20_000;
/** The slow state's line: 6 between its words, the dot and the link; the link's 8 on either side of its words. */
const LINE_GAP = 6;
const LINK_SIDES = 16;
/** Home Assistant's iframe card's switches, read as a variant and a level (`aliases`) and let go. */
const PASTED: readonly string[] = ['hide_background', 'disable_sandbox'];

/** An address the card may frame: what `webUrl` gives once `prepare` has refused the rest. */
type Framed = Exclude<WebUrl, { state: 'refused' }>;

type Data = Readonly<Record<string, unknown>>;
const isPlate = (data: Data): boolean => (data['variant'] ?? 'plate') === 'plate';
const notBare = (data: Data): boolean => data['variant'] !== 'bare';
const byShape = (data: Data): boolean => !(Number(data['height']) > 0);
const sandboxed = (data: Data): boolean => data['sandbox'] !== 'off';

/** The plate's height across `width` for a config: the height written (on the 4 grid, never under the floor), else its shape. */
export function webPlate(
  config: Pick<WebCardConfig, 'height' | 'aspect_ratio'>,
  width: number,
): number {
  const asked = Number(config.height);
  return asked > 0
    ? Math.max(PLATE_FLOOR, Math.round(asked / 4) * 4)
    : plateHeight(width, cameraRatio(config.aspect_ratio));
}

/**
 * The web page card (#61): a page on a plate — a map, a chart, a site of the person's own — under a head with the
 * page's host on its line (`plate`, the default), alone on the card (`frame`) or with no card at all (`bare`, Home
 * Assistant's `hide_background`). The plate keeps the shape asked for, or the height written, and holds its rounds at
 * its bottom end: open in a new tab, full screen (the plate itself; a phone that cannot opens the tab) and reload.
 * The page is framed as Home Assistant's iframe card frames it — its sandbox by default, no referrer, a permissions
 * policy of `fullscreen` — with a stricter sandbox or none on request, a dark look that inverts the page where the
 * page cannot be asked, a scale for a dense page, and a reload every so many minutes while the card can be seen. A
 * skeleton covers the plate until the page loads; one still loading after twenty seconds says so and offers the tab
 * (a page that refuses to be framed loads all the same, blank: the open round is the way out). On an https dashboard
 * an http page is never asked for — the browser would refuse it silently — so the plate says the page needs https, at
 * its size, its open round alive. Home Assistant's own iframe card pastes in (`type: iframe`).
 */
export class FluvyWebCard extends Card<WebCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: LovelaceCardConfig): number {
    return webHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.devices,
    css`
      /* the devices sheet's plate, on the page's ground until the page is drawn; alone on a card from its padding */
      .wb-plate {
        background: var(--fluvy-page-alt);
      }
      .is-frame .wb-plate,
      .wb-bare .wb-plate {
        margin-top: 0;
      }
      /* no card: the plate keeps a card's corners and enters as one */
      .wb-bare {
        position: relative;
        animation: fv-enter 420ms var(--fv-ease-out) both;
        animation-delay: var(--fv-enter-delay, 0ms);
      }
      .wb-bare .wb-plate {
        border-radius: var(--fluvy-radius-card);
      }
      /* the view's height, in a panel or grid view: the card is as tall as its cell, the plate takes what the head leaves */
      :host([fill]) {
        display: block;
        height: 100%;
      }
      :host([fill]) .wb-card,
      :host([fill]) .wb-bare {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      :host([fill]) .wb-plate {
        flex: 1;
        min-height: ${PLATE_FLOOR}px;
      }
      .wb-frame {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: transparent;
        transform-origin: 0 0;
        opacity: 0;
        transition: opacity var(--fv-base) var(--fv-ease);
      }
      .wb-frame.is-on {
        opacity: 1;
      }
      /* the dark look: the page inverted, its hues turned back — pictures invert too */
      .wb-frame.is-dark {
        filter: invert(0.92) hue-rotate(180deg);
      }
      .wb-skeleton {
        position: absolute;
        inset: 0;
        border-radius: 0;
      }
      /* an http page on an https dashboard: the unavailable skin — page fill, dashed hairline, one glyph, one line */
      .wb-plate.is-off {
        background: var(--fluvy-page);
        outline: 1px dashed var(--fluvy-unavailable-border);
        outline-offset: -1px;
      }
      /* a state's words (still loading, kept back), never under the rounds: centred in the room over their row, or at
         the plate's start beside it (stateLayout); one line, its short form where the full one would not hold */
      .wb-state {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 16px;
      }
      .wb-state--beside {
        top: auto;
        bottom: 12px;
        left: 16px;
        height: 44px;
        align-items: flex-start;
        padding: 0;
      }
      .wb-state__line {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .wb-state__words {
        font-size: 13px;
        font-weight: 500;
        line-height: 24px;
        white-space: nowrap;
        color: var(--fluvy-text-secondary);
      }
      .is-off .wb-state__words {
        color: var(--fluvy-unavailable);
      }
      /* still loading, where the line holds it: the tab offered as a link of 44 */
      .wb-state__open {
        min-height: 44px;
        padding: 0 8px;
        font-size: 13px;
        font-weight: 500;
        line-height: 24px;
        white-space: nowrap;
        color: var(--fluvy-primary);
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .wb-plate:fullscreen {
        border-radius: 0;
        background: var(--fluvy-neutral-05);
      }
    `,
  ];

  static override properties = {
    ...Card.properties,
    loaded_: { state: true },
    slow_: { state: true },
    fullscreen_: { state: true },
    generation_: { state: true },
  };
  /** The page has loaded: the skeleton goes, the frame shows. */
  declare loaded_: boolean;
  /** Twenty seconds without a load: the plate says so and offers the tab. */
  declare slow_: boolean;
  /** The plate fills the screen: its round leaves it, and says so. */
  declare fullscreen_: boolean;
  /** Counted up on every reload: the frame is keyed by it, so the page is asked for anew. */
  declare generation_: number;

  constructor() {
    super();
    this.loaded_ = false;
    this.slow_ = false;
    this.fullscreen_ = false;
    this.generation_ = 0;
    // every minute while the card can be seen: a page shown for `refresh` minutes is asked for again
    new Ticker(this, () => this.reloadDue());
  }

  static override base: readonly BaseKey[] = [
    'icon',
    'show_icon',
    'tone',
    'color',
    'card_color',
    'card_opacity',
    'tap_action',
    'hold_action',
  ];
  static override keys = configKeys<WebCardConfig>()([
    'url',
    'variant',
    'title',
    'subtitle',
    'aspect_ratio',
    'height',
    'scale',
    'refresh',
    'look',
    'sandbox',
    'allow_open_top_navigation',
    'allow',
    'show_open',
    'show_fullscreen',
    'show_reload',
  ]);
  /**
   * Home Assistant's iframe card as it is pasted: no background is the bare plate, no sandbox the level `off`; either
   * saying nothing (`false`) is let go once the editor saves.
   */
  static override aliases: AliasSpec = {
    keys: [
      {
        from: 'hide_background',
        to: 'variant',
        when: (value) => value === true,
        map: () => 'bare',
      },
      { from: 'disable_sandbox', to: 'sandbox', when: (value) => value === true, map: () => 'off' },
    ],
    upgrade: (config) =>
      PASTED.some((key) => key in config)
        ? Object.fromEntries(Object.entries(config).filter(([key]) => !PASTED.includes(key)))
        : config,
  };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'plate',
    aspect_ratio: '16:9',
    scale: 1,
    refresh: 0,
    look: 'page',
    sandbox: 'standard',
    allow_open_top_navigation: false,
    allow: ALLOW,
    show_open: true,
    show_fullscreen: true,
    show_reload: false,
  });
  static override getConfigForm(): LovelaceConfigForm {
    const url: HaFormSchemaItem = {
      name: 'url',
      required: true,
      selector: { text: { type: 'url' } },
    };
    return {
      schema: [
        url,
        selectField('variant', VARIANTS),
        // the head is the plate variant's alone
        onlyWhen(isPlate, fieldRow(textField('title'), iconField())),
        onlyWhen(isPlate, showIconField()),
        onlyWhen(isPlate, textField('subtitle')),
        // a height written decides the plate: the shape has no say then
        fieldRow(
          onlyWhen(byShape, selectField('aspect_ratio', RATIOS, { custom: true })),
          numberField('height', PLATE_FLOOR, 2000, 4),
        ),
        fieldRow(numberField('scale', 0.5, 1, 0.05), numberField('refresh', 0, 1440)),
        fieldRow(selectField('look', LOOKS), selectField('sandbox', LEVELS)),
        onlyWhen(sandboxed, boolField('allow_open_top_navigation')),
        textField('allow'),
        fieldRow(boolField('show_open'), boolField('show_fullscreen')),
        boolField('show_reload'),
        // no card, no colours to wear; no head, no button for the actions
        ...colourFields({ unavailable: false }).map((field) => onlyWhen(notBare, field)),
        onlyWhen(isPlate, actionFields()),
      ],
      ...editorLabels(
        s,
        {
          url: 'editor.url',
          height: 'editor.height',
          scale: 'editor.scale',
          refresh: 'editor.refresh',
          look: 'editor.look',
          sandbox: 'editor.sandbox',
          allow_open_top_navigation: 'editor.allow_open_top_navigation',
          allow: 'editor.allow',
          show_open: 'editor.show_open',
          show_fullscreen: 'editor.show_fullscreen',
          show_reload: 'editor.show_reload',
        },
        {},
      ),
      computeHelper: (schema) =>
        schema.name === 'look'
          ? s(editorLanguage(), 'editor.look_helper')
          : schema.name === 'sandbox'
            ? s(editorLanguage(), 'editor.sandbox_helper')
            : undefined,
    };
  }

  static getStubConfig(): WebCardConfig {
    return { type: 'custom:fluvy-web-card', url: 'https://www.home-assistant.io/' };
  }

  private readonly head = new HeadFit(this);
  /** The address as `setConfig` read it: framed, or kept back for https. */
  private page: Framed | undefined;
  /** What the frame is made of beyond its generation: a change asks for a new frame, and a new load. */
  private frameKey = '';
  /** When the page was last asked for: what `refresh` counts from. */
  private shownAt = 0;
  private slowTimer: number | undefined;
  /** The plate is on screen, by the viewport's last word: what starts a lazy frame, and its slow clock. */
  private seen = false;
  private observer: IntersectionObserver | undefined;
  /** The playground's page that never answers (`_slow`): no frame is asked for, the plate is still loading at once. */
  private never = false;

  /**
   * The address is read here, once per config: a scheme no page can be framed from (`javascript:`, `data:`, `blob:`,
   * none) is refused with a readable error; an http page on an https dashboard is kept back, said on the plate.
   */
  protected override prepare(config: WebCardConfig): WebCardConfig {
    const place = config._https
      ? { href: location.href.replace(/^http:/, 'https:'), protocol: 'https:' }
      : location;
    const page = webUrl(config.url, place);
    if (page.state === 'refused')
      throw new Error('fluvy-web-card: "url" must be an http or https address');
    this.page = page;
    this.never = config._slow === true;
    const key = [
      page.href,
      sandboxOf(this.level(config), config.allow_open_top_navigation === true) ?? '',
      config.allow ?? ALLOW,
    ].join('\n');
    if (key !== this.frameKey) {
      this.frameKey = key;
      this.load();
    }
    return config;
  }

  override getCardSize(): number {
    return this.config ? Math.ceil(webHeight(this.config) / 50) : 3;
  }

  /* ---------- the frame's life ---------- */

  /** A frame is on its way: the skeleton covers the plate, the slow clock starts once the plate is on screen. */
  private load(): void {
    this.shownAt = Date.now();
    this.loaded_ = false;
    this.slow_ = this.never && this.page?.state === 'ok';
    this.stopClock();
    this.startClock();
  }

  /**
   * The slow clock: twenty seconds from when a frame on its way is in the page and on screen — the frame loads lazily,
   * so a card scrolled to long after the page opened starts its page, and its clock, only then.
   */
  private startClock(): void {
    if (
      this.slowTimer !== undefined ||
      !this.seen ||
      !this.isConnected ||
      this.loaded_ ||
      this.slow_ ||
      this.never ||
      this.page?.state !== 'ok'
    )
      return;
    this.slowTimer = window.setTimeout(() => {
      this.slowTimer = undefined;
      this.slow_ = true;
    }, SLOW);
  }

  private stopClock(): void {
    window.clearTimeout(this.slowTimer);
    this.slowTimer = undefined;
  }

  private readonly onLoad = (): void => {
    this.stopClock();
    this.loaded_ = true;
    this.slow_ = false;
  };

  /** The page asked for anew: a fresh frame (keyed by its generation), the skeleton and the clock with it. */
  private reload(): void {
    this.generation_ += 1;
    this.load();
  }

  /** The ticker's question, every minute: has the page been shown for `refresh` minutes? */
  private reloadDue(): boolean {
    const minutes = this.refreshMinutes();
    if (!minutes || Date.now() - this.shownAt < minutes * MINUTE) return false;
    this.reload();
    return true;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('fullscreenchange', this.onFullscreen);
    // the viewport's first word, a frame from now, starts the clock (at once where there is no observer)
    this.seen = typeof IntersectionObserver !== 'function';
    if (!this.seen) {
      this.observer = new IntersectionObserver((entries) => {
        this.seen = entries[entries.length - 1]?.isIntersecting ?? true;
        this.startClock();
      });
      this.observer.observe(this);
    }
    // a frame put back in the page asks for its page anew: the skeleton covers it again, its clock starts afresh
    if (this.hasUpdated) this.load();
    else this.startClock();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    this.observer?.disconnect();
    this.observer = undefined;
    this.stopClock();
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.toggleAttribute('fill', this.fills());
  }

  /* ---------- what the config says ---------- */

  private variant(): WebVariant {
    const variant = this.config?.variant;
    return variant && VARIANTS.includes(variant) ? variant : 'plate';
  }

  /** Bare, the page has no surface around it: never see-through. */
  protected override get surface(): boolean {
    return this.variant() !== 'bare';
  }

  private level(config: WebCardConfig | undefined = this.config): SandboxLevel {
    const level = config?.sandbox;
    return level && LEVELS.includes(level) ? level : 'standard';
  }

  /** The page drawn at a scale of 0.5–1; 1 where none is asked. */
  private scale(): number {
    const scale = Number(this.config?.scale);
    return scale > 0 ? Math.min(1, Math.max(0.5, scale)) : 1;
  }

  private refreshMinutes(): number {
    return Math.max(0, Number(this.config?.refresh) || 0);
  }

  /** The dark look: asked for, or the card's own dark while the look follows it. */
  private inverted(): boolean {
    const look = this.config?.look;
    return look === 'dark' || (look === 'auto' && this.dark);
  }

  /** The plate takes the view's height: asked for (`aspect_ratio: fill`) in a panel or grid view. */
  private fills(): boolean {
    return (
      this.config?.aspect_ratio === 'fill' && (this.layout === 'panel' || this.layout === 'grid')
    );
  }

  /* ---------- the rounds ---------- */

  private open(): void {
    if (this.page) window.open(this.page.href, '_blank', 'noopener');
  }

  private readonly onFullscreen = (): void => {
    this.fullscreen_ =
      this.renderRoot instanceof ShadowRoot && this.renderRoot.fullscreenElement !== null;
  };

  private fullscreen(): void {
    haptic(this, 'light');
    if (this.renderRoot instanceof ShadowRoot && this.renderRoot.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const plate = this.renderRoot.querySelector<HTMLElement>('.wb-plate');
    // a phone that has no full screen for a page (iPhone): the tab
    if (!plate || typeof plate.requestFullscreen !== 'function') {
      this.open();
      return;
    }
    plate.requestFullscreen().catch(() => this.open());
  }

  /** The rounds the plate's bottom end holds at `width`, of those asked for; every one in full screen. */
  private rounds(width: number): Round[] {
    const config = this.config;
    const wanted: Round[] = [
      ...(config?.show_reload === true ? (['reload'] as const) : []),
      ...(config?.show_open === false ? [] : (['open'] as const)),
      ...(config?.show_fullscreen === false ? [] : (['fullscreen'] as const)),
    ];
    return roundsFit(this.fullscreen_ ? Number.POSITIVE_INFINITY : width, wanted);
  }

  private renderRound(name: Round, off: boolean): TemplateResult {
    const hass = this.hass;
    if (name === 'reload')
      return round('refresh', 'quiet', s(hass, 'reload'), () => this.reload(), off);
    if (name === 'open') return round('external', 'quiet', s(hass, 'open'), () => this.open());
    return this.fullscreen_
      ? round('close', 'quiet', s(hass, 'exit_fullscreen'), () => this.fullscreen())
      : round('expand', 'quiet', s(hass, 'fullscreen'), () => this.fullscreen(), off);
  }

  /* ---------- render ---------- */

  /**
   * A state's words on the plate, laid where they hold whole and clear of the rounds (`stateLayout`): kept back (`off`:
   * the globe over "This page needs https", the off plate's anatomy) or still loading (the words, the tab offered on
   * their line where it holds; the open round is there where it does not).
   */
  private renderState(state: 'off' | 'slow', plate: PlateRoom): TemplateResult | typeof nothing {
    const hass = this.hass;
    const off = state === 'off';
    const full = s(hass, off ? 'insecure' : 'slow');
    const short = s(hass, off ? 'insecure_short' : 'slow_short');
    const open = s(hass, 'open');
    const ruler = this.head.ruler;
    const words = (text: string): number => ruler.width('wb-state__words', text);
    const fit = stateLayout(plate, {
      full: words(full),
      short: words(short),
      ...(off
        ? { glyph: true }
        : {
            link:
              LINE_GAP + words('·') + LINE_GAP + ruler.width('wb-state__open', open) + LINK_SIDES,
          }),
    });
    if (!fit) return nothing;
    const text = fit.words === 'full' ? full : fit.words === 'short' ? short : '';
    const beside = fit.place === 'beside';
    // on the 4 grid where the plate's height is known; centred over the rounds where the view or the screen decides it
    const place = beside
      ? `right:${fit.reserve}px`
      : fit.top === undefined
        ? `bottom:${fit.reserve}px`
        : `top:${fit.top}px`;
    return html`<div class="wb-state ${beside ? 'wb-state--beside' : ''}" style=${place}>
      ${fit.glyph ? html`<span class="fv-ico fv-ico--off" data-icon>${glyph('globe')}</span>` : nothing}
      ${
        text
          ? html`<p class="wb-state__line">
              <span class="wb-state__words">${text}</span>
              ${
                fit.link
                  ? html`<span class="wb-state__words" aria-hidden="true">·</span>
                      <button class="wb-state__open" data-target @click=${() => this.open()}>
                        ${open}
                      </button>`
                  : nothing
              }
            </p>`
          : nothing
      }
    </div>`;
  }

  private renderPlate(
    config: WebCardConfig,
    page: Framed,
    width: number,
    title: string,
  ): TemplateResult {
    const off = page.state === 'insecure';
    const fills = this.fills();
    const height = webPlate(config, width);
    const scale = this.scale();
    const rounds = this.rounds(width);
    // the view's or the screen's height: room enough for any state
    const room: PlateRoom = {
      width,
      height: fills || this.fullscreen_ ? Number.POSITIVE_INFINITY : height,
      rounds: rounds.length,
    };
    return html`<div
      class="dv-cam fv-plate wb-plate ${off ? 'is-off' : ''}"
      style=${fills ? nothing : `height:${height}px`}
    >
      ${
        off
          ? this.renderState('off', room)
          : html`${
              this.never
                ? nothing
                : keyed(
                    `${this.generation_}\n${this.frameKey}`,
                    html`<iframe
                      class="wb-frame ${this.loaded_ ? 'is-on' : ''} ${this.inverted() ? 'is-dark' : ''}"
                      src=${page.href}
                      sandbox=${sandboxOf(this.level(), config.allow_open_top_navigation === true) ?? nothing}
                      allow=${config.allow ?? ALLOW}
                      title=${title}
                      referrerpolicy="no-referrer"
                      loading="lazy"
                      style=${
                        scale < 1
                          ? `transform:scale(${scale});width:calc(100% / ${scale});height:calc(100% / ${scale})`
                          : nothing
                      }
                      @load=${this.onLoad}
                    ></iframe>`,
                  )
            }
            ${this.loaded_ ? nothing : html`<span class="fv-skeleton wb-skeleton"></span>`}
            ${this.slow_ ? this.renderState('slow', room) : nothing}`
      }
      <div class="dv-cam__actions">${rounds.map((name) => this.renderRound(name, off))}</div>
    </div>`;
  }

  protected renderCard(): TemplateResult | typeof nothing {
    const page = this.page;
    const config = this.config;
    if (!page || !config) return nothing;
    const variant = this.variant();
    const title = config.title ?? s(this.hass, 'card');
    if (variant === 'bare')
      return html`<div class="wb-bare" data-card>
        ${this.renderPlate(config, page, this.width, title)}
      </div>`;
    const width = this.contentWidth;
    if (variant === 'frame')
      return html`<article class="fv-card wb-card is-frame" data-card>
        ${this.renderPlate(config, page, width, title)}
      </article>`;
    const sub = config.subtitle ?? page.host;
    // the head gives way in its order (the sub, then the circle) before the title is cut; a host too long for a half
    // card's line ("grafana.local:3000") goes whole rather than cut
    const fitted = this.head.fit({ width, title, sub, shorter: [''] });
    return html`<article class="fv-card wb-card" data-card>
      ${head({
        icon: fitted.icon ? (config.icon ?? 'globe') : null,
        small: fitted.small,
        tone: toneOf(config, 'accent'),
        title,
        sub: fitted.sub,
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${this.renderPlate(config, page, width, title)}
    </article>`;
  }
}
