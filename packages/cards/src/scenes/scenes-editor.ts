import type { LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  accentField,
  actionField,
  cardOpacityField,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  selectField,
  textField,
  tintField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys } from '../shared/config.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { ScenesCardConfig } from './scenes-card.js';

/** The scenes card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

const DOMAINS: readonly string[] = ['scene', 'script', 'button', 'input_button', 'automation'];

/** A grid of scenes has no entity of its own: its colour is the lit tile's, a hold on a tile is the base's. */
export const base: readonly BaseKey[] = [
  'entities',
  'color',
  'card_color',
  'card_opacity',
  'hold_action',
];

export const keys = configKeys<ScenesCardConfig>()([
  'title',
  'scenes',
  'columns',
  'tint',
  ...EMPTY_KEYS,
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'scenes',
    alias: 'entities',
    title: 'editor.scenes',
    domains: DOMAINS,
    keys: ['entity', 'name', 'icon', 'subtitle', 'color', 'tap_action'],
    schema: [
      entityField(DOMAINS),
      nameIconFields(),
      textField('subtitle'),
      accentField('color', { item: 'card' }),
      actionField(),
    ],
  },
];

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = () => ({ columns: 'auto', tint: 'on' });

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      fieldRow(textField('title'), selectField('columns', ['auto', '1', '2'])),
      entitiesField('entities', DOMAINS, true),
      fieldRow(
        accentField(),
        accentField('card_color', { none: true }),
        actionField('hold_action'),
      ),
      cardOpacityField(),
      tintField(),
      emptyFields(),
    ],
    ...formLabels({}),
  };
}
