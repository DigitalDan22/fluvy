import { describe, expect, it } from 'vitest';
import {
  areaClimate,
  areaContents,
  areaEntities,
  areaIndex,
  areaOf,
  areasInOrder,
  climateAttribute,
  floorsInOrder,
  holdsSomething,
  isLoad,
  isRoomDevice,
  usableEntity,
  type Registries,
} from '../areas.js';

const state = (id: string, value: string, attributes: Record<string, unknown> = {}) => [
  id,
  { entity_id: id, state: value, attributes, last_changed: '', last_updated: '' },
];

function house(): Registries {
  return {
    states: Object.fromEntries([
      state('light.sofa', 'on'),
      state('light.desk', 'off'),
      state('switch.fan_plug', 'on'),
      state('cover.blind', 'open'),
      state('sensor.room_temperature', '21', { device_class: 'temperature' }),
      state('sensor.room_humidity', '48', { device_class: 'humidity' }),
      state('sensor.hidden_power', '3'),
      state('sensor.diagnostic_rssi', '-60'),
      state('switch.config_led', 'on'),
      state('light.hall', 'on'),
    ]) as Registries['states'],
    entities: {
      'light.sofa': { entity_id: 'light.sofa', device_id: 'd1' },
      'light.desk': { entity_id: 'light.desk', area_id: 'office', device_id: 'd1' },
      'switch.fan_plug': { entity_id: 'switch.fan_plug', device_id: 'd1' },
      'cover.blind': { entity_id: 'cover.blind', area_id: 'living' },
      'sensor.room_temperature': { entity_id: 'sensor.room_temperature', area_id: 'living' },
      'sensor.room_humidity': { entity_id: 'sensor.room_humidity', area_id: 'living' },
      'sensor.hidden_power': { entity_id: 'sensor.hidden_power', area_id: 'living', hidden: true },
      'sensor.diagnostic_rssi': {
        entity_id: 'sensor.diagnostic_rssi',
        area_id: 'living',
        entity_category: 'diagnostic',
      },
      'switch.config_led': {
        entity_id: 'switch.config_led',
        area_id: 'living',
        entity_category: 'config',
      },
      'light.hall': { entity_id: 'light.hall', area_id: 'hall' },
    },
    devices: { d1: { id: 'd1', name: 'Hub', name_by_user: null, area_id: 'living' } },
    areas: {
      living: { area_id: 'living', name: 'Living room', floor_id: 'ground' },
      office: {
        area_id: 'office',
        name: 'Office',
        floor_id: 'upstairs',
        temperature_entity_id: 'sensor.room_temperature',
      },
      hall: { area_id: 'hall', name: 'Hall', floor_id: 'ground' },
      attic: { area_id: 'attic', name: 'Attic' },
    },
    floors: {
      upstairs: { floor_id: 'upstairs', name: 'Upstairs', level: 1 },
      ground: { floor_id: 'ground', name: 'Ground', level: 0 },
      roof: { floor_id: 'roof', name: 'Roof' },
    },
  };
}

