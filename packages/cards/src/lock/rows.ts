import {
  formatTime,
  isActive,
  isUsable,
  relativeTime,
  stateText,
  strings,
  TOGGLE_DOMAINS,
  toggleEntity,
  valueParts,
  type ActionConfig,
  type EntityName,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
} from '@fluvy/core';
import { listRow, type Tone } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { HeadFit } from '../energy/head.js';
import { Card } from '../shared/base.js';
import { currentTone, iconOf, toneFor } from '../shared/domain.js';
import { statusToneOf, toneOf } from '../shared/colour.js';
import { type Secondary } from '../shared/config.js';
import {
  chosenLabel,
  dropdown,
  dropdownEnd,
  SELECTS,
  type SelectRowConfig,
} from '../shared/dropdown.js';
import { withUnit } from '../shared/duration.js';
import { buttonWidth, rowsKeepIcon, rowStacks } from '../shared/row-end.js';
import { secondaryText } from '../shared/secondary.js';
import { changedAt, sinceIds } from '../shared/since.js';
import { TemplateTexts } from '../shared/templates.js';

/** A row of a list of entities; a select's offers its options in its order and words (#96). */
export interface RowConfig extends SelectRowConfig {
  entity: string;
  name?: EntityName;
  icon?: string;
  /** What the row says under its name: area, last change, state, none, an attribute, or a template; the area, else the time. */
  secondary?: Secondary;
  /** Where its last change is read from (#67): a timestamp sensor, or `attribute:<name>` of its own; else Home Assistant's. */
  since?: string;
  tap_action?: ActionConfig;
  tone?: Tone;
  color?: string;
}

export interface RowsCardConfig extends FluvyCardConfig {
  /** Entities shown as 60 px rows under the card's own control. */
  rows?: ReadonlyArray<string | RowConfig>;
  show_rows?: boolean;
}

const s = strings('lock');

/** What a row opens where it names no tap of its own: its entity's details, never the card's own tap. */
export const DETAILS: ActionConfig = { action: 'more-info' };

/** A row switch is only for what is harmless to flip by accident — never a lock, a garage door or a valve. */
const NEVER_A_SWITCH = new Set([
  'lock',
  'cover',
  'valve',
  'scene',
  'script',
  'button',
  'input_button',
  'vacuum',
  'media_player',
]);
/** Domains whose state is worth reading at the end of the row. */
const READ_OUT = new Set([
  'sensor',
  'binary_sensor',
  'lock',
  'cover',
  'valve',
  'person',
  'device_tracker',
  'sun',
  'input_select',
  'select',
  'number',
  'input_number',
  'counter',
  'timer',
]);

/** Within half a day a time of day cannot be misread; after that a bare "21:40" would lie about the day. */
const RECENT_MS = 12 * 3600_000;

/** When the entity last changed — as its `since` says where that reads (#67) — and whether that is recent. */
function lastChanged(
  hass: HomeAssistant | undefined,
  view: EntityView,
  since?: string,
): { date: Date; recent: boolean } | null {
  const date = changedAt(hass, view, since);
  if (!date || Number.isNaN(date.getTime())) return null;
  return { date, recent: Date.now() - date.getTime() < RECENT_MS };
}

/** A recent change reads as its time ("21:40"), an older one as its age ("2 days ago"). */
function changedTime(hass: HomeAssistant | undefined, view: EntityView, since?: string): string {
  const changed = lastChanged(hass, view, since);
  if (!changed) return '';
  return changed.recent ? formatTime(hass, changed.date) : relativeTime(hass, changed.date);
}

/** Head sub line of a lock or an alarm: "21:40 by Marta", else "Since 21:40", else the age of the state. */
export function changedLine(hass: HomeAssistant | undefined, view: EntityView): string {
  if (view.status !== 'ok') return stateText(hass, view);
  const changed = lastChanged(hass, view);
  if (!changed) return view.areaName;
  const time = changedTime(hass, view);
  const who = view.attr<string | null>('changed_by');
  if (who) return s(hass, 'by', { time, who });
  return changed.recent ? s(hass, 'since', { time }) : time;
}

/**
 * That line's shorter forms, longest first, for a head too narrow for it: the time alone ("32 days ago" — who did it
 * goes first), then its short form ("32 d ago"). Never a time cut.
 */
export function changedShort(hass: HomeAssistant | undefined, view: EntityView): string[] {
  const changed = lastChanged(hass, view);
  if (view.status !== 'ok' || !changed) return [];
  return [
    changedTime(hass, view),
    ...(changed.recent ? [] : [relativeTime(hass, changed.date, new Date(), true)]),
  ];
}

