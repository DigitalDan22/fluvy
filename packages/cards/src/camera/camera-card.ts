import {
  formatTime,
  haptic,
  isUsable,
  stateText,
  strings,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { head, round, sheetStyles } from '@fluvy/ui';

import { css, html, type CSSResultGroup, type TemplateResult } from 'lit';

import { RowsCard, type RowsCardConfig } from '../lock/rows.js';

import { Card, HEAD_BASE } from '../shared/base.js';

import { iconOf } from '../shared/domain.js';

import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  entitiesField,
  entityField,
  fieldRow,
  nameIconFields,
  numberField,
  rowItems,
  selectField,
  showIconField,
  textField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys, ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { toneOf } from '../shared/colour.js';
import { rowEndStyles } from '../shared/row-end.js';
import { CameraFeed } from './feed.js';
import { plateLayout, plateStyles, renderPlate } from './plate.js';
import { CAMERA_RATIOS, cameraHeight, cameraRatio, plateHeight } from '../devices-family.js';

const s = strings('camera');

export interface CameraCardConfig extends RowsCardConfig {
  /** Seconds between two stills (0.5–300, default 10). */
  refresh?: number;
  /**
   * `auto` (the default): stills that refresh themselves. `live`: Home Assistant's own stream (WebRTC, HLS or MJPEG,
   * as the camera offers) while the card is on screen; stills again where Home Assistant cannot give one.
   */
  camera_view?: 'auto' | 'live';
  /**
   * The picture's shape: `16:9` (the default), `4:3`, `3:2`, `1:1`, `2:1`, `21:9`, `native` (the camera's own), or
   * Home Assistant's own forms (`16:9`, `56%`).
   */
  aspect_ratio?: string;
  /** `cover` (the default) fills the shape and crops what overflows; `contain` shows the whole picture. */
  fit_mode?: 'cover' | 'contain';
  /** Second line of the head ("Front of house · 1080p"). Default: area and state. */
  subtitle?: string;
}

/**
 * The camera: a 16:9 still that refreshes itself (or Home Assistant's stream), the live and time pills inside the
 * picture and two overlay actions. Its feed (`feed.ts`) fetches the stills while the card is on screen and the tab is
 * in front; its plate (`plate.ts`) draws them.
 */
export class FluvyCameraCard extends RowsCard<CameraCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: CameraCardConfig): number {
    return cameraHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.devices,
    rowEndStyles,
    plateStyles,
    css`
      .dv-card {
        width: auto;
      }
    `,
  ];

  static override properties = { ...Card.properties, fullscreen_: { state: true } };
  /** The picture fills the screen: its button leaves it, and says so. */
  declare fullscreen_: boolean;

  /** The picture: its stills, or Home Assistant's stream on a live card, while the card is on screen. */
  private readonly feed = new CameraFeed(this, () => ({
    hass: this.hass,
    view: this.entity(),
    live: this.config?.camera_view === 'live',
    refresh: this.config?.refresh ?? 10,
    native: this.config?.aspect_ratio === 'native',
    // the screen's width in full screen: as sharp as the picture is wide
    width: this.fullscreen_ ? Math.max(screen.width, screen.height) : this.contentWidth,
  }));

  constructor() {
    super();
    this.fullscreen_ = false;
  }

  static override base = HEAD_BASE;
  static override keys = configKeys<CameraCardConfig>()([
    'rows',
    'show_rows',
    'refresh',
    'subtitle',
    'camera_view',
    'aspect_ratio',
    'fit_mode',
  ]);
  static override lists: readonly RowsListSpec[] = [
    { key: 'rows', title: 'editor.rows', ...rowItems() },
  ];
  static override aliases: AliasSpec = {
    keys: [{ from: 'sub', to: 'subtitle' }],
    items: { rows: ITEM_ALIASES },
  };
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    camera_view: 'auto',
    aspect_ratio: '16:9',
    fit_mode: 'cover',
    show_rows: true,
  });
  static override getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        entityField(['camera']),
        nameIconFields(),
        showIconField(),
        textField('subtitle'),
        fieldRow(
          selectField('camera_view', ['auto', 'live']),
          numberField('refresh', 0.5, 300, 0.5),
        ),
        fieldRow(
          selectField('aspect_ratio', CAMERA_RATIOS, { custom: true }),
          selectField('fit_mode', ['cover', 'contain']),
        ),
        boolField('show_rows'),
        entitiesField('rows'),
        ...colourFields(),
        actionFields(),
      ],
      ...editorLabels(s, { refresh: 'refresh' }, {}),
    };
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): CameraCardConfig {
    return {
      type: 'custom:fluvy-camera-card',
      entity: entities.find((id) => id.startsWith('camera.')) ?? '',
    };
  }

  protected override prepare(config: CameraCardConfig): CameraCardConfig {
    if (!config.entity) throw new Error('fluvy-camera-card: "entity" is required');
    return super.prepare({
      ...config,
      // half a second at the quickest (one request at a time all the same: a slow camera is waited for)
      refresh: Math.min(300, Math.max(0.5, Number(config.refresh) || 10)),
    });
  }

  override getCardSize(): number {
    return 5 + this.rowCount;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
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

  /** Full screen entered or left (by the button, Esc or the system): the button follows. */
  private readonly onFullscreen = (): void => {
    this.fullscreen_ =
      this.renderRoot instanceof ShadowRoot && this.renderRoot.fullscreenElement !== null;
    // the picture is as wide as the screen now (or the card's again): a still at that width at once
    this.feed.resized();
  };

  /* ---------- actions ---------- */

  private moreInfo(): void {
    if (this.renderRoot instanceof ShadowRoot && this.renderRoot.fullscreenElement) {
      void document.exitFullscreen();
      return;
    } // the dialog would open behind the picture
    this.tap(this.config?.entity, { action: 'more-info' });
  }

  private fullscreen(): void {
    haptic(this, 'light');
    if (this.renderRoot instanceof ShadowRoot && this.renderRoot.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const box = this.renderRoot.querySelector<HTMLElement>('.dv-cam');
    if (!box || typeof box.requestFullscreen !== 'function') {
      this.moreInfo();
      return;
    } // iPhone: Home Assistant's dialog has the player
    box.requestFullscreen().catch(() => this.moreInfo());
  }

  /* ---------- render ---------- */

  private clock(): string {
    if (!this.feed.stamp) return '';
    const date = new Date(this.feed.stamp);
    const full = formatTime(this.hass, date, true);
    return full.length > 9 ? formatTime(this.hass, date, false) : full; // a 12-hour locale keeps the pill's 80 px
  }

  protected renderCard(): TemplateResult {
    const view = this.entity();
    const name = this.config?.name ?? view.name;
    // a camera out of reach — unavailable, unknown or gone from the house — keeps its head, its plate in its shape
    // and its rows: the plate says why, the colours say the rest (1.9: an unavailable card keeps its size)
    const unusable = view.status !== 'ok';
    const off =
      unusable ||
      (!this.feed.streaming && (this.feed.failed || !view.attr<string | null>('entity_picture')));
    // the shape asked for (the camera's own once a frame says it), landed on the 4 px grid
    const ratio = cameraRatio(this.config?.aspect_ratio, this.feed.native);
    const height = plateHeight(this.contentWidth, ratio);
    // the off block's words: one line, two where they do not fit the plate's width
    const offText = unusable ? stateText(this.hass, view) : s(this.hass, 'offline');
    const offLines =
      this.headFit.ruler.width('dv-cam__off p', offText) > this.contentWidth - 32 ? 2 : 1;
    const sub =
      this.config?.subtitle ??
      [view.areaName, stateText(this.hass, view)].filter(Boolean).join(' · ');
    // the head gives way in its order (the sub's last parts, then the circle) before the name is cut
    const fitted = this.headFit.fit({ width: this.contentWidth, title: name, sub, trailing: 44 });
    // a live card whose stream could not play says so in the pill's place ("Stream unavailable"), the stills showing
    // meanwhile and the stream asked for again after its wait
    const liveText = s(this.hass, this.feed.unplayable ? 'stream_failed' : 'live');
    const liveWord = this.headFit.ruler.width('dv-cam__pill dv-cam__live', liveText);

    return html`<article
      class="fv-card dv-card ${isUsable(view) ? '' : 'is-unavailable'}"
      data-card
    >
      ${head({
        icon: fitted.icon ? iconOf(view, this.config?.icon) : null,
        small: fitted.small,
        tone: isUsable(view) ? toneOf(this.config, 'accent') : 'off',
        title: name,
        name: true,
        sub: fitted.sub,
        trailing: round('dots', 'quiet', this.t('common.more'), () => this.moreInfo()),
        cut: fitted.cut,
        ...this.headActions(view.id),
      })}
      ${renderPlate({
        feed: this.feed,
        height,
        ratio,
        layout: plateLayout(this.contentWidth, height, liveWord, 2),
        live: liveText,
        off: off ? { text: offText, lines: offLines } : undefined,
        contain: this.config?.fit_mode === 'contain',
        quick: (this.config?.refresh ?? 10) < 1,
        fullscreen: this.fullscreen_,
        clock: this.clock(),
        label: s(this.hass, 'view', { name }),
        open: () => this.moreInfo(),
        snapshot: s(this.hass, 'snapshot'),
        screen: {
          enter: s(this.hass, 'fullscreen'),
          leave: s(this.hass, 'exit_fullscreen'),
          run: () => this.fullscreen(),
        },
      })}
      ${this.renderRows(true)}
    </article>`;
  }
}
