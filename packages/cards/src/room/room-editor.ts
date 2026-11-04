import {
  areaClimate,
  lightDefaults,
  type ClimateKind,
  type HaFormSchemaItem,
  type LovelaceConfigForm,
} from '@fluvy/core';
import { configKeys } from '../shared/config.js';
import {
  actionField,
  areaField,
  boolField,
  colourFields,
  fieldRow,
  formLabels,
  lightColourFields,
  nameIconFields,
  nameLinesField,
  onlyWhen,
  selectField,
  showIconField,
  sinceChoices,
  textField,
  tintField,
} from '../shared/form.js';
import type { BaseKey } from '../shared/base.js';
import type { EditorChoices, EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { lists as tilesLists } from '../tiles/tiles-editor.js';
import type { RoomCardConfig } from './room-card.js';

/** The room card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

/** Whether the room draws what its editor offers under its head or hero (its form's data): a row draws none of it. */
const drawsControls = ({ variant }: Readonly<Record<string, unknown>>): boolean =>
  variant !== 'row';

/** …its tiles (`controls: tiles`), and their colour at rest with them. */
const drawsTiles = (form: Readonly<Record<string, unknown>>): boolean =>
  drawsControls(form) && form['controls'] === 'tiles';

/** …its lights, in a row of their own or among its tiles. */
const drawsLights = (form: Readonly<Record<string, unknown>>): boolean =>
  drawsControls(form) && form['controls'] !== 'none';

/** A reading's field: a sensor of its class, or the thermostat (the humidifier) that carries it (`climateAttribute`). */
const readingField = (kind: ClimateKind, ...domain: string[]): HaFormSchemaItem => ({
  name: `${kind}_entity`,
  selector: { entity: { filter: [{ domain: 'sensor', device_class: kind }, { domain }] } },
});

export const base: readonly BaseKey[] = [
  'name',
  'icon',
  'tone',
  'color',
  'card_color',
  'tap_action',
  'hold_action',
  'show_icon',
];

export const keys = configKeys<RoomCardConfig>()([
  'area',
  'variant',
  'picture',
  'show_climate',
  'show_count',
  'controls',
  'tiles',
  'path',
  'temperature_entity',
  'humidity_entity',
  'tint',
  'name_lines',
  'light_colors',
  'light_whites',
]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'tiles',
    title: 'editor.tiles',
    keys: tilesLists[0]?.keys ?? [],
    schema: tilesLists[0]?.schema ?? [],
    when: drawsTiles,
  },
];

/** A tile's `since` offers the house's timestamp sensors, as the tiles card's do. */
export const choices: EditorChoices = sinceChoices;

/** What the editor shows where the config says nothing: what the card does then — its variant, the readings it found. */
export const defaults: EditorDefaults = (config, hass) => {
  const area = hass?.areas?.[String(config['area'] ?? '')];
  const found = hass && area ? areaClimate(hass, area.area_id) : {};
  return {
    variant: config['picture'] || area?.picture ? 'photo' : 'tile',
    controls: 'rows',
    name_lines: '1',
    show_count: true,
    show_climate: true,
    tint: 'on',
    light_colors: lightDefaults().colors,
    light_whites: 'temperature',
    temperature_entity: found.temperature,
    humidity_entity: found.humidity,
  };
};

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      areaField(),
      nameIconFields(),
      showIconField(),
      fieldRow(
        selectField('variant', ['photo', 'tile', 'row']),
        onlyWhen(drawsControls, selectField('controls', ['rows', 'tiles', 'none'])),
      ),
      fieldRow(boolField('show_climate'), boolField('show_count')),
      // a picture is the photo's alone (the default where the room has one)
      fieldRow(
        onlyWhen(({ variant }) => variant === 'photo', textField('picture')),
        textField('path'),
      ),
      fieldRow(
        readingField('temperature', 'climate'),
        readingField('humidity', 'climate', 'humidifier'),
      ),
      ...colourFields(),
      // its tiles' colour at rest; their names' lines, and the row's (a compact tile)
      fieldRow(
        onlyWhen(drawsTiles, tintField()),
        onlyWhen((form) => drawsTiles(form) || form['variant'] === 'row', nameLinesField()),
      ),
      onlyWhen(drawsLights, lightColourFields()),
      fieldRow(actionField('tap_action'), actionField('hold_action')),
    ],
    ...formLabels({
      temperature_entity: 'editor.temperature_entity',
      humidity_entity: 'editor.humidity_entity',
    }),
  };
}
