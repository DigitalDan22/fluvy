import { isUsable, type EntityView, type HomeAssistant } from '@fluvy/core';
import type { FluvySelect, SelectChangeDetail } from '@fluvy/ui/select';
import { html, type TemplateResult } from 'lit';
import type { ControlHost } from './base.js';
import { type TextRuler } from './fit.js';
import { buttonWidth, rowButton, type RowEnd } from './row-end.js';

/*
 * A select's row (#96): its value, in the row's words, opens Fluvy's dropdown, which offers the row's options in its
 * order and chooses with `select_option`. The helpers' long selects, and a select's row on the entities card and the
 * device cards (lock, alarm, camera).
 */

/** The domains of a select. */
export const SELECTS: ReadonlySet<string> = new Set(['input_select', 'select']);

/** A select's row as its config says it: the options it offers and their words, on every card that lists one. */
export interface SelectRowConfig {
  /** A select's options offered, in this order: those it lists (#96). */
  options?: readonly string[];
  /** A select's options in the owner's words (`gen_589828: AI Mode`), before Home Assistant's. */
  labels?: Readonly<Record<string, string>>;
}

/** The options of a list from the config or the house, a figure as its text (`options: [1, 2]`); none but a list's. */
const strings = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.flatMap((item) =>
        typeof item === 'string' || typeof item === 'number' ? [`${item}`] : [],
      )
    : [];

/**
 * The options a select offers (#96): the row's own (`options`, in its order) that the select lists, else all it lists;
 * the row's own while the select has not been read (its card keeps its anatomy).
 */
export function offered(listed: readonly string[], own: unknown): string[] {
  const mine = strings(own);
  const kept = listed.length ? mine.filter((option) => listed.includes(option)) : mine;
  return kept.length ? kept : [...listed];
}

/** The options the row offers, from what the select lists. */
export const optionsOf = (view: EntityView, row: SelectRowConfig): string[] =>
  offered(strings(view.attr('options')), row.options);

/** An option in the row's own words (`labels`), where it has some. */
export const ownLabel = (row: SelectRowConfig, option: string): string | undefined => {
  const own: unknown = row.labels?.[option];
  return typeof own === 'string' && own ? own : undefined;
};

/**
 * An option in words: the row's own, else Home Assistant's. `select` entities carry translated options ("eco" →
 * "Eco"); the formatter takes the state from the entity it is given, so it is handed the entity in that state.
 */
export function optionLabel(
  hass: HomeAssistant | undefined,
  view: EntityView,
  row: SelectRowConfig,
  option: string,
): string {
  const own = ownLabel(row, option);
  if (own) return own;
  if (hass?.formatEntityState && view.stateObj) {
    try {
      return hass.formatEntityState({ ...view.stateObj, state: option });
    } catch {
      /* fall through to the raw option */
    }
  }
  return option;
}

/** What a select's row shows: the option chosen (`state`, the one in flight) in the row's words, "—" while unread. */
export const chosenLabel = (
  hass: HomeAssistant | undefined,
  view: EntityView,
  row: SelectRowConfig,
  state: string,
): string => (view.status === 'ok' ? optionLabel(hass, view, row, state) : '—');

/** A dropdown's end as the rows' rule weighs it: its value with its chevron, held to its cap (`RowEnd`). */
export const dropdownEnd = (name: string, value: string, sub = ''): RowEnd => ({
  name,
  sub,
  button: value,
  menu: true,
  capped: true,
});

/** Chooses `option` of a select (`select_option`, either domain), shown at once; nothing where it is chosen already. */
export function chooseOption(host: ControlHost, view: EntityView, option: string): void {
  if (option === host.state(view)) return;
  host.expect(view.id, option);
  host.call(view.domain, 'select_option', { option }, view.id);
}

/** A select's row, as its dropdown is laid out in it. */
export interface DropdownRow {
  /** The card that draws the row: the state it shows, and its calls. */
  readonly host: ControlHost;
  readonly hass: HomeAssistant | undefined;
  readonly view: EntityView;
  readonly row: SelectRowConfig;
  /** The row's name: the list's accessible name, and the button's with its value. */
  readonly name: string;
  /** What the value says (`chosenLabel`), as the list weighed it. */
  readonly value: string;
  /** The value is under the name (`rowStacks` of its `dropdownEnd`), as wide as the row. */
  readonly stack: boolean;
  readonly ruler: TextRuler;
  /** The row's width: its card's content column. */
  readonly width: number;
}

/**
 * How a select's row ends (#96): its value in the link-button shape, which opens Fluvy's dropdown — laid out as
 * nothing after the button and fetched with the pages' controls the first time one opens, so a dashboard that never
 * opens one never pays for it. The value is held to its cap as a date's is (the row stacks where it would not hold),
 * and under the name its chevron gives way before its words would be cut. Out of reach, the value is "—" and the
 * button does nothing.
 */
export function dropdown(o: DropdownRow): TemplateResult {
  const { view, name, value } = o;
  const disabled = !isUsable(view);
  const chevron = !o.stack || buttonWidth(o.ruler, value, true) <= o.width;
  const open = (event: Event): void => {
    const button = event.currentTarget as HTMLElement;
    void import('@fluvy/ui/select').then(() => {
      const menu = button.nextElementSibling as FluvySelect | null;
      if (menu) menu.open = !menu.open;
    });
  };
  return html`${rowButton('link', value, `${name} · ${value}`, open, disabled, true, true, chevron)}<fluvy-select
      anchored
      .label=${name}
      .value=${o.host.state(view)}
      .options=${optionsOf(view, o.row).map((option) => ({
        value: option,
        label: optionLabel(o.hass, view, o.row, option),
      }))}
      ?disabled=${disabled}
      @fluvy-change=${(event: CustomEvent<SelectChangeDetail>) =>
        chooseOption(o.host, view, event.detail.value)}
    ></fluvy-select>`;
}
