import type { LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  actionField,
  boolField,
  colourFields,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  textField,
} from '../shared/form.js';
import { configKeys } from '../shared/config.js';
import type { EditorDefaults } from '../shared/rows-editor.js';
import { DOMAINS, type SceneCardConfig } from './scene-card.js';

/** The scene card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

/** A tap on the tile runs the scene: of the base it honours the entity, its name and icon, its colours and a hold. */
export const base: readonly BaseKey[] = [
  'entity',
  'name',
  'icon',
  'tone',
  'color',
  'card_color',
  'card_opacity',
  'unavailable',
  'hold_action',
];

export const keys = configKeys<SceneCardConfig>()(['subtitle', 'show_subtitle']);

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = () => ({ show_subtitle: true });

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      entityField(DOMAINS),
      nameIconFields(),
      fieldRow(textField('subtitle'), boolField('show_subtitle')),
      ...colourFields(),
      actionField('hold_action'),
    ],
    ...formLabels({}),
  };
}
