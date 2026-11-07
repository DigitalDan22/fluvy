import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { PRINTER_HOUSE } from '../printer/fixtures.js';
import { printerDevices } from '../printer/roles.js';
import { allFixtures, houseOf, laterFixtures } from './fixtures/index.js';
import {
  APPLIANCE_KINDS,
  applianceDevices,
  byWords,
  KIND_DEFAULTS,
  kindOf,
  LG_MODEL,
  signalsOf,
  type KindSignals,
} from './kinds.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const FIXTURES = allFixtures(NOW);
const HOUSE = houseOf(FIXTURES, NOW);

/** Signals with nothing in them but what a test says. */
const signals = (given: Partial<KindSignals>): KindSignals => ({
  keys: new Set(),
  objects: [],
  domains: new Set(),
  programs: [],
  tops: [],
  ...given,
});

describe('what an appliance is', () => {
  it.each(FIXTURES.map((fixture) => [fixture.title, fixture]))('knows %s', (_, fixture) => {
    const verdict = kindOf(signalsOf(HOUSE, fixture.device.id));
    if (fixture.expected.excluded) expect(verdict).toEqual({ excluded: fixture.expected.excluded });
    else if (fixture.expected.kind) expect(verdict).toMatchObject({ kind: fixture.expected.kind });
    else expect(verdict).toBeUndefined();
  });

  it('asks in order: the card, then the model, then LG’s type, then the keys, then the name', () => {
    // the card's word over everything, even what is never an appliance
    expect(kindOf(signals({ model: 'Robot vacuum cleaner', platform: 'miele' }), 'oven')).toEqual({
      kind: 'oven',
      by: 'config',
    });
    // Miele's model over its keys and its name
    expect(
      kindOf(
        signals({
          platform: 'miele',
          model: 'Washer dryer',
          keys: new Set(['salt_level']),
          name: 'Spüli',
        }),
      ),
    ).toEqual({ kind: 'washer_dryer', by: 'model' });
    // LG's type over its keys
    expect(
      kindOf(
        signals({
          platform: 'lg_thinq',
          model: 'X (DEVICE_OVEN)',
          keys: new Set(['express_fridge']),
        }),
      ),
    ).toEqual({ kind: 'oven', by: 'lg' });
    // the keys over the name
    expect(
      kindOf(
        signals({ platform: 'home_connect', keys: new Set(['salt_lack']), name: 'Waschmaschine' }),
      ),
    ).toEqual({ kind: 'dishwasher', by: 'keys' });
    expect(kindOf(signals({ platform: 'shelly', name: 'Lavastoviglie' }))).toEqual({
      kind: 'dishwasher',
      by: 'words',
    });
    // 'auto' asks the appliance
    expect(kindOf(signals({ name: 'Kettle' }), 'auto')).toEqual({ kind: 'kettle', by: 'words' });
  });

  it('reads its maker’s words where its name and its model say nothing (#115), never over them', () => {
    // the DE1 as its plugin names it, then renamed by its owner
    const de1 = { platform: 'mqtt', model: 'DE1PRO', manufacturer: 'Decent Espresso' };
    expect(kindOf(signals({ ...de1, name: 'Decent Espresso DE1PRO' }))).toEqual({
      kind: 'coffee',
      by: 'words',
    });
    expect(kindOf(signals({ ...de1, name: 'DE1' }))).toEqual({ kind: 'coffee', by: 'words' });
    expect(kindOf(signals({ ...de1, name: 'Wasserkocher' }))).toEqual({
      kind: 'kettle',
      by: 'words',
    });
    // a maker of anything says nothing
    expect(kindOf(signals({ platform: 'shelly', name: 'Plug 3', manufacturer: 'Shelly' }))).toBe(
      undefined,
    );
    // nor does one whose name says a robot or a charger: it rules out no appliance its plug powers
    for (const manufacturer of ['Allterco Robotics', 'Ecovacs Robotics', 'Wallbox'])
      expect(
        kindOf(signals({ platform: 'shelly', name: 'Plug 3', manufacturer })),
        manufacturer,
      ).toBe(undefined);
  });

  it('reads LG’s type off its model, both integrations’ forms, and a WashTower’s half off its name', () => {
    expect(LG_MODEL.exec('WM4000HWA (DEVICE_WASHER)')?.[1]).toBe('WASHER');
    expect(LG_MODEL.exec('F4V5VYP0W (TOWER_DRYER)')?.[1]).toBe('TOWER_DRYER');
    expect(LG_MODEL.exec('WM4000HWA')).toBeNull();
    const tower = (name: string) =>
      kindOf(signals({ platform: 'lg_thinq', model: 'WKEX200 (DEVICE_WASHTOWER)', name }));
    expect(tower('Turm washer')).toMatchObject({ kind: 'washer' });
    expect(tower('Turm dryer')).toMatchObject({ kind: 'dryer' });
    // a WashTower not split in two is both
    expect(tower('Turm')).toMatchObject({ kind: 'washer_dryer' });
    expect(kindOf(signals({ model: 'WM6998 (DEVICE_WASHCOMBO_MAIN)' }))).toMatchObject({
      kind: 'washer_dryer',
    });
    expect(kindOf(signals({ model: 'WM6998 (DEVICE_WASHCOMBO_MINI)' }))).toMatchObject({
      kind: 'washer',
    });
  });

  it('reads Home Connect’s programmes: a dishwasher’s, a washer-dryer’s, a microwave’s all microwave, an oven with a microwave an oven', () => {
    const programs = (...list: string[]) =>
      kindOf(signals({ platform: 'home_connect', programs: list }));
    expect(programs('laundry_care_washer_dryer_program_mix')).toMatchObject({
      kind: 'washer_dryer',
    });
    expect(programs('laundry_care_dryer_program_cotton')).toMatchObject({ kind: 'dryer' });
    expect(programs('cooking_oven_program_microwave_600_watt')).toMatchObject({
      kind: 'microwave',
    });
    expect(
      programs(
        'cooking_oven_program_microwave_600_watt',
        'cooking_oven_program_heating_mode_hot_air',
      ),
    ).toMatchObject({ kind: 'oven' });
    expect(programs('consumer_products_cleaning_robot_program_cleaning_clean_all')).toEqual({
      excluded: 'vacuum',
    });
  });

  it('tells Matter’s compartments and cavities by their ranges', () => {
    expect(kindOf(signals({ platform: 'matter', tops: [7, -15] }))).toMatchObject({
      kind: 'fridge',
    });
    expect(kindOf(signals({ platform: 'matter', tops: [-15] }))).toMatchObject({ kind: 'freezer' });
    expect(kindOf(signals({ platform: 'matter', tops: [250] }))).toMatchObject({ kind: 'oven' });
  });

  it('reads a name in any of the fourteen languages, accents or none, the more particular kind first', () => {
    const names: ReadonlyArray<readonly [string, string]> = [
      ['Washing machine', 'washer'],
      ['Waschmaschine', 'washer'],
      ['Lave-linge', 'washer'],
      ['lave_linge', 'washer'],
      ['Lavadora', 'washer'],
      ['Wasmachine', 'washer'],
      ['Lavatrice', 'washer'],
      ['Máquina de lavar', 'washer'],
      ['Çamaşır makinesi', 'washer'],
      ['Waschtrockner', 'washer_dryer'],
      ['Lavasecadora', 'washer_dryer'],
      ['Kurutmalı çamaşır makinesi', 'washer_dryer'],
      ['Dishwasher', 'dishwasher'],
      ['Geschirrspüler', 'dishwasher'],
      ['Lave-vaisselle', 'dishwasher'],
      ['Lavavajillas', 'dishwasher'],
      ['Vaatwasser', 'dishwasher'],
      ['Lava-louças', 'dishwasher'],
      ['Máquina de lavar loiça', 'dishwasher'],
      ['Máquina de lavar louça', 'dishwasher'],
      ['Bulaşık makinesi', 'dishwasher'],
      ['Wäschetrockner', 'dryer'],
      ['Sèche-linge', 'dryer'],
      ['Asciugatrice', 'dryer'],
      ['Kurutma makinesi', 'dryer'],
      ['Microwave oven', 'microwave'],
      ['Forno a microonde', 'microwave'],
      ['Magnetron', 'microwave'],
      ['Backofen', 'oven'],
      ['Horno', 'oven'],
      ['Four', 'oven'],
      ['Fırın', 'oven'],
      ['Kochfeld', 'hob'],
      ['Placa de inducción', 'hob'],
      ['Piano cottura', 'hob'],
      ['Dunstabzugshaube', 'hood'],
      ['Hotte', 'hood'],
      ['Weinkühlschrank', 'wine'],
      ['Wine fridge', 'wine'],
      ['Adega', 'wine'],
      ['Garrafeira', 'wine'],
      ['Kühlschrank', 'fridge'],
      ['Fridge freezer', 'fridge'],
      ['Frigorífico', 'fridge'],
      ['Koelkast', 'fridge'],
      ['Geladeira', 'fridge'],
      ['Buzdolabı', 'fridge'],
      ['Gefrierschrank', 'freezer'],
      ['Congélateur', 'freezer'],
      ['Vriezer', 'freezer'],
      ['Kaffeevollautomat', 'coffee'],
      ['Cafetera', 'coffee'],
      ['Koffiezetapparaat', 'coffee'],
      ['Wasserkocher', 'kettle'],
      ['Bouilloire', 'kettle'],
      ['Waterkoker', 'kettle'],
      ['Air fryer', 'air_fryer'],
      ['Heißluftfritteuse', 'air_fryer'],
      ['Friggitrice ad aria', 'air_fryer'],
      // Japanese, in kanji and kana as a name is written, or in the romaji an entity id carries
      ['洗濯機', 'washer'],
      ['sentakuki', 'washer'],
      ['ドラム式洗濯乾燥機', 'washer_dryer'],
      ['食洗機', 'dishwasher'],
      ['食器洗い乾燥機', 'dishwasher'],
      ['shokusenki', 'dishwasher'],
      ['乾燥機', 'dryer'],
      ['電子レンジ', 'microwave'],
      ['オーブンレンジ', 'microwave'],
      ['オーブン', 'oven'],
      ['ＩＨクッキングヒーター', 'hob'],
      ['ガスコンロ', 'hob'],
      ['ガスレンジ', 'hob'],
      ['レンジフード', 'hood'],
      ['冷蔵庫', 'fridge'],
      ['reizouko', 'fridge'],
      ['冷凍庫', 'freezer'],
      ['コーヒーメーカー', 'coffee'],
      ['電気ケトル', 'kettle'],
      ['ノンフライヤー', 'air_fryer'],
      ['オーブントースター', 'toaster'],
      ['ホットサンドメーカー', 'sandwich_maker'],
      ['ミキサー', 'blender'],
      ['ワインセラー', 'wine'],
      // Polish, its ł read as l: a Polish name keeps it, an entity id writes l
      ['Pralka', 'washer'],
      ['Pralko-suszarka', 'washer_dryer'],
      ['Zmywarka', 'dishwasher'],
      ['Suszarka', 'dryer'],
      ['Kuchenka mikrofalowa', 'microwave'],
      ['Piekarnik', 'oven'],
      ['Płyta indukcyjna', 'hob'],
      ['plyta_indukcyjna', 'hob'],
      ['Okap', 'hood'],
      ['Chłodziarka do win', 'wine'],
      ['Lodówka', 'fridge'],
      ['Chłodziarka', 'fridge'],
      ['Zamrażarka', 'freezer'],
      ['Ekspres do kawy', 'coffee'],
      ['Czajnik', 'kettle'],
      ['Frytkownica beztłuszczowa', 'air_fryer'],
      ['Toster', 'toaster'],
      ['Toster do kanapek', 'sandwich_maker'],
      ['Kuweta', 'litter_box'],
      // Slovak, with its accents or as an entity id carries it
      ['Práčka', 'washer'],
      ['Práčka so sušičkou', 'washer_dryer'],
      ['Umývačka riadu', 'dishwasher'],
      ['Sušička', 'dryer'],
      ['Mikrovlnná rúra', 'microwave'],
      ['Rúra', 'oven'],
      ['Indukčná doska', 'hob'],
      ['Digestor', 'hood'],
      ['Vinotéka', 'wine'],
      ['Chladnička', 'fridge'],
      ['chladnicka_kuchyna', 'fridge'],
      ['Mraznička', 'freezer'],
      ['Kávovar', 'coffee'],
      ['Rýchlovarná kanvica', 'kettle'],
      ['Teplovzdušná fritéza', 'air_fryer'],
      ['Dávkovač krmiva', 'feeder'],
      ['Fontána pre zvieratá', 'fountain'],
      ['Mačacia toaleta', 'litter_box'],
      // Simplified Chinese, its Han anywhere in the name
      ['洗衣机', 'washer'],
      ['洗烘一体机', 'washer_dryer'],
      ['厨房洗碗机', 'dishwasher'],
      ['干衣机', 'dryer'],
      ['微波炉', 'microwave'],
      ['蒸烤一体机', 'oven'],
      ['集成灶', 'hob'],
      ['抽油烟机', 'hood'],
      ['酒柜', 'wine'],
      ['冰箱', 'fridge'],
      ['冰柜', 'freezer'],
      ['咖啡机', 'coffee'],
      ['电水壶', 'kettle'],
      ['空气炸锅', 'air_fryer'],
      ['早餐机', 'sandwich_maker'],
      ['多士炉', 'toaster'],
      ['破壁机', 'blender'],
      ['自动喂食器', 'feeder'],
      ['宠物饮水机', 'fountain'],
      ['猫砂盆', 'litter_box'],
    ];
    for (const [name, kind] of names) expect(byWords(name), name).toEqual({ kind, by: 'words' });
    // a name that says no kind says none: a solar panel is no hob ("placa"), a brand ("marca") no freezer ("arca")
    expect(byWords('Steckdose Flur')).toBeUndefined();
    expect(byWords('Placa solar')).toBeUndefined();
    expect(byWords('Placas solares')).toBeUndefined();
    expect(byWords('Marca X tomada')).toBeUndefined();
    // a word of another: a hood is not a "neighbourhood", a hob not a "hobby"
    expect(byWords('Neighbourhood lamp')).toBeUndefined();
    expect(byWords('Hobby room plug')).toBeUndefined();
    // Slovak's cooling ("chladenie") is no fridge ("chladnička")
    expect(byWords('Chladenie obývačka')).toBeUndefined();
    // the laundry room and the detergent are no washer; a home's water dispenser no pet fountain
    expect(byWords('洗衣房插座')).toBeUndefined();
    expect(byWords('洗衣液')).toBeUndefined();
    expect(byWords('饮水机')).toBeUndefined();
  });

  it('never takes a vacuum, a charger, a hair dryer or what waits for 1.10 for an appliance', () => {
    for (const name of [
      'Saugroboter',
      'Robot vacuum',
      'Staubsauger',
      'Aspirateur',
      'Wallbox',
      'Haartrockner',
      'Hair dryer',
      'Suszarka do włosów',
      'Odkurzacz',
      'Wärmeschublade',
      'Styler',
      'ロボット掃除機',
      'ドライヤー',
      '布団乾燥機',
      '扫地机器人',
      '吹风机',
    ])
      expect(byWords(name), name).toEqual({ excluded: 'name' });
    expect(kindOf(signals({ domains: new Set(['vacuum']), name: 'Waschmaschine' }))).toEqual({
      excluded: 'vacuum',
    });
    expect(
      kindOf(signals({ keys: new Set(['lost', 'lifted']), platform: 'home_connect' })),
    ).toEqual({
      excluded: 'vacuum',
    });
    expect(
      kindOf(
        signals({ keys: new Set(['stick_cleaner_operating_state']), platform: 'smartthings' }),
      ),
    ).toEqual({ excluded: 'vacuum' });
    expect(kindOf(signals({ keys: new Set(['evse_plug']), platform: 'matter' }))).toEqual({
      excluded: 'charger',
    });
    expect(kindOf(signals({ printer: true, name: 'Waschmaschine' }))).toEqual({
      excluded: 'printer',
    });
  });

  it('gives every kind its defaults: a glyph, a tone, a hero, what it shows', () => {
    for (const kind of APPLIANCE_KINDS) expect(KIND_DEFAULTS[kind], kind).toBeDefined();
    expect(KIND_DEFAULTS.washer.steps).toEqual(['wash', 'rinse', 'spin']);
    expect(KIND_DEFAULTS.fridge).toMatchObject({ hero: 'cold', doorAlert: 60, unload: false });
    // a big appliance's whole card (the reporter's design, #47); what lives on a plug, a row
    expect(KIND_DEFAULTS.coffee.variant).toBe('full');
    for (const kind of ['toaster', 'blender', 'sandwich_maker', 'kettle', 'microwave'] as const)
      expect(KIND_DEFAULTS[kind].variant, kind).toBe('row');
  });

  it('knows a toaster, a blender and a sandwich maker by their names, in every language, the sandwich maker first', () => {
    const said = (name: string) => byWords(name);
    expect(said('Toaster Küche')).toEqual({ kind: 'toaster', by: 'words' });
    expect(said('Grille-pain')).toEqual({ kind: 'toaster', by: 'words' });
    expect(said('Sandwichtoaster')).toEqual({ kind: 'sandwich_maker', by: 'words' });
    expect(said('Tosti-ijzer')).toEqual({ kind: 'sandwich_maker', by: 'words' });
    expect(said('Standmixer')).toEqual({ kind: 'blender', by: 'words' });
    expect(said('Liquidificador')).toEqual({ kind: 'blender', by: 'words' });
    expect(said('Ekmek kızartma makinesi')).toEqual({ kind: 'toaster', by: 'words' });
  });

  it('reads the longest of a name’s words that overlap, whatever the kinds’ order, in kana and in Latin letters', () => {
    const said = (name: string) => byWords(name);
    // an oven toaster is a toaster (listed after the oven), a gas range a hob (after the microwave), a range hood a hood
    expect(said('オーブントースター')).toEqual({ kind: 'toaster', by: 'words' });
    expect(said('ガスレンジ')).toEqual({ kind: 'hob', by: 'words' });
    expect(said('レンジフード')).toEqual({ kind: 'hood', by: 'words' });
    expect(said('電子レンジ')).toEqual({ kind: 'microwave', by: 'words' });
    expect(said('電気ポット')).toEqual({ kind: 'kettle', by: 'words' });
    // a longer never-word beats the kind inside it
    for (const name of [
      '布団乾燥機',
      'ヘアドライヤー',
      'Hair dryer',
      'Haartrockner',
      'Kimchi refrigerator',
    ])
      expect(said(name), name).toEqual({ excluded: 'name' });
    // and a never-word wins outright, even where a longer kind's word overlaps it: a laundry-folding machine's 洗濯物
    // (the laundry) inside the washer's 全自動洗濯
    expect(said('全自動洗濯物たたみ機')).toEqual({ excluded: 'name' });
    expect(said('全自動洗濯機')).toEqual({ kind: 'washer', by: 'words' });
    // in Latin letters: the dishwasher's word holds the washer's, the washer-dryer's the dryer's
    expect(said('Dishwasher')).toEqual({ kind: 'dishwasher', by: 'words' });
    expect(said('Waschtrockner')).toEqual({ kind: 'washer_dryer', by: 'words' });
    expect(said('Lave-vaisselle')).toEqual({ kind: 'dishwasher', by: 'words' });
    // words that stand apart keep the kinds' order, the more particular first
    expect(said('Wine fridge')).toEqual({ kind: 'wine', by: 'words' });
    expect(said('Fridge freezer')).toEqual({ kind: 'fridge', by: 'words' });
  });
});

