// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
// the cards register their heights with core: the strategy lays columns out with them
import '../index.js';
import { CAPS } from './caps.js';
import { findEnergyRoles } from './energy-roles.js';
import { generate } from './generate.js';
import { FluvyHomeStrategy } from './home-strategy.js';
import { HomeRegistry } from './home-registry.js';
import { roomParts } from './rooms.js';
import type { View } from './types.js';
import {
  hcCoffee,
  hcDishwasher,
  hcOven,
  houseOf,
  lgDryer,
  lgFridge,
  lgWasher,
  mieleHob,
  petFixtures,
  plugWasher,
  tuyaKettle,
} from '../appliance/fixtures/index.js';
import { areaContents, type HomeAssistant } from '@fluvy/core';

import {
  DEMO_ENERGY_SOURCES,
  DEMO_EXTRAS,
  DEMO_HEAT_PUMP_READINGS,
  DEMO_ROOMS,
  demoHass,
  type DemoEntity,
} from '@fluvy/demo-home';

/** The demo home as a strategy sees it, with what a test adds on top. */
function house(more: readonly DemoEntity[] = [], consumption?: readonly string[]) {
  return demoHass({ more, ...(consumption ? { consumption } : {}) }) as never;
}

const entity = (
  id: string,
  state: string,
  attributes: Record<string, unknown> = {},
  registry: Record<string, unknown> = {},
): DemoEntity => ({ id, state, attributes, registry });

const types = (cards: readonly { type: string }[]): string[] =>
  cards.map((c) => c.type.replace('custom:fluvy-', '').replace('-card', ''));

describe('custom:fluvy-home strategy — a house named in Japanese', () => {
  it('reads a switch as a light by its kana or kanji, a garden as outdoors, a full-width name in ordinary width', () => {
    const registry = new HomeRegistry(
      house([
        entity('switch.ribingu_no_denki', 'on', { friendly_name: 'リビングの電気' }),
        entity('switch.shinshitsu', 'off', { friendly_name: '寝室の照明' }),
        entity('switch.niwa', 'off', { friendly_name: '庭のライト' }),
        entity('switch.led_tape', 'off', { friendly_name: 'ＬＥＤ テープ' }),
        entity('switch.denki_ketoru', 'off', { friendly_name: '電気ケトル' }),
        entity('switch.despot', 'off', { friendly_name: 'Despot' }),
      ]),
    );
    const { lights } = registry;
    for (const id of [
      'switch.ribingu_no_denki',
      'switch.shinshitsu',
      'switch.niwa',
      'switch.led_tape',
    ])
      expect(lights, id).toContain(id);
    for (const id of ['switch.denki_ketoru', 'switch.despot']) expect(lights, id).not.toContain(id);
    expect(registry.outdoor('switch.niwa')).toBe(true);
    expect(registry.outdoor('switch.shinshitsu')).toBe(false);
  });

  it('reads a switch among a light’s words and the appliances’, the longest of words that overlap winning, and a place against the house’s', () => {
    const registry = new HomeRegistry(
      house([
        entity('switch.denki_potto', 'off', { friendly_name: '電気ポット' }),
        entity('switch.oobun_toosutaa', 'off', { friendly_name: 'オーブントースター' }),
        entity('switch.gasu_renji', 'off', { friendly_name: 'ガスレンジ' }),
        entity('switch.niwa_no_raito', 'off', { friendly_name: '庭のライト' }),
        entity('switch.katei_konsento', 'off', { friendly_name: '家庭用コンセント' }),
        entity('switch.wasserkocher', 'off', { friendly_name: 'Wasserkocher Küche' }),
        entity('switch.backofen_lampe', 'off', { friendly_name: 'Lampe Backofen' }),
      ]),
    );
    const { lights, appliances } = registry;
    // a kettle, a toaster, a hob on their plugs: the appliance's word holds the light's 電気, or stands alone
    for (const id of [
      'switch.denki_potto',
      'switch.oobun_toosutaa',
      'switch.gasu_renji',
      'switch.wasserkocher',
    ]) {
      expect(lights, id).not.toContain(id);
      expect(appliances, id).toContain(id);
    }
    // a light's word that stands apart from an appliance's keeps the light (the light's words are listed first)
    for (const id of ['switch.niwa_no_raito', 'switch.backofen_lampe'])
      expect(lights, id).toContain(id);
    // 家庭 (the household) holds no garden 庭; 庭のライト is in the garden
    expect(registry.outdoor('switch.katei_konsento')).toBe(false);
    expect(registry.outdoor('switch.niwa_no_raito')).toBe(true);
  });

  it('names its energy readings’ roles: the sun, what is bought and sold, the battery, the charger, the house', () => {
    const power = (id: string, friendly_name: string) =>
      [
        id,
        {
          entity_id: id,
          state: '100',
          attributes: { friendly_name, device_class: 'power', unit_of_measurement: 'W' },
          last_changed: '',
          last_updated: '',
          context: { id: '', parent_id: null, user_id: null },
        },
      ] as const;
    const registry = new HomeRegistry({
      states: Object.fromEntries([
        power('sensor.taiyoukou', '太陽光発電 電力'),
        power('sensor.kaiden', '買電 電力'),
        power('sensor.baiden', '売電 電力'),
        power('sensor.chikudenchi', '蓄電池 電力'),
        power('sensor.ev_juudenki', 'EV充電器 電力'),
        power('sensor.katei', '家庭の消費電力'),
      ]),
      entities: {},
      devices: {},
      areas: {},
      language: 'ja',
    } as never);
    expect(findEnergyRoles(registry, null)).toMatchObject({
      solarPower: 'sensor.taiyoukou',
      gridPower: 'sensor.kaiden',
      gridImport: 'sensor.kaiden',
      gridExport: 'sensor.baiden',
      batteryPower: 'sensor.chikudenchi',
      charger: 'sensor.ev_juudenki',
      homePower: 'sensor.katei',
    });
  });

  it('never takes a bathroom for the house: "casa de banho" and "casa de baño" are rooms, "consumo da casa" is the house', () => {
    const power = (id: string, friendly_name: string) =>
      [
        id,
        {
          entity_id: id,
          state: '100',
          attributes: { friendly_name, device_class: 'power', unit_of_measurement: 'W' },
          last_changed: '',
          last_updated: '',
          context: { id: '', parent_id: null, user_id: null },
        },
      ] as const;
    const house = (states: ReadonlyArray<ReturnType<typeof power>>, language: string) =>
      new HomeRegistry({
        states: Object.fromEntries(states),
        entities: {},
        devices: {},
        areas: {},
        language,
      } as never);
    const bathrooms = [
      power('sensor.toalheiro_casa_de_banho_power', 'Toalheiro casa de banho'),
      power('sensor.calefactor_casa_de_bano_power', 'Calefactor casa de baño'),
    ];
    expect(findEnergyRoles(house(bathrooms, 'pt-PT'), null).homePower).toBeUndefined();
    expect(
      findEnergyRoles(
        house([...bathrooms, power('sensor.consumo_da_casa', 'Consumo da casa')], 'pt-PT'),
        null,
      ).homePower,
    ).toBe('sensor.consumo_da_casa');
  });
});

