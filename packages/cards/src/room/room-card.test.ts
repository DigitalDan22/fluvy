// @vitest-environment happy-dom
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  areaContents,
  areaEntities,
  LANGUAGE_CODES,
  localize,
  preloadLanguages,
  type HomeAssistant,
} from '@fluvy/core';
import { familiesDefined } from '../index.js';
import { cardForm, drawEditor, listTitles, shownNames } from '../shared/fixtures/editor.js';
import { FluvyRoomCard, roomHeight, type RoomCardConfig } from './room-card.js';
import * as roomEditor from './room-editor.js';

// the index fetches the lazy families: they land before this file's page goes
afterAll(() => familiesDefined);

/*
 * #39: a room finds what is in it. The reporter's four areas, each one temperature and one humidity sensor and nothing
 * else: two plain, one whose sensors are diagnostic and named by the area, one whose sensors are hidden; and the
 * shapes around them — a thermostat alone, a dead sensor first, entries the registry has and the house has no state
 * for, a sensor whose state comes after the first draw.
 */

type Seed = readonly [id: string, state: string, attributes?: Record<string, unknown>];
const STAMP = '2026-10-17T19:00:00+00:00';
const states = (seeds: readonly Seed[]) =>
  Object.fromEntries(
    seeds.map(([entity_id, state, attributes]) => [
      entity_id,
      { entity_id, state, attributes: attributes ?? {}, last_changed: STAMP, last_updated: STAMP },
    ]),
  );
const temperature = (id: string, value: string): Seed => [
  id,
  value,
  { device_class: 'temperature', unit_of_measurement: '°C' },
];
const humidity = (id: string, value: string): Seed => [
  id,
  value,
  { device_class: 'humidity', unit_of_measurement: '%' },
];

const SEEDS: readonly Seed[] = [
  temperature('sensor.garten_t', '16.4'),
  humidity('sensor.garten_h', '92'),
  temperature('sensor.kuche_t', '21.4'),
  humidity('sensor.kuche_h', '48'),
  temperature('sensor.wohnzimmer_t', '20.5'),
  humidity('sensor.wohnzimmer_h', '45'),
  ['climate.buero', 'heat', { current_temperature: 20.5, current_humidity: 44, temperature: 21 }],
  temperature('sensor.flur_a', 'unavailable'),
  temperature('sensor.flur_b', '19.8'),
  ['light.keller', 'off', {}],
];

/** Registry entries: the area each is in, and how dashboards treat it. */
const ENTRIES: Record<string, Record<string, unknown>> = {
  'sensor.garten_t': { area_id: 'garten' },
  'sensor.garten_h': { area_id: 'garten' },
  'sensor.kuche_t': { area_id: 'kuche', entity_category: 'diagnostic' },
  'sensor.kuche_h': { area_id: 'kuche', entity_category: 'diagnostic' },
  'sensor.wohnzimmer_t': { area_id: 'wohnzimmer', hidden: true },
  'sensor.wohnzimmer_h': { area_id: 'wohnzimmer', hidden: true },
  'climate.buero': { area_id: 'buero' },
  'sensor.flur_a': { area_id: 'flur' },
  'sensor.flur_b': { area_id: 'flur' },
  // entries the house has no state for: neither shown nor counted
  'sensor.speicher_t': { area_id: 'speicher' },
  'sensor.speicher_h': { area_id: 'speicher', hidden: true },
  // a sensor that comes late
  'sensor.spaet_t': { area_id: 'spaet' },
  'light.keller': { area_id: 'keller' },
};

const area = (area_id: string, name: string, more: Record<string, unknown> = {}) => ({
  area_id,
  name,
  picture: null,
  icon: null,
  ...more,
});

