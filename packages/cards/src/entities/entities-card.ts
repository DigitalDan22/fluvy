import {
  isActive,
  isUsable,
  lightDefaults,
  navigate,
  stateText,
  TOGGLE_DOMAINS,
  toggleEntity,
  valueParts,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceGridOptions,
} from '@fluvy/core';

import { head, listRow } from '@fluvy/ui';

import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';

import { Card, type CardEditor } from '../shared/base.js';

import { currentTone, iconOf, toneFor } from '../shared/domain.js';
import { chosenLabel, dropdown, dropdownEnd, SELECTS } from '../shared/dropdown.js';
import { DETAILS, type RowConfig } from '../lock/rows.js';
import { ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { statusToneOf, toneOf, type LightColours } from '../shared/colour.js';
import { lightLook, litColour, withMembers } from '../shared/light.js';
import { buttonWidth, rowEndStyles, rowsKeepIcon, rowStacks } from '../shared/row-end.js';
import { secondaryText } from '../shared/secondary.js';
import { sinceIds } from '../shared/since.js';
import { isTemplate, TemplateTexts } from '../shared/templates.js';
import { EMPTY, entryCount, HEAD, ROW_COMPACT, ROW } from '../shared/heights.js';
import { emptyPanel, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import { HeadFit, SWITCH_SLOT } from '../energy/head.js';

/** A row of the card: the rows every list shares (`RowConfig`). */
export type EntityRowConfig = RowConfig;

export interface EntitiesCardConfig extends FluvyCardConfig, EmptyList, LightColours {
  title?: string;
  subtitle?: string;
  rows?: ReadonlyArray<string | EntityRowConfig>;
  /** Show "3 on" / "All off" in the head. */
  show_count?: boolean;
  /** `rows` (default): 60 px rows with a second line. `compact`: 48 px rows, the name alone. */
  variant?: 'rows' | 'compact';
  /**
   * How many more the list has elsewhere: a last row, "{count} more", that opens `more_path` (the automatic
   * dashboards end a capped list with it, #78). Both or none.
   */
  more?: number;
  more_path?: string;
}

/** The "N more" row a card ends with: how many, and where they are; none without both. */
const moreOf = (config: EntitiesCardConfig | undefined): { count: number; path: string } | null => {
  const count = Math.floor(Number(config?.more));
  const path = config?.more_path;
  return count >= 1 && typeof path === 'string' && path ? { count, path } : null;
};

/**
 * A card of 60 px rows: icon circle, title / sub, and ONE trailing element chosen by the entity —
 * a switch for what can be toggled, the value for what is measured, a chevron for the rest.
 * State is said once: the trailing element carries it, the sub line carries context (area or time).
 */
export class FluvyEntitiesCard extends Card<EntitiesCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: EntitiesCardConfig): number {
    const n = entryCount(config, ['rows', 'entities']) + (moreOf(config) ? 1 : 0);
    // nothing to list: the panel under the head, or alone in the card (20 + 120 + 20)
    if (!n) return (config.title ? HEAD : 40) + EMPTY;
    // the head and 8 over the rows (20 + 44 + 8 + … + 20), else the rows alone, 8 into the padding at each end
    return (config.title ? 92 : 24) + (config.variant === 'compact' ? ROW_COMPACT : ROW) * n;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    rowEndStyles,
    css`
      .fv-rows {
        margin-top: 8px;
      }
      .fv-rows--bare {
        margin-top: -8px;
        margin-bottom: -8px;
      }
      /* a state in words is never cut: it wraps at its words, never narrower than its longest one ("Niet /
         gedetecteerd"), and the name gives way first */
      .fv-row__value.fv-row__value--text {
        overflow-wrap: normal;
        min-width: min-content;
      }
      .fv-row:has(.fv-row__value--text) .fv-row__text {
        min-width: 0;
      }
      /* a row that gave its circle away lets a state of a few words take a second line between them ("No /
         detectado") before the time under the name is cut */
      .fv-row--bare > .fv-row__value--words {
        flex-shrink: 1;
        white-space: normal;
        text-align: end;
      }
      /* …and where not even then, the state goes under the words, at their start, and the row grows */
      .fv-row--stack {
        flex-wrap: wrap;
        row-gap: 4px;
        height: auto;
        min-height: 60px;
        padding: 8px 0;
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

  static override editor(): Promise<CardEditor> {
    return import('./entities-editor.js');
  }
  static override aliases: AliasSpec = { items: { rows: ITEM_ALIASES } };
  /** A row's second line when it is a template: rendered by Home Assistant, live. */
  private readonly texts = new TemplateTexts(this);
  /** Fits the head to its column (measured in the card's own classes, again when a font lands). */
  private readonly head = new HeadFit(this);

  static getStubConfig(_hass: unknown, entities: readonly string[]): EntitiesCardConfig {
    return { type: 'custom:fluvy-entities-card', title: 'Devices', entities: entities.slice(0, 4) };
  }

  private rows(): EntityRowConfig[] {
    return itemsOf(this.config?.rows ?? this.config?.entities);
  }

  protected override prepare(config: EntitiesCardConfig): EntitiesCardConfig {
    listOf(config, 'rows', ['entities']);
    return config;
  }

  /** The rows' entities (a light group's members too), and what the rows' last change is read from (`since`). */
  protected override watched(): readonly string[] {
    const rows = this.rows();
    return [
      ...withMembers(
        rows.map((r) => r.entity),
        this.hass,
      ),
      ...sinceIds(rows),
    ];
  }

  override getCardSize(): number {
    return 1 + this.rows().length + (moreOf(this.config) ? 1 : 0);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected renderCard(): TemplateResult {
    const rows = this.rows();
    const views = rows.map((row) => this.entity(row.entity));
    const active = views.filter((v) => isActive(v)).length;
    const tone = toneOf(this.config, 'accent');
    const compact = this.config?.variant === 'compact';
    const title = this.config?.title;
    // a lit light's row may wear its bulb's colour (`light_colors`, the house's where the card says none)
    const glows = this.config?.light_colors ?? lightDefaults().colors;
    const more = moreOf(this.config);
    const panel = emptyPanel(this, !rows.length && !more, 'grid', 'common.no_entities');
    // the count gives way to the title, then the circle does, as every head's do (`HeadFit`); an empty list's panel
    // says what a count of nothing would
    const fitted = title
      ? this.head.fit({
          width: this.contentWidth,
          title,
          sub: this.config?.subtitle ?? '',
          badge:
            this.config?.show_count && !panel
              ? {
                  text:
                    active > 0
                      ? `${active} ${this.t('common.on').toLowerCase()}`
                      : this.t('common.off'),
                  tone: active > 0 ? tone : 'neutral',
                }
              : null,
        })
      : null;
    const header =
      title && fitted
        ? head({
            icon: fitted.icon ? (this.config?.icon ?? 'grid') : null,
            tone,
            title,
            sub: fitted.sub,
            trailing: fitted.badge,
          })
        : nothing;

    // what ends each row (its switch, its value's words, its chevron, a select's dropdown) is decided before the rows
    // are drawn: a column too narrow for a name beside its end gives every row's circle to the names, as every list does
    const laid = rows.map((row, i) => {
      const view = views[i] as EntityView;
      const usable = isUsable(view);
      // a select's value opens its dropdown (#96), unless the row names a tap of its own
      const menu = SELECTS.has(view.domain) && !row.tap_action;
      // a row switch is for what is safe to flip by accident: never a lock, and not the things that are not on/off
      const canToggle =
        usable &&
        TOGGLE_DOMAINS.has(view.domain) &&
        !['scene', 'script', 'button', 'input_button', 'lock', 'vacuum', 'media_player'].includes(
          view.domain,
        );
      const measured = view.domain === 'sensor' || view.number !== null;
      const trailing: 'switch' | 'value' | 'chevron' | 'menu' = menu
        ? 'menu'
        : canToggle
          ? 'switch'
          : usable &&
              (measured ||
                view.domain === 'binary_sensor' ||
                view.domain === 'person' ||
                view.domain === 'sun' ||
                view.domain === 'weather' ||
                view.domain === 'input_select' ||
                view.domain === 'select' ||
                view.domain === 'lock' ||
                view.domain === 'vacuum' ||
                view.domain === 'media_player')
            ? 'value'
            : 'chevron';
      const parts = valueParts(this.hass, view);
      // a select says its option in the row's words (`labels`)
      const value =
        trailing === 'switch' || trailing === 'chevron'
          ? ''
          : SELECTS.has(view.domain)
            ? chosenLabel(this.hass, view, row, this.stateOf(view))
            : view.number !== null
              ? `${parts.value}${parts.unit ? ` ${parts.unit}` : ''}`
              : stateText(this.hass, view);
      // the end's own width where it is not a value's words: a switch's 56, a chevron's 44, a dropdown's button
      const end =
        trailing === 'switch'
          ? SWITCH_SLOT
          : trailing === 'chevron'
            ? 44
            : menu
              ? buttonWidth(this.head.ruler, value, true)
              : undefined;
      const sub = (short = false): string =>
        secondaryText(
          this.hass,
          view,
          row.secondary,
          trailing === 'value' || menu,
          this.texts,
          short,
          row.since,
        );
      return { view, usable, trailing, title: row.name ?? view.name, value, end, sub };
    });
    // the "N more" row says it in words where they hold beside its chevron, else as "+N"
    const moreWords = more ? this.t('common.more_count', { count: more.count }) : '';
    const moreTitle =
      more &&
      this.head.rowRoom(this.contentWidth, '', { icon: false, end: 44 }) <
        this.head.ruler.width('fv-row__title', moreWords)
        ? `+${more.count}`
        : moreWords;
    const keep =
      this.head.rowsKeepIcon(
        this.contentWidth,
        [
          ...laid.map(({ title, value, end, sub }) => ({
            title,
            value,
            // the least the line says (a time's short form), so a passing minute never moves the circles
            sub: compact ? '' : sub(true),
            ...(end === undefined ? {} : { end }),
          })),
          ...(more ? [{ title: moreTitle, value: '', end: 44 }] : []),
        ],
        compact,
      ) &&
      // …and a dropdown's value holds within its cap beside its name (the rows' rule for a button)
      rowsKeepIcon(
        this.head.ruler,
        this.contentWidth,
        laid.flatMap(({ trailing, title, value }) =>
          trailing === 'menu' ? [dropdownEnd(title, value)] : [],
        ),
      );
    // a line too long for its row even so takes its short form ("32 d geleden", "Not found"); where not even that
    // holds beside a state in words at its narrowest (its longest word), the state goes under the words. A dropdown
    // goes under them where even without the circle it would not hold beside them (`rowStacks`), a compact row's (its
    // name alone) too: its value is never cut where the row can hold it
    const line = ({
      trailing,
      title,
      value,
      end,
      sub,
    }: (typeof laid)[number]): {
      sub: string;
      stack: boolean;
    } => {
      const full = compact ? '' : sub();
      const short = compact ? '' : sub(true);
      const width = (text: string): number => this.head.ruler.width('fv-row__sub', text);
      if (
        trailing === 'menu' &&
        !keep &&
        rowStacks(this.head.ruler, this.contentWidth, dropdownEnd(title, value, short))
      )
        return { sub: width(full) <= this.contentWidth ? full : short, stack: true };
      if (compact) return { sub: '', stack: false };
      const room = this.head.rowRoom(
        this.contentWidth,
        value,
        end === undefined ? { icon: keep } : { icon: keep, end },
      );
      if (width(full) <= room) return { sub: full, stack: false };
      const least = Math.max(
        0,
        ...value.split(' ').map((word) => this.head.ruler.width('fv-row__value', word)),
      );
      const stack = !keep && end === undefined && this.contentWidth - 12 - least < width(short);
      return { sub: stack && width(full) <= this.contentWidth ? full : short, stack };
    };

    return html`<article class="fv-card" data-card>
      ${header}
      <div class="fv-rows ${this.config?.title ? '' : 'fv-rows--bare'}">
        ${panel}
        ${rows.map((row, i) => {
          const { view, usable, trailing, title, value } = laid[i]!;
          const state = this.stateOf(view);
          const on =
            state === view.state ? isActive(view) : !['off', 'closed', 'locked'].includes(state);
          const warn = view.domain === 'binary_sensor' && on && toneFor(view) === 'warning';
          // a light's row wears what the rule every light follows says (`lightLook`); any other its own colour, else
          // its kind's tone (a warning stays one)
          const [colour, rowTone] =
            view.domain === 'light'
              ? lightLook(
                  row,
                  this.config,
                  glows ? litColour(view, on, this.config?.light_whites, this.hass) : undefined,
                )
              : ([row.color, statusToneOf(row, toneFor(view))] as const);
          const said = line(laid[i]!);
          const menu = trailing === 'menu';
          return listRow({
            icon: keep ? iconOf(view, row.icon) : null,
            tone: currentTone(view, on ? rowTone : 'neutral'),
            title,
            name: true,
            sub: said.sub,
            stack: said.stack,
            // a template's line is the owner's words: a name, that may end in its ellipsis
            subName: isTemplate(row.secondary ?? ''),
            trailing: menu
              ? dropdown({
                  host: this.controlHost,
                  hass: this.hass,
                  view,
                  row,
                  name: title,
                  value,
                  stack: said.stack,
                  ruler: this.head.ruler,
                  width: this.contentWidth,
                })
              : trailing,
            on,
            compact,
            accent: this.accents.item(colour),
            switchTone: rowTone === 'warning' ? 'accent' : rowTone,
            value,
            valueTone: warn ? 'warning' : '',
            unavailable: !usable,
            // a dropdown's row is no button of its own: its value is
            onTap: menu ? undefined : () => this.tap(view.id, row.tap_action ?? DETAILS),
            onToggle: (next) => {
              if (!this.hass) return;
              this.expect(
                view.id,
                next
                  ? view.domain === 'cover' || view.domain === 'valve'
                    ? 'open'
                    : view.domain === 'lock'
                      ? 'unlocked'
                      : 'on'
                  : view.domain === 'cover' || view.domain === 'valve'
                    ? 'closed'
                    : view.domain === 'lock'
                      ? 'locked'
                      : 'off',
              );
              void toggleEntity(this.hass, view.id);
            },
          });
        })}
        ${
          more
            ? // the house's fold row: the list's glyph, how many more, the chevron to where they are
              listRow({
                icon: keep ? 'list' : null,
                tone: 'neutral',
                title: moreTitle,
                trailing: 'chevron',
                compact,
                label: moreWords,
                onTap: () => navigate(more.path),
              })
            : nothing
        }
      </div>
    </article>`;
  }
}
