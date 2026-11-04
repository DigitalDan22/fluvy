import type { LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  accentField,
  actionField,
  emptyFields,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  textField,
  tintField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys } from '../shared/config.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { ChipsCardConfig } from './chips-card.js';

/** The chips card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

/** The row's accessible name is the base's `name`; the tabs are its own. */
export const base: readonly BaseKey[] = ['name'];

export const keys = configKeys<ChipsCardConfig>()(['chips', 'tint', ...EMPTY_KEYS]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'chips',
    idKey: 'name',
    title: 'editor.tabs',
    keys: ['name', 'icon', 'path', 'entity', 'action', 'color'],
    schema: [
      // its words, or a template rendered live (a count, a state); its icon and colour take one in YAML
      { ...textField('name'), helper: 'editor.template_helper' },
      fieldRow(iconField(), textField('path')),
      entityField(undefined, 'entity', false),
      accentField('color', { item: 'card' }),
      actionField('action'),
    ],
  },
];

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = () => ({ tint: 'on' });

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      textField('name'),
      { name: 'chips', required: true, selector: { object: {} } },
      tintField(),
      emptyFields(),
    ],
    ...formLabels({ chips: 'editor.tabs' }),
  };
}
