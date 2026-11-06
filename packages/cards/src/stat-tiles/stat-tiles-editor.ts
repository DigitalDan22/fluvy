import { strings as words, type LovelaceConfigForm } from '@fluvy/core';
import { HEAD_BASE } from '../shared/base.js';
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
  iconField,
  idsOnly,
  nameField,
  nameIconFields,
  NUMBER_DEFAULTS,
  numberFields,
  selectField,
  showIconField,
  textField,
  titleFields,
  toneField,
} from '../shared/form.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { configKeys } from '../shared/config.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { StatTilesCardConfig, StatTilesVariant } from './stat-tiles-card.js';

/** The stat tiles card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

const strings = words('stat-tiles');

const VARIANTS: readonly StatTilesVariant[] = ['full', 'compact'];

const COLUMNS = ['auto', '2', '3'] as const;

export const base = HEAD_BASE;

export const keys = configKeys<StatTilesCardConfig>()([
  'title',
  'subtitle',
  'variant',
  'columns',
  'badge_entity',
  'badge_label',
  'tiles',
  'rows',
  'unit',
  'decimals',
  ...EMPTY_KEYS,
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'tiles',
    title: 'editor.tiles',
    keys: [
      'entity',
      'name',
      'icon',
      'tone',
      'highlight',
      'unit',
      'decimals',
      'tap_action',
      'hold_action',
    ],
    schema: [
      entityField(),
      nameIconFields(),
      fieldRow(toneField(), boolField('highlight')),
      numberFields(),
      actionFields(),
    ],
  },
  {
    key: 'rows',
    title: 'editor.rows',
    keys: ['entity', 'name', 'icon', 'secondary', 'tone', 'color', 'tap_action'],
    schema: [
      entityField(),
      nameIconFields(),
      textField('secondary'),
      fieldRow(toneField(), accentField('color', { item: 'own' })),
      actionField(),
    ],
  },
];

/** Two a row in full; compact tiles take three when they fit. */
export const defaults: EditorDefaults = (config) => ({
  variant: 'full',
  columns: config.variant === 'compact' ? 'auto' : '2',
  ...NUMBER_DEFAULTS,
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      titleFields(),
      fieldRow(iconField(), showIconField()),
      ...colourFields(),
      fieldRow(selectField('variant', VARIANTS), selectField('columns', COLUMNS)),
      entitiesField('tiles', undefined, true),
      fieldRow(entityField(undefined, 'entity', false), nameField()),
      fieldRow({ name: 'badge_entity', selector: { entity: {} } }, textField('badge_label')),
      entitiesField('rows'),
      emptyFields(),
      numberFields(),
      actionFields(),
    ],
    ...idsOnly('tiles', 'rows'),
    ...editorLabels(
      strings,
      { tiles: 'tiles', rows: 'rows', badge_entity: 'badge_entity', badge_label: 'badge_label' },
      {},
    ),
  };
}
