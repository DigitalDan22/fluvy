import type { LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import { configKeys } from '../shared/config.js';
import {
  actionFields,
  boolField,
  colourFields,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  nameIconFields,
  numberField,
  selectField,
  showIconField,
  textField,
} from '../shared/form.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import type { MapCardConfig } from './map-card.js';

/** The map card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

export const base: readonly BaseKey[] = [
  'entities',
  'icon',
  'tone',
  'color',
  'card_color',
  'card_opacity',
  'tap_action',
  'hold_action',
  'show_icon',
];

export const keys = configKeys<MapCardConfig>()([
  'title',
  'zones',
  'variant',
  'map_shape',
  'hours_to_show',
  'default_zoom',
  'fit_zones',
  'show_empty',
  'show_distance',
  'map_path',
  ...EMPTY_KEYS,
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'zones',
    title: 'editor.zones',
    domains: ['zone'],
    keys: ['entity', 'name', 'icon'],
    schema: [entityField(['zone']), nameIconFields()],
  },
];

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = () => ({
  variant: 'zones',
  map_shape: 'wide',
  fit_zones: false,
  show_empty: false,
  show_distance: false,
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      entitiesField('entities', ['person', 'device_tracker'], true),
      entitiesField('zones', ['zone']),
      fieldRow(textField('title'), iconField()),
      showIconField(),
      fieldRow(
        selectField('variant', ['zones', 'map', 'rows']),
        selectField('map_shape', ['wide', 'square']),
      ),
      fieldRow(numberField('hours_to_show', 0, 168), numberField('default_zoom', 1, 20)),
      fieldRow(boolField('fit_zones'), boolField('show_empty')),
      fieldRow(boolField('show_distance'), textField('map_path')),
      ...colourFields(),
      emptyFields(),
      actionFields(),
    ],
    ...formLabels({ hours_to_show: 'editor.hours', map_path: 'editor.map_path' }),
  };
}
