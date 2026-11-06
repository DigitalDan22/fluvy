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
import { menuRow } from './rows.js';
import { chipRow } from '../shared/chips.js';
import { type RowStyle } from '../shared/config.js';
import {
  chooseOption,
  chosenLabel,
  dropdownEnd,
  optionLabel,
  optionsOf,
} from '../shared/dropdown.js';
import { type RowEnd } from '../shared/row-end.js';

/** Beyond six, chips stop being a glance: the row carries the value and its list opens from it. */
export const MAX_CHIPS = 6;

/** Whether a select of `count` options is chips: as the row says (`display`), else up to six. */
export const asChips = (row: Pick<HelperRowConfig, 'display'>, count: number): boolean =>
  row.display === 'chips' || (row.display !== 'dropdown' && count <= MAX_CHIPS);

/**
 * How a select's row ends where it is a dropdown (the option chosen, "—" while it cannot be read, and its chevron,
 * held to the value's cap); none for its chips, which keep their place while it cannot be read (Home Assistant writes
 * the options whatever the state).
 */
export function selectEnd(
  host: HelperHost,
  view: EntityView,
  row: HelperRowConfig,
): RowEnd | undefined {
  const count = optionsOf(view, row).length;
  if (count > 0 && asChips(row, count)) return undefined;
  return dropdownEnd(nameOf(host, view, row), chosenLabel(host.hass, view, row, host.state(view)));
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
  const end = selectEnd(host, view, row);
  if (end) return { row: menuRow(host, view, row, end.button ?? '') };
  const state = host.state(view);
  const unusable = isUnusable(view);
  const items: ChipItem[] = optionsOf(view, row).map((option) => ({
    key: option,
    label: optionLabel(host.hass, view, row, option),
    active: option === state,
    unavailable: unusable,
  }));
  return {
    blocks: [
      field(nameOf(host, view, row), fieldContext(host, view, row), nothing, unusable),
      chipRow(items, (option) => chooseOption(host, view, option), style, {
        ruler: host.ruler,
        width: host.contentWidth,
      }),
    ],
  };
}
