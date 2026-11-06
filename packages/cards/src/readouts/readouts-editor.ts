import type { LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  accentField,
  actionField,
  cardOpacityField,
  unavailableField,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  nameField,
  NUMBER_DEFAULTS,
  numberField,
  numberFields,
  selectField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys } from '../shared/config.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { ReadoutsCardConfig } from './readouts-card.js';

/** The readouts card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

const DOMAINS: readonly string[] = ['sensor', 'number', 'input_number', 'counter'];

/** A strip of readouts has no entity of its own; its colour is its figures' accent. */
export const base: readonly BaseKey[] = [
  'entities',
  'color',
  'card_color',
  'card_opacity',
  'unavailable',
];

export const keys = configKeys<ReadoutsCardConfig>()([
  'rows',
  'hours',
  'variant',
  'unit',
  'decimals',
  ...EMPTY_KEYS,
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'rows',
    alias: 'entities',
    title: 'editor.rows',
    domains: DOMAINS,
    keys: ['entity', 'name', 'unit', 'decimals', 'tap_action'],
    schema: [entityField(DOMAINS), nameField(), numberFields(), actionField()],
  },
];

export const defaults: EditorDefaults = () => ({
  variant: 'grid',
  hours: 6,
  ...NUMBER_DEFAULTS,
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      entitiesField('entities', DOMAINS, true),
      fieldRow(numberField('hours', 1, 48), selectField('variant', ['grid', 'row'])),
      accentField(),
      accentField('card_color', { none: true }),
      cardOpacityField(),
      unavailableField(),
      emptyFields(),
      numberFields(),
    ],
    ...formLabels({}),
  };
}