describe('custom:fluvy-home strategy — a place named by its device, no separator left hanging', () => {
  /** A house of readings, each on a device of its own name, in no area: the place is the device's name. */
  const readings = (devices: Record<string, string>, names: Record<string, string> = {}) =>
    new HomeRegistry({
      states: Object.fromEntries(
        Object.keys(devices).map((id) => [
          id,
          {
            entity_id: id,
            state: '21',
            attributes: { friendly_name: names[id] ?? devices[id], device_class: 'temperature' },
            last_changed: '',
            last_updated: '',
            context: { id: '', parent_id: null, user_id: null },
          },
        ]),
      ),
      entities: Object.fromEntries(
        Object.keys(devices).map((id) => [id, { entity_id: id, device_id: `d.${id}` }]),
      ),
      devices: Object.fromEntries(
        Object.entries(devices).map(([id, name]) => [`d.${id}`, { id: `d.${id}`, name }]),
      ),
      areas: {},
      language: 'ja',
    } as never);

  it('takes the separators the sensor words leave at its ends with them, in Japanese and in Latin letters', () => {
    const registry = readings({
      'sensor.kitchen': 'キッチン温度・湿度',
      'sensor.bedroom': '寝室：温度',
      'sensor.study': '書斎 ／ 温度計',
      'sensor.hall': 'Hall · Temperature',
      'sensor.attic': 'Attic temperature',
      'sensor.porch': 'Temperature – Porch',
    });
    expect(registry.placeName('sensor.kitchen')).toBe('キッチン');
    expect(registry.placeName('sensor.bedroom')).toBe('寝室');
    expect(registry.placeName('sensor.study')).toBe('書斎');
    expect(registry.placeName('sensor.hall')).toBe('Hall');
    expect(registry.placeName('sensor.attic')).toBe('Attic');
    expect(registry.placeName('sensor.porch')).toBe('Porch');
  });

  it('keeps a separator inside the place, and the entity’s name for a device named only by sensor words', () => {
    const registry = readings(
      { 'sensor.loft': 'Loft · Nord Temperatur', 'sensor.bare': '温湿度センサー' },
      { 'sensor.bare': '温湿度センサー 書斎' },
    );
    expect(registry.placeName('sensor.loft')).toBe('Loft · Nord');
    expect(registry.placeName('sensor.bare')).toBe(registry.displayName('sensor.bare'));
    expect(registry.placeName('sensor.bare')).toBe('書斎');
  });

  it('reads an entity’s own name without the device’s in front of it, nor a separator at either end', () => {
    const registry = readings(
      { 'sensor.a': 'Kitchen sensor', 'sensor.b': '寝室センサー' },
      { 'sensor.a': 'Kitchen sensor: Temperature', 'sensor.b': '寝室センサー／温度 ・' },
    );
    expect(registry.ownName('sensor.a')).toBe('Temperature');
    expect(registry.ownName('sensor.b')).toBe('温度');
  });
});

describe("custom:fluvy-home strategy — the grid meter's sign", () => {
  /** A grid meter found by its words, negative while the house imports at night. */
  const withMeter = (hourly: number) => {
    const hass = house([
      entity('sensor.solar_inverter_power', '0', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Solar inverter power',
      }),
      entity('sensor.grid_meter_power', '-1286', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Grid meter power',
      }),
    ]) as unknown as { callWS: (msg: { type: string }) => Promise<unknown> };
    const prefs = hass.callWS;
    hass.callWS = async (msg) =>
      msg.type === 'recorder/statistics_during_period'
        ? {
            'sensor.grid_meter_power': Array.from({ length: 24 }, (_, i) => ({
              start: i,
              mean: hourly,
            })),
            'sensor.solar_inverter_power': Array.from({ length: 24 }, (_, i) => ({
              start: i,
              mean: 0,
            })),
          }
        : prefs(msg);
    return hass as never;
  };
  const flow = (views: Awaited<ReturnType<typeof FluvyHomeStrategy.generate>>['views']) =>
    views
      .flatMap((v) => v.sections.flatMap((s) => s.cards))
      .find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as Record<
      string,
      unknown
    >;

  it('inverts a meter that reads negative through the dark hours', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withMeter(-1200),
    );
    expect(flow(views)?.['sources']).toContainEqual({
      type: 'grid',
      power: 'sensor.grid_meter_power',
      invert: true,
    });
  });

  it('keeps a meter that imports as positive', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withMeter(1200),
    );
    expect(flow(views)?.['sources']).toContainEqual({
      type: 'grid',
      power: 'sensor.grid_meter_power',
    });
  });
});

/** The moment the appliances' fixtures are read at. */
const APPLIANCES_AT = Date.parse('2026-09-17T19:47:00Z');
/** A house with the reporter's kitchen and laundry (#47): a large appliance of every kind, a kettle and a plug's washer. */
const withAppliances = (base: Record<string, unknown> = demoHass() as never) =>
  houseOf(
    [
      hcCoffee(APPLIANCES_AT),
      mieleHob(APPLIANCES_AT),
      hcOven(APPLIANCES_AT),
      lgDryer(APPLIANCES_AT),
      lgWasher(APPLIANCES_AT),
      hcDishwasher(APPLIANCES_AT),
      lgFridge(APPLIANCES_AT),
      tuyaKettle(APPLIANCES_AT),
      plugWasher(APPLIANCES_AT),
    ],
    APPLIANCES_AT,
    base as Partial<HomeAssistant>,
  ) as never;

/** The demo home with one of everything the library has a card for. */
const everything = () =>
  withAppliances(
    demoHass({
      more: [...DEMO_EXTRAS, ...DEMO_ROOMS],
      consumption: ['sensor.washing_machine_energy_today', 'sensor.dryer_energy_today'],
      sources: DEMO_ENERGY_SOURCES,
    }) as never,
  );

