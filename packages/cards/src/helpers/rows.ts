import { isActive, stateText, strings, valueParts, type EntityView } from '@fluvy/core';
import { chips, glyph, icon, listRow, type ChipItem, type Tone } from '@fluvy/ui';
import type { FluvySelect, SelectChangeDetail, SelectOption } from '@fluvy/ui/select';
import { html, nothing, type TemplateResult } from 'lit';
import { currentTone, iconOf, toneFor } from '../shared/domain.js';
import {
  contextOf,
  isUnusable,
  nameOf,
  ownSecondary,
  type HelperHost,
  type HelperRowConfig,
} from './context.js';
import { type TextRuler } from '../shared/fit.js';
import { changedAt } from '../shared/since.js';
import {
  dayText,
  dayTextShort,
  daysUntil,
  parseMomentText,
  presetTime,
  relativeAgo,
  relativeDays,
  sentenceCase,
  timeText,
  type Moment,
} from './datetime.js';

const s = strings('helpers');

/** Below this content width a row's extras stop indenting to the text column. */
const NARROW = 300;
/** A row button's sides: its words plus 16 on either side, on the 4 grid (`fitPills`). */
export const BUTTON_SIDES = 32;
/** A value's chevron where its list opens from it, 4 after its words (`styles.ts`). */
const CHEVRON = 4 + 16;
/** The class a row button's words are laid out in. */
const BUTTON_TEXT = 'fv-btn > in-value__text';
/** A row's 44 circle and the 12 gaps on either side of its words. */
const ROW_SIDES = 44 + 12 + 12;
/** The least a row's name may have beside an action before the circles give way to it (the name itself when shorter). */
const NAME_MIN = 96;

/** What ends a list row: a button's words ("Run", "06:45", "Kitchen"), or the width of what else does (a switch). */
export interface RowEnd {
  readonly name: string;
  readonly button?: string;
  readonly end?: number;
  /** The line under the name: its first segment holds the same room as the name ("Sets at 20:12"). */
  readonly sub?: string;
  /** The button is a value's, capped at `valueCap`: it holds within the cap too, or the row gives way as for its name. */
  readonly capped?: boolean;
  /** The button opens a list (a long select's): its chevron beside its words. */
  readonly menu?: boolean;
}

/**
 * The most a row's value button may take, as `styles.ts` caps `.in-value` (its lines 78 and 83): 68 % of the row
 * less the circle's room (68, the circle and its gaps), less the one gap once the row gave the circle to its name —
 * down to the 4 grid, as the browser rounds it.
 */
export const valueCap = (width: number, bare: boolean): number =>
  Math.floor((0.68 * width - (bare ? 12 : ROW_SIDES)) / 4) * 4;

/**
 * Whether a list's rows keep their circles. What ends a row is never cut — an action's word, a value's button, a
 * switch — so a row whose end would leave its name under 96 (or under the name itself) gives the circle's room to the
 * name, and every row of the list with it, so the names keep one column: the rows' rule (`HeadFit.rowsKeepIcon`).
 */
export function rowsKeepIcon(ruler: TextRuler, width: number, rows: readonly RowEnd[]): boolean {
  return rows.every((row) => holds(ruler, width, false, row));
}

/**
 * Whether a row puts its end under its name: where even without its circle the end would leave the name — or its
 * line's first segment — under 96 (or under itself), or would not hold within its cap: a German "Installieren" at
 * 211, the sun's "Above horizon", a date at a third of a section. The words then have the row, the end the line under
 * them, as wide as it is.
 */
export const rowStacks = (ruler: TextRuler, width: number, row: RowEnd): boolean =>
  !holds(ruler, width, true, row) ||
  !holds(ruler, width, true, { ...row, name: row.sub?.split(' · ')[0] ?? '' }, 'fv-row__sub');

/**
 * Whether a row's name keeps its room beside what ends it, with its circle (the end has the row less the circle and
 * the gaps) or without (`bare`: less the one gap), and a capped end holds within its cap.
 */
