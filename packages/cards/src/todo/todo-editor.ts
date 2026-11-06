import type { LovelaceConfigForm } from '@fluvy/core';
import { HEAD_BASE } from '../shared/base.js';
import {
  actionFields,
  boolField,
  colourFields,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  nameField,
  showIconField,
  textField,
} from '../shared/form.js';
import { configKeys } from '../shared/config.js';
import type { EditorDefaults } from '../shared/rows-editor.js';
import type { TodoCardConfig } from './todo-card.js';

/** The todo card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

export const base = HEAD_BASE;

export const keys = configKeys<TodoCardConfig>()([
  'subtitle',
  'show_completed',
  'show_add',
  'show_due',
]);

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = () => ({
  show_add: true,
  show_due: true,
  show_completed: true,
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      entityField(['todo']),
      fieldRow(nameField(), textField('subtitle')),
      fieldRow(iconField(), showIconField()),
      ...colourFields(),
      fieldRow(boolField('show_completed'), boolField('show_add')),
      boolField('show_due'),
      actionFields(),
    ],
    ...formLabels({}),
  };
}
