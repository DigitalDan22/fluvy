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
  englishParts,
  integrationFile,
  LOCALES,
  readCatalogue,
  ROOT,
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
      pattern(['sensor', 'センサー', '温度', 'の(?=[温セ])'], 'words'),
      'gi',
    );
    expect('リビングの温度センサー'.replace(noise, ' ').trim()).toBe('リビング');
    expect(
      'Living room sensor'
        .replace(noise, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    ).toBe('Living room');
    // a substring shape holds both in one alternation, a stem after the longer ones that begin with it
    expect(pattern(['washer', '洗濯', '洗濯機'], 'substring')).toBe('(washer|洗濯機|洗濯)');
  });

  it('try a stem after every longer stem that begins with it: a prefix never hides the longer stem', () => {
    // as the words list them, the shorter first: in kana and kanji (every shape a substring) and in a substring shape
    expect(stem(pattern(['温度', '湿度', '温度計'], 'words'), 'gi', 'リビングの温度計')).toBe(
      '温度計',
    );
    expect(stem(pattern(['温度', '湿度', '温度計'], 'words'), 'gi', 'リビングの温度')).toBe('温度');
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
    expect(stem(pattern(['sensor', 'センサー'], 'words'), 'i', 'リビングのセンサー')).toBe(
      'センサー',
    );
    expect(stem(pattern(['sensor', 'センサー'], 'words'), 'i', 'Living room sensor')).toBe(
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
