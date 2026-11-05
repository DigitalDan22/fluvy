import { lightDefaults, type LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  boolField,
  colourFields,
  emptyFields,
  entitiesField,
  fieldRow,
  formLabels,
  holdsLight,
  iconField,
  lightColourFields,
  numberField,
  onlyWhen,
  selectField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { rowItems } from '../lock/rows.js';
import { configKeys } from '../shared/config.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { EntitiesCardConfig } from './entities-card.js';

/** The entities card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

/** A card of rows has no entity of its own: its icon, tone and colour are the head's and the rows' default. */
export const base: readonly BaseKey[] = [
  'entities',
  'icon',
  'tone',
  'color',
  'card_color',
  'card_opacity',
  'show_icon',
];

export const keys = configKeys<EntitiesCardConfig>()([
  'title',
  'subtitle',
  'rows',
  'show_count',
  'variant',
  'light_colors',
  'light_whites',
  'more',
  'more_path',
  ...EMPTY_KEYS,
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'rows',
    alias: 'entities',
    title: 'editor.rows',
    ...rowItems(true),
  },
];

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = () => ({
  variant: 'rows',
  show_count: false,
  light_colors: lightDefaults().colors,
  light_whites: 'temperature',
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      titleFields(),
      fieldRow(iconField(), selectField('variant', ['rows', 'compact'])),
      showIconField(),
      ...colourFields(),
      entitiesField('entities', undefined, true),
      boolField('show_count'),
      // a light's colours where the rows hold a light
      onlyWhen(holdsLight('rows', 'entities'), lightColourFields()),
      // a last row to where the rest of the list is
      fieldRow(numberField('more', 1, 999), textField('more_path')),
      emptyFields(),
    ],
    ...formLabels({}),
  };
}
