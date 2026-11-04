import { lightDefaults, resolveEntity, type LovelaceConfigForm } from '@fluvy/core';
import {
  actionFields,
  colourFields,
  entitiesField,
  entityField,
  fieldRow,
  formLabels,
  lightColourFields,
  nameIconFields,
  nameLinesField,
  onlyWhen,
  selectField,
  sinceChoices,
  sinceField,
  tintField,
} from '../shared/form.js';
import { ENTITY_BASE } from '../shared/base.js';
import { configKeys } from '../shared/config.js';
import type { EditorChoices, EditorDefaults } from '../shared/rows-editor.js';
import { ruled, TILE_SIZES, tintsAtRest, type TileCardConfig } from './tile-card.js';

/** The tile card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

export const base = ENTITY_BASE;

export const keys = configKeys<TileCardConfig>()([
  'size',
  'name_lines',
  'readouts',
  'since',
  'tint',
  'light_colors',
  'light_whites',
]);

export const defaults: EditorDefaults = () => ({
  size: 'large',
  name_lines: '1',
  since: '',
  tint: 'on',
  light_colors: lightDefaults().colors,
  light_whites: 'temperature',
});

/** `since` offers the house's timestamp sensors. */
export const choices: EditorChoices = sinceChoices;

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      entityField(),
      nameIconFields(),
      // a small tile's name may take two lines
      fieldRow(
        selectField('size', TILE_SIZES),
        onlyWhen(({ size }) => size !== 'large', nameLinesField()),
      ),
      sinceField(),
      ...colourFields(),
      onlyWhen(tintsAtRest, tintField()),
      // a light's colours, for a light; readouts where they are drawn: a large tile's foot is its ruler when it has one
      onlyWhen(({ entity }) => String(entity).startsWith('light.'), lightColourFields()),
      onlyWhen(
        ({ size, entity }, hass) => size !== 'large' || !ruled(resolveEntity(hass, String(entity))),
        entitiesField('readouts', ['sensor']),
      ),
      actionFields(),
    ],
    ...formLabels({ readouts: 'editor.readouts' }),
  };
}