describe('the house by its rooms', () => {
  it("puts an entity in its own area, else its device's", () => {
    const hass = house();
    expect(areaOf(hass, 'light.sofa')).toBe('living');
    expect(areaOf(hass, 'light.desk')).toBe('office');
    expect(areaOf(hass, 'sensor.nowhere')).toBeUndefined();
    expect(areaOf(undefined, 'light.sofa')).toBeUndefined();
  });

  it('shows what a dashboard should: hidden and config out, diagnostic on request', () => {
    const hass = house();
    expect(areaEntities(hass, 'living')).toEqual([
      'cover.blind',
      'light.sofa',
      'sensor.room_humidity',
      'sensor.room_temperature',
      'switch.fan_plug',
    ]);
    expect(areaEntities(hass, 'living', { diagnostic: true })).toContain('sensor.diagnostic_rssi');
    expect(areaEntities(hass, 'living', { hidden: true })).toContain('sensor.hidden_power');
    expect(areaEntities(hass, 'living', { domains: ['light'] })).toEqual(['light.sofa']);
    expect(usableEntity(hass, 'switch.config_led')).toBe(false);
    expect(usableEntity(hass, 'sensor.nowhere')).toBe(false);
  });

  it('indexes once per registries and again when they are new objects', () => {
    const hass = house();
    const first = areaIndex(hass);
    expect(areaIndex(hass)).toBe(first);
    expect(areaIndex({ ...hass, areas: { ...hass.areas } })).toBe(first);
    expect(areaIndex({ ...hass, states: { ...hass.states } })).toBe(first);
    expect(areaIndex({ ...hass, devices: { ...hass.devices } })).not.toBe(first);
    expect(areaIndex({ ...hass, entities: { ...hass.entities } })).not.toBe(first);
    const { states, devices, areas } = hass;
    expect(areaIndex({ states, devices, areas } as Registries)).toBe(
      areaIndex({ states, devices, areas } as Registries),
    );
  });

  it('indexes the registries, not the states: a state that comes later is found (#39)', () => {
    const full = house();
    const without = (id: string): Registries => ({
      ...full,
      states: Object.fromEntries(Object.entries(full.states).filter(([key]) => key !== id)),
    });
    // Home Assistant starting: the same registries, a state not there yet — and an earlier reader asks first
    expect(areaEntities(without('sensor.room_humidity'), 'living')).not.toContain(
      'sensor.room_humidity',
    );
    expect(areaEntities(full, 'living')).toContain('sensor.room_humidity');
    expect(areaIndex(full).get('living')).toContain('sensor.room_humidity');
    // a registry entry whose state leaves is read as gone, without a throw
    expect(areaEntities(without('light.sofa'), 'living')).not.toContain('light.sofa');
  });

  it("finds an area's entities by their own area, else their device's", () => {
    const hass: Registries = {
      ...house(),
      entities: {
        ...house().entities,
        'light.desk': { entity_id: 'light.desk', area_id: 'office', device_id: 'd1' },
        'switch.lost': { entity_id: 'switch.lost', device_id: 'missing' },
      },
      states: { ...house().states, 'switch.lost': house().states['light.desk']! },
    };
    expect(areaOf(hass, 'light.desk')).toBe('office');
    expect(areaOf(hass, 'switch.lost')).toBeUndefined();
    // the id is Home Assistant's slug, the name the person's: "Küche" is `kuche`
    const kitchen: Registries = {
      ...hass,
      areas: { kuche: { area_id: 'kuche', name: 'Küche' } },
      entities: { 'light.sofa': { entity_id: 'light.sofa', area_id: 'kuche' } },
    };
    expect(areaEntities(kitchen, 'kuche')).toEqual(['light.sofa']);
  });

  it('counts what a room holds, leads with its lights, and what it keeps out', () => {
    const contents = areaContents(house(), 'living');
    expect(contents).toEqual({
      entities: [
        'cover.blind',
        'light.sofa',
        'sensor.room_humidity',
        'sensor.room_temperature',
        'switch.fan_plug',
      ],
      // its devices: never its readings
      devices: ['cover.blind', 'light.sofa', 'switch.fan_plug'],
      controls: ['light.sofa', 'switch.fan_plug', 'cover.blind'],
      on: 3,
      climate: { temperature: 'sensor.room_temperature', humidity: 'sensor.room_humidity' },
      // the hidden power and the diagnostic signal; never the config LED
      keptOut: 2,
    });
    expect(holdsSomething(contents)).toBe(true);
    expect(holdsSomething(areaContents(house(), 'attic'))).toBe(false);
  });

  it('counts what a person calls the room’s devices: never an appliance’s own controls, nor a sensor (#95)', () => {
    const base = house();
    const seeds: Array<[string, string, Record<string, unknown>?, Record<string, unknown>?]> = [
      ['light.kitchen', 'on'],
      ['switch.kettle', 'on', {}, { device_id: 'plug' }],
      ['sensor.kettle_power', '1800', { device_class: 'power' }, { device_id: 'plug' }],
      // a plug's settings are filed as such: it stays a plug
      ['select.kettle_power_on', 'previous', {}, { device_id: 'plug', entity_category: 'config' }],
      // an appliance of an integration the appliance card does not read (LocalThings): its options are switches beside
      // its programme, its delay and its start
      ['switch.dishwasher_power', 'on', {}, { device_id: 'dishwasher' }],
      ['switch.dishwasher_extra_dry', 'on', {}, { device_id: 'dishwasher' }],
      ['switch.dishwasher_sanitize', 'off', {}, { device_id: 'dishwasher' }],
      ['select.dishwasher_program', 'eco', {}, { device_id: 'dishwasher' }],
      ['select.dishwasher_zone', 'all', {}, { device_id: 'dishwasher' }],
      ['number.dishwasher_delay', '0', {}, { device_id: 'dishwasher' }],
      ['button.dishwasher_start', 'unknown', {}, { device_id: 'dishwasher' }],
      ['sensor.dishwasher_remaining', '42', {}, { device_id: 'dishwasher' }],
      [
        'binary_sensor.dishwasher_door',
        'off',
        { device_class: 'door' },
        { device_id: 'dishwasher' },
      ],
      // its socket says it is one
      ['switch.dishwasher_socket', 'on', { device_class: 'outlet' }, { device_id: 'dishwasher' }],
      ['media_player.kitchen', 'idle', {}, { device_id: 'speaker' }],
      ['automation.kitchen_lights', 'on'],
      ['scene.kitchen_dinner', '2026-11-03T20:00:00+00:00'],
      ['input_boolean.kitchen_guests', 'on'],
      ['lock.kitchen_door', 'unlocked'],
      ['valve.kitchen_water', 'open'],
      ['switch.party', 'off'],
    ];
    const hass: Registries = {
      ...base,
      states: Object.fromEntries(
        seeds.map(([id, value, attributes]) => state(id, value, attributes)),
      ) as Registries['states'],
      entities: Object.fromEntries(
        seeds.map(([id, , , entry]) => [id, { entity_id: id, area_id: 'kitchen', ...entry }]),
      ),
      devices: {},
      areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen' } },
    };
    const kitchen = areaContents(hass, 'kitchen');
    expect(kitchen.entities).toHaveLength(seeds.length - 1);
    expect(kitchen.devices).toEqual([
      'light.kitchen',
      'media_player.kitchen',
      'switch.dishwasher_socket',
      'switch.kettle',
      'switch.party',
    ]);
    expect(kitchen.controls).toEqual([
      'light.kitchen',
      'switch.dishwasher_socket',
      'switch.kettle',
      'switch.party',
    ]);
    expect(isLoad(hass, 'switch.kettle')).toBe(true);
    expect(isLoad(hass, 'switch.dishwasher_extra_dry')).toBe(false);
    expect(isRoomDevice(hass, 'switch.dishwasher_power')).toBe(false);
    expect(isRoomDevice(hass, 'sensor.kettle_power')).toBe(false);
    // what the person hides of the appliance still says what it is
    const hidden: Registries = {
      ...hass,
      entities: Object.fromEntries(
        Object.entries(hass.entities).map(([id, entry]) => [
          id,
          /^(select|number|button)\.dishwasher/.test(id) ? { ...entry, hidden: true } : entry,
        ]),
      ),
    };
    expect(isLoad(hidden, 'switch.dishwasher_extra_dry')).toBe(false);
  });

  /** A house of one area whose entities are seeded with their state, attributes and registry entry. */
  type Seed = [id: string, state: string, attributes?: Record<string, unknown>, entry?: object];
  const seeded = (seeds: readonly Seed[], more: Partial<Registries> = {}): Registries => ({
    ...house(),
    states: Object.fromEntries(
      seeds.map(([id, value, attributes]) => state(id, value, attributes)),
    ) as Registries['states'],
    entities: Object.fromEntries(
      seeds.map(([id, , , entry]) => [id, { entity_id: id, area_id: 'kitchen', ...entry }]),
    ),
    devices: {},
    areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen' } },
    ...more,
  });

  it('counts a plug whose integration files its timer or power-on behaviour as no setting, never an appliance’s options', () => {
    const on = (device: string) => ({ device_id: device });
    const hass = seeded([
      // Tuya: a countdown and the relay's power-on state, no category, beside its power and its energy
      ['switch.tuya_plug', 'on', {}, on('tuya')],
      ['number.tuya_plug_countdown', '0', {}, on('tuya')],
      ['select.tuya_plug_relay_status', 'memory', {}, on('tuya')],
      ['sensor.tuya_plug_power', '12', { device_class: 'power' }, on('tuya')],
      ['sensor.tuya_plug_energy', '3.2', { device_class: 'energy' }, on('tuya')],
      // Zigbee2MQTT: its power-on behaviour beside its energy, read as a diagnostic
      ['switch.z2m_plug', 'off', {}, on('z2m')],
      ['select.z2m_plug_power_on_behavior', 'off', {}, on('z2m')],
      [
        'sensor.z2m_plug_energy',
        '1.1',
        { device_class: 'energy' },
        { ...on('z2m'), entity_category: 'diagnostic' },
      ],
      // a relay with a setting and nothing measured: nothing says it is a plug
      ['switch.relay', 'off', {}, on('relay')],
      ['select.relay_power_on', 'off', {}, on('relay')],
      // a washer that measures its power: one option switch, its programme and its start
      ['switch.washer_child_lock', 'off', {}, on('washer')],
      ['select.washer_programme', 'cotton', {}, on('washer')],
      ['button.washer_start', 'unknown', {}, on('washer')],
      ['sensor.washer_power', '1900', { device_class: 'power' }, on('washer')],
      // a dishwasher that measures its energy: its option switches beside its programme
      ['switch.dishwasher_extra_dry', 'on', {}, on('dishwasher')],
      ['switch.dishwasher_sanitize', 'off', {}, on('dishwasher')],
      ['select.dishwasher_program', 'eco', {}, on('dishwasher')],
      ['sensor.dishwasher_energy', '0.9', { device_class: 'energy' }, on('dishwasher')],
    ]);
    expect(isLoad(hass, 'switch.tuya_plug')).toBe(true);
    expect(isLoad(hass, 'switch.z2m_plug')).toBe(true);
    expect(isLoad(hass, 'switch.relay')).toBe(false);
    expect(isLoad(hass, 'switch.washer_child_lock')).toBe(false);
    expect(isLoad(hass, 'switch.dishwasher_extra_dry')).toBe(false);
    expect(areaContents(hass, 'kitchen').devices).toEqual(['switch.tuya_plug', 'switch.z2m_plug']);
  });

  it('takes a room’s own say: what it includes counts, what it excludes leaves, by id, pattern, device or domain (#95)', () => {
    const hass = seeded(
      [
        ['light.kitchen', 'on'],
        ['media_player.kitchen_radio', 'playing'],
        ['valve.kitchen_water', 'open'],
        ['sensor.fridge_temperature', '4', { device_class: 'temperature' }],
        ['sensor.kitchen_temperature', '21', { device_class: 'temperature' }],
        ['switch.dishwasher_extra_dry', 'on', {}, { device_id: 'dishwasher' }],
        ['switch.dishwasher_sanitize', 'off', {}, { device_id: 'dishwasher' }],
        ['select.dishwasher_program', 'eco', {}, { device_id: 'dishwasher' }],
        ['light.hall', 'off', {}, { area_id: 'hall' }],
        ['switch.hall_hidden', 'off', {}, { area_id: 'hall', hidden: true }],
      ],
      {
        devices: {
          dishwasher: { id: 'dishwasher', area_id: null, name: 'Dishwasher', name_by_user: null },
        },
      },
    );
    const contents = (include?: unknown[], exclude?: unknown[]) =>
      areaContents(hass, 'kitchen', {
        include: include as string[] | undefined,
        exclude: exclude as string[] | undefined,
      });
    expect(contents().devices).toEqual(['light.kitchen', 'media_player.kitchen_radio']);
    // a domain, a pattern of ids, an entity: out of the count and out of the room, its reading taken from what is left
    const tuned = contents(undefined, [
      'media_player',
      'switch.dishwasher_*',
      'sensor.fridge_temperature',
    ]);
    expect(tuned.devices).toEqual(['light.kitchen']);
    expect(tuned.entities).toEqual([
      'light.kitchen',
      'select.dishwasher_program',
      'sensor.kitchen_temperature',
      'valve.kitchen_water',
    ]);
    expect(contents().climate.temperature).toBe('sensor.fridge_temperature');
    expect(tuned.climate.temperature).toBe('sensor.kitchen_temperature');
    // a device: all of it out
    expect(contents(undefined, ['dishwasher']).entities).not.toContain('select.dishwasher_program');
    // counted where the rule leaves them out: the valve by its id, the dishwasher's every entity by its device; an
    // entity named whole from another room, even hidden
    expect(
      contents(['valve.kitchen_water', 'dishwasher', 'light.hall', 'switch.hall_hidden']).devices,
    ).toEqual([
      'light.hall',
      'light.kitchen',
      'media_player.kitchen_radio',
      'select.dishwasher_program',
      'switch.dishwasher_extra_dry',
      'switch.dishwasher_sanitize',
      'switch.hall_hidden',
      'valve.kitchen_water',
    ]);
    // what it includes it keeps, whatever it excludes; a pattern reads the room's own, never the house's
    expect(
      contents(['switch.dishwasher_sanitize', 'light.*'], ['switch', 'light']).devices,
    ).toEqual(['light.kitchen', 'media_player.kitchen_radio', 'switch.dishwasher_sanitize']);
    // nothing a config could stray into names anything, nor reads as an expression
    expect(contents([42, null, '', { id: 'x' }], ['', 'light.(kitchen)', '.*']).devices).toEqual(
      contents().devices,
    );
  });

  it('holds a room with a reading and nothing else, and none with only a config entity', () => {
    const base = house();
    const hass: Registries = {
      ...base,
      states: {
        ...base.states,
        'sensor.cellar_temperature': {
          ...base.states['sensor.room_temperature']!,
          entity_id: 'sensor.cellar_temperature',
        },
        'switch.cellar_led': {
          ...base.states['switch.config_led']!,
          entity_id: 'switch.cellar_led',
        },
      },
      entities: {
        ...base.entities,
        'sensor.cellar_temperature': {
          entity_id: 'sensor.cellar_temperature',
          area_id: 'cellar',
          hidden: true,
        },
        'switch.cellar_led': {
          entity_id: 'switch.cellar_led',
          area_id: 'store',
          entity_category: 'config',
        },
        // a registry entry with no state: neither shown nor counted
        'sensor.store_ghost': { entity_id: 'sensor.store_ghost', area_id: 'store', hidden: true },
      },
      areas: {
        ...base.areas,
        cellar: {
          area_id: 'cellar',
          name: 'Cellar',
          temperature_entity_id: 'sensor.cellar_temperature',
        },
        store: { area_id: 'store', name: 'Store' },
      },
    };
    const cellar = areaContents(hass, 'cellar');
    expect(cellar.entities).toEqual([]);
    expect(cellar.climate).toEqual({ temperature: 'sensor.cellar_temperature' });
    expect(holdsSomething(cellar)).toBe(true);
    const store = areaContents(hass, 'store');
    expect(holdsSomething(store)).toBe(false);
    expect(store.keptOut).toBe(0);
  });

  it("finds a room's climate by the registry, else by class", () => {
    const hass = house();
    expect(areaClimate(hass, 'living')).toEqual({
      temperature: 'sensor.room_temperature',
      humidity: 'sensor.room_humidity',
    });
    expect(areaClimate(hass, 'office')).toEqual({ temperature: 'sensor.room_temperature' });
    expect(areaClimate(hass, 'hall')).toEqual({});
  });

  describe("a room's climate", () => {
    const sensor = (id: string, value: string, attributes: Record<string, unknown>) =>
      state(id, value, attributes) as [string, Registries['states'][string]];
    const room = (
      seeds: ReadonlyArray<[string, Registries['states'][string]]>,
      entries: Record<string, Partial<Registries['entities'][string]>> = {},
      area: Partial<Registries['areas'][string]> = {},
    ): Registries => ({
      states: Object.fromEntries(seeds),
      entities: Object.fromEntries(
        [...seeds.map(([id]) => id), ...Object.keys(entries)].map((id) => [
          id,
          { entity_id: id, area_id: 'den', ...entries[id] },
        ]),
      ),
      devices: {},
      areas: { den: { area_id: 'den', name: 'Den', ...area } },
    });

    it('takes the sensor the area names even hidden or diagnostic, while it has a state', () => {
      const seeds = [
        sensor('sensor.a', '20', { device_class: 'temperature' }),
        sensor('sensor.b', '21', { device_class: 'temperature' }),
        sensor('sensor.h', '50', { device_class: 'humidity' }),
      ];
      const hass = room(
        seeds,
        { 'sensor.b': { hidden: true }, 'sensor.h': { entity_category: 'diagnostic' } },
        { temperature_entity_id: 'sensor.b', humidity_entity_id: 'sensor.h' },
      );
      expect(areaClimate(hass, 'den')).toEqual({ temperature: 'sensor.b', humidity: 'sensor.h' });
      // named but without a state: the next rung
      const ghost = room(seeds, {}, { temperature_entity_id: 'sensor.gone' });
      expect(areaClimate(ghost, 'den').temperature).toBe('sensor.a');
    });

    it('prefers a sensor that reads over a dead one, and keeps the dead one rather than none', () => {
      const dead = sensor('sensor.a_temp', 'unavailable', { device_class: 'temperature' });
      const live = sensor('sensor.b_temp', '19.8', { device_class: 'temperature' });
      expect(areaClimate(room([dead, live]), 'den').temperature).toBe('sensor.b_temp');
      expect(areaClimate(room([dead]), 'den').temperature).toBe('sensor.a_temp');
    });

    it('never picks a diagnostic or a hidden sensor by itself, nor a humidity by its "%"', () => {
      const hass = room(
        [
          sensor('sensor.chip', '41', { device_class: 'temperature', unit_of_measurement: '°C' }),
          sensor('sensor.valve', '60', { unit_of_measurement: '%' }),
          sensor('sensor.plain', '20', { unit_of_measurement: '°C' }),
        ],
        { 'sensor.chip': { entity_category: 'diagnostic' } },
      );
      expect(areaClimate(hass, 'den')).toEqual({});
    });

    it('reads a thermostat-only room from the thermostat, and a humidity only where it measures one', () => {
      const thermostat = sensor('climate.den', 'heat', {
        current_temperature: 20.5,
        current_humidity: 44,
      });
      expect(areaClimate(room([thermostat]), 'den')).toEqual({
        temperature: 'climate.den',
        humidity: 'climate.den',
      });
      const bare = sensor('climate.den', 'heat', { current_temperature: 20.5 });
      expect(areaClimate(room([bare]), 'den')).toEqual({ temperature: 'climate.den' });
      // an unreadable thermostat keeps its temperature and, as it cannot say whether it measures one, its humidity
      // (dashes: the room keeps its size, 1.9); a sensor always comes first
      const off = sensor('climate.den', 'unavailable', {});
      expect(areaClimate(room([off]), 'den')).toEqual({
        temperature: 'climate.den',
        humidity: 'climate.den',
      });
      const humidifier = sensor('humidifier.den', 'on', { current_humidity: 51 });
      const probe = sensor('sensor.den_t', '19', { device_class: 'temperature' });
      expect(areaClimate(room([thermostat, humidifier, probe]), 'den')).toEqual({
        temperature: 'sensor.den_t',
        humidity: 'climate.den',
      });
      expect(climateAttribute('climate.den', 'temperature')).toBe('current_temperature');
      expect(climateAttribute('humidifier.den', 'humidity')).toBe('current_humidity');
      expect(climateAttribute('humidifier.den', 'temperature')).toBeUndefined();
      expect(climateAttribute('sensor.den_t', 'temperature')).toBeUndefined();
    });
  });

  it('orders floors by level and areas floor by floor, the unplaced last', () => {
    const hass = house();
    expect(floorsInOrder(hass).map((floor) => floor.floor_id)).toEqual([
      'ground',
      'upstairs',
      'roof',
    ]);
    expect(areasInOrder(hass).map((area) => area.area_id)).toEqual([
      'hall',
      'living',
      'office',
      'attic',
    ]);
    const { states, entities, devices, areas } = hass;
    expect(floorsInOrder({ states, entities, devices, areas })).toEqual([]);
  });
});