/** A row as the list plans it: what it shows, and the width of what ends it. */
interface RowPlan {
  readonly row: RowConfig;
  readonly view: EntityView;
  readonly usable: boolean;
  readonly trailing: 'switch' | 'value' | 'chevron' | 'menu';
  readonly value: string;
  readonly end: number;
  readonly title: string;
  readonly words: string;
  /** The line's shorter form (`secondaryText`'s), for a row too narrow for its words: a time's, a state's one word. */
  readonly short: string;
  readonly age: boolean;
}

/**
 * Cards that end in a list of entity rows (lock, alarm, camera). One trailing element per row, chosen
 * by the entity: a switch for what is safe to toggle, the value for what is measured, a select's value that opens
 * its dropdown (#96), a chevron for the rest.
 */
export abstract class RowsCard<C extends RowsCardConfig = RowsCardConfig> extends Card<C> {
  private rowList: readonly RowConfig[] = [];
  /** The head's fitting and the rows' (what gives way, in its order), for the card and its rows alike. */
  protected readonly headFit = new HeadFit(this);
  /** A row's second line when it is a template: rendered by Home Assistant, live. */
  protected readonly texts = new TemplateTexts(this);

  protected override prepare(config: C): C {
    const rows: unknown = config.rows;
    this.rowList = (Array.isArray(rows) ? (rows as ReadonlyArray<string | RowConfig | null>) : [])
      .map((row) => (typeof row === 'string' ? { entity: row } : row))
      .filter((row): row is RowConfig => typeof row?.entity === 'string' && row.entity !== '');
    return config;
  }

  protected get rowCount(): number {
    return this.config?.show_rows === false ? 0 : this.rowList.length;
  }

  /** The card's entity, its rows', and what the rows' last change is read from (`since`). */
  protected override watched(): readonly string[] {
    return [
      this.config?.entity ?? '',
      ...this.rowList.map((row) => row.entity),
      ...sinceIds(this.rowList),
    ];
  }

  /**
   * `events` draws the rows as history (camera detections): a chevron, and a neutral circle unless the row names a tone
   * or a colour; the line says when it changed as the time of day, unless the row asks for another one.
   */
  protected renderRows(events = false): TemplateResult | typeof nothing {
    if (!this.rowList.length || this.config?.show_rows === false) return nothing;
    const plans = this.rowList.map((row) => this.plan(row, events));
    // a column too narrow for a name beside what ends its row gives every row's circle to its words, as every list does
    const keep =
      this.headFit.rowsKeepIcon(
        this.contentWidth,
        plans.map((p) => ({ title: p.title, value: p.value, end: p.end })),
      ) &&
      // …and a dropdown's value holds within its cap beside its name (the rows' rule for a button)
      rowsKeepIcon(
        this.headFit.ruler,
        this.contentWidth,
        plans.flatMap((p) => (p.trailing === 'menu' ? [dropdownEnd(p.title, p.value)] : [])),
      );
    // an age in its full words ("21 days ago") where every row's fits beside what ends it, else every age short
    // ("21 d"): one form a list, never cut
    const short = plans.some(
      (p) => p.age && this.headFit.ruler.width('fv-row__sub', p.words) > this.wordsRoom(p, keep),
    );
    // the longest word of a value in words, so a name's floor leaves it its line (devices.css)
    const word = Math.max(
      0,
      ...plans.flatMap((p) =>
        /\S\s+\S/.test(p.value)
          ? p.value.split(/\s+/).map((w) => this.headFit.ruler.width('fv-row__value', w))
          : [],
      ),
    );
    return html`<div class="dv-rows" style=${word ? `--fv-word:${word}px` : nothing}>
      ${plans.map((p) => this.renderRow(p, events, keep, short))}
    </div>`;
  }