describe('the house’s appliances', () => {
  it('lists every device that is one, strictly, once, and nothing else', () => {
    const listed = FIXTURES.filter((fixture) => fixture.expected.listed).map(
      (fixture) => fixture.device.id,
    );
    expect([...applianceDevices(HOUSE)].sort()).toEqual([...listed].sort());
    for (const fixture of laterFixtures(NOW))
      expect(applianceDevices(houseOf([fixture], NOW)), fixture.title).toEqual(
        fixture.expected.listed ? [fixture.device.id] : [],
      );
  });

  it('never lists a printer, and the printer card never lists one of them: every fixture of each', () => {
    expect(applianceDevices(PRINTER_HOUSE)).toEqual([]);
    expect(printerDevices(HOUSE)).toEqual([]);
    // in one house, each finds its own
    const both = houseOf(FIXTURES, NOW, PRINTER_HOUSE);
    const printers = printerDevices(both);
    const appliances = applianceDevices(both);
    expect(printers.filter((id) => appliances.includes(id))).toEqual([]);
    expect([...appliances].sort()).toEqual([...applianceDevices(HOUSE)].sort());
    expect([...printers].sort()).toEqual([...printerDevices(PRINTER_HOUSE)].sort());
  });

  it('reads a model, a model id, a maker and a name an integration writes as numbers as they are written (#129)', () => {
    // the reporter's fuel station beside the house's appliances: its model a number, and no appliance
    const house = {
      ...HOUSE,
      entities: {
        ...HOUSE.entities,
        'sensor.station_gazole': {
          entity_id: 'sensor.station_gazole',
          device_id: 'station',
          platform: 'prix_carburant',
        },
      },
      devices: {
        ...HOUSE.devices,
        station: {
          id: 'station',
          name: 'Station Bapdis Sas',
          name_by_user: null,
          area_id: null,
          manufacturer: 'Leclerc',
          model: 76380002 as never,
        },
        thermo: {
          id: 'thermo',
          name: 4711 as never,
          name_by_user: null,
          area_id: null,
          manufacturer: 1234 as never,
          model: 3 as never,
          model_id: 7 as never,
        },
      },
    } as HomeAssistant;
    expect([...applianceDevices(house)].sort()).toEqual([...applianceDevices(HOUSE)].sort());
    expect(signalsOf(house, 'station')).toMatchObject({
      model: '76380002',
      manufacturer: 'Leclerc',
    });
    expect(signalsOf(house, 'thermo')).toMatchObject({
      name: '4711',
      model: '3',
      modelId: '7',
      manufacturer: '1234',
    });
  });

  it('reads the house again only when its registries change, not on every state', () => {
    const first = applianceDevices(HOUSE);
    const ticked = { ...HOUSE, states: { ...HOUSE.states } } as HomeAssistant;
    expect(applianceDevices(ticked)).toBe(first);
    const renamed = { ...HOUSE, entities: { ...HOUSE.entities } } as HomeAssistant;
    expect(applianceDevices(renamed)).not.toBe(first);
    expect(applianceDevices(renamed)).toEqual(first);
  });
});
