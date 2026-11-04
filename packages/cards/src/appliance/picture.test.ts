import { describe, expect, it } from 'vitest';
import { headFit, pictureLadder, pictureStep, SUB_BESIDE, type PictureStyle } from './picture.js';

/*
 * The whole card's head (#47): the picture gives way before a letter of the name does. The names are German ones from
 * the reporter's house and the judge's probes, each as the card's ruler measures it in its head title (Inter 700, its
 * −0.01em tracking, the ruler's pixel for rounding) at 20 and at 16; the columns are 211, 266 and 360 (the card's 20
 * a side), the round 48 and its 16.
 */
const NAMES: Readonly<Record<string, readonly [number, number]>> = {
  Backofen: [95, 78],
  Kühlschrank: [121, 99],
  Spülmaschine: [138, 112],
  Wasserkocher: [142, 117],
  Geschirrspüler: [143, 119],
  'Trockner Keller': [148, 123],
  Heißluftfritteuse: [160, 133],
  Waschmaschine: [161, 132],
  Kaffeevollautomat: [185, 149],
  'Waschmaschine Keller': [219, 180],
  'Kühl-Gefrierkombination': [240, 194],
  'Samsung Geschirrspüler': [239, 196],
};
const ROUND = 48 + 16;

/** The head at a column: its picture, whether the name steps to 16, and whether the name is whole. */
const at = (
  column: number,
  name: string,
  picture: PictureStyle = 'art',
  least?: number | string,
) => {
  const [big, small] = NAMES[name] ?? [0, 0];
  const fit = headFit(column - 40, ROUND, pictureLadder(picture, least), big, small);
  return {
    size: fit.size,
    small: fit.small,
    whole: (fit.small ? small : big) <= fit.room,
    under: fit.under,
  };
};

