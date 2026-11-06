import { strings as words, type HaFormSchemaItem, type LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  accentField,
  actionField,
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  iconField,
  idsOnly,
  nameIconFields,
  selectField,
  showIconField,
  textField,
  titleFields,
  toneField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { softIn } from '../shared/chart-config.js';
import { configKeys } from '../shared/config.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { BarsCardConfig, BarsVariant } from './bars-card.js';

/** The bars card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

const strings = words('bars');

const VARIANTS: readonly BarsVariant[] = ['full', 'compact'];

const anyNumber = (name: string): HaFormSchemaItem => ({
  name,
  selector: { number: { mode: 'box', step: 'any' } },
});

/** A list of many sensors has no entity of its own: its head's icon, tone and colour, and its actions on the head. */
export const base: readonly BaseKey[] = [
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

export const keys = configKeys<BarsCardConfig>()([
  'title',
  'subtitle',
  'rows',
  'variant',
  'badge_ok',
  'badge_warn',
  'chart',
  ...EMPTY_KEYS,
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'rows',
    title: 'editor.rows',
    keys: [
      'entity',
      'name',
      'icon',
      'secondary',
      'sub_entity',
      'min',
      'max',
      'low',
      'high',
      'tone',
      'color',
      'plain',
      'tap_action',
    ],
    schema: [
      entityField(),
      nameIconFields(),
      textField('secondary'),
      entitiesField('sub_entity'),
      fieldRow(toneField(), accentField('color', { item: 'own' })),
      fieldRow(anyNumber('min'), anyNumber('max')),
      fieldRow(anyNumber('low'), anyNumber('high')),
      fieldRow(boolField('plain'), actionField()),
    ],
    computeLabel: formLabels({ sub_entity: 'editor.sub_entity' }).computeLabel,
  },
];

export const defaults: EditorDefaults = (config) => ({
  variant: 'full',
  chart: softIn(config) ? 'soft' : 'classic',
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      titleFields(),
      fieldRow(iconField(), selectField('variant', VARIANTS)),
      fieldRow(showIconField(), selectField('chart', ['classic', 'soft'])),
      ...colourFields(),
      entitiesField('rows', undefined, true),
      fieldRow(textField('badge_ok'), textField('badge_warn')),
      emptyFields(),
      actionFields(),
    ],
    ...idsOnly('rows'),
    ...editorLabels(strings, { rows: 'rows', badge_ok: 'badge_ok', badge_warn: 'badge_warn' }, {}),
  };
}