const registries = {
  entities: Object.fromEntries(
    Object.entries(ENTRIES).map(([entity_id, entry]) => [entity_id, { entity_id, ...entry }]),
  ),
  devices: {},
  areas: {
    garten: area('garten', 'Garten'),
    kuche: area('kuche', 'Küche', {
      temperature_entity_id: 'sensor.kuche_t',
      humidity_entity_id: 'sensor.kuche_h',
    }),
    wohnzimmer: area('wohnzimmer', 'Wohnzimmer'),
    buero: area('buero', 'Büro'),
    flur: area('flur', 'Flur'),
    speicher: area('speicher', 'Speicher'),
    spaet: area('spaet', 'Später'),
    leer: area('leer', 'Leer'),
    keller: area('keller', 'Keller'),
  },
};

const house = (seeds: readonly Seed[] = SEEDS, admin = true): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: states(seeds),
    ...registries,
    user: { id: 'u1', name: 'Marta', is_admin: admin },
    config: { unit_system: { temperature: '°C', length: 'km' } },
    themes: { darkMode: false, themes: {} },
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => path,
  }) as unknown as HomeAssistant;

type RoomElement = HTMLElement & {
  setConfig(config: RoomCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

/** The reporter's card: the photo variant, tiles under it, no count. */
const REPORTER = { variant: 'photo', controls: 'tiles', show_count: false } as const;

async function room(
  config: Partial<RoomCardConfig> & { area: string },
  hass: HomeAssistant = house(),
): Promise<RoomElement> {
  const card = document.createElement('fluvy-room-card') as RoomElement;
  card.setConfig({ type: 'custom:fluvy-room-card', ...config });
  card.hass = hass;
  (card as unknown as { width: number }).width = 360;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const root = (card: RoomElement): ShadowRoot => card.shadowRoot!;
const readouts = (card: RoomElement): string[] =>
  [...root(card).querySelectorAll('.am-area__stats .fv-readout__value')].map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
const hint = (card: RoomElement): string | undefined =>
  root(card).querySelector('.fv-empty-state__hint')?.textContent?.trim();

describe('a room finds what is in it (#39)', () => {
  afterEach(() => document.body.replaceChildren());

  it('reads a plain room: its photo and its two readings', async () => {
    const card = await room({ area: 'garten', ...REPORTER });
    expect(root(card).querySelector('.rm-hero')).not.toBeNull();
    expect(readouts(card)).toEqual(['16.4°C', '92%']);
    expect(root(card).querySelector('.fv-empty-state')).toBeNull();
  });

  it('reads the sensors the area names, even diagnostic ones', async () => {
    const card = await room({ area: 'kuche', ...REPORTER });
    expect(readouts(card)).toEqual(['21.4°C', '48%']);
  });

  it('keeps a room whose sensors are hidden as a room: its photo, then why it is empty', async () => {
    const card = await room({ area: 'wohnzimmer', ...REPORTER });
    expect(root(card).querySelector('.rm-hero')).not.toBeNull();
    expect(root(card).querySelector('.fv-empty-state__text')?.textContent?.trim()).toBe(
      'Nothing in this room yet',
    );
    expect(hint(card)).toBe(
      '2 hidden or diagnostic entities · choose its sensors in the area’s settings',
    );
  });

  it('tells only an administrator why', async () => {
    const card = await room({ area: 'wohnzimmer', ...REPORTER }, house(SEEDS, false));
    expect(root(card).querySelector('.fv-empty-state')).not.toBeNull();
    expect(hint(card)).toBeUndefined();
  });

  it('never counts what the registry has and the house has no state for', async () => {
    const card = await room({ area: 'speicher', ...REPORTER });
    expect(root(card).querySelector('.fv-empty-state')).not.toBeNull();
    expect(hint(card)).toBeUndefined();
    const bare = await room({ area: 'leer' });
    expect(hint(bare)).toBeUndefined();
  });

  it('draws the readings its config names, in a room that shows nothing', async () => {
    const card = await room({
      area: 'wohnzimmer',
      ...REPORTER,
      temperature_entity: 'sensor.garten_t',
    });
    expect(readouts(card)).toEqual(['16.4°C']);
    expect(root(card).querySelector('.fv-empty-state')).toBeNull();
  });

  it('draws the tiles asked for in an empty room, only where its controls are tiles', async () => {
    const tiles = [{ entity: 'light.keller' }];
    const asked = await room({ area: 'leer', controls: 'tiles', tiles });
    expect(root(asked).querySelectorAll('.rm-controls .fv-tile').length).toBe(1);
    expect(root(asked).querySelector('.fv-empty-state')).toBeNull();
    const rows = await room({ area: 'leer', tiles });
    expect(root(rows).querySelector('.rm-controls')).toBeNull();
    expect(root(rows).querySelector('.fv-empty-state')).not.toBeNull();
  });

  it('reads a thermostat-only room from the thermostat', async () => {
    const card = await room({ area: 'buero', ...REPORTER });
    expect(readouts(card)).toEqual(['20.5°C', '44%']);
    const tile = await room({ area: 'buero', variant: 'tile', show_count: false });
    expect(root(tile).querySelector('.fv-card__sub')?.textContent?.trim()).toBe('20.5°');
  });

  it('counts what is on as its rows do: a heating thermostat is on in the readout, the line and the rows alike', async () => {
    // the readout once counted the lights, switches, covers and fans that were on over everything it showed ("Devices
    // on 0 of 1") above the rows' "All devices · 1 of 1 on"
    const card = await room({ area: 'buero', variant: 'photo' });
    expect(readouts(card)).toEqual(['20.5°C', '44%', '1of 1']);
    const all = [...root(card).querySelectorAll('.am-rows .fv-row')].at(-1)!;
    expect(all.querySelector('.fv-row__sub')?.textContent?.trim()).toBe('1 of 1 on');
    const tile = await room({ area: 'buero', variant: 'tile' });
    expect(root(tile).querySelector('.fv-card__sub')?.textContent?.trim()).toBe(
      '1 of 1 on · 20.5°',
    );
    // nothing on is nothing on, in both
    const off = await room({ area: 'keller', variant: 'photo' });
    expect(readouts(off)).toEqual(['0of 1']);
    expect(
      [...root(off).querySelectorAll('.am-rows .fv-row__sub')].map((el) => el.textContent?.trim()),
    ).toEqual(['1 device', '1 device']);
  });

  it('reads the sensor that works when the first one is dead', async () => {
    const card = await room({ area: 'flur', ...REPORTER });
    expect(readouts(card)).toEqual(['19.8°C']);
  });

  it('carries the climate in the line of a row and a tile', async () => {
    const row = await room({ area: 'kuche', variant: 'row' });
    expect(root(row).querySelector('.fv-tile__state')?.textContent?.trim()).toBe('21.4°');
    const tile = await room({ area: 'kuche', variant: 'tile' });
    expect(root(tile).querySelector('.fv-card__sub')?.textContent?.trim()).toBe('21.4°');
    expect(root(tile).querySelector('.fv-empty-state')).toBeNull();
  });

  it('keeps an empty card’s way in: its tap, its hold and its chevron', async () => {
    const went: string[] = [];
    const listen = (): void => void went.push(window.location.pathname);
    window.addEventListener('location-changed', listen);
    try {
      const actions = {
        path: '/fluvy-home/room-leer',
        hold_action: { action: 'navigate', navigation_path: '/hold' },
      } as const;
      const tile = await room({ area: 'leer', variant: 'tile', ...actions });
      const head = root(tile).querySelector('.fv-card__head')!;
      expect(head.classList.contains('fv-card__head--hold')).toBe(true);
      expect(root(tile).querySelector('.fv-head__open')).not.toBeNull();
      root(tile).querySelector<HTMLElement>('.fv-card__tap')!.click();
      expect(went.at(-1)).toBe('/fluvy-home/room-leer');
      const photo = await room({ area: 'leer', variant: 'photo', ...actions });
      const cover = root(photo).querySelector<HTMLElement & { fvHold?: () => void }>(
        '.rm-hero .fv-tile__tap',
      )!;
      expect(cover.fvHold).toBeTypeOf('function');
      expect(root(photo).querySelector('.rm-hero + .fv-empty-state')).not.toBeNull();
    } finally {
      window.removeEventListener('location-changed', listen);
    }
  });

  it('fills the room when a sensor comes late, with the same registries', async () => {
    const early = house();
    const card = await room({ area: 'spaet', ...REPORTER }, early);
    expect(root(card).querySelector('.fv-empty-state')).not.toBeNull();
    card.hass = house([...SEEDS, temperature('sensor.spaet_t', '18.2')]);
    await card.updateComplete;
    expect(readouts(card)).toEqual(['18.2°C']);
  });

  it('is never starved by an earlier reader that saw fewer states (the automatic dashboard while Home Assistant starts)', async () => {
    const partial = house(SEEDS.filter(([id]) => !id.startsWith('sensor.garten')));
    expect(areaEntities(partial, 'garten')).toEqual([]);
    const card = await room({ area: 'garten', ...REPORTER });
    expect(readouts(card)).toEqual(['16.4°C', '92%']);
  });

  it('shows in the editor the variant it draws and the readings it found', () => {
    const defaults = roomEditor.defaults(
      { type: 'custom:fluvy-room-card', area: 'kuche' },
      house(),
    );
    expect(defaults).toMatchObject({
      variant: 'tile',
      temperature_entity: 'sensor.kuche_t',
      humidity_entity: 'sensor.kuche_h',
    });
    const pictured = roomEditor.defaults(
      { type: 'custom:fluvy-room-card', area: 'garten', picture: '/local/garten.jpg' },
      house(),
    );
    expect(pictured['variant']).toBe('photo');
  });

  it('is offered with a room that holds something', () => {
    expect(FluvyRoomCard.getStubConfig(house(), []).area).toBe('buero');
  });
});

describe('a room counts its devices, never an appliance’s controls (#95)', () => {
  afterEach(() => document.body.replaceChildren());

  /**
   * The reporter's kitchen: two lights, and a dishwasher of an integration the appliance card does not read
   * (LocalThings), whose options are switches beside its programme, its delay and its start.
   */
  const KITCHEN: readonly Seed[] = [
    ['light.kitchen_ceiling', 'on'],
    ['light.kitchen_counter', 'off'],
    ['switch.dishwasher_power', 'on'],
    ['switch.dishwasher_extra_dry', 'on'],
    ['switch.dishwasher_sanitize', 'off'],
    ['select.dishwasher_course', 'eco', { options: ['eco', 'auto'] }],
    ['number.dishwasher_delay_start', '0', { min: 0, max: 24 }],
    ['button.dishwasher_start', 'unknown'],
    ['sensor.dishwasher_remaining', '42', { unit_of_measurement: 'min' }],
    ['binary_sensor.dishwasher_door', 'on', { device_class: 'door' }],
  ];
  const kitchen = (ceiling = 'on'): HomeAssistant => {
    const seeds = KITCHEN.map((seed): Seed =>
      seed[0] === 'light.kitchen_ceiling' ? [seed[0], ceiling] : seed,
    );
    const hass = house([...SEEDS, ...seeds]);
    const entries = KITCHEN.map(([entity_id]) => [
      entity_id,
      entity_id.includes('dishwasher')
        ? { entity_id, device_id: 'dishwasher', platform: 'localthings' }
        : { entity_id, area_id: 'kitchen' },
    ]);
    return {
      ...hass,
      entities: { ...hass.entities, ...Object.fromEntries(entries) },
      devices: {
        dishwasher: {
          id: 'dishwasher',
          area_id: 'kitchen',
          name: 'Dishwasher',
          name_by_user: null,
        },
      },
      areas: { ...hass.areas, kitchen: area('kitchen', 'Kitchen') },
    } as HomeAssistant;
  };

  it('counts its lights: the readout, the line and the rows say "1 of 2 on" where they said "5 of 10"', async () => {
    const card = await room({ area: 'kitchen', variant: 'photo' }, kitchen());
    expect(readouts(card)).toEqual(['1of 2']);
    const all = [...root(card).querySelectorAll('.am-rows .fv-row')].at(-1)!;
    expect(all.querySelector('.fv-row__sub')?.textContent?.trim()).toBe('1 of 2 on');
    const row = await room({ area: 'kitchen', variant: 'row' }, kitchen());
    expect(root(row).querySelector('.fv-tile__state')?.textContent?.trim()).toBe('1 of 2 on');
    // its tiles are its lights, never a dishwasher's option
    const tiles = await room({ area: 'kitchen', variant: 'tile', controls: 'tiles' }, kitchen());
    expect(root(tiles).querySelectorAll('.rm-controls .fv-tile')).toHaveLength(2);
  });

  it('is off while its lights are, whatever the dishwasher’s options and door say', async () => {
    const row = await room({ area: 'kitchen', variant: 'row' }, kitchen('off'));
    expect(root(row).querySelector('.rm-tile')?.classList.contains('is-on')).toBe(false);
    expect(root(row).querySelector('.fv-tile__state')?.textContent?.trim()).toBe('2 devices');
  });
});

describe('a room of sensors alone', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows its readings and no row of the devices it has none of, and declares as much', async () => {
    for (const variant of ['photo', 'tile'] as const) {
      const card = await room({ area: 'garten', variant });
      expect(root(card).querySelector('.am-rows'), variant).toBeNull();
      expect(root(card).querySelector('.fv-empty-state'), variant).toBeNull();
    }
    const hass = house();
    const found = areaContents(hass, 'garten');
    // the house's height: the photo's hero and its readouts, the tile's head, and nothing under them
    expect(
      roomHeight(
        { type: 'x', area: 'garten', variant: 'photo' },
        { found, picture: false, admin: true },
      ),
    ).toBe(160 + 64 + 20);
    expect(
      roomHeight(
        { type: 'x', area: 'garten', variant: 'tile' },
        { found, picture: false, admin: true },
      ),
    ).toBe(20 + 44 + 20);
  });
});

