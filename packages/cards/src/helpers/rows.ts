import { isActive, stateText, strings, valueParts, type EntityView } from '@fluvy/core';
import { chips, listRow, type ChipItem, type Tone } from '@fluvy/ui';
import { html, type TemplateResult } from 'lit';
import { currentTone, iconOf, toneFor } from '../shared/domain.js';
import {
  contextOf,
  isUnusable,
  nameOf,
  ownSecondary,
  type HelperHost,
  type HelperRowConfig,
} from './context.js';
import { dropdown, dropdownEnd } from '../shared/dropdown.js';
import { buttonWidth, rowButton, rowStacks, valueCap, type RowEnd } from '../shared/row-end.js';
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
 * A helper's list row ending in a button (`rowButton`, or a select's dropdown): where the rows gave their circles to
 * their names (`host.bare`) and even so the button would leave the name under its room, it goes under the name
 * (`stack`, as `rowStacks` says).
 */
function row(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
  tone: Tone,
  sub: string,
  trailing: TemplateResult,
  stack: boolean,
): TemplateResult {
  return listRow({
    icon: host.bare ? null : iconOf(view, config.icon),
    tone,
    title: nameOf(host, view, config),
    name: true,
    sub,
    trailing,
    stack,
    unavailable: isUnusable(view),
  });
}

/** Whether a row's button goes under its name: the rows gave their circles to their names, and even so it would not hold. */
const stacks = (host: HelperHost, end: RowEnd): boolean =>
  host.bare && rowStacks(host.ruler, host.contentWidth, end);

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

/** A select whose options are a list (#96): the row says where it stands, and its value opens Fluvy's dropdown. */
export function menuRow(
  host: HelperHost,
  view: EntityView,
  config: HelperRowConfig,
  value: string,
): TemplateResult {
  const name = nameOf(host, view, config);
  const sub = rowSub(host, view, config);
  const stack = stacks(host, dropdownEnd(name, value, sub));
  const end = dropdown({
    host,
    hass: host.hass,
    view,
    row: config,
    name,
    value,
    stack,
    ruler: host.ruler,
    width: host.contentWidth,
  });
  return row(host, view, config, currentTone(view, 'neutral'), sub, end, stack);
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
    title: nameOf(host, view, config),
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
  return buttonWidth(host.ruler, long) <= valueCap(host.contentWidth, host.bare)
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
  const name = nameOf(host, view, config);
  const main = row(
    host,
    view,
    config,
    currentTone(view, 'neutral'),
    parts.sub,
    valueButton(host, view, name, parts.value),
    stacks(host, { name, sub: parts.sub, button: parts.value, capped: true }),
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
  const name = nameOf(host, view, config);
  const word = s(host.hass, 'run');
  const run = rowButton(
    'quiet',
    word,
    s(host.hass, 'run_named', { name }),
    () => host.call(view.domain, 'press', {}, view.id),
    isUnusable(view),
  );
  return row(
    host,
    view,
    config,
    currentTone(view, 'neutral'),
    sub,
    run,
    stacks(host, { name, sub, button: word }),
  );
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
  const name = nameOf(host, view, config);
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
