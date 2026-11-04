import {
  formatNumber,
  formatTime,
  plural,
  stateText,
  strings,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { head, icon, listRow, sheetStyles, type Tone } from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import {
  rowButton,
  rowEndStyles,
  rowsKeepIcon,
  rowStacks,
  type RowEnd,
} from '../shared/row-end.js';

import { rowStyles } from '../helpers/styles.js';

import { Card, type CardEditor } from '../shared/base.js';

import { iconOf } from '../shared/domain.js';
import { toneOf } from '../shared/colour.js';
import { HeadFit } from '../energy/head.js';
import { HEAD, ROW } from '../shared/heights.js';
import { hideEmpty, idsOf, listOf, type EmptyList } from '../shared/lists.js';

const s = strings('updates');

export interface UpdatesCardConfig extends FluvyCardConfig, EmptyList {
  title?: string;
  subtitle?: string;
  /** Keep the entities that are already current in the list instead of hiding them. */
  show_up_to_date?: boolean;
  /** A switch shown under the list, as the sheet's "Auto-update at night" (an `input_boolean`, `switch` or `automation`). */
  toggle?: string;
  /** Context line of that switch ("03:00 · backup first"). Defaults to its area. */
  toggle_secondary?: string;
}

/** `UpdateEntityFeature.INSTALL` */
const INSTALL = 1;
/** The state a row is expected to reach once Install is tapped, until `in_progress` says so itself. */
const STARTING = 'installing';
/** Below this content width the count badge gives its place to the title and moves into the sub line. */
const NARROW = 300;

/**
 * The card's height at a 360 column, for the automatic dashboard's columns: the rows 16 under the head, one per
 * update `waiting` (or that cannot be read; every one with `show_up_to_date` — the house says which: every one listed
 * where it is not there to say), 76 for each of them `installing`; nothing waiting (or nothing listed) is the one
 * quiet row ("Everything is up to date"); the switch under the list is a row of its own group (16 + 60).
 */
export const updatesHeight = (config: UpdatesCardConfig, waiting: number, installing = 0): number =>
  HEAD + ROW * Math.max(1, waiting) + 16 * installing + (config.toggle ? 16 + ROW : 0);

/**
 * What is waiting to be installed: one row per update entity with the version step in the sub, an
 * Install button, and — while an install runs — the 4 px progress bar under the text, exactly as the
 * sheet draws it. Entities that are current are hidden unless asked for; an empty card says so.
 */
export class FluvyUpdatesCard extends Card<UpdatesCardConfig> {
  /** The card's height at a 360 column from its config alone: every update listed waits (`updatesHeight`). */
  static override layoutHeight(config: UpdatesCardConfig): number {
    return updatesHeight(config, idsOf(config.entities).length);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.inputs,
    rowStyles,
    rowEndStyles,
    css`
      /* the sheet's 76 progress row, free to grow by a line like every other row; laid out as the bar rows are: the circle
         on the title / sub pair (8 from the top), the text 12 down, the bar under it — not centred on the taller row */
      .in-row--progress {
        height: auto;
        min-height: 76px;
        align-items: flex-start;
        padding: 0 0 12px;
      }

      .in-row--progress .fv-ico {
        margin-top: 8px;
      }

      .in-row--progress .fv-row__text {
        margin-top: 12px;
      }

      /* in progress without a percentage: the empty track breathes, so it does not read as "0 %" */
      .in-progress--busy {
        animation: fv-shimmer 1400ms ease-in-out infinite;
      }

      .in-rows--quiet .fv-row__title {
        color: var(--fluvy-text-secondary);
        font-weight: 500;
      }
    `,
  ];

  static override editor(): Promise<CardEditor> {
    return import('./updates-editor.js');
  }

  static getStubConfig(_hass: unknown, entities: readonly string[]): UpdatesCardConfig {
    return {
      type: 'custom:fluvy-updates-card',
      entities: entities.filter((id) => id.startsWith('update.')).slice(0, 4),
    };
  }

  protected override prepare(config: UpdatesCardConfig): UpdatesCardConfig {
    listOf(config, 'entities');
    return config;
  }

  protected override watched(): readonly string[] {
    return [...idsOf(this.config?.entities), ...(this.config?.toggle ? [this.config.toggle] : [])];
  }

  override getCardSize(): number {
    return 1 + Math.max(1, idsOf(this.config?.entities).length) + (this.config?.toggle ? 1 : 0);
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** The head's fitting; its ruler lays widths out in the card's own classes (whether the rows' ends leave names room). */
  private readonly head = new HeadFit(this);

  /* ---------- rows ---------- */

  /** 0–100 while Home Assistant reports a percentage, null while it only says "in progress" (or nothing). */
  private percent(view: EntityView): number | null {
    const raw = view.attr<unknown>('update_percentage');
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : null;
  }

  private installing(view: EntityView): boolean {
    if (view.status !== 'ok') return false;
    return (
      view.attr<unknown>('in_progress') === true ||
      this.percent(view) !== null ||
      this.stateOf(view) === STARTING
    );
  }

  private versions(view: EntityView): string {
    const from = view.attr<string | null>('installed_version');
    const to = view.attr<string | null>('latest_version');
    if (from && to && from !== to) return s(this.hass, 'versions', { from, to });
    return to ?? from ?? '';
  }

  /** An update that Install starts from here: not running, waiting, and installable by Home Assistant. */
  private installable(view: EntityView): boolean {
    return !this.installing(view) && view.state === 'on' && view.supports(INSTALL);
  }

  /** What ends a row that waits for nothing from here: "Up to date", or a dash while it cannot be read. */
  private value(view: EntityView): string {
    return view.status === 'ok' ? s(this.hass, 'up_to_date') : '—';
  }

  /**
   * What ends each row, for the rows' rule: Install's words, a chevron's 44, a state's words; a row installing has
   * its bar and nothing at its end.
   */
  private ends(shown: readonly EntityView[]): RowEnd[] {
    const install = s(this.hass, 'install');
    return shown
      .filter((view) => !this.installing(view))
      .map((view) =>
        this.installable(view)
          ? { name: view.name, button: install }
          : {
              name: view.name,
              end:
                view.state === 'on' ? 44 : this.head.ruler.width('fv-row__value', this.value(view)),
            },
      );
  }

  /** `bare`: the rows have given their circles to their names (what ends one, never cut, squeezed it). */
  private row(view: EntityView, narrow: boolean, bare: boolean): TemplateResult {
    const unusable = view.status === 'unavailable' || view.status === 'missing';
    const ref = iconOf(view);
    const circle = (tone: Tone): TemplateResult | typeof nothing =>
      bare ? nothing : html`<span class="fv-ico fv-ico--${tone}" data-icon>${icon(ref)}</span>`;

    if (this.installing(view)) {
      const percent = this.percent(view);
      const progress =
        percent === null
          ? s(this.hass, 'working')
          : s(this.hass, 'installing', {
              percent: formatNumber(this.hass, percent, { digits: 0 }),
            });
      // a narrow column keeps what is happening and lets go of the version step it cannot hold beside it
      const sub = narrow
        ? progress.charAt(0).toLocaleUpperCase() + progress.slice(1)
        : [this.versions(view), progress].filter(Boolean).join(' · ');
      return html`<div class="fv-row in-row--progress ${bare ? 'fv-row--bare' : ''}">
        ${circle('accent')}
        <span class="fv-row__text">
          <span class="fv-row__title" data-name>${view.name}</span>
          <span class="fv-row__sub">${sub}</span>
          <span
            class="in-progress ${percent === null ? 'in-progress--busy' : ''}"
            role="progressbar"
            aria-label=${view.name}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${percent ?? nothing}
            ><span
              class="in-progress__fill"
              data-measure="value"
              style="width:${percent ?? 0}%"
            ></span
          ></span>
        </span>
      </div>`;
    }

    if (this.installable(view)) {
      const word = s(this.hass, 'install');
      const install = rowButton(
        'link',
        word,
        s(this.hass, 'install_named', { name: view.name }),
        () => {
          this.expect(view.id, STARTING); // the row turns into its progress bar under the finger
          this.call('update', 'install', {}, view.id);
        },
      );
      // where even without its circle Install would leave the name under its room, it goes under the name
      const stack =
        bare && rowStacks(this.head.ruler, this.contentWidth, { name: view.name, button: word });
      return html`<div class="fv-row ${bare ? 'fv-row--bare' : ''} ${stack ? 'fv-row--stack' : ''}">
        ${circle('neutral')}
        <span class="fv-row__text"
          ><span class="fv-row__title" data-name>${view.name}</span
          ><span class="fv-row__sub">${this.versions(view)}</span></span
        >
        ${install}
      </div>`;
    }

    // nothing to install from here: the trailing slot says why, or the chevron leads to Home Assistant's own dialog
    return listRow({
      icon: bare ? null : ref,
      tone: unusable ? 'off' : 'neutral',
      title: view.name,
      name: true,
      sub: this.versions(view),
      trailing: view.state === 'on' ? 'chevron' : 'value',
      value: this.value(view),
      unavailable: unusable,
      onTap:
        view.status === 'missing' ? undefined : () => this.tap(view.id, { action: 'more-info' }),
    });
  }

  /** The switch under the list, in the list's column: without its circle when the rows gave theirs to their names. */
  private toggleRow(bare: boolean): TemplateResult | typeof nothing {
    const id = this.config?.toggle;
    if (!id) return nothing;
    const view = this.entity(id);
    const unusable = view.status === 'unavailable' || view.status === 'missing';
    const on = this.stateOf(view) === 'on';
    return html`<div class="in-rows">
      ${listRow({
        icon: bare ? null : (view.attr<string>('icon') ?? 'clock'),
        tone: unusable ? 'off' : on ? 'accent' : 'neutral',
        title: view.name,
        sub:
          this.config?.toggle_secondary ??
          (view.status === 'ok' ? view.areaName : stateText(this.hass, view)),
        trailing: 'switch',
        on,
        switchTone: 'accent',
        unavailable: unusable,
        onToggle: (next) => {
          this.expect(view.id, next ? 'on' : 'off');
          this.call('homeassistant', next ? 'turn_on' : 'turn_off', {}, view.id);
        },
      })}
    </div>`;
  }

  protected renderCard(): TemplateResult {
    const views = idsOf(this.config?.entities).map((id) => this.entity(id));
    const waiting = views.filter((view) => view.state === 'on' || this.installing(view));
    // an update that cannot be read — unavailable, unknown, gone — keeps its row, in its order: whether it waits is
    // not known, and the list keeps its size (1.9)
    const away = views.filter((view) => view.status !== 'ok');
    const shown = this.config?.show_up_to_date
      ? views
      : views.filter((view) => waiting.includes(view) || away.includes(view));
    // nothing to show is nothing waiting (or nothing listed): the card says so in its quiet row, or hides when asked
    hideEmpty(this, !shown.length);
    const narrow = this.contentWidth < NARROW;
    const bare = !rowsKeepIcon(this.head.ruler, this.contentWidth, this.ends(shown));

    const stamps = views
      .map((view) => (view.stateObj ? new Date(view.stateObj.last_updated).getTime() : Number.NaN))
      .filter((time) => Number.isFinite(time));
    const checked = stamps.length
      ? s(this.hass, 'checked', { time: formatTime(this.hass, new Date(Math.max(...stamps))) })
      : '';
    // nothing waits that can be read: "Up to date" only where every update can be
    const count =
      waiting.length === 0
        ? away.length
          ? plural(this.hass, 'room.unavailable', away.length, { count: away.length })
          : s(this.hass, 'up_to_date')
        : waiting.length === 1
          ? s(this.hass, 'one_available')
          : s(this.hass, 'available', { count: waiting.length });

    // the head fitted to its column: the badge, then the line's trailing segments, then the circle — never the title
    // cut ("Actualizaciones" at 211)
    const title = this.config?.title ?? s(this.hass, 'title');
    const fitted = this.head.fit({
      width: this.contentWidth,
      title,
      sub: narrow ? count : (this.config?.subtitle ?? checked),
      badge: narrow ? null : { text: count, tone: waiting.length ? 'accent' : 'neutral' },
    });
    return html`<article class="fv-card" data-card>
      ${head({
        icon: fitted.icon ? (this.config?.icon ?? 'update') : null,
        tone: toneOf(this.config, 'accent'),
        title,
        sub: fitted.sub,
        trailing: fitted.badge,
        cut: fitted.cut,
        ...this.headActions(),
      })}
      ${
        shown.length
          ? html`<div class="in-rows">${shown.map((view) => this.row(view, narrow, bare))}</div>`
          : html`<div class="in-rows in-rows--quiet">
              ${listRow({ icon: 'check', tone: 'neutral', title: this.config?.empty_text ?? s(this.hass, 'all_up_to_date'), trailing: 'none' })}
            </div>`
      }
      ${this.toggleRow(bare)}
    </article>`;
  }
}
