import { strings, type LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  actionField,
  boolField,
  colourFields,
  editorLabels,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import { configKeys } from '../shared/config.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { EditorDefaults } from '../shared/rows-editor.js';
import type { UpdatesCardConfig } from './updates-card.js';

/** The updates card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

const s = strings('updates');

/** A card of many updates has no entity of its own: its head's icon, tone and colour, and a hold on the head. */
export const base: readonly BaseKey[] = [
  'entities',
  'icon',
  'tone',
  'color',
  'card_color',
  'card_opacity',
  'hold_action',
  'show_icon',
];

export const keys = configKeys<UpdatesCardConfig>()([
  'title',
  'subtitle',
  'show_up_to_date',
  'toggle',
  'toggle_secondary',
  ...EMPTY_KEYS,
]);

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = () => ({ show_up_to_date: false });

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      titleFields(),
      fieldRow(iconField(), showIconField()),
      ...colourFields(),
      boolField('show_up_to_date'),
      entitiesField('entities', ['update'], true),
      fieldRow(
        entityField(['input_boolean', 'switch', 'automation'], 'toggle', false),
        textField('toggle_secondary'),
      ),
      emptyFields(),
      actionField('hold_action'),
    ],
    // this card's own options are worded by its own strings
    ...editorLabels(
      s,
      {
        show_up_to_date: 'show_up_to_date',
        toggle: 'toggle',
        toggle_secondary: 'toggle_secondary',
      },
      {},
    ),
  };
}
