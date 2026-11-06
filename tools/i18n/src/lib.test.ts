import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPLIANCE_OUT,
  CJK,
  generate,
  generateAppliance,
  ordered,
  OUT,
  pattern,
  plain,
} from './build.js';
import {
  catalogueCodes,
  compare,
  compareIntegration,
  counts,
  englishCounts,
  englishParts,
  integrationFile,
  LOCALES,
  reached,
  readCatalogue,
  ROOT,
  type Catalogue,
} from './lib.js';

describe('the catalogues on disk', () => {
  it('are the languages the registry names', async () => {
    const registry = await readFile(
      join(ROOT, 'packages', 'core', 'src', 'i18n', 'languages.ts'),
      'utf8',
    );
    const codes =
      /LANGUAGE_CODES = \[([^\]]+)\]/
        .exec(registry)?.[1]
        ?.match(/'([^']+)'/g)
        ?.map((s) => s.slice(1, -1)) ?? [];
    expect([...codes].sort()).toEqual(await catalogueCodes());
  });

  it('mirror English key for key, with the same placeholders and words', async () => {
    const english = await readCatalogue('en');
    for (const code of await catalogueCodes()) {
      if (code === 'en') continue;
      const errors = compare(code, await readCatalogue(code), english, true).filter(
        (p) => p.level === 'error',
      );
      expect(errors.map((p) => `${p.language} ${p.text}`)).toEqual([]);
    }
  });

  it('keep English in parts, core first, each namespace in one of them', async () => {
    const parts = await englishParts();
    expect(parts[0]?.part).toBe('core.json');
    const namespaces = parts.flatMap(({ tables }) => Object.keys(tables));
    expect(namespaces.length).toBe(new Set(namespaces).size);
    expect(Object.keys(await readCatalogue('en'))).toEqual([...namespaces, 'words']);
  });

  it('ship no naming words: every language has them beside its catalogue, as build input', async () => {
    const shipped = [
      ...(await englishParts()).map(({ tables }) => tables),
      ...(await Promise.all(
        (await catalogueCodes())
          .filter((code) => code !== 'en')
          .map(
            async (code) =>
              JSON.parse(await readFile(join(LOCALES, `${code}.json`), 'utf8')) as object,
          ),
      )),
    ];
    for (const tables of shipped) expect(tables).not.toHaveProperty('words');
    for (const code of await catalogueCodes())
      expect(Object.keys((await readCatalogue(code))['words'] ?? {}).length).toBeGreaterThan(0);
  });

  it('say English’s counts in English’s two forms, each with its other form', async () => {
    expect(englishCounts(await readCatalogue('en')).map((p) => p.text)).toEqual([]);
  });

  it('have their integration translation, key for key with strings.json', async () => {
    for (const code of await catalogueCodes())
      expect((await compareIntegration(code)).map((p) => p.text)).toEqual([]);
  });

  it('name the integration translation by Home Assistant’s code: Portugal’s Portuguese is its `pt`', () => {
    expect(integrationFile('pt-PT')).toBe('translations/pt.json');
    expect(integrationFile('pt-BR')).toBe('translations/pt-BR.json');
    expect(integrationFile('de')).toBe('translations/de.json');
  });

  it('are what the strategy’s generated words were built from', async () => {
    expect(await readFile(OUT, 'utf8')).toBe(await generate());
  });

  it('are what the appliances’ generated words were built from', async () => {
    expect(await readFile(APPLIANCE_OUT, 'utf8')).toBe(await generateAppliance());
  });

  it('give every appliance kind plain stems in every language: a name is read with its accents taken off, kana and kanji as written', async () => {
    for (const code of await catalogueCodes()) {
      const words = (await readCatalogue(code))['words'] as Record<string, readonly string[]>;
      const kinds = Object.entries(words).filter(([category]) => category.startsWith('appliance_'));
      expect(kinds.length, code).toBe(21);
      for (const [category, stems] of kinds)
        for (const stem of stems) {
          expect(stem, `${code} ${category}`).toBe(plain(stem));
          for (const char of stem)
            expect(/[\x20-\x7e]/.test(char) || CJK.test(char), `${code} ${category} ${stem}`).toBe(
              true,
            );
        }
    }
  });
});

