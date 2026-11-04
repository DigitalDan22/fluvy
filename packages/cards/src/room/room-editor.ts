import {
  addEnglish,
  areaContents,
  areaEntities,
  lightDefaults,
  resolveEntity,
  type ClimateKind,
  type HaFormSchemaItem,
  type HomeAssistant,
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
import words from '@fluvy/core/locales/en/room-editor.json';

// the editor's own English, in its chunk: its words are said once it is drawn, never by a dashboard
addEnglish(words);

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
  'include',
  'exclude',
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

/**
 * What a room's `include` and `exclude` offer (#95), each with its words: its entities, its devices and its domains,
 * any other entry typed (an entity elsewhere, a pattern of ids).
 */
function roomEntries(config: Readonly<Record<string, unknown>>, hass?: HomeAssistant) {
  const area = String(config['area'] ?? '');
  if (!hass?.states || !area) return [];
  const ids = areaEntities(hass, area);
  const devices = [...new Set(ids.map((id) => hass.entities?.[id]?.device_id ?? ''))].filter(
    (device) => hass.devices?.[device],
  );
  return [
    ...ids.map((id) => ({ value: id, label: `${resolveEntity(hass, id).name} (${id})` })),
    ...devices.map((device) => ({
      value: device,
      label: hass.devices?.[device]?.name_by_user ?? hass.devices?.[device]?.name ?? device,
    })),
    ...[...new Set(ids.map((id) => id.slice(0, id.indexOf('.'))))].map((domain) => ({
      value: domain,
      label: domain,
    })),
  ];
}

/** A tile's `since` offers the house's timestamp sensors, as the tiles card's do; `include`, `exclude` the room's own. */
export const choices: EditorChoices = (config, hass) => {
  const entries = roomEntries(config, hass);
  return { ...sinceChoices(config, hass), include: entries, exclude: entries };
};

/** A room's `include` or `exclude`: its entities, devices and domains to choose, or a pattern typed (#95). */
const entriesField = (name: 'include' | 'exclude'): HaFormSchemaItem => ({
  name,
  selector: { select: { multiple: true, custom_value: true, mode: 'dropdown', options: [] } },
  helper: 'room-editor.entries_help',
});

/**
 * What the editor shows where the config says nothing: what the card does then — its variant, the readings it found
 * in the room as its `include` and `exclude` say.
 */
export const defaults: EditorDefaults = (config, hass) => {
  const area = hass?.areas?.[String(config['area'] ?? '')];
  const found =
    hass && area ? areaContents(hass, area.area_id, config as RoomCardConfig) : undefined;
  return {
    variant: config['picture'] || area?.picture ? 'photo' : 'tile',
    controls: 'rows',
    name_lines: '1',
    show_count: true,
    show_climate: true,
    tint: 'on',
    light_colors: lightDefaults().colors,
    light_whites: 'temperature',
    temperature_entity: found?.climate.temperature,
    humidity_entity: found?.climate.humidity,
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
      entriesField('include'),
      entriesField('exclude'),
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
      include: 'room-editor.include',
      exclude: 'room-editor.exclude',
    }),
  };
}