const holds = (
  ruler: TextRuler,
  width: number,
  bare: boolean,
  { name, button = '', end, capped, menu }: RowEnd,
  cls = 'fv-row__title',
): boolean => {
  const pill = end ?? ruler.pill(BUTTON_TEXT, button, BUTTON_SIDES + (menu ? CHEVRON : 0));
  return (
    (!capped || pill <= valueCap(width, bare)) &&
    width - (bare ? 12 : ROW_SIDES) - pill >= Math.min(NAME_MIN, ruler.width(cls, name))
  );
};

/**
 * Where the entity is, else when it last changed (as the row's `since` says where that reads, #67): a row's sub is
 * context or time, never its state again.
 */
function rowSub(host: HelperHost, view: EntityView, row: HelperRowConfig): string {
  const context = contextOf(host, view, row);
  if (context || row.secondary !== undefined) return context;
  const changed = changedAt(host.hass, view, row.since);
  return changed && !Number.isNaN(changed.getTime())
    ? sentenceCase(relativeAgo(host.hass, changed))
    : '';
}

/**
 * The sheet's list row with a free trailing element — `listRow` only knows switch, value and chevron — a button with
 * `end.button` for its words (`capped`: a value's, held to `valueCap`; `menu`: with its chevron). Where the rows gave
 * their circles to their names (`host.bare`) and even so the button would leave the name under its room, the button
 * goes under the name (`rowStacks`).
 */
function row(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
  tone: Tone,
  sub: string,
  trailing: TemplateResult,
  end: Omit<RowEnd, 'name' | 'sub'>,
): TemplateResult {
  const bare = host.bare;
  const stack =
    bare && rowStacks(host.ruler, host.contentWidth, { ...end, name: nameOf(view, config), sub });
  return html`<div
    class="fv-row ${bare ? 'fv-row--bare' : ''} ${stack ? 'fv-row--stack' : ''} ${isUnusable(view) ? 'is-unavailable' : ''}"
  >
    ${
      bare
        ? nothing
        : html`<span class="fv-ico fv-ico--${tone}" data-icon
            >${icon(iconOf(view, config.icon))}</span
          >`
    }
    <span class="fv-row__text"
      ><span class="fv-row__title" data-name>${nameOf(view, config)}</span
      >${sub ? html`<span class="fv-row__sub">${sub}</span>` : nothing}</span
    >
    ${trailing}
  </div>`;
}

/**
 * The sheet's content-sized row button (44 in a row, text + 16 px sides on the 4 grid). `label` is the
 * accessible name: a card holds several "Run" and several "Install", each must say what it acts on.
 * `name`: the words are a name (a select's chosen option) and may end in an ellipsis where the row is narrow;
 * otherwise they are an action's word, never cut: the row's name gives way to it. `menu`: a list opens from it, its
 * chevron after the words unless `chevron` says it gave way (the list says on it whether it is open).
 */
export function rowButton(
  kind: 'quiet' | 'link',
  text: string,
  label: string,
  onClick: (event: Event) => void,
  disabled = false,
  name = false,
  menu = false,
  chevron = menu,
): TemplateResult {
  return html`<button
    class="fv-btn fv-btn--${kind} in-value ${name ? '' : 'in-value--action'}"
    data-control
    data-target
    data-fit=${BUTTON_SIDES}
    aria-label=${label}
    aria-haspopup=${menu ? 'listbox' : nothing}
    aria-expanded=${menu ? 'false' : nothing}
    ?disabled=${disabled}
    @click=${onClick}
  >
    <span class="in-value__text" data-name=${name ? '' : nothing}>${text}</span
    >${chevron ? glyph('down') : nothing}
  </button>`;
}

/** An editable value wears the link-button shape; tapping it opens Home Assistant's own editor for the entity. */
const valueButton = (
  host: HelperHost,
  view: EntityView,
  name: string,
  value: string,
): TemplateResult =>
  rowButton(
    'link',
    value,
    `${name} · ${value}`,
    () => host.moreInfo(view.id),
    isUnusable(view),
    true,
  );