describe('a count', () => {
  const english = {
    alerts: {
      devices_one: '{n} device',
      devices: '{n} devices',
      title: 'Alerts',
    },
    page: { days_other: '{n} days' },
  };
  const errors = (language: string, catalogue: Catalogue): string[] =>
    compare(language, catalogue, english).flatMap((p) => (p.level === 'error' ? [p.text] : []));

  it('is a key in its forms by number: with _one, of any number; _other alone, of two or more', () => {
    expect([...counts(english.alerts)]).toEqual([['devices', { other: 'devices', from: 0 }]]);
    expect([...counts(english.page)]).toEqual([['days', { other: 'days_other', from: 2 }]]);
  });

  it('needs each form its language’s rules give a whole number up to 1000', () => {
    expect([...reached('sk', 0)]).toEqual([
      ['other', 0],
      ['one', 1],
      ['few', 2],
    ]);
    expect([...reached('sk', 2)]).toEqual([
      ['few', 2],
      ['other', 5],
    ]);
    // a million's many in French, a fraction's in Slovak: never a house's count
    expect([...reached('fr', 0).keys()]).toEqual(['one', 'other']);
    expect([...reached('ja', 0).keys()]).toEqual(['other']);
  });

  it('fails a language without a form it says: Slovak’s 2 to 4, never English’s word for them', () => {
    expect(
      errors('sk', {
        alerts: { devices_one: '{n} zariadenie', devices: '{n} zariadení', title: 'Upozornenia' },
        page: { days_other: '{n} dní' },
      }),
    ).toEqual([
      'alerts.devices_few: missing, the form for 2',
      'page.days_few: missing, the form for 2',
    ]);
    expect(
      errors('sk', {
        alerts: {
          devices_one: '{n} zariadenie',
          devices_few: '{n} zariadenia',
          devices: '{n} zariadení',
          title: 'Upozornenia',
        },
        page: { days_few: '{n} dni', days_other: '{n} dní' },
      }),
    ).toEqual([]);
    // a form English writes is needed as any: without its one, a single device would say "1 zariadení"
    expect(
      errors('sk', {
        alerts: { devices_few: '{n} zariadenia', devices: '{n} zariadení', title: 'Upozornenia' },
        page: { days_few: '{n} dni', days_other: '{n} dní' },
      }),
    ).toEqual(['alerts.devices_one: missing, the form for 1']);
  });

  it('holds a language’s own forms to English’s placeholders, and only the forms its rules have', () => {
    expect(
      errors('sk', {
        alerts: {
          devices_one: '{n} zariadenie',
          devices_few: '{count} zariadenia',
          devices: '{n} zariadení',
          title: 'Upozornenia',
        },
        page: { days_few: '{n} dni', days_other: '{n} dní' },
      }),
    ).toEqual(['alerts.devices_few: placeholders {count} ≠ English {n}']);
    expect(
      errors('de', {
        alerts: {
          devices_one: '{n} Gerät',
          devices_few: '{n} Geräte',
          devices: '{n} Geräte',
          title: 'Warnungen',
        },
        page: { days_other: '{n} Tage' },
      }),
    ).toEqual(['alerts.devices_few: not in English']);
    // a language with one form for every number keeps English's other ones, and needs nothing more
    expect(
      errors('ja', {
        alerts: { devices_one: '{n}台', devices: '{n}台', title: 'アラート' },
        page: { days_other: '{n}日' },
      }),
    ).toEqual([]);
  });

  it('is written in English in its two forms, with its other form', () => {
    expect(
      englishCounts({
        openings: { open_one: '1 open', open_many: '{count} open', sensor_one: '1 sensor' },
      }).map((p) => p.text),
    ).toEqual([
      'openings.open_many: a form English never says (its counts are _one and the other form)',
      'openings.open_one: a count without its other form (open)',
      'openings.sensor_one: a count without its other form (sensor)',
    ]);
  });
});