/** A room drawn at `width` on a stub ruler: what happy-dom cannot lay out. */
async function roomAt(
  config: Partial<RoomCardConfig> & { area: string },
  width: number,
  ruler: { width: (cls: string, text: string) => number },
  hass: HomeAssistant = house(),
): Promise<RoomElement> {
  const card = document.createElement('fluvy-room-card') as RoomElement;
  Object.assign((card as unknown as { headFit: object }).headFit, {
    ruler: {
      ...ruler,
      pill: (_cls: string, text: string, pad: number) => text.length * 8 + pad,
      clear() {},
    },
  });
  card.setConfig({ type: 'custom:fluvy-room-card', ...config });
  card.hass = hass;
  (card as unknown as { width: number }).width = width;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

describe('a room in a narrow column', () => {
  afterEach(() => document.body.replaceChildren());

  it('gives its tile head’s circle to a name that would be cut beside it, as every head does', async () => {
    // 8 px a glyph: "Wohnzimmer" (80) beside the circle and the chevron at 211 has 171 − 56 − 48 = 67; without the
    // circle, 123
    const ruler = { width: (_cls: string, text: string) => text.length * 8 };
    const narrow = await roomAt({ area: 'wohnzimmer', variant: 'tile' }, 211, ruler);
    const head = root(narrow).querySelector('.fv-card__head')!;
    expect(head.querySelector('.fv-ico')).toBeNull();
    expect(head.querySelector('.fv-card__title')?.textContent?.trim()).toBe('Wohnzimmer');
    expect(head.querySelector('.fv-card__tap')?.hasAttribute('title')).toBe(false);
    // a name that holds beside it keeps the circle, and so does every name in a wide column
    const short = await roomAt({ area: 'flur', variant: 'tile' }, 211, ruler);
    expect(root(short).querySelector('.fv-card__head .fv-ico')).not.toBeNull();
    const wide = await roomAt({ area: 'wohnzimmer', variant: 'tile' }, 360, ruler);
    expect(root(wide).querySelector('.fv-card__head .fv-ico')).not.toBeNull();
    // never asked for, never drawn
    const none = await roomAt({ area: 'flur', variant: 'tile', show_icon: 'never' }, 360, ruler);
    expect(root(none).querySelector('.fv-card__head .fv-ico')).toBeNull();
  });

  it('keeps an administrator’s hint to three lines at 211 in every language: the why, the way out left out', async () => {
    await preloadLanguages();
    // the ruler as a browser's: a class's measure caps its probe, as the hint's 380 does — the room measures the hint's
    // whole line (7 px a glyph, 14 a kana or kanji), so a long one is never taken for three lines it would run past
    const glyphs = (text: string): number =>
      [...text].reduce((sum, ch) => sum + (/[\u3000-\u9fff]/u.test(ch) ? 14 : 7), 0);
    const ruler = {
      width: (cls: string, text: string) =>
        (cls === 'fv-empty-state__hint' ? Math.min(glyphs(text), 380) : glyphs(text)) + 1,
    };
    for (const language of LANGUAGE_CODES) {
      const hass = { ...house(), language, locale: { language, number_format: 'language' } };
      const full = localize(hass as HomeAssistant, 'room.kept_out', { n: 2 });
      const why = full.split(' · ')[0]!;
      const narrow = await roomAt(
        { area: 'wohnzimmer', ...REPORTER },
        211,
        ruler,
        hass as HomeAssistant,
      );
      // three lines of 211's 139 less what wrapping by words loses: 389
      expect(hint(narrow), language).toBe(why);
      expect(glyphs(why) + 1, language).toBeLessThanOrEqual(389);
      const wide = await roomAt(
        { area: 'wohnzimmer', ...REPORTER },
        360,
        ruler,
        hass as HomeAssistant,
      );
      expect(hint(wide), language).toBe(full);
      document.body.replaceChildren();
    }
  });
});

describe('the room card’s editor offers what acts in the room’s style (#58)', () => {
  const editor = async (config: Record<string, unknown>) => {
    const element = await FluvyRoomCard.getConfigElement();
    (element as HTMLElement & { hass: HomeAssistant }).hass = house();
    return drawEditor(element, { type: 'custom:fluvy-room-card', area: 'garten', ...config });
  };
  const shown = async (config: Record<string, unknown>): Promise<string[]> =>
    shownNames(cardForm(await editor(config)).schema);
  afterEach(() => document.body.replaceChildren());

  it('a row draws neither controls, tiles, a picture nor the lights’ colours: none of them is offered', async () => {
    const photo = await shown({ variant: 'photo', controls: 'tiles' });
    for (const name of ['controls', 'picture', 'tint', 'light_colors'])
      expect(photo).toContain(name);
    const row = await shown({ variant: 'row', controls: 'tiles', light_colors: true });
    for (const name of ['controls', 'picture', 'tint', 'light_colors', 'light_whites'])
      expect(row).not.toContain(name);
    // what a row does draw stays: its line, its way in
    for (const name of ['show_climate', 'show_count', 'path']) expect(row).toContain(name);
    expect(listTitles(await editor({ variant: 'row', controls: 'tiles' }))).toEqual([]);
  });

  it('the tiles and their colour at rest with tiles alone; the lights’ colours wherever lights are drawn', async () => {
    const rows = await editor({ variant: 'tile' });
    expect(shownNames(cardForm(rows).schema)).not.toContain('tint');
    expect(shownNames(cardForm(rows).schema)).toContain('light_colors');
    expect(listTitles(rows)).toEqual([]);
    const tiles = await editor({ variant: 'tile', controls: 'tiles' });
    expect(shownNames(cardForm(tiles).schema)).toContain('tint');
    expect(listTitles(tiles)).toEqual(['Tiles']);
    expect(await shown({ variant: 'tile', controls: 'none' })).not.toContain('light_colors');
  });

  it('a picture for the photo alone: its default where the room has one or the card names one', async () => {
    expect(await shown({ variant: 'tile', controls: 'tiles' })).not.toContain('picture');
    expect(await shown({ variant: 'tile', picture: '/local/garden.jpg' })).not.toContain('picture');
    expect(await shown({ variant: 'photo' })).toContain('picture');
    // no variant: the photo where the card names a picture, the tile where nothing does
    expect(await shown({ picture: '/local/garden.jpg' })).toContain('picture');
    expect(await shown({})).not.toContain('picture');
  });

  it('a name in two lines where a compact tile is drawn: its tiles, or the row (#100)', async () => {
    expect(await shown({ variant: 'tile', controls: 'tiles' })).toContain('name_lines');
    expect(await shown({ variant: 'row' })).toContain('name_lines');
    expect(await shown({ variant: 'tile' })).not.toContain('name_lines');
    expect(await shown({ variant: 'photo', controls: 'none' })).not.toContain('name_lines');
    // each tile, and the row, a line taller, from the config alone
    const tiles: RoomCardConfig = {
      type: 'custom:fluvy-room-card',
      area: 'garten',
      variant: 'tile',
      controls: 'tiles',
    };
    expect(
      FluvyRoomCard.layoutHeight({ ...tiles, name_lines: 2 }) - FluvyRoomCard.layoutHeight(tiles),
    ).toBe(2 * 12);
    expect(FluvyRoomCard.layoutHeight({ ...tiles, variant: 'row', name_lines: '2' })).toBe(88);
  });

  it('never the size and the readouts it never read (their YAML keys stay, ignored)', async () => {
    const names = await shown({ variant: 'tile', size: 'mini', readouts: ['sensor.garten_t'] });
    expect(names).not.toContain('size');
    expect(names).not.toContain('readouts');
    expect(roomEditor.keys).not.toContain('size');
    expect(roomEditor.keys).not.toContain('readouts');
  });
});

describe('a room’s own include and exclude (#95)', () => {
  afterEach(() => document.body.replaceChildren());

  it('counts what it includes and leaves out what it excludes, in its readout and its line alike', async () => {
    const hass = house([...SEEDS, ['light.flur', 'on'], ['switch.flur_heater', 'on']]);
    const tuned = {
      ...hass,
      entities: {
        ...hass.entities,
        'light.flur': { entity_id: 'light.flur', area_id: 'flur' },
        'switch.flur_heater': { entity_id: 'switch.flur_heater', area_id: 'flur' },
      },
    } as HomeAssistant;
    const card = await room({ area: 'flur', variant: 'photo', exclude: ['switch'] }, tuned);
    expect(readouts(card).at(-1)).toBe('1of 1');
    const row = await room(
      { area: 'flur', variant: 'row', exclude: ['switch'], include: ['light.keller'] },
      tuned,
    );
    expect(root(row).querySelector('.fv-tile__state')?.textContent?.trim()).toBe(
      '1 of 2 on · 19.8°',
    );
  });

  it('offers its entities, devices and domains to choose, and a pattern typed', async () => {
    const element = await FluvyRoomCard.getConfigElement();
    (element as HTMLElement & { hass: HomeAssistant }).hass = house();
    const editor = await drawEditor(element, { type: 'custom:fluvy-room-card', area: 'flur' });
    const selects = [...editor.shadowRoot!.querySelectorAll('ha-form')]
      .flatMap(
        (form) => (form as unknown as { schema: { name: string; selector?: unknown }[] }).schema,
      )
      .filter((item) => item.name === 'include' || item.name === 'exclude')
      .map(
        (item) =>
          (item.selector as { select: { options: { value: string }[]; custom_value: boolean } })
            .select,
      );
    expect(selects).toHaveLength(2);
    for (const select of selects) {
      expect(select.custom_value).toBe(true);
      expect(select.options.map((option) => option.value)).toEqual([
        'sensor.flur_a',
        'sensor.flur_b',
        'sensor',
      ]);
    }
  });
});
