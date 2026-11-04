import { isActiveState } from '@fluvy/core';
import { TONES, type Tone } from '@fluvy/ui';

/**
 * What a template card's templates answer, read as the card reads it: each parser takes the text Home Assistant
 * rendered (a result is text by then: `true`, `21.5`, `warning`) and gives what the card draws, or nothing for a
 * text that says none — never the text itself where it is not the thing asked for. An icon is read as every card reads
 * one (`iconRefOf`, shared/templates.ts).
 */

/**
 * Whether an answer says on, by the house's rule: a number is on unless it is 0, `true` and `yes` are on, `false` and
 * `no` are off, and any other word is on unless it is one of the states that read as off (`off`, `closed`, `idle`,
 * `not_home` …). Nothing at all is off.
 */
export function activeOf(text: string): boolean {
  const word = text.trim().toLowerCase();
  if (word === '' || word === 'false' || word === 'no') return false;
  if (word === 'true' || word === 'yes') return true;
  const number = Number(word);
  return Number.isFinite(number) ? number !== 0 : isActiveState('', word);
}

/** A colour an answer gives: a tone of the palette (`heat`, `warning`), or a colour as the card's palette draws it. */
export interface TemplateColour {
  readonly tone?: Tone;
  readonly color?: string;
}

/**
 * The colour an answer gives: a tone by its name, else what `pick` (the card's `accents.pick`) makes of it on the
 * palette the card wears — a Home Assistant colour's name, `#rrggbb`, `rgb(…)`, `primary` — as the hex it draws, or
 * nothing for a word no colour answers to.
 */
export function colourOf(
  text: string,
  pick: (choice: string) => string | undefined,
): TemplateColour {
  const word = text.trim();
  if ((TONES as readonly string[]).includes(word)) return { tone: word as Tone };
  const color = word ? pick(word) : undefined;
  return color ? { color } : {};
}
