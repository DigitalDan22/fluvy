import type { LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  actionFields,
  colourFields,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  nameIconFields,
  numberField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import type { RowsListSpec } from '../shared/rows-editor.js';
import { configKeys } from '../shared/config.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import { ACTION_DOMAINS, type ActionsCardConfig } from './actions-card.js';

/** The actions card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

/** A card of many actions has no entity of its own: its head's icon, tone and colour, its tap ("…") and its hold. */
export const base: readonly BaseKey[] = [
  'entities',
  'icon',
  'tone',
  'color',
  'card_color',
  'card_opacity',
  'unavailable',
  'tap_action',
  'hold_action',
  'show_icon',
];

export const keys = configKeys<ActionsCardConfig>()([
  'title',
  'subtitle',
  'rows',
  'columns',
  ...EMPTY_KEYS,
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'rows',
    alias: 'entities',
    title: 'editor.rows',
    domains: ACTION_DOMAINS,
    keys: ['entity', 'name', 'icon', 'secondary'],
    schema: [entityField(ACTION_DOMAINS), nameIconFields(), textField('secondary')],
  },
];

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      titleFields(),
      fieldRow(iconField(), numberField('columns', 1, 3)),
      showIconField(),
      ...colourFields(),
      entitiesField('entities', ACTION_DOMAINS, true),
      emptyFields(),
      actionFields(),
    ],
    ...formLabels({}),
  };
}
