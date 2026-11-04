import { strings, type LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';
import {
  accentField,
  actionFields,
  boolField,
  editorLabels,
  emptyFields,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  selectField,
  showIconField,
  sinceChoices,
  sinceField,
  textField,
} from '../shared/form.js';
import { configKeys } from '../shared/config.js';
import type { EditorChoices, EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { PeopleCardConfig } from './people-card.js';

/** The people card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

const s = strings('people');

/** The people have no entity of their own: the head's icon and the card's colour are the base fields it honours. */
export const base: readonly BaseKey[] = [
  'entities',
  'icon',
  'color',
  'card_color',
  'tap_action',
  'hold_action',
  'show_icon',
];

export const keys = configKeys<PeopleCardConfig>()([
  'title',
  'people',
  'variant',
  'map_path',
  'show_zone',
  'show_time',
  'show_battery',
  ...EMPTY_KEYS,
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'people',
    alias: 'entities',
    title: 'editor.people',
    domains: ['person', 'device_tracker'],
    keys: ['entity', 'name', 'battery', 'color', 'since', 'tap_action', 'hold_action'],
    schema: [
      entityField(['person', 'device_tracker']),
      fieldRow(textField('name'), entityField(['sensor'], 'battery', false)),
      accentField('color', { item: 'card' }),
      sinceField(),
      actionFields(),
    ],
  },
];

/** A person's `since` offers the house's timestamp sensors. */
export const choices: EditorChoices = sinceChoices;

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = () => ({
  show_battery: false,
  variant: 'grid',
  show_zone: true,
  show_time: true,
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      entitiesField('entities', ['person', 'device_tracker'], true),
      fieldRow(textField('title'), iconField()),
      showIconField(),
      fieldRow(selectField('variant', ['grid', 'rows']), textField('map_path')),
      fieldRow(boolField('show_zone'), boolField('show_time')),
      boolField('show_battery'),
      accentField(),
      accentField('card_color', { none: true }),
      emptyFields(),
      actionFields(),
    ],
    ...editorLabels(s, { map_path: 'editor.map_path' }, {}),
  };
}
