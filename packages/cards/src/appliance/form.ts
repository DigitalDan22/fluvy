import type { HaFormSchemaItem, MessageKey } from '@fluvy/core';
import { editorWord, type OptionWord } from '../shared/form.js';
import { APPLIANCE_KINDS, type ApplianceKind } from './kinds.js';
import { VERIFIED_PLATFORMS, COMMUNITY_PLATFORMS } from './roles.js';

/*
 * The appliance cards' editor parts: a choice whose words are the family's own (they travel with its chunk, never in
 * core's `option` table), the folding group every long editor shares (`sectionField`, the shared form's), the kinds,
 * the least a picture steps down to, and the device picker filtered to the integrations the cards read.
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

/** The device picker, filtered to the integrations the cards read (a plug's appliance is picked by its entity). */
export const deviceField = (): HaFormSchemaItem => ({
  name: 'device',
  selector: {
    device: {
      filter: [...VERIFIED_PLATFORMS, ...COMMUNITY_PLATFORMS].map((integration) => ({
        integration,
      })),
    },
  },
});