describe('custom:fluvy-home strategy', () => {
  it('writes only configs its cards accept', async () => {
    await (await import('../index.js')).catalogue(); // the energy family too
    const rejected: string[] = [];
    for (const hass of [house(), everything()]) {
      const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
      for (const card of views.flatMap((v) => v.sections.flatMap((s) => s.cards))) {
        const Card = customElements.get(card.type.replace(/^custom:/, '')) as
          (new () => HTMLElement & { setConfig(config: unknown): void }) | undefined;
        if (!Card) {
          rejected.push(`${card.type}: not defined`);
          continue;
        }
        try {
          new Card().setConfig(card);
        } catch (error) {
          rejected.push(`${card.type}: ${(error as Error).message}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  });

  it('draws the cards in the style the dashboard asks for', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      {
        type: 'custom:fluvy-home',
        thermostat_variant: 'compact',
        tile_size: 'compact',
        flow_style: 'rail',
      },
      house(),
    );
    const cards = views.flatMap((v) => v.sections.flatMap((s) => s.cards));
    const of = (type: string) => cards.filter((c) => c.type === `custom:fluvy-${type}-card`);
    expect(of('thermostat').every((c) => c['variant'] === 'compact')).toBe(true);
    expect(of('energy-flow').every((c) => c['flow_style'] === 'rail')).toBe(true);
    const lights = views.find((v) => v.path === 'lights')!.sections.flatMap((s) => s.cards);
    const tiles = lights.filter((c) => c.type === 'custom:fluvy-tile-card');
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((c) => c['size'] === 'compact')).toBe(true);
  });

  it('puts every card of the library to use in a house that has one of everything', async () => {
    const CATALOGUE = await (await import('../index.js')).catalogue();
    // the views as chips under the greeting too: the chips card is in use
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      everything(),
    );
    const used = new Set(
      views.flatMap((v) => v.sections.flatMap((s) => s.cards.map((c) => c.type))),
    );
    // the automations card is placed by hand (1.8): the automatic dashboards do not put it on a view; the appliance
    // card is drawn by the appliances card, which lays the strategy's out whole (#47); a template card says what its
    // templates say, and only the person writes those (#59), as only the person knows a web page's address (#61); an
    // items card lists what a sensor's attribute holds, and only the person says what its items are (#66); the Energy
    // period strip leads the Energy dashboard's Today view (1.11), while the home's energy view keeps its cards' own
    // periods; a chart card draws the series the person names, in a list or a forecast only they know of (#68); the
    // Energy usage card (#62) is the person's to place; so is the Slider card (#77): the dashboards set a player's
    // volume, a number and a fan on their own cards
    const byHand = new Set([
      'custom:fluvy-automations-card',
      'custom:fluvy-appliance-card',
      'custom:fluvy-template-card',
      'custom:fluvy-web-card',
      'custom:fluvy-items-card',
      'custom:fluvy-energy-period-card',
      'custom:fluvy-chart-card',
      'custom:fluvy-energy-usage-card',
      'custom:fluvy-slider-card',
    ]);
    expect(
      CATALOGUE.map(([tag]) => `custom:${tag}`).filter(
        (type) => !used.has(type) && !byHand.has(type),
      ),
    ).toEqual([]);
  });

  it('builds a view for each thing the house has, with the greeting (and the tabs, when asked) on every one', async () => {
    // by default the header's tabs are the way between the views: the greeting stands alone
    const plain = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    for (const v of plain.views)
      expect(types(v.sections[0]!.cards).slice(0, 2)).not.toContain('chips');
    expect(types(plain.views[0]!.sections[0]!.cards)[0]).toBe('hello');
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      house(),
    );
    expect(views.filter((v) => !v.subview).map((v) => v.path)).toEqual([
      'home',
      'rooms',
      'lights',
      'climate',
      'energy',
      'media',
      'sensors',
    ]);
    for (const v of views)
      expect(types(v.sections[0]!.cards).slice(0, 2)).toEqual(['hello', 'chips']);
    const chips = views[0]!.sections[0]!.cards[1] as unknown as {
      chips: { label: string; path: string; icon: string }[];
    };
    expect(chips.chips.map((c) => c.label)).toEqual([
      'Home',
      'Rooms',
      'Lights',
      'Climate',
      'Energy',
      'Media',
      'Sensors',
    ]);
    expect(chips.chips[2]!.path.endsWith('/lights')).toBe(true);
    expect(chips.chips.every((c) => c.icon.startsWith('fluvy:'))).toBe(true);
  });

  it('generates the same dashboard for the demo home (golden file: a change here is a change of the dashboard)', async () => {
    const hass = house(DEMO_HEAT_PUMP_READINGS, [
      'sensor.washing_machine_energy_today',
      'sensor.heat_pump_energy_today',
    ]);
    expect(await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass)).toMatchSnapshot();
  });

  it('puts the running thermostat and the home forecast first, greets whoever looks, and keeps valves out of appliances', async () => {
    const hass = house([
      entity('climate.aa_idle_ac', 'off', { temperature: 24 }),
      entity('weather.met_service', 'sunny'),
      entity('weather.forecast_house', 'sunny'),
      entity('person.me', 'home', { user_id: 'u-1' }),
      entity('switch.sink_water_valve', 'on', { friendly_name: 'Sink water valve' }),
      entity('update.zigbee', 'on', {}, { entity_category: 'config' }),
    ]) as unknown as Record<string, unknown>;
    hass['user'] = { id: 'u-1', name: 'Me', is_admin: true };
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const home = views[0]!.sections.flatMap((section) => section.cards);
    expect(home.find((c) => c.type === 'custom:fluvy-thermostat-card')?.['entity']).toBe(
      'climate.heat_pump',
    );
    expect(home.find((c) => c.type === 'custom:fluvy-weather-card')?.['entity']).not.toBe(
      'weather.met_service',
    ); // the home's forecast (home / forecast_home) before the national service
    // the greeting names no one: each person who opens the dashboard is greeted (a saved copy too)
    const hello = home.find((c) => c.type === 'custom:fluvy-hello-card');
    expect(hello).toBeDefined();
    expect(hello?.['person']).toBeUndefined();
    expect(home.some((c) => c['entity'] === 'switch.sink_water_valve')).toBe(false);
    const sensors = views
      .find((v) => v.path === 'sensors')!
      .sections.flatMap((section) => section.cards);
    expect(
      (
        sensors.find((c) => c.type === 'custom:fluvy-updates-card')?.['entities'] as string[]
      ).includes('update.zigbee'),
    ).toBe(true);
  });

  it('adds a Rooms view when the house has two rooms with something in them, and a subview per room', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      house(DEMO_ROOMS),
    );
    const rooms = views.find((view) => view.path === 'rooms');
    expect(rooms).toBeDefined();
    const cards = rooms!.sections.flatMap((section) => section.cards);
    const areas = cards
      .filter((card) => card.type === 'custom:fluvy-room-card')
      .map((card) => card['area']);
    expect(areas).toEqual(['kitchen', 'living_room', 'bedroom', 'garden']); // ground floor, upstairs, then the garden on no floor
    expect(
      cards
        .filter((card) => card.type === 'custom:fluvy-heading-card')
        .map((card) => card['title']),
    ).toEqual(['Ground floor', 'Upstairs', 'Rooms']);
    const subviews = views.filter((view) => view.subview);
    expect(subviews.map((view) => view.path)).toEqual(areas.map((area) => `room-${area}`));
    expect(subviews[0]?.back_path).toBe('/fluvy-home/rooms');
    // a subview is not a tab
    const tabs = views[0]!.sections[0]!.cards.find(
      (card) => card.type === 'custom:fluvy-chips-card',
    ) as unknown as { chips: { path: string }[] };
    expect(tabs.chips.some((chip) => chip.path.includes('room-'))).toBe(false);
    // a room's subview opens with the way back to every room, then what the room holds
    const living = subviews.find((view) => view.path === 'room-living_room')!;
    const livingCards = living.sections
      .flatMap((section) => section.cards)
      .filter(
        (card) =>
          card.type !== 'custom:fluvy-hello-card' && card.type !== 'custom:fluvy-chips-card',
      );
    expect(livingCards[0]).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'All rooms',
      path: '/fluvy-home/rooms',
    });
    expect(
      livingCards.some(
        (card) =>
          card.type === 'custom:fluvy-tile-card' && card['entity'] === 'light.living_room_lamp',
      ),
    ).toBe(true);
  });

  it('makes a room of what the room card draws: an area that names its hidden sensors, and the reading it names alone (#39)', async () => {
    const hass = house([
      ...DEMO_ROOMS,
      entity(
        'sensor.cellar_temperature',
        '14.2',
        { device_class: 'temperature', unit_of_measurement: '°C' },
        { area_id: 'cellar', hidden: true },
      ),
      entity(
        'sensor.loft_humidity',
        '61',
        { device_class: 'humidity', unit_of_measurement: '%' },
        { area_id: 'loft', entity_category: 'diagnostic' },
      ),
      entity('switch.attic_led', 'on', {}, { area_id: 'attic', entity_category: 'config' }),
    ]) as { areas: Record<string, unknown> };
    hass.areas['cellar'] = {
      area_id: 'cellar',
      name: 'Cellar',
      temperature_entity_id: 'sensor.cellar_temperature',
    };
    hass.areas['loft'] = {
      area_id: 'loft',
      name: 'Loft',
      humidity_entity_id: 'sensor.loft_humidity',
    };
    hass.areas['attic'] = { area_id: 'attic', name: 'Attic' };
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const areas = views
      .find((view) => view.path === 'rooms')!
      .sections.flatMap((section) => section.cards)
      .filter((card) => card.type === 'custom:fluvy-room-card')
      .map((card) => card['area']);
    expect(areas).toContain('cellar');
    expect(areas).toContain('loft');
    expect(areas).not.toContain('attic');
    const loft = views
      .find((view) => view.path === 'room-loft')!
      .sections.flatMap((section) => section.cards)
      .find((card) => card.type === 'custom:fluvy-readouts-card');
    expect(loft?.['rows']).toEqual([{ entity: 'sensor.loft_humidity', name: 'Loft' }]);
  });

  it('puts the map beside the people once the house has a zone', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      house(DEMO_ROOMS),
    );
    const sensors = views.find((view) => view.path === 'sensors')!;
    const cards = sensors.sections.flatMap((section) => section.cards);
    expect(cards.some((card) => card.type === 'custom:fluvy-map-card')).toBe(true);
  });

  it('gives every view three columns, so the header never moves between tabs', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    for (const v of views) {
      expect(v.max_columns).toBe(3);
      expect(v.sections.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('tells lights from appliances by their words and gives plugs their readings', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const home = views[0]!.sections.flatMap((section) => section.cards); // wherever the columns cut
    const lights = home.find((c) => c.type === 'custom:fluvy-heading-card') as unknown as {
      entities: string[];
    };
    expect(lights.entities).toEqual([
      'light.living_room_lamp',
      'switch.kitchen_light',
      'switch.patio_light',
    ]);
    const washer = home.find((c) => c['entity'] === 'switch.washing_machine') as unknown as {
      readouts?: string[];
    };
    expect(washer.readouts).toEqual([
      'sensor.washing_machine_power',
      'sensor.washing_machine_energy_today',
    ]);
    expect(
      home.some(
        (c) => c['entity'] === 'switch.heat_pump_boost' || c['entity'] === 'switch.plug_beep',
      ),
    ).toBe(false);
  });

  it('groups the lights by area, dimmable ones as light cards', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const lights = views.find((v) => v.path === 'lights')!;
    const headings = lights.sections.flatMap((s) =>
      s.cards.filter((c) => c.type === 'custom:fluvy-heading-card').map((c) => c['title']),
    );
    expect(headings).toEqual(['Living room', 'Kitchen', 'Outdoor']);
    expect(
      lights.sections[0]!.cards.some(
        (c) => c.type === 'custom:fluvy-light-card' && c['entity'] === 'light.living_room_lamp',
      ),
    ).toBe(true);
  });

  it('pairs the tiles and closes an odd run with a compact tile across the column', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const columns = (card: { grid_options?: unknown }) =>
      (card.grid_options as { columns?: number } | undefined)?.columns;
    const runs: number[] = [];
    for (const cards of views.flatMap((v) => v.sections.map((s) => s.cards))) {
      let run = 0;
      for (const card of [...cards, {}]) {
        if (columns(card) === 6) run++;
        else {
          if (run) runs.push(run);
          run = 0;
        }
      }
    }
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.filter((n) => n % 2)).toEqual([]);
    const compact = views.flatMap((v) =>
      v.sections.flatMap((s) => s.cards.filter((c) => c['size'] === 'compact')),
    );
    expect(compact.length).toBeGreaterThan(0);
    expect(compact.every((c) => columns(c) === 12)).toBe(true);
  });

  it("leaves the weather service's sensors out of the climate view and pairs humidity with its temperature", async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const climate = views.find((v) => v.path === 'climate')!.sections.flatMap((s) => s.cards);
    expect(climate.some((c) => c['entity'] === 'sensor.met_temperature')).toBe(false);
    const humidity = climate.find((c) => c.type === 'custom:fluvy-humidity-card') as unknown as {
      temperature_entity?: string;
    };
    expect(humidity.temperature_entity).toBe('sensor.garden_temperature');
  });

  it("finds solar and grid power for the flow and the energy dashboard's devices", async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const energy = views.find((v) => v.path === 'energy')!.sections.flatMap((s) => s.cards);
    const flow = energy.find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as {
      sources: { type: string; power: string }[];
    };
    expect(flow.sources.map((s) => [s.type, s.power])).toEqual([
      ['solar', 'sensor.solar_inverter_power'],
      ['grid', 'sensor.grid_meter_power'],
    ]);
    expect(
      energy.some(
        (c) =>
          c.type === 'custom:fluvy-production-card' &&
          c['entity'] === 'sensor.solar_inverter_daily_yield',
      ),
    ).toBe(true);
    const devices = energy.find(
      (c) => c.type === 'custom:fluvy-energy-devices-card',
    ) as unknown as { rows: { entity: string }[] };
    expect(devices.rows.map((r) => r.entity)).toEqual(['sensor.washing_machine_energy_today']);
  });

  it('reads an export meter as the grid’s second sensor, never as the grid', async () => {
    const hass = house([
      entity('sensor.grid_import_power', '1900', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Grid import power',
      }),
      entity('sensor.grid_export_power', '400', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'Grid export power',
      }),
    ]);
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const cards = views.flatMap((v) => v.sections.flatMap((s) => s.cards));
    const flow = cards.find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as {
      sources: Record<string, unknown>[];
    };
    // the ordinary house's own meter is named for the grid too: the one named for the export is never it
    expect(JSON.stringify(flow.sources)).not.toContain('"power":"sensor.grid_export_power"');
    expect(flow.sources).toContainEqual({
      type: 'grid',
      import: expect.any(String),
      export: 'sensor.grid_export_power',
    });
  });

  it('reads a grid named by its phases as one source summed per phase', async () => {
    const phase = (n: number, w: string) =>
      entity(`sensor.grid_power_l${n}`, w, {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: `Grid power L${n}`,
      });
    const hass = house([phase(1, '-400'), phase(2, '1000'), phase(3, '900')]);
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const cards = views.flatMap((v) => v.sections.flatMap((s) => s.cards));
    const flow = cards.find((c) => c.type === 'custom:fluvy-energy-flow-card') as unknown as {
      sources: Record<string, unknown>[];
    };
    expect(flow.sources).toContainEqual({
      type: 'grid',
      phases: ['sensor.grid_power_l1', 'sensor.grid_power_l2', 'sensor.grid_power_l3'],
    });
    expect(cards.find((c) => c.type === 'custom:fluvy-grid-card')).toMatchObject({
      phases: ['sensor.grid_power_l1', 'sensor.grid_power_l2', 'sensor.grid_power_l3'],
    });
  });

  it("draws the distribution of the energy dashboard's devices from the power sensor beside each statistic", async () => {
    const hass = house(DEMO_HEAT_PUMP_READINGS, [
      'sensor.washing_machine_energy_today',
      'sensor.heat_pump_energy_today',
    ]);
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const energy = views.find((v) => v.path === 'energy')!.sections.flatMap((s) => s.cards);
    const distribution = energy.find(
      (c) => c.type === 'custom:fluvy-distribution-card',
    ) as unknown as { entities: string[] } | undefined;
    expect(distribution?.entities).toEqual([
      'sensor.washing_machine_power',
      'sensor.heat_pump_power',
    ]);
  });

  it('splits batteries into devices and phones, and keeps connectivity sensors out of openings', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    const sensors = views.find((v) => v.path === 'sensors')!.sections.flatMap((s) => s.cards);
    const bars = sensors.filter((c) => c.type === 'custom:fluvy-bars-card') as unknown as {
      title: string;
      rows: { entity: string }[];
    }[];
    expect(bars.map((b) => [b.title, b.rows.map((r) => r.entity)])).toEqual([
      ['Batteries', ['sensor.garden_battery']],
      ['Phones', ['sensor.phone_battery_level']],
    ]);
    const openings = sensors.find((c) => c.type === 'custom:fluvy-openings-card') as unknown as {
      entities: string[];
    };
    expect(openings.entities).toEqual(['binary_sensor.kitchen_leak']);
  });

  it('hands every opening to the sensors card, which folds them itself', async () => {
    const windows = Array.from({ length: 10 }, (_, i) =>
      entity(`binary_sensor.window_${i}`, 'off', { device_class: 'window' }),
    );
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      house(windows),
    );
    const sensors = views.find((v) => v.path === 'sensors')!.sections.flatMap((s) => s.cards);
    const openings = sensors.find((c) => c.type === 'custom:fluvy-openings-card') as unknown as {
      entities: string[];
    };
    expect(openings.entities).toHaveLength(11);
    expect(openings.entities).toContain('binary_sensor.window_9');
  });

  it("speaks the dashboard's language and leaves out hidden views", async () => {
    const hass = house() as unknown as { language: string };
    hass.language = 'es';
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', hide: ['energy', 'media'] },
      hass as never,
    );
    expect(views.filter((v) => !v.subview).map((v) => v.title)).toEqual([
      'Inicio',
      'Habitaciones',
      'Luces',
      'Clima',
      'Sensores',
    ]);
  });
});

describe('custom:fluvy-home strategy — the appliances, as the reporter of #47 drew them', () => {
  const band = (views: readonly { path: string; sections: readonly Section[] }[], path: string) =>
    views.find((view) => view.path === path)!.sections.filter((section) => section.column_span);
  type Section = { column_span?: number; cards: Record<string, unknown>[] };

  it('lays them across Home under its columns: the large ones as whole cards, then the small ones as rows', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withAppliances(),
    );
    const home = views[0]!;
    // the columns first (the greeting in the first), then the band across them
    expect(home.sections.slice(0, 3).every((section) => !section.column_span)).toBe(true);
    const [across, ...more] = band(views, 'home');
    expect(more).toEqual([]);
    expect(across?.column_span).toBe(3);
    const [large, largeCards, small, smallCards] = across!.cards;
    expect(large).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'Large appliances',
      icon: 'fluvy:dishwasher',
      subtitle: 'All appliances',
      path: '/fluvy-home/appliances',
    });
    // what keeps food cold, what cleans, what cooks, the coffee — the reporter's order
    expect(largeCards).toMatchObject({
      type: 'custom:fluvy-appliances-card',
      variant: 'cards',
      grid_options: { columns: 'full' },
    });
    expect((largeCards!['appliances'] as { kind: string }[]).map((item) => item.kind)).toEqual([
      'fridge',
      'dishwasher',
      'washer',
      'washer',
      'dryer',
      'oven',
      'hob',
      'coffee',
    ]);
    expect(small).toMatchObject({ title: 'Small appliances', subtitle: 'Show all' });
    expect(smallCards!['appliances']).toEqual([{ device: 'tuya-kettle', kind: 'kettle' }]);
  });

  it('gives the pets’ feeders, fountains and litter boxes a band of their own after the small appliances (#112)', async () => {
    const hass = houseOf(
      [tuyaKettle(APPLIANCES_AT), ...petFixtures(APPLIANCES_AT)],
      APPLIANCES_AT,
      demoHass() as never,
    );
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, hass);
    const [across] = band(views, 'home');
    const [small, , pets, petCards] = across!.cards;
    expect(small).toMatchObject({ title: 'Small appliances' });
    expect(pets).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'Pets',
      icon: 'mdi:paw',
      subtitle: 'Show all',
    });
    // whole cards, by kind and then by name; never a pet of its own
    expect(petCards!['appliances']).toEqual([
      { device: 'pk-feeder', kind: 'feeder' },
      { device: 'pl-feeder', kind: 'feeder' },
      { device: 'pl-fountain', kind: 'fountain' },
      { device: 'pk-fountain', kind: 'fountain' },
      { device: 'pk-litter', kind: 'litter_box' },
      { device: 'pl-litter', kind: 'litter_box' },
    ]);
  });

  it('takes the appliances out of the plug tiles and the room readings, never out of the energy views', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withAppliances(),
    );
    const cards = (path: string, of = views) =>
      of.find((view) => view.path === path)!.sections.flatMap((section) => section.cards);
    // the washer on its plug is an appliance card now, not a tile; the demo's own plug stays a tile
    const tiles = cards('home').filter((card) => card.type === 'custom:fluvy-tile-card');
    expect(tiles.some((card) => card['entity'] === 'switch.waschmaschine_keller')).toBe(false);
    expect(tiles.some((card) => card['entity'] === 'switch.washing_machine')).toBe(true);
    // an oven's or a fridge's temperature is not a room's
    expect(JSON.stringify(cards('climate'))).not.toMatch(/backofen|kuhlschrank|fridge/);
    // without devices in the energy dashboard, its consumption reads every plug's power as it did: the appliance's too
    const unlisted = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      withAppliances(demoHass({ consumption: [] }) as never),
    );
    expect(
      cards('energy', unlisted.views).find(
        (card) => card.type === 'custom:fluvy-distribution-card',
      )?.['entities'],
    ).toEqual(['sensor.waschmaschine_keller_leistung', 'sensor.washing_machine_power']);
  });

  it('opens every appliance on a subview of its own, back to Home, never a tab', async () => {
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home', greeting_tabs: 'show' },
      withAppliances(),
    );
    const all = views.find((view) => view.path === 'appliances')!;
    expect(all).toMatchObject({ subview: true, back_path: '/fluvy-home/home', max_columns: 3 });
    // the greeting keeps the first column; the bands lead nowhere further, every appliance in them
    expect(all.sections[0]!.cards[0]!.type).toBe('custom:fluvy-hello-card');
    const [across] = band(views, 'appliances');
    expect(across!.cards.filter((card) => card['path'])).toEqual([]);
    expect((across!.cards[1]!['appliances'] as unknown[]).length).toBe(8);
    const tabs = views[0]!.sections[0]!.cards.find(
      (card) => card.type === 'custom:fluvy-chips-card',
    ) as unknown as { chips: { path: string }[] };
    expect(tabs.chips.some((chip) => chip.path.endsWith('/appliances'))).toBe(false);
    // golden file: Home and the subview of a house with appliances (a change here is a change of the dashboard)
    const plain = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, withAppliances());
    expect(
      plain.views.filter((view) => view.path === 'home' || view.path === 'appliances'),
    ).toMatchSnapshot();
  });

  it('shows Home two rows of four large ones and a row of five small ones; the rest on the subview', async () => {
    const extra = Array.from({ length: 6 }, (_, i) => {
      const id = `plug-${i}`;
      return [
        id,
        {
          id,
          name: `Toaster ${i + 1}`,
          name_by_user: null,
          area_id: null,
          model: null,
          manufacturer: null,
          via_device_id: null,
        },
      ] as const;
    });
    const hass = withAppliances() as unknown as HomeAssistant;
    for (const [id, device] of extra) {
      (hass.devices as Record<string, unknown>)[id] = device;
      const slug = id.replace('-', '_');
      hass.entities[`switch.${slug}`] = {
        entity_id: `switch.${slug}`,
        device_id: id,
        platform: 'shelly',
      };
      hass.entities[`sensor.${slug}_power`] = {
        entity_id: `sensor.${slug}_power`,
        device_id: id,
        platform: 'shelly',
      };
      hass.states[`switch.${slug}`] = {
        entity_id: `switch.${slug}`,
        state: 'off',
        attributes: {},
        last_changed: '',
        last_updated: '',
      };
      hass.states[`sensor.${slug}_power`] = {
        entity_id: `sensor.${slug}_power`,
        state: '0',
        attributes: { device_class: 'power', unit_of_measurement: 'W' },
        last_changed: '',
        last_updated: '',
      };
    }
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const count = (path: string, index: number) =>
      (band(views, path)[0]!.cards[index]!['appliances'] as unknown[]).length;
    expect([count('home', 1), count('home', 3)]).toEqual([8, 5]);
    expect([count('appliances', 1), count('appliances', 3)]).toEqual([8, 7]);
  });

  it('gives a room its own appliances across under what it holds', async () => {
    const hass = withAppliances(
      demoHass({ more: DEMO_ROOMS }) as never,
    ) as unknown as HomeAssistant;
    (hass.devices['hc-dish'] as { area_id: string | null }).area_id = 'kitchen';
    hass.entities['sensor.wasserkocher_status'] = {
      ...hass.entities['sensor.wasserkocher_status']!,
      area_id: 'kitchen',
    };
    const { views } = await FluvyHomeStrategy.generate(
      { type: 'custom:fluvy-home' },
      hass as never,
    );
    const kitchen = band(views, 'room-kitchen');
    expect(kitchen).toHaveLength(1);
    // in the room the bands name what they hold and lead nowhere: every appliance of the room is in them
    expect(kitchen[0]!.cards.map((card) => [card['title'], card['path']])).toEqual([
      ['Large appliances', undefined],
      [undefined, undefined],
      ['Small appliances', undefined],
      [undefined, undefined],
    ]);
    expect(band(views, 'room-living_room')).toEqual([]);
  });

  it('leaves a house without appliances as it was: no band, no subview', async () => {
    const { views } = await FluvyHomeStrategy.generate({ type: 'custom:fluvy-home' }, house());
    expect(views.some((view) => view.sections.some((section) => section.column_span))).toBe(false);
    expect(views.some((view) => view.path === 'appliances')).toBe(false);
  });
});

/** The views' cards. */
const cardsIn = (views: readonly View[]) =>
  views.flatMap((view) => view.sections.flatMap((section) => section.cards));

/** Every entity a card names, however deep (an `entity`, a list of ids, a row's), as the house knows it. */
function namedIn(
  value: unknown,
  hass: { states: Record<string, unknown> },
  out = new Set<string>(),
) {
  if (typeof value === 'string') {
    if (value in hass.states) out.add(value);
  } else if (Array.isArray(value)) for (const item of value) namedIn(item, hass, out);
  else if (value && typeof value === 'object')
    for (const inner of Object.values(value)) namedIn(inner, hass, out);
  return out;
}

/**
 * What a room's page reaches: the entities its cards name, those of the appliances it draws whole, and the same on
 * the subviews its "N more" rows open.
 */
function reachedFrom(
  views: readonly View[],
  path: string,
  hass: { states: Record<string, unknown>; entities: Record<string, { device_id?: string }> },
): Set<string> {
  const page = views.find((view) => view.path === path)!;
  const lists = views.filter((view) => view.subview && view.back_path?.endsWith(`/${path}`));
  const cards = cardsIn([page, ...lists]);
  const reached = namedIn(cards, hass);
  const devices = new Set(
    cards.flatMap((card) =>
      ((card['appliances'] as { device: string }[] | undefined) ?? []).map(({ device }) => device),
    ),
  );
  for (const [id, entry] of Object.entries(hass.entities))
    if (entry.device_id && devices.has(entry.device_id)) reached.add(id);
  return reached;
}

describe('custom:fluvy-home strategy — a room’s page shows everything its card counts (#76)', () => {
  /** The reporter's garage: a temperature and humidity sensor, a smoke detector, a leak sensor and a garage door. */
  const garage = (more: readonly DemoEntity[] = []) => {
    const hass = house([
      entity(
        'sensor.garage_climate_temperature',
        '12.5',
        { device_class: 'temperature', unit_of_measurement: '°C' },
        { device_id: 'd-garage-climate' },
      ),
      entity(
        'sensor.garage_climate_humidity',
        '71',
        { device_class: 'humidity', unit_of_measurement: '%' },
        { device_id: 'd-garage-climate' },
      ),
      entity(
        'binary_sensor.garage_smoke',
        'off',
        { device_class: 'smoke', friendly_name: 'Smoke detector' },
        { area_id: 'garage' },
      ),
      entity(
        'binary_sensor.garage_leak',
        'off',
        { device_class: 'moisture', friendly_name: 'Leak sensor' },
        { area_id: 'garage' },
      ),
      entity(
        'cover.garage_main_door',
        'closed',
        { device_class: 'garage', friendly_name: 'Garage door', supported_features: 3 },
        { area_id: 'garage' },
      ),
      ...more,
    ]) as unknown as HomeAssistant;
    hass.areas['garage'] = { area_id: 'garage', name: 'Garage', icon: 'mdi:garage' } as never;
    hass.devices['d-garage-climate'] = {
      id: 'd-garage-climate',
      area_id: 'garage',
      name: 'Garage climate',
    } as never;
    return hass;
  };

  it('draws the reporter’s garage whole: its readings, the smoke and the leak on its Openings card, the door as a cover', async () => {
    const hass = garage();
    // the page's five, of which the card counts the door (#95: its sensors are not devices)
    expect(areaContents(hass, 'garage').entities).toHaveLength(5);
    expect(areaContents(hass, 'garage').devices).toEqual(['cover.garage_main_door']);
    const { views } = await generate({ type: 'custom:fluvy-rooms' }, hass as never);
    const cards = cardsIn(views.filter((view) => view.path === 'room-garage'));
    expect(cards.find((card) => card.type === 'custom:fluvy-readouts-card')?.['rows']).toEqual([
      { entity: 'sensor.garage_climate_temperature', name: 'Garage' },
      { entity: 'sensor.garage_climate_humidity', name: 'Garage' },
    ]);
    expect(cards.find((card) => card.type === 'custom:fluvy-openings-card')).toMatchObject({
      title: 'Sensors',
      entities: ['binary_sensor.garage_leak', 'binary_sensor.garage_smoke'],
    });
    expect(cards.find((card) => card.type === 'custom:fluvy-cover-card')).toMatchObject({
      entity: 'cover.garage_main_door',
    });
  });

  it('reaches every entity the room card counts, by one rule for both, on Home’s rooms and the rooms dashboard', async () => {
    // the garage besides: lights past their cap, a fan, a vacuum, a lock, a battery, a plug's USB outlet, a button
    const hass = garage([
      ...Array.from({ length: 9 }, (_, i) =>
        entity(
          `light.garage_${i + 1}`,
          'off',
          { supported_color_modes: ['onoff'] },
          { area_id: 'garage' },
        ),
      ),
      entity('fan.garage', 'off', {}, { area_id: 'garage' }),
      entity('vacuum.garage', 'docked', {}, { area_id: 'garage' }),
      entity('lock.garage_side', 'locked', {}, { area_id: 'garage' }),
      entity(
        'sensor.garage_smoke_battery',
        '90',
        { device_class: 'battery', unit_of_measurement: '%' },
        { area_id: 'garage' },
      ),
      entity(
        'switch.garage_plug',
        'on',
        { device_class: 'outlet' },
        { device_id: 'd-garage-plug' },
      ),
      entity(
        'switch.garage_plug_usb',
        'on',
        { friendly_name: 'Garage plug USB' },
        { device_id: 'd-garage-plug' },
      ),
      entity(
        'sensor.garage_plug_power',
        '12',
        { device_class: 'power', unit_of_measurement: 'W' },
        { device_id: 'd-garage-plug' },
      ),
      entity('button.garage_door_identify', 'unknown', {}, { area_id: 'garage' }),
    ]);
    hass.devices['d-garage-plug'] = {
      id: 'd-garage-plug',
      area_id: 'garage',
      name: 'Garage plug',
    } as never;
    const { entities: counted, devices } = areaContents(hass, 'garage');
    // the one rule: each entity the room shows in exactly one part of the page, or shown by a part's card; the devices
    // its card counts among them
    expect(devices.filter((id) => !counted.includes(id))).toEqual([]);
    const parts = roomParts(new HomeRegistry(hass), 'garage');
    const placed = [
      ...parts.thermostats,
      ...parts.lights,
      ...parts.covers,
      ...parts.gates,
      ...parts.fans,
      ...parts.players,
      ...parts.appliances,
      ...parts.readings,
      ...parts.openings,
      ...parts.cameras,
      ...parts.rest,
      ...parts.within,
    ];
    expect([...placed].sort()).toEqual([...counted].sort());
    expect(parts.rest).toEqual(
      expect.arrayContaining([
        'button.garage_door_identify',
        'lock.garage_side',
        'sensor.garage_smoke_battery',
        'switch.garage_plug_usb',
        'vacuum.garage',
      ]),
    );
    // the plug's power is its tile's readout
    expect(parts.within).toEqual(['sensor.garage_plug_power']);
    for (const type of ['custom:fluvy-home', 'custom:fluvy-rooms'] as const) {
      const { views } = await generate({ type }, hass as never);
      const reached = reachedFrom(views, 'room-garage', hass as never);
      expect(
        counted.filter((id) => !reached.has(id)),
        type,
      ).toEqual([]);
      // the lights past their cap are a "N more" row away, on a subview back to the room
      const page = cardsIn(views.filter((view) => view.path === 'room-garage'));
      expect(page.filter((card) => card.type === 'custom:fluvy-tile-card').length).toBeGreaterThan(
        0,
      );
      expect(page.find((card) => card['more_path'] !== undefined)).toMatchObject({
        type: 'custom:fluvy-entities-card',
        more: 3,
        more_path: '/fluvy-home/room-garage-lights',
      });
      const lights = views.find((view) => view.path === 'room-garage-lights')!;
      expect(lights).toMatchObject({
        subview: true,
        back_path: '/fluvy-home/room-garage',
        title: 'Lights',
      });
    }
  });
});

describe('custom:fluvy-home strategy — a room counts its devices, never an appliance’s controls (#95)', () => {
  /** A galley kitchen of two lights, a radio on its plug and a dishwasher of an integration the appliance card does not read. */
  const kitchen = () => {
    const dishwasher = (id: string, state: string, attributes: Record<string, unknown> = {}) =>
      entity(id, state, attributes, { device_id: 'd-dishwasher', platform: 'localthings' });
    const hass = house([
      entity(
        'light.galley_ceiling',
        'on',
        { supported_color_modes: ['onoff'] },
        { area_id: 'galley' },
      ),
      entity(
        'light.galley_counter',
        'off',
        { supported_color_modes: ['onoff'] },
        { area_id: 'galley' },
      ),
      entity('switch.galley_radio', 'off', { friendly_name: 'Radio' }, { device_id: 'd-radio' }),
      entity(
        'sensor.galley_radio_power',
        '0',
        { device_class: 'power', unit_of_measurement: 'W' },
        { device_id: 'd-radio' },
      ),
      dishwasher('switch.dishwasher_power', 'on', { friendly_name: 'Dishwasher Power' }),
      dishwasher('switch.dishwasher_extra_dry', 'on', { friendly_name: 'Dishwasher Extra dry' }),
      dishwasher('switch.dishwasher_half_load', 'off', { friendly_name: 'Dishwasher Half load' }),
      dishwasher('select.dishwasher_course', 'eco', { options: ['eco', 'auto', 'quick'] }),
      dishwasher('select.dishwasher_zone', 'all', { options: ['all', 'upper', 'lower'] }),
      dishwasher('number.dishwasher_delay_start', '0', { min: 0, max: 24, step: 1 }),
      dishwasher('button.dishwasher_start', 'unknown'),
      dishwasher('button.dishwasher_pause', 'unknown'),
      dishwasher('sensor.dishwasher_remaining', '42', { unit_of_measurement: 'min' }),
      dishwasher('binary_sensor.dishwasher_door', 'off', { device_class: 'door' }),
    ]) as unknown as HomeAssistant;
    hass.areas['kitchen'] = { area_id: 'galley', name: 'Kitchen' } as never;
    for (const id of ['d-radio', 'd-dishwasher'])
      hass.devices[id] = { id, area_id: 'galley', name: id.slice(2) } as never;
    return hass;
  };

  it('counts the lights and the radio’s plug, and keeps the dishwasher’s options off the room’s plugs', async () => {
    const hass = kitchen();
    const { entities, devices } = areaContents(hass, 'galley');
    expect(devices).toEqual([
      'light.galley_ceiling',
      'light.galley_counter',
      'switch.galley_radio',
    ]);
    const parts = roomParts(new HomeRegistry(hass), 'galley');
    expect(parts.appliances).toEqual(['switch.galley_radio']);
    // the page still reaches every one of them: the dishwasher's controls as rows, under Devices
    expect(parts.rest).toEqual(
      expect.arrayContaining(['switch.dishwasher_extra_dry', 'select.dishwasher_course']),
    );
    const { views } = await generate({ type: 'custom:fluvy-rooms' }, hass as never);
    const reached = reachedFrom(views, 'room-galley', hass as never);
    expect(entities.filter((id) => !reached.has(id))).toEqual([]);
    // Home's plugs, as the room's
    expect(new HomeRegistry(hass).applianceTiles).not.toContain('switch.dishwasher_power');
  });

  it('takes each room’s own include and exclude from the dashboard’s `rooms`: its card, its count and its page', async () => {
    const hass = kitchen();
    const galley = {
      include: ['switch.dishwasher_power'],
      exclude: ['light.galley_counter', 'select.dishwasher_*'],
    };
    const home = new HomeRegistry(hass, { galley });
    expect(home.contents('galley').devices).toEqual([
      'light.galley_ceiling',
      'switch.dishwasher_power',
      'switch.galley_radio',
    ]);
    const parts = roomParts(home, 'galley');
    expect(parts.lights).toEqual(['light.galley_ceiling']);
    expect(parts.rest).not.toContain('select.dishwasher_course');
    const { views } = await generate(
      { type: 'custom:fluvy-rooms', rooms: { galley } } as never,
      hass as never,
    );
    const card = views
      .flatMap((view) => view.sections.flatMap((section) => section.cards))
      .find((each) => each.type === 'custom:fluvy-room-card' && each['area'] === 'galley');
    expect(card).toMatchObject(galley);
    // its page reaches what its card counts, and nothing it leaves out
    const reached = reachedFrom(views, 'room-galley', hass as never);
    expect(reached.has('switch.dishwasher_power')).toBe(true);
    expect(reached.has('light.galley_counter')).toBe(false);
    expect(reached.has('select.dishwasher_course')).toBe(false);
    // a room the dashboard says nothing of, or says nonsense of, holds what its area does
    const stray = new HomeRegistry(hass, { galley: 'all', constructor: {} } as never);
    expect(stray.tuning('galley')).toEqual({});
    expect(stray.tuning('constructor')).toEqual({});
    expect(stray.contents('galley')).toEqual(areaContents(hass, 'galley'));
    expect(new HomeRegistry(hass, null as never).tuning('galley')).toEqual({});
    expect(new HomeRegistry(hass, { galley: null } as never).tuning('galley')).toEqual({});
  });
});

describe('custom:fluvy-home strategy — capped lists (#78)', () => {
  /** A house of twelve rooms, each with its temperature, its humidity and its light. */
  const twelveRooms = () => {
    const more: DemoEntity[] = [];
    const hass = house(
      Array.from({ length: 12 }, (_, i) => {
        const area = `room_${i + 1}`;
        more.push(
          entity(
            `sensor.${area}_humidity`,
            String(40 + i),
            { device_class: 'humidity', unit_of_measurement: '%' },
            { area_id: area },
          ),
          entity(`light.${area}`, 'off', { supported_color_modes: ['onoff'] }, { area_id: area }),
        );
        return entity(
          `sensor.${area}_temperature`,
          String(20 + i / 10),
          { device_class: 'temperature', unit_of_measurement: '°C' },
          { area_id: area },
        );
      }).concat(more),
    ) as unknown as HomeAssistant;
    for (let i = 1; i <= 12; i++)
      hass.areas[`room_${i}`] = { area_id: `room_${i}`, name: `Room ${i}` } as never;
    return hass;
  };
  const moreRows = (cards: readonly Record<string, unknown>[]) =>
    cards.filter((card) => card['more_path'] !== undefined);

  it('ends a capped list with "N more", which opens a subview of every one, back to the view', async () => {
    const hass = twelveRooms();
    const home = new HomeRegistry(hass);
    const { views } = await generate({ type: 'custom:fluvy-home' }, hass as never);
    const climate = cardsIn(views.filter((view) => view.path === 'climate'));
    const humidity = climate.filter((card) => card.type === 'custom:fluvy-humidity-card');
    expect(humidity).toHaveLength(3);
    expect(moreRows(climate)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'custom:fluvy-entities-card',
          more: home.humidities.length - 3,
          more_path: '/fluvy-home/climate-humidity',
        }),
        expect.objectContaining({
          more: home.temperatures.length - 4,
          more_path: '/fluvy-home/climate-temperatures',
        }),
      ]),
    );
    const every = views.find((view) => view.path === 'climate-humidity')!;
    expect(every).toMatchObject({
      subview: true,
      back_path: '/fluvy-home/climate',
      title: 'Humidity',
    });
    expect(
      cardsIn([every])
        .filter((card) => card.type === 'custom:fluvy-humidity-card')
        .map((card) => card['entity']),
    ).toEqual(home.humidities);
    // its way back first, after the greeting
    expect(every.sections[0]!.cards[1]).toMatchObject({
      type: 'custom:fluvy-heading-card',
      title: 'Climate',
      path: '/fluvy-home/climate',
    });
    // Home's lights: six tiles, the rest on a subview of every light by room; never a tab
    const homeCards = cardsIn(views.filter((view) => view.path === 'home'));
    expect(moreRows(homeCards).map((card) => card['more_path'])).toContain(
      '/fluvy-home/home-lights',
    );
    const lights = namedIn(
      cardsIn(views.filter((view) => view.path === 'home-lights')),
      hass as never,
    );
    expect(home.lights.filter((id) => !lights.has(id))).toEqual([]);
    const tabs = views.filter((view) => !view.subview).map((view) => view.path);
    expect(tabs).not.toContain('climate-humidity');
    expect(tabs).not.toContain('home-lights');
  });

  it('raises a list’s cap, lifts it, or lifts them all (`caps`)', async () => {
    const hass = twelveRooms();
    const home = new HomeRegistry(hass);
    const raised = await generate(
      { type: 'custom:fluvy-home', caps: { humidity: 20, temperatures: 'none' } },
      hass as never,
    );
    const climate = cardsIn(raised.views.filter((view) => view.path === 'climate'));
    expect(climate.filter((card) => card.type === 'custom:fluvy-humidity-card')).toHaveLength(
      home.humidities.length,
    );
    expect(climate.filter((card) => card.type === 'custom:fluvy-sensor-card')).toHaveLength(
      home.temperatures.length,
    );
    expect(moreRows(climate)).toEqual([]);
    expect(raised.views.some((view) => view.path.startsWith('climate-'))).toBe(false);
    // the others keep the house's
    expect(raised.views.some((view) => view.path === 'home-lights')).toBe(true);
    const whole = await generate({ type: 'custom:fluvy-home', caps: 'none' }, hass as never);
    expect(moreRows(cardsIn(whole.views))).toEqual([]);
    expect(
      whole.views.filter((view) => view.subview).every((view) => view.path.startsWith('room-')),
    ).toBe(true);
    // a cap that is no number is the house's
    const nonsense = await generate(
      { type: 'custom:fluvy-home', caps: { humidity: 0, fridges: 3 } as never },
      hass as never,
    );
    expect(
      cardsIn(nonsense.views.filter((view) => view.path === 'climate')).filter(
        (card) => card.type === 'custom:fluvy-humidity-card',
      ),
    ).toHaveLength(CAPS.humidity);
  });

  it('shows one past the cap of a list of rows or tiles, never a "1 more" row', async () => {
    // seven lights in all: Home's six and the one past them
    const lights = (count: number) =>
      Array.from({ length: count - new HomeRegistry(house()).lights.length }, (_, i) =>
        entity(`light.l${i}`, 'off', { supported_color_modes: ['onoff'] }),
      );
    const lightsMore = async (count: number) =>
      moreRows(
        cardsIn(
          (
            await generate({ type: 'custom:fluvy-home' }, house(lights(count)) as never)
          ).views.filter((view) => view.path === 'home'),
        ),
      ).filter((card) => card['more_path'] === '/fluvy-home/home-lights');
    expect(await lightsMore(CAPS.lights + 1)).toEqual([]);
    expect((await lightsMore(CAPS.lights + 2)).map((card) => card['more'])).toEqual([2]);
  });
});
