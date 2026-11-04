import { resolveEntity, type LovelaceConfigForm, type MessageKey } from '@fluvy/core';
import { HEAD_BASE } from '../shared/base.js';
import {
  actionFields,
  boolField,
  colourFields,
  editorWord,
  entityField,
  fieldRow,
  formLabels,
  nameIconFields,
  orderedField,
  selectField,
  showIconField,
  textField,
  whenOffField,
} from '../shared/form.js';
import type { EditorChoices, EditorDefaults } from '../shared/rows-editor.js';
import { configKeys } from '../shared/config.js';
import {
  defaultModes,
  MODE_ORDER,
  modeLabel,
  modeOrder,
  type ThermostatCardConfig,
} from './thermostat-card.js';

/** The thermostat card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

export const base = HEAD_BASE;

/** What the editor shows where the config says nothing; the modes as the card draws them, in its order. */
export const defaults: EditorDefaults = (config, hass) => {
  const entity = config['entity'];
  const view = resolveEntity(hass, typeof entity === 'string' ? entity : undefined);
  const modes = defaultModes(view.domain === 'climate', modeOrder(view));
  return {
    variant: 'dial',
    show_stepper: true,
    show_current: true,
    show_modes: true,
    modes_style: 'tiles',
    preset_style: 'full',
    fan_style: 'full',
    show_presets: true,
    show_fan: true,
    when_off: 'all',
    ...(modes.length ? { modes } : {}),
  };
};

/** The modes the editor offers are the entity's own, worded as the card words them. */
export const choices: EditorChoices = (config, hass) => {
  const entity = config['entity'];
  const view = resolveEntity(hass, typeof entity === 'string' ? entity : undefined);
  const modes = modeOrder(view);
  return modes.length
    ? { modes: modes.map((value) => ({ value, label: modeLabel(hass, view, value) })) }
    : {};
};

export const keys = configKeys<ThermostatCardConfig>()([
  'subtitle',
  'image',
  'show_presets',
  'show_fan',
  'variant',
  'show_stepper',
  'show_current',
  'show_modes',
  'modes',
  'modes_style',
  'preset_style',
  'fan_style',
  'when_off',
]);

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      entityField(['climate', 'water_heater', 'humidifier']),
      nameIconFields(),
      // the person's own picture in the circle's place: an address, or an entity whose picture it is
      textField('image'),
      fieldRow(textField('subtitle'), showIconField()),
      fieldRow(selectField('variant', ['dial', 'compact', 'ruler']), boolField('show_stepper')),
      fieldRow(boolField('show_modes'), selectField('modes_style', ['tiles', 'chips', 'full'])),
      // a climate's seven until the entity is known: then its own (`choices`), dragged into the order they show in
      orderedField(
        'modes',
        MODE_ORDER.map((value) => ({
          value,
          label: editorWord(`climate.mode.${value}` as MessageKey),
        })),
      ),
      boolField('show_current'),
      fieldRow(boolField('show_presets'), selectField('preset_style', ['full', 'chips'])),
      fieldRow(boolField('show_fan'), selectField('fan_style', ['full', 'chips'])),
      whenOffField(),
      ...colourFields(),
      actionFields(),
    ],
    ...formLabels({
      modes: 'editor.modes',
      modes_style: 'editor.modes_style',
      show_presets: 'climate.preset',
      preset_style: 'editor.preset_style',
      show_fan: 'climate.fan',
      fan_style: 'editor.fan_style',
    }),
  };
}