describe('the whole card’s head', () => {
  it('gives its picture up before a letter of the name: 64, 44, 44 with the name at 16, none (#47)', () => {
    // a 360 column, as the reporter's page: his names whole at 20 beside the 64
    for (const name of [
      'Backofen',
      'Kühlschrank',
      'Geschirrspüler',
      'Waschmaschine',
      'Heißluftfritteuse',
    ])
      expect(at(360, name), name).toEqual({ size: 64, small: false, whole: true, under: false });
    // a longer one keeps its 20 beside the 44; longer still, the 44 with the name at 16 — never cut beside a picture
    expect(at(360, 'Kaffeevollautomat')).toEqual({
      size: 44,
      small: false,
      whole: true,
      under: false,
    });
    for (const name of [
      'Waschmaschine Keller',
      'Samsung Geschirrspüler',
      'Kühl-Gefrierkombination',
    ])
      expect(at(360, name), name).toEqual({ size: 44, small: true, whole: true, under: false });
  });

  it('at 266, the German names are whole: the picture goes first (#47)', () => {
    // "Waschma…" and "Geschirrs…" beside a 44 were the judge's: each holds without it
    for (const name of ['Waschmaschine', 'Geschirrspüler', 'Wasserkocher', 'Trockner Keller'])
      expect(at(266, name), name).toEqual({ size: 0, small: false, whole: true, under: true });
    // one that holds at 16 beside the 32 keeps that (#103)
    expect(at(266, 'Spülmaschine')).toEqual({ size: 32, small: true, whole: true, under: true });
    expect(at(266, 'Kaffeevollautomat')).toEqual({
      size: 0,
      small: true,
      whole: true,
      under: true,
    });
    // a short one keeps a picture
    expect(at(266, 'Backofen')).toEqual({ size: 44, small: false, whole: true, under: true });
    expect(at(266, 'Kühlschrank')).toEqual({ size: 44, small: true, whole: true, under: true });
  });

  it('at 211, no picture; the name at 20, then 16, and only one that holds nowhere ends in its ellipsis', () => {
    expect(at(211, 'Backofen')).toEqual({ size: 0, small: false, whole: true, under: true });
    expect(at(211, 'Kühlschrank')).toEqual({ size: 0, small: true, whole: true, under: true });
    expect(at(211, 'Waschmaschine')).toEqual({ size: 0, small: true, whole: false, under: true });
  });

  it('keeps its least where the card asks, the name at 16 ending in its ellipsis while a slot of 72 holds (#103)', () => {
    expect(at(266, 'Waschmaschine', 'art', 32)).toEqual({
      size: 32,
      small: true,
      whole: false,
      under: true,
    });
    expect(at(266, 'Waschmaschine', 'art', '44')).toEqual({
      size: 44,
      small: true,
      whole: false,
      under: true,
    });
    // a larger step the whole name holds beside is taken first; the 64 asked is always the 64
    expect(at(266, 'Backofen', 'art', 32)).toEqual({
      size: 44,
      small: false,
      whole: true,
      under: true,
    });
    expect(at(360, 'Kaffeevollautomat', 'art', 64)).toEqual({
      size: 64,
      small: true,
      whole: true,
      under: false,
    });
    // the circle's least is its 44; without a slot of 72 the picture goes all the same
    expect(at(266, 'Waschmaschine', 'icon', 32).size).toBe(44);
    expect(at(211, 'Waschmaschine', 'art', 32)).toEqual({
      size: 0,
      small: true,
      whole: false,
      under: true,
    });
  });

  it('steps a row’s picture down to 32 before it goes; kept, beside a name cut however short, never the state (#103)', () => {
    // a row (the appliance card's, as its own row reads it: its content, 8 of its own beside, its round given up),
    // its name at 15 and what it says, as wide as given
    const row = (content: number, name: number, state: number, least?: number) => {
      const ladder = pictureLadder('art', least);
      return pictureStep(ladder.sizes, ladder.keep, (size, room) => {
        const left = content - (size ? size + 12 : 0);
        return (
          state <= left &&
          (room === 'whole'
            ? name <= left + 8
            : room === 'least'
              ? Math.min(96, name) <= left
              : true)
        );
      });
    };
    // two side by side on a phone, 182 each (142 of content): the reporter's oven, dishwasher, a long name
    expect(row(142, 40, 60)).toBe(64);
    expect(row(142, 85, 60)).toBe(44);
    expect(row(142, 150, 60)).toBe(32);
    // at 152 (112), a long name is cut to its 96 before the picture goes: it goes, unless the card keeps it
    expect(row(112, 150, 60)).toBe(0);
    expect(row(112, 150, 60, 32)).toBe(32);
    // a state that would not hold beside its least takes the picture's place, kept or not
    expect(row(112, 150, 60, 44)).toBe(0);
    expect(row(112, 150, 72, 32)).toBe(0);
    expect(row(112, 150, 72)).toBe(0);
  });

  it('reads the least a card keeps: 32, 44 or 64 (a number or its word), any other the steps up from it', () => {
    expect(pictureLadder('art', undefined)).toEqual({ sizes: [64, 44, 32], keep: false });
    expect(pictureLadder('art', 'auto')).toEqual({ sizes: [64, 44, 32], keep: false });
    expect(pictureLadder('art', 0)).toEqual({ sizes: [64, 44, 32], keep: false });
    expect(pictureLadder('art', '32')).toEqual({ sizes: [64, 44, 32], keep: true });
    expect(pictureLadder('art', 50)).toEqual({ sizes: [64], keep: true });
    expect(pictureLadder('art', 200)).toEqual({ sizes: [64], keep: true });
    expect(pictureLadder('icon', 32)).toEqual({ sizes: [64, 44], keep: true });
    expect(pictureLadder('none', 44)).toEqual({ sizes: [], keep: false });
  });

  it('says what the appliance does beside the name or under the head by the column alone, never by the name', () => {
    for (const column of [211, 266, 300, 320, 360, 412]) {
      const said = Object.keys(NAMES).map((name) => at(column, name).under);
      expect(new Set(said).size, String(column)).toBe(1);
      expect(said[0], String(column)).toBe(column - 40 - ROUND - 64 - 16 < SUB_BESIDE);
    }
    // without a picture, by the room the column leaves the name
    expect(at(266, 'Waschmaschine', 'none').under).toBe(226 - ROUND < SUB_BESIDE);
    expect(at(360, 'Waschmaschine Keller', 'none')).toEqual({
      size: 0,
      small: false,
      whole: true,
      under: false,
    });
  });
});