/**
 * A select whose options are a list (#96): the row says where it stands, and its list opens from its value — Fluvy's
 * dropdown, laid out as nothing after the button and fetched with the pages' controls the first time one opens, so
 * a dashboard that never opens one never pays for it. The value is held to its cap as a date's is (the row stacks
 * where it would not hold), and under its name its chevron gives way before its words would be cut.
 */
export function menuRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
  value: string,
  options: readonly SelectOption[],
  choose: (option: string) => void,
): TemplateResult {
  const name = nameOf(view, config);
  const unusable = isUnusable(view);
  const sub = rowSub(host, view, config);
  const end = { button: value, menu: true, capped: true };
  const chevron =
    !(host.bare && rowStacks(host.ruler, host.contentWidth, { ...end, name, sub })) ||
    host.ruler.pill(BUTTON_TEXT, value, BUTTON_SIDES + CHEVRON) <= host.contentWidth;
  const open = (event: Event): void => {
    const button = event.currentTarget as HTMLElement;
    void import('@fluvy/ui/select').then(() => {
      const menu = button.nextElementSibling as FluvySelect | null;
      if (menu) menu.open = !menu.open;
    });
  };
  return row(
    host,
    view,
    config,
    currentTone(view, 'neutral'),
    sub,
    html`${rowButton('link', value, `${name} · ${value}`, open, unusable, true, true, chevron)}<fluvy-select
        anchored
        .label=${name}
        .value=${host.state(view)}
        .options=${options}
        ?disabled=${unusable}
        @fluvy-change=${(event: CustomEvent<SelectChangeDetail>) => choose(event.detail.value)}
      ></fluvy-select>`,
    end,
  );
}

/** `input_boolean` / `switch`: the sheet's list row with its switch. */
export function switchRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
): TemplateResult {
  const unusable = isUnusable(view);
  const on = host.state(view) === 'on';
  return listRow({
    icon: host.bare ? null : iconOf(view, config.icon),
    tone: unusable ? 'off' : on ? 'accent' : 'neutral',
    title: nameOf(view, config),
    name: true,
    sub: rowSub(host, view, config),
    trailing: 'switch',
    on,
    switchTone: 'accent',
    unavailable: unusable,
    onToggle: (next) => {
      host.expect(view.id, next ? 'on' : 'off');
      host.call(view.domain, next ? 'turn_on' : 'turn_off', {}, view.id);
    },
  });
}

/** A moment helper's moment, as the row shows it (a quick-set chip is ahead of the report); none while it cannot be read. */
const momentOf = (host: HelperHost, view: EntityView): Moment | null =>
  view.status === 'ok' ? parseMomentText(host.state(view)) : null;

function momentParts(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
  moment: Moment | null,
): { value: string; sub: string } {
  if (!moment) return { value: '—', sub: contextOf(host, view, config) };
  const custom = ownSecondary(host, config);
  if (!moment.hasTime)
    return {
      value: dateValue(host, moment),
      sub: custom ?? relativeDays(host.hass, daysUntil(moment)),
    };
  if (!moment.hasDate) return { value: timeText(host.hass, moment), sub: custom ?? view.areaName };
  return { value: timeText(host.hass, moment), sub: custom ?? dayText(host.hass, moment) };
}

/**
 * A date as its row's pill holds it whole: its month named ("10 de nov.") where the pill's cap (`valueCap`) holds
 * it, as figures ("10/11") where it does not, so the row keeps its line; where even the figures run over the cap the
 * row stacks (`rowStacks`), and under the name the pill has the row.
 */
function dateValue(host: HelperHost, moment: Moment): string {
  const long = dayText(host.hass, moment);
  return host.ruler.pill(BUTTON_TEXT, long, BUTTON_SIDES) <= valueCap(host.contentWidth, host.bare)
    ? long
    : dayTextShort(host.hass, moment);
}

