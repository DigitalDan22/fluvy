import { strings, type HaFormSchemaItem, type LovelaceConfigForm } from '@fluvy/core';
import type { SourceKind } from '../energy-model/prefs.js';
import { ARROWS, SHOWS, SOURCE_KEYS, SOURCE_KINDS } from '../energy-model/sources.js';
import {
  COLLECTION_LABEL,
  collectionChoices,
  collectionField,
  collectionHelper,
  following,
  periodic,
} from '../energy/collection-field.js';
import { WATT_LADDERS } from '../energy/power.js';
import type { BaseKey } from '../shared/base.js';
import { configKeys } from '../shared/config.js';
import {
  accentField,
  actionFields,
  boolField,
  byName,
  colourFields,
  editorLabels,
  editorWord,
  entitiesField,
  entityField,
  fieldRow,
  iconField,
  nameField,
  nameIconFields,
  NUMBER_DEFAULTS,
  numberField,
  numberFields,
  onlyWhen,
  pickFields,
  selectField,
  showIconField,
  textField,
  titleFields,
} from '../shared/form.js';
import type { EditorChoices, EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import {
  FLOW_BADGES,
  FLOW_PERIODS,
  FLOW_STYLES,
  FLOW_VARIANTS,
  type EnergyFlowCardConfig,
} from './energy-flow-card.js';
import { MOTION_MODES } from './motion.js';

/** The flow card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

const s = strings('energy-flow');

const KIND_OPTIONS = {
  select: {
    mode: 'dropdown' as const,
    options: SOURCE_KINDS.map((value) => ({
      value,
      label: editorWord(`energy-flow.kind_${value}`),
    })),
  },
};

/** Every field a source may carry, in the order its form shows them. */
const SOURCE_FIELDS: HaFormSchemaItem[] = [
  { name: 'type', selector: KIND_OPTIONS },
  entityField(['sensor'], 'power', false),
  { name: 'phases', selector: { entity: { domain: ['sensor'], multiple: true } } },
  fieldRow(entityField(['sensor'], 'import', false), entityField(['sensor'], 'export', false)),
  boolField('invert'),
  fieldRow(entityField(['sensor'], 'level', false), numberField('capacity', 0, 1000, 0.1)),
  fieldRow(textField('name'), iconField()),
  fieldRow(accentField('color', { item: 'own' }), numberField('threshold', 0, 10000, 1)),
  fieldRow(selectField('arrows', ARROWS), selectField('show', SHOWS)),
];

/**
 * What each kind is read by, beyond the fields every source has: two sensors for what can flow both ways, phases
 * for what a house meters per phase, a charge for what stores energy. A field the item already carries stays shown.
 */
const KIND_FIELDS: Readonly<Record<SourceKind, readonly string[]>> = {
  solar: ['phases'],
  grid: ['phases', 'import', 'export'],
  battery: ['import', 'export', 'level', 'capacity'],
  generator: ['phases'],
  vehicle: ['import', 'export', 'level', 'capacity'],
};
const EVERY_SOURCE = new Set([
  'type',
  'power',
  'invert',
  'name',
  'icon',
  'color',
  'threshold',
  'arrows',
  'show',
]);
const sourceForms = new Map<string, HaFormSchemaItem[]>();

function sourceSchema(item: Readonly<Record<string, unknown>>): readonly HaFormSchemaItem[] {
  const own = KIND_FIELDS[item.type as SourceKind] as readonly string[] | undefined;
  if (!own) return SOURCE_FIELDS;
  const shown = (name: string): boolean =>
    EVERY_SOURCE.has(name) ||
    own.includes(name) ||
    (item[name] !== undefined && item[name] !== '' && item[name] !== null);
  const key = SOURCE_KEYS.filter(shown).join(',');
  let form = sourceForms.get(key);
  if (!form) {
    form = pickFields(SOURCE_FIELDS, byName(shown));
    sourceForms.set(key, form);
  }
  return form;
}

/** A diagram of many sensors has no entity of its own: its head's icon, tone and colour, and its actions on the head. */
export const base: readonly BaseKey[] = [
  'icon',
  'tone',
  'color',
  'card_color',
  'card_opacity',
  'tap_action',
  'hold_action',
  'show_icon',
];

export const keys = configKeys<EnergyFlowCardConfig>()([
  'title',
  'subtitle',
  'sources',
  'home',
  'consumers',
  'variant',
  'flow_style',
  'motion',
  'max_power',
  'badge',
  'period',
  'show_period',
  'collection_key',
  'readouts',
  'unit',
  'decimals',
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'sources',
    title: 'energy-flow.editor_sources',
    idKey: 'type',
    picker: { name: 'type', selector: KIND_OPTIONS },
    keys: SOURCE_KEYS,
    schema: SOURCE_FIELDS,
    schemaOf: sourceSchema,
    computeLabel: editorLabels(s, {
      type: 'editor_type',
      power: 'editor_power',
      phases: 'editor_phases',
      import: 'editor_import',
      export: 'editor_export',
      invert: 'editor_invert',
      level: 'editor_level',
      capacity: 'editor_capacity',
      threshold: 'editor_threshold',
      arrows: 'editor_arrows',
      show: 'editor_show',
    }).computeLabel,
  },
  {
    key: 'consumers',
    title: 'energy-flow.editor_consumers',
    domains: ['sensor'],
    keys: ['entity', 'name', 'icon', 'color'],
    schema: [entityField(['sensor']), nameIconFields(), accentField('color', { item: 'own' })],
  },
  {
    key: 'readouts',
    title: 'editor.rows',
    domains: ['sensor'],
    keys: ['entity', 'name', 'unit', 'decimals'],
    schema: [entityField(['sensor']), nameField(), numberFields({ units: WATT_LADDERS })],
  },
];

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = () => ({
  flow_style: 'stream',
  motion: 'full',
  badge: 'solar',
  period: 'live',
  variant: 'rows',
  show_period: true,
  collection_key: '',
  ...NUMBER_DEFAULTS,
});

/** The date pickers on the dashboard, for the key. */
export const choices: EditorChoices = (_config, hass) => ({
  collection_key: collectionChoices(hass),
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      titleFields(),
      fieldRow(iconField(), entityField(['sensor'], 'home', false)),
      showIconField(),
      fieldRow(selectField('variant', FLOW_VARIANTS), selectField('flow_style', FLOW_STYLES)),
      fieldRow(selectField('motion', MOTION_MODES), numberField('max_power', 100, 100000, 100)),
      fieldRow(
        {
          name: 'badge',
          selector: {
            select: {
              mode: 'dropdown',
              options: FLOW_BADGES.map((value) => ({
                value,
                label: editorWord(value === 'none' ? 'option.none' : `energy-flow.badge_${value}`),
              })),
            },
          },
        },
        selectField('period', FLOW_PERIODS),
      ),
      // over a period, a date picker to follow; the chips while none is followed
      fieldRow(
        onlyWhen(periodic, collectionField()),
        onlyWhen((data) => !following(data), boolField('show_period')),
      ),
      entitiesField('readouts', ['sensor']),
      ...colourFields(),
      numberFields({ units: WATT_LADDERS }),
      actionFields(),
    ],
    ...editorLabels(
      s,
      {
        home: 'editor_home',
        readouts: 'editor_readouts',
        max_power: 'editor_max_power',
        badge: 'editor_badge',
        motion: 'editor_motion',
        period: 'editor_period',
        show_period: 'editor_show_period',
      },
      { flow_style: 'editor.flow_style', ...COLLECTION_LABEL },
    ),
    computeHelper: collectionHelper,
  };
}
