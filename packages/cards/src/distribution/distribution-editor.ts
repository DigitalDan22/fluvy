import { strings as words, type LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  accentField,
  actionFields,
  colourFields,
  editorLabels,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  idsOnly,
  nameField,
  numberField,
  onlyWhen,
  selectField,
  showIconField,
  titleFields,
  toneField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { softIn } from '../shared/chart-config.js';
import { configKeys } from '../shared/config.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { DistributionCardConfig } from './distribution-card.js';

/** The distribution card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

const strings = words('distribution');

/** A share of many sensors has no entity of its own: its head's icon, tone and colour, and its actions on the head. */
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

export const keys = configKeys<DistributionCardConfig>()([
  'title',
  'subtitle',
  'max_rows',
  'variant',
  'total',
  'chart',
  ...EMPTY_KEYS,
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'entities',
    title: 'editor.entities',
    domains: ['sensor'],
    keys: ['entity', 'name', 'tone', 'color'],
    schema: [
      entityField(['sensor']),
      nameField(),
      fieldRow(toneField(), accentField('color', { item: 'own' })),
    ],
  },
];

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = (config) => ({
  variant: 'stack',
  chart: softIn(config) ? 'soft' : 'classic',
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      titleFields(),
      fieldRow(iconField(), showIconField()),
      ...colourFields(),
      entitiesField('entities', ['sensor'], true),
      fieldRow(numberField('max_rows', 2, 10), selectField('variant', ['stack', 'rows'])),
      // the stack's style: the rows draw no bar
      onlyWhen((data) => data['variant'] !== 'rows', selectField('chart', ['classic', 'soft'])),
      entityField(['sensor'], 'total', false),
      emptyFields(),
      actionFields(),
    ],
    ...idsOnly('entities'),
    ...editorLabels(strings, { max_rows: 'max_rows', total: 'editor_total' }, {}),
  };
}