  /** What a row shows and how wide its end is, before the list decides its circles and its ages. */
  private plan(row: RowConfig, events: boolean): RowPlan {
    const view = this.entity(row.entity);
    const usable = isUsable(view);
    const canToggle = usable && TOGGLE_DOMAINS.has(view.domain) && !NEVER_A_SWITCH.has(view.domain);
    // a select's value opens its dropdown (#96), unless the row names a tap of its own
    const trailing: RowPlan['trailing'] =
      SELECTS.has(view.domain) && !row.tap_action
        ? 'menu'
        : canToggle
          ? 'switch'
          : !events && view.status === 'ok' && (view.number !== null || READ_OUT.has(view.domain))
            ? 'value'
            : 'chevron';
    const parts = trailing === 'value' ? valueParts(this.hass, view) : null;
    // a select says its option in the row's words (`labels`)
    const value =
      trailing === 'switch' || trailing === 'chevron'
        ? ''
        : SELECTS.has(view.domain)
          ? chosenLabel(this.hass, view, row, this.stateOf(view))
          : parts
            ? `${parts.value}${parts.unit ? ` ${parts.unit}` : ''}`
            : stateText(this.hass, view);
    // the line says when it changed unless the row asks for another one (the area, its state, an attribute, a template,
    // none); in history that is the time of day (its age, once it is over half a day old)
    const mode = row.secondary ?? 'last-changed';
    const changed = lastChanged(this.hass, view, row.since);
    const time = events && mode === 'last-changed' && view.status === 'ok';
    const line = (short: boolean): string =>
      secondaryText(
        this.hass,
        view,
        mode,
        trailing === 'value' || trailing === 'menu',
        this.texts,
        short,
        row.since,
      );
    return {
      row,
      view,
      usable,
      trailing,
      value,
      // the end's own width: the value's words, a dropdown's button, a switch's 56 (its hit area), a chevron's 44
      end:
        trailing === 'value'
          ? this.headFit.ruler.width('fv-row__value', value)
          : trailing === 'menu'
            ? buttonWidth(this.headFit.ruler, value, true)
            : trailing === 'switch'
              ? 56
              : 44,
      title: this.nameFor(view, row.name),
      words: time ? changedTime(this.hass, view, row.since) : line(false),
      short: time ? '' : line(true),
      // an age only where the line is one: a state's word (a row that cannot be read) is never shortened into one
      age:
        view.status === 'ok' &&
        changed !== null &&
        mode === 'last-changed' &&
        (!events || !changed.recent),
    };
  }

  /** A row's words' room: the column less its circle (where kept), the gap and what ends the row. */
  private wordsRoom(p: RowPlan, keep: boolean): number {
    return this.headFit.rowRoom(this.contentWidth, '', { icon: keep, end: p.end });
  }

  /** An age in its short form: "21 d", "3 h", "12 min" — "21日", "12分". */
  private shortAge(p: RowPlan): string {
    const changed = lastChanged(this.hass, p.view, p.row.since);
    if (!changed) return '';
    const minutes = Math.max(1, Math.round((Date.now() - changed.date.getTime()) / 60_000));
    const [n, unit] =
      minutes < 60
        ? [minutes, 'time.unit_min' as const]
        : minutes < 1440
          ? [Math.round(minutes / 60), 'time.unit_h' as const]
          : [Math.round(minutes / 1440), 'time.unit_d' as const];
    return withUnit(n, this.t(unit));
  }

  private renderRow(p: RowPlan, events: boolean, keep: boolean, short: boolean): TemplateResult {
    const { row, view, usable, trailing } = p;
    const state = this.stateOf(view);
    const on = state === view.state ? isActive(view) : state === 'on';
    const tone = statusToneOf(row, toneFor(view));
    const menu = trailing === 'menu';
    // a dropdown that would not hold beside the words even without the circle goes under them, the line its whole row
    const stack =
      menu &&
      !keep &&
      rowStacks(this.headFit.ruler, this.contentWidth, dropdownEnd(p.title, p.value, p.short));
    // a row that cannot be read says its state's word where it fits; where it would be cut, the dashed skin says it
    // alone and the word is the row's label (as a gone tile's)
    const fits = (text: string): boolean =>
      this.headFit.ruler.width('fv-row__sub', text) <=
      (stack ? this.contentWidth : this.wordsRoom(p, keep));
    const word = view.status !== 'ok' && !fits(p.words) ? p.words : '';
    // a line the row cannot hold whole takes its shorter form ("32 d ago", "Not found"), read in full
    const sub = p.age && short ? this.shortAge(p) : word ? '' : fits(p.words) ? p.words : p.short;
    return listRow({
      icon: keep ? iconOf(view, row.icon) : null,
      tone: events
        ? usable
          ? toneOf(row, 'neutral')
          : 'off'
        : currentTone(view, on ? tone : 'neutral'),
      title: p.title,
      name: true,
      sub,
      // a short line is read in full; a word the row could not hold is read too
      ...(word
        ? { label: `${p.title} · ${word}` }
        : sub !== p.words
          ? { label: `${p.title} · ${p.words}` }
          : {}),
      stack,
      trailing: menu
        ? dropdown({
            host: this.controlHost,
            hass: this.hass,
            view,
            row,
            name: p.title,
            value: p.value,
            stack,
            ruler: this.headFit.ruler,
            width: this.contentWidth,
          })
        : trailing,
      on,
      switchTone: tone === 'warning' ? 'accent' : tone,
      value: p.value,
      valueTone: view.domain === 'binary_sensor' && on && tone === 'warning' ? 'warning' : '',
      unavailable: !usable,
      accent: this.accents.item(row.color),
      // a dropdown's row is no button of its own: its value is; out of reach, the row opens its details
      onTap: menu && usable ? undefined : () => this.tap(view.id, row.tap_action ?? DETAILS),
      onToggle: (next) => {
        if (!this.hass) return;
        this.expect(view.id, next ? 'on' : 'off');
        void toggleEntity(this.hass, view.id);
      },
    });
  }
}
