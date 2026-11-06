import { localize, type HaFormSchemaItem, type MessageKey } from '@fluvy/core';
import {
  editorLanguage,
  editorWord,
  entityField,
  orderedField,
  type OptionWord,
} from '../shared/form.js';
import type { FormHelper } from '../shared/rows-editor.js';
import { CONFIRM_ACTION, CONFIRM_NAMES, unknownConfirms, type ConfirmName } from './commands.js';
import { APPLIANCE_KINDS, type ApplianceKind } from './kinds.js';
import { NO_ENTITY } from './roles.js';

/*
 * The appliance cards' editor parts: a choice whose words are the family's own (they travel with its chunk, never in
 * core's `option` table), the folding group every long editor shares (`sectionField`, the shared form's), the kinds,
 * the least a picture steps down to, the commands asked before, a role's entity, and the device picker.
 */

/** A choice among values, each named by a word of the catalogue (the family's, or core's `option` words). */
export const choiceField = (
  name: string,
  options: ReadonlyArray<readonly [value: string, word: MessageKey]>,
): HaFormSchemaItem => ({
  name,
  selector: {
    select: {
      mode: 'dropdown',
      options: options.map(([value, word]) => ({ value, label: editorWord(word) })),
    },
  },
});

/** A value named by core's `option` word. */
export const option = (value: OptionWord): readonly [string, MessageKey] => [
  value,
  `option.${value}`,
];

export { sectionField } from '../shared/form.js';

/** What an appliance is, the card's guess first. */
export const kindField = (name = 'kind'): HaFormSchemaItem =>
  choiceField(name, [
    option('auto'),
    ...APPLIANCE_KINDS.map(
      (kind: ApplianceKind) =>
        [kind, `appliance.kind_${kind}`] as const satisfies readonly [string, MessageKey],
    ),
  ]);

/**
 * The least a picture steps down to (#103): Automatic (it steps down, then gives way, before a letter of the name),
 * or small, medium or large, a long name ending in its ellipsis beside it.
 */
export const pictureMinField = (): HaFormSchemaItem => ({
  ...choiceField('picture_min', [
    option('auto'),
    ['32', 'appliance.o_picture_small'],
    ['44', 'appliance.o_picture_medium'],
    ['64', 'appliance.o_picture_large'],
  ]),
  helper: 'appliance.editor_picture_min_helper',
});

/** The commands a card asks before (#120), each in its button's words: those `names`, every one by default. */
export const confirmField = (names: readonly ConfirmName[] = CONFIRM_NAMES): HaFormSchemaItem =>
  orderedField('confirm', confirmChoices(names));

/**
 * What the editor says under `confirm` where it names a command the card does not know (a typo by hand): that it is
 * left out, or, where it names none the card knows, that the card asks before its default ones.
 */
export const confirmHelper: FormHelper = (schema, _localize, data) => {
  if (schema.name !== 'confirm') return undefined;
  const named = data?.['confirm'];
  const unknown = unknownConfirms(named);
  if (!unknown.length) return undefined;
  const all = unknown.length === (Array.isArray(named) ? named.length : 1);
  return localize(
    editorLanguage(),
    all ? 'appliance.editor_confirm_unknown_all' : 'appliance.editor_confirm_unknown',
    { words: unknown.join(', ') },
  );
};

/** The commands a card may ask before, as its editor offers them. */
export const confirmChoices = (
  names: readonly ConfirmName[],
): ReadonlyArray<{ readonly value: string; readonly label: string }> =>
  names.map((name) => ({ value: name, label: editorWord(`appliance.${CONFIRM_ACTION[name]}`) }));

/**
 * A role's entity (`roles`): one of the house, or None (Home Assistant's picker lists it first), which leaves out what
 * the card found for the role (#127); its word in the editor's language.
 */
export const roleEntityField = (): HaFormSchemaItem => ({
  ...entityField(undefined, 'entity'),
  selector: {
    entity: {
      extra_options: [
        { id: NO_ENTITY, primary: editorWord('appliance.editor_role_none'), icon: 'mdi:cancel' },
      ],
    },
  },
});

/**
 * The device picker: any device of the house, of an integration the cards read or not (#115: an espresso machine over
 * MQTT, its kind and its roles named in the editor), but one with no entity an appliance's state, power or readings
 * live in — a hub, a bridge, a player, a light — which can never be one.
 */
export const deviceField = (): HaFormSchemaItem => ({
  name: 'device',
  selector: { device: { entity: { domain: ['sensor', 'binary_sensor', 'switch'] } } },
});
