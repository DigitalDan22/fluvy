import type { EntityView } from '@fluvy/core';
import { type ChipItem } from '@fluvy/ui';
import { nothing, type TemplateResult } from 'lit';
import {
  field,
  fieldContext,
  isUnusable,
  nameOf,
  type HelperHost,
  type HelperRowConfig,
} from './context.js';
import { menuRow, type RowEnd } from './rows.js';
import { chipRow } from '../shared/chips.js';
import { type RowStyle } from '../shared/config.js';

/** Beyond six, chips stop being a glance: the row carries the value and its list opens from it. */
export const MAX_CHIPS = 6;

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

/** Whether a select of `count` options is chips: as the row says (`display`), else up to six. */
export const asChips = (row: Pick<HelperRowConfig, 'display'>, count: number): boolean =>
  row.display === 'chips' || (row.display !== 'dropdown' && count <= MAX_CHIPS);

/** An option in the row's own words (`labels`), where it has some. */
export const ownLabel = (row: HelperRowConfig, option: string): string | undefined => {
  const own: unknown = row.labels?.[option];
  return typeof own === 'string' && own ? own : undefined;
};

/**
 * An option in words: the row's own, else Home Assistant's. `select` entities carry translated options ("eco" →
 * "Eco"); the formatter takes the state from the entity it is given, so it is handed the entity in that state.
 */
function optionLabel(
  host: HelperHost,
  view: EntityView,
  row: HelperRowConfig,
  option: string,
): string {
  const own = ownLabel(row, option);
  if (own) return own;
  if (host.hass?.formatEntityState && view.stateObj) {
    try {
      return host.hass.formatEntityState({ ...view.stateObj, state: option });
    } catch {
      /* fall through to the raw option */
    }
  }
  return option;
}

/** The options the row offers, from what the select lists. */
const optionsOf = (view: EntityView, row: HelperRowConfig): string[] =>
  offered(strings(view.attr('options')), row.options);

/**
 * How a select's row ends where it is a dropdown (the option chosen, "—" while it cannot be read, and its chevron,
 * held to the value's cap); none for its chips, which keep their place while it cannot be read (Home Assistant writes
 * the options whatever the state).
 */
export function selectEnd(
  host: HelperHost,
  view: EntityView,
  row: HelperRowConfig,
): Omit<RowEnd, 'name'> | undefined {
  const count = optionsOf(view, row).length;
  if (count > 0 && asChips(row, count)) return undefined;
  const value = view.status === 'ok' ? optionLabel(host, view, row, host.state(view)) : '—';
  return { button: value, menu: true, capped: true };
}

/** What a select hands back: the label and its chips (blocks of the card), or one row its list opens from. */
export type SelectPiece =
  { readonly blocks: readonly TemplateResult[] } | { readonly row: TemplateResult };

/**
 * `input_select` / `select`: the label and its options as chips; a long list (or a row that says so) is a row whose
 * value opens Fluvy's dropdown. Either offers the row's options in its order and words, and chooses with
 * `select_option`.
 */
export function selectPiece(
  host: HelperHost,
  view: EntityView,
  row: HelperRowConfig,
  style: RowStyle = 'full',
): SelectPiece {
  const options = optionsOf(view, row);
  const state = host.state(view);
  const choose = (option: string): void => {
    if (option === state) return;
    host.expect(view.id, option);
    host.call(view.domain, 'select_option', { option }, view.id);
  };
  const end = selectEnd(host, view, row);
  if (end)
    return {
      row: menuRow(
        host,
        view,
        row,
        end.button ?? '',
        options.map((value) => ({ value, label: optionLabel(host, view, row, value) })),
        choose,
      ),
    };
  const unusable = isUnusable(view);
  const items: ChipItem[] = options.map((option) => ({
    key: option,
    label: optionLabel(host, view, row, option),
    active: option === state,
    unavailable: unusable,
  }));
  return {
    blocks: [
      field(nameOf(view, row), fieldContext(host, view, row), nothing, unusable),
      chipRow(items, choose, style, { ruler: host.ruler, width: host.contentWidth }),
    ],
  };
}
