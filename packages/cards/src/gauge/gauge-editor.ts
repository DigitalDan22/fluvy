import {
  chartDefaults,
  resolveEntity,
  strings as words,
  type GaugePreset,
  type HomeAssistant,
  type LovelaceConfigForm,
} from '@fluvy/core';
import { HEAD_BASE } from '../shared/base.js';
import { chartEngine } from '../shared/chart-load.js';
import {
  actionFields,
  boolField,
  colourFields,
  editorLabels,
  editorWord,
  entityField,
  fieldRow,
  hasLadder,
  iconField,
  nameField,
  NUMBER_DEFAULTS,
  numberField,
  numberFields,
  onlyWhen,
  optionChoices,
  orderedField,
  selectField,
  showIconField,
  textField,
  unitChoicesOf,
} from '../shared/form.js';
import { configKeys } from '../shared/config.js';
import type { EditorChoices, EditorDefaults } from '../shared/rows-editor.js';
import { toBase } from '../shared/units.js';
import { dialOf, GAUGE_STATS, GAUGE_VARIANTS, type GaugeCardConfig } from './gauge-card.js';

/** The gauge card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

const strings = words('gauge');

export const base = HEAD_BASE;

export const keys = configKeys<GaugeCardConfig>()([
  'subtitle',
  'variant',
  'min',
  'max',
  'max_entity',
  'label',
  'hours',
  'show_stats',
  'stats',
  'badge',
  'unit',
  'decimals',
  'gauge',
  'animate',
]);

type Data = Readonly<Record<string, unknown>>;

/** The ring's styles that read anything: its ticks (the dial since 1.0), the thermostat's dial read, a ring. */
const DIALS: readonly GaugePreset[] = ['ticks', 'dial', 'ring'];

/** What the card's sensor reads, as a gauge asks: its device class, and the unit its value comes in (W for a kW). */
const readsOf = (data: Data, hass?: HomeAssistant) => {
  const id = data['entity'];
  if (typeof id !== 'string' || !hass?.states[id]) return {};
  const view = resolveEntity(hass, id);
  return { deviceClass: view.deviceClass, unit: toBase(1, view.unit).unit };
};

/** The ring's style as drawn: the one it wants where it reads the sensor (the engine's rule), else ticks. */
const drawn = (data: Data, hass?: HomeAssistant) =>
  chartEngine()?.resolveGauge(dialOf(data), data, undefined, readsOf(data, hass));

/** Whether the card draws a gauge that moves: the ring, in a moving style that reads its sensor. */
const moving = (data: Data, hass?: HomeAssistant): boolean => {
  const style = (data['variant'] ?? 'ring') === 'ring' ? drawn(data, hass) : undefined;
  return style !== undefined && chartEngine()?.GAUGE_PRESETS[style.preset].motion === true;
};

/** What the editor shows where the config says nothing: what the card does then. */
export const defaults: EditorDefaults = (config, hass) => ({
  variant: 'ring',
  gauge: drawn(config, hass)?.preset ?? dialOf(config),
  animate: chartDefaults().settings.animate,
  show_stats: true,
  stats: [...GAUGE_STATS],
  ...NUMBER_DEFAULTS,
});

/** The units it offers are the sensor's class's; the ring's styles, its controls and the gauges that read it. */
export const choices: EditorChoices = (config, hass) => ({
  ...unitChoicesOf(config, hass),
  gauge: optionChoices([...DIALS, ...(chartEngine()?.movingFor(readsOf(config, hass)) ?? [])]),
});

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      entityField(['sensor', 'number', 'input_number', 'counter']),
      fieldRow(nameField(), textField('subtitle')),
      fieldRow(iconField(), selectField('variant', GAUGE_VARIANTS)),
      // the ring's style: a bar and a signed ring have one look each; of the moving ones, those that read the sensor
      // (`choices`)
      onlyWhen(
        (data) => (data['variant'] ?? 'ring') === 'ring',
        selectField('gauge', [...DIALS, ...(chartEngine()?.MOVING ?? [])]),
      ),
      // a moving gauge moves, or rests on its first frame
      onlyWhen(moving, boolField('animate')),
      showIconField(),
      ...colourFields(),
      fieldRow(
        numberField('min', -1_000_000, 1_000_000, 0.1),
        numberField('max', -1_000_000, 1_000_000, 0.1),
      ),
      {
        name: 'max_entity',
        selector: { entity: { domain: ['sensor', 'number', 'input_number'] } },
      },
      fieldRow(textField('label'), textField('badge')),
      fieldRow(boolField('show_stats'), numberField('hours', 1, 168)),
      // the row's figures in their order, while it is shown
      onlyWhen(
        (data) => data['show_stats'] !== false,
        orderedField(
          'stats',
          GAUGE_STATS.map((stat) => ({ value: stat, label: editorWord(`common.${stat}`) })),
        ),
      ),
      numberFields({ when: hasLadder }),
      actionFields(),
    ],
    ...editorLabels(
      strings,
      { max_entity: 'max_entity', label: 'label', badge: 'badge', stats: 'stats' },
      { show_stats: 'sensor.editor.show_stats' },
    ),
  };
}