/**
 * `input_datetime` / `date` / `time` / `datetime`: the value in the link-button shape (Home Assistant's
 * picker opens on tap) and, for a time of day, the owner's quick-set chips under the row.
 */
export function momentRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
): TemplateResult {
  const state = host.state(view); // a quick-set chip is ahead of the report: the value follows the tap
  const moment = momentOf(host, view);
  const parts = momentParts(host, view, config, moment);
  const main = row(
    host,
    view,
    config,
    currentTone(view, 'neutral'),
    parts.sub,
    valueButton(host, view, nameOf(view, config), parts.value),
    { button: parts.value, capped: true },
  );
  const settable = view.domain === 'input_datetime' || view.domain === 'time';
  if (!moment || moment.hasDate || !settable || !config.presets?.length) return main;

  const items: ChipItem[] = [];
  for (const preset of config.presets) {
    const time = presetTime(preset);
    if (time)
      items.push({
        key: time,
        label: timeText(host.hass, { ...moment, date: new Date(`1970-01-01T${time}Z`) }),
        active: state.slice(0, 5) === time.slice(0, 5),
      });
  }
  if (!items.length) return main;
  // a narrow column gives the chips the whole line rather than breaking the set in two
  return html`${main}
    <div class="in-quick ${host.contentWidth < NARROW || host.bare ? 'in-quick--flush' : ''}">
      ${chips(items, (time) => {
        if (state.slice(0, 5) === time.slice(0, 5)) return;
        host.expect(view.id, time);
        host.call(
          view.domain,
          view.domain === 'time' ? 'set_value' : 'set_datetime',
          { time },
          view.id,
        );
      })}
    </div>`;
}

/** `input_button` / `button`: a quiet "Run"; the sub says when it last ran (the state of a button is that moment). */
export function buttonRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
): TemplateResult {
  const pressed = view.status === 'ok' ? new Date(view.state) : null;
  const sub =
    ownSecondary(host, config) ??
    (pressed && !Number.isNaN(pressed.getTime())
      ? sentenceCase(relativeAgo(host.hass, pressed))
      : contextOf(host, view, config));
  const name = nameOf(view, config);
  const word = s(host.hass, 'run');
  const run = rowButton(
    'quiet',
    word,
    s(host.hass, 'run_named', { name }),
    () => host.call(view.domain, 'press', {}, view.id),
    isUnusable(view),
  );
  return row(host, view, config, currentTone(view, 'neutral'), sub, run, { button: word });
}

/** What a moment helper's row shows at its end ("06:45", "Oct 18"). */
export const momentValue = (host: HelperHost, view: EntityView, config: HelperRowConfig): string =>
  momentParts(host, view, config, momentOf(host, view)).value;

/** What any other helper's row shows at its end: its figure, else its state, "—" while it cannot be read. */
export function plainValue(host: HelperHost, view: EntityView): string {
  if (view.status !== 'ok') return '—';
  const parts = valueParts(host.hass, view);
  return view.number !== null
    ? `${parts.value}${parts.unit ? ` ${parts.unit}` : ''}`
    : stateText(host.hass, view);
}

/** Anything else (the sheet's Sun row): read-only state stays plain, and the row opens more-info. */
export function plainRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
): TemplateResult {
  const missing = view.status === 'missing';
  const name = nameOf(view, config);
  const sub = rowSub(host, view, config);
  const value = plainValue(host, view);
  return listRow({
    icon: host.bare ? null : iconOf(view, config.icon),
    tone: currentTone(view, isActive(view) ? toneFor(view) : 'neutral'),
    title: name,
    name: true,
    sub,
    trailing: 'value',
    value,
    // a state in words that would leave the words beside it under their room goes under them
    stack:
      host.bare &&
      rowStacks(host.ruler, host.contentWidth, {
        name,
        sub,
        end: host.ruler.width('fv-row__value', value),
      }),
    unavailable: isUnusable(view),
    onTap: missing ? undefined : () => host.moreInfo(view.id),
  });
}