describe('the generated patterns', () => {
  /** The stem a pattern finds in a name: the first group that takes part in the match. */
  const stem = (source: string, flags: string, name: string): string | undefined =>
    new RegExp(source, flags)
      .exec(name)
      ?.slice(1)
      .find((group) => group !== undefined);

  it('match a Latin stem in its shape and a kana or kanji stem as a substring, Japanese writing no spaces', () => {
    expect(pattern(['light', 'spot', '照明', 'ライト', 'ライトスタンド'], 'word')).toBe(
      '(?:^|[\\s_.-])(light|spot)(?:[\\s_.-]|$)|(照明|ライトスタンド|ライト)',
    );
    const light = new RegExp(pattern(['light', 'spot', '照明', 'ライト', '電気'], 'word'), 'i');
    for (const name of [
      'switch.spot Spot',
      'switch.kitchen_light Kitchen light',
      'switch.zhao_ming 照明',
      'switch.ribingu_no_denki リビングの電気',
      'switch.living ライト',
    ])
      expect(light.test(name), name).toBe(true);
    for (const name of ['switch.despot Despot', 'switch.lighthouse Lighthouse', '電子レンジ'])
      expect(light.test(name), name).toBe(false);
    // a whole name says the kind of reading in either script
    const generic = new RegExp(pattern(['temperature', '温度'], 'whole'), 'i');
    expect(generic.test('温度')).toBe(true);
    expect(generic.test('リビング温度')).toBe(false);
    // a place's noise is taken out in either script; a stem may carry a lookaround of its own
    const noise = new RegExp(
      pattern(['sensor', 'センサー', '温度', 'の(?=[温セ])', 'es', 'a'], 'words'),
      'giu',
    );
    expect('リビングの温度センサー'.replace(noise, ' ').trim()).toBe('リビング');
    expect(
      'Living room sensor'
        .replace(noise, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    ).toBe('Living room');
    // a whole word beside no Latin letter whatever its marks, a digit or an underscore; kana bound one
    for (const name of ['Großes', 'Spálňa', 'sensor2', 'sensor_1'])
      expect(name.replace(noise, ' '), name).toBe(name);
    expect('リビングsensor'.replace(noise, ' ')).toBe('リビング ');
    // a substring shape holds both in one alternation, a stem after the longer ones that begin with it
    expect(pattern(['washer', '洗濯', '洗濯機'], 'substring')).toBe('(washer|洗濯機|洗濯)');
  });

  it('take a word that joins as written, and an elision before the word it leans on, in either apostrophe', async () => {
    const joins = new RegExp(pattern(['de', "d'", "dell'"], 'words'), 'giu');
    expect("Capteur d'humidité Salle de bain".match(joins)).toEqual(["d'", 'de']);
    expect('Capteur d’humidité'.match(joins)).toEqual(['d’']);
    expect("Sensore dell'umidità".match(joins)).toEqual(["dell'"]);
    // never inside a word: a street's "Grand'Rue" holds no elision
    expect("Grand'Rue".match(joins)).toBeNull();
    // the place's noise is built plain, the words that join it as written: "és" is Hungarian's "and", no "es"
    const built = await generate();
    expect(built).toMatch(/PLACE_NOISE = [^\n]*\|humidite\|/);
    expect(built).toMatch(/PLACE_JOINS = [^\n]*\|és\|/);
  });

  it('try a stem after every longer stem that begins with it: a prefix never hides the longer stem', () => {
    // as the words list them, the shorter first: in kana and kanji (every shape a substring) and in a substring shape
    expect(stem(pattern(['温度', '湿度', '温度計'], 'words'), 'giu', 'リビングの温度計')).toBe(
      '温度計',
    );
    expect(stem(pattern(['温度', '湿度', '温度計'], 'words'), 'giu', 'リビングの温度')).toBe(
      '温度',
    );
    const fridge = pattern(['frigo', 'refrigerateur', 'frigorifero'], 'substring');
    expect(stem(fridge, 'i', 'frigorifero')).toBe('frigorifero');
    expect(stem(fridge, 'i', 'frigo cuisine')).toBe('frigo');
    // a Latin stem begins one in kanji, in the one alternation of a substring shape
    expect(stem(pattern(['ev', 'ev充電'], 'substring'), 'i', 'ev充電器')).toBe('ev充電');
    // stable: a stem waits only for the longer stems that begin with it, the listed order holds otherwise
    expect(ordered(['温度', '湿度', '温度計', '温'])).toEqual(['湿度', '温度計', '温度', '温']);
    // a stem of its own regex is longer by the letters every match of it begins with
    expect(ordered(['secadora', 'dryer', 'secadora[ _-]de[ _-]roupas'])).toEqual([
      'dryer',
      'secadora[ _-]de[ _-]roupas',
      'secadora',
    ]);
    // and never the shorter, nor longer by a letter it may go without (`所?`): these keep their places
    for (const stems of [
      ['kanso\\b', 'kansouki'],
      ['(?<!ガス)レンジ', 'レンジ'],
      ['pv\\b', 'pv'],
      ['洗面所', '洗面所?(?:台|ボウル)'],
    ])
      expect(ordered(stems), stems.join(' ')).toEqual(stems);
  });

  it('capture the stem found as the first group that takes part in the match, never a separator around it', () => {
    const light = pattern(['light', 'spot', '照明', '電気'], 'word');
    expect(stem(light, 'i', 'switch.kitchen_light Kitchen light')).toBe('light');
    expect(stem(light, 'i', 'リビングの電気')).toBe('電気');
    // a stem's own separators are its own; a stem's own group is numbered after the alternation's
    const hob = pattern(['cooktop', '(^|[ _-])hob([ _-]|$)', 'コンロ'], 'substring');
    expect(stem(hob, 'i', 'the hob')).toBe(' hob');
    expect(stem(hob, 'i', 'ガスコンロ')).toBe('コンロ');
    expect(stem(pattern(['temperature', '温度'], 'whole'), 'i', '温度')).toBe('温度');
    expect(stem(pattern(['sensor', 'センサー'], 'words'), 'iu', 'リビングのセンサー')).toBe(
      'センサー',
    );
    expect(stem(pattern(['sensor', 'センサー'], 'words'), 'iu', 'Living room sensor')).toBe(
      'sensor',
    );
  });

  it('read a name plain: accents off, ordinary width, a kana’s voicing mark kept', () => {
    expect(plain('Kühlschrank')).toBe('kuhlschrank');
    expect(plain('Çamaşır makinesi')).toBe('camasir makinesi');
    expect(plain('Heißluftfritteuse')).toBe('heissluftfritteuse');
    expect(plain('ＬＥＤライト')).toBe('ledライト');
    expect(plain('ｶﾞﾚｰｼﾞ')).toBe('ガレージ');
    expect(plain('ガレージ'.normalize('NFD'))).toBe('ガレージ');
    expect(plain('食洗機')).toBe('食洗機');
    expect(plain('ぱぴぷ')).toBe('ぱぴぷ');
  });
});
