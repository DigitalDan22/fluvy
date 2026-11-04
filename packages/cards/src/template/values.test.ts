import { describe, expect, it } from 'vitest';
import { activeOf, colourOf } from './values.js';

describe('activeOf: on by the house’s rule', () => {
  it.each([
    'on',
    'true',
    'True',
    'yes',
    'open',
    'home',
    'playing',
    'heat',
    '1',
    '0.5',
    '-2',
    ' on ',
  ])('%j is on', (text) => expect(activeOf(text)).toBe(true));

  it.each([
    '',
    '  ',
    'off',
    'false',
    'False',
    'no',
    'closed',
    'idle',
    'not_home',
    'unavailable',
    '0',
    '0.0',
  ])('%j is off', (text) => expect(activeOf(text)).toBe(false));
});

describe('colourOf: a tone by its name, else a colour on the palette', () => {
  // the palette as `accents.pick` answers it: the names it knows as hexes, the rest as nothing
  const pick = (choice: string): string | undefined =>
    ({ red: '#f44336', '#00aa88': '#00aa88', primary: 'accent' })[choice];

  it('a tone of the palette is the tone', () => {
    expect(colourOf('warning', pick)).toEqual({ tone: 'warning' });
    expect(colourOf(' heat ', pick)).toEqual({ tone: 'heat' });
  });

  it('a colour is what the palette draws it as', () => {
    expect(colourOf('red', pick)).toEqual({ color: '#f44336' });
    expect(colourOf('#00aa88', pick)).toEqual({ color: '#00aa88' });
    expect(colourOf('primary', pick)).toEqual({ color: 'accent' });
  });

  it('nothing for an empty answer, or a word no colour answers to', () => {
    expect(colourOf('', pick)).toEqual({});
    expect(colourOf('banana', pick)).toEqual({});
  });
});
