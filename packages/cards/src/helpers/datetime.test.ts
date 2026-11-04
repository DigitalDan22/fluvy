import { LANGUAGE_CODES, type HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { textWidth } from '../shared/heights.js';
import { dayText, dayTextShort, parseMomentText } from './datetime.js';
import { BUTTON_SIDES, valueCap } from '../shared/row-end.js';

/** A house speaking `language`, its profile's date order where it has one. */
const house = (language: string, date_format?: 'DMY' | 'MDY' | 'YMD'): HomeAssistant =>
  ({
    language,
    locale: { language, number_format: 'language', time_format: '24', date_format },
  }) as unknown as HomeAssistant;

/** The sheets' evening: a day of 2026, so a date of 2026 shows no year and one of 2027 does. */
const NOW = new Date(2026, 8, 17, 21, 47);
const ORDERS = [undefined, 'DMY', 'MDY', 'YMD'] as const;
/** The 10th of each month, this year and next (the year then shows). */
const MOMENTS = [2026, 2027].flatMap((year) =>
  Array.from({ length: 12 }, (_, month) => {
    const moment = parseMomentText(`${year}-${String(month + 1).padStart(2, '0')}-10`);
    if (!moment) throw new Error('a date the parser reads');
    return moment;
  }),
);
/** What a pill of `text` runs to, as `heights.ts` estimates a row's words (the button's 15/600 is near its 14/500). */
const pill = (text: string): number =>
  Math.ceil((textWidth(text, 'legend') + BUTTON_SIDES) / 4) * 4;

describe('a date as a row shows it', () => {
  it('names the month in the language, as figures where the pill is narrow; the year once it is not this one', () => {
    const nov = parseMomentText('2026-11-10')!;
    const next = parseMomentText('2027-11-10')!;
    expect(dayText(house('pt-BR'), nov, NOW)).toBe('10 de nov.');
    expect(dayTextShort(house('pt-BR'), nov, NOW)).toBe('10/11');
    expect(dayText(house('en'), nov, NOW)).toBe('Nov 10');
    expect(dayTextShort(house('en'), nov, NOW)).toBe('11/10');
    expect(dayTextShort(house('de'), nov, NOW)).toBe('10.11.');
    expect(dayTextShort(house('ja'), nov, NOW)).toBe('11/10');
    expect(dayText(house('en'), next, NOW)).toBe('Nov 10, 2027');
    expect(dayTextShort(house('en'), next, NOW)).toBe('11/10/27');
  });

  it("keeps the profile's order in both forms, the parts bare of what a language hangs on them", () => {
    const nov = parseMomentText('2026-11-10')!;
    const next = parseMomentText('2027-11-10')!;
    expect(dayText(house('en', 'DMY'), nov, NOW)).toBe('10 Nov');
    expect(dayTextShort(house('en', 'DMY'), nov, NOW)).toBe('10/11');
    expect(dayTextShort(house('en', 'MDY'), nov, NOW)).toBe('11/10');
    expect(dayTextShort(house('en', 'YMD'), next, NOW)).toBe('27/11/10');
    expect(dayTextShort(house('de', 'DMY'), next, NOW)).toBe('10/11/27');
    expect(dayTextShort(house('ja', 'DMY'), next, NOW)).toBe('10/11/27');
  });

  it('holds as figures within the pill at a third of a section, every month in every language and order', () => {
    // the cap of a bare row at the 211 column (171 of content): the long form may run over it, the figures never
    const cap = valueCap(171, true);
    expect(cap).toBe(104);
    for (const language of LANGUAGE_CODES)
      for (const order of ORDERS)
        for (const moment of MOMENTS) {
          const hass = house(language, order);
          const long = dayText(hass, moment, NOW);
          const short = dayTextShort(hass, moment, NOW);
          const where = `${language} ${order ?? 'own'} ${moment.date.toISOString().slice(0, 10)}`;
          expect(long, where).toMatch(/10/);
          expect(short, where).toMatch(/^[\d./-]+$/);
          expect(pill(short), `${where}: "${short}"`).toBeLessThanOrEqual(cap);
        }
  });
});
