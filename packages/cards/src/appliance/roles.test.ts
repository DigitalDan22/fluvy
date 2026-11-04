import { describe, expect, it } from 'vitest';
import {
  allFixtures,
  device,
  entriesFor,
  houseOf,
  mieleCoffee,
  stOven,
  stWasher,
  whirlpoolOven,
} from './fixtures/index.js';
import {
  applianceDevice,
  applianceEntities,
  deviceSlug,
  partOf,
  platformOf,
  roleOf,
  slugify,
  withoutSlug,
  type Candidate,
} from './roles.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const FIXTURES = allFixtures(NOW);
const HOUSE = houseOf(FIXTURES, NOW);

const candidate = (given: Partial<Candidate> & { id: string }): Candidate => ({
  domain: given.id.slice(0, given.id.indexOf('.')),
  key: undefined,
  object: given.id.slice(given.id.indexOf('.') + 1),
  ...given,
});

describe('an appliance’s entities', () => {
  it('are fixtures of one house: no two of its entities share an id', () => {
    const ids = FIXTURES.flatMap((fixture) => fixture.entities.map((entry) => entry.entity_id));
    expect(ids.length).toBe(new Set(ids).size);
    for (const fixture of FIXTURES)
      for (const [id] of fixture.states)
        expect(
          fixture.entities.map((entry) => entry.entity_id),
          fixture.title,
        ).toContain(id);
  });

  it.each(
    FIXTURES.filter((fixture) => fixture.expected.roles).map((fixture) => [fixture.title, fixture]),
  )('finds %s’s by its integration’s words, whatever language its ids are in', (_, fixture) => {
    const found = applianceEntities(HOUSE, fixture.device.id);
    expect(found.roles).toMatchObject(fixture.expected.roles ?? {});
  });

  it('never takes a system entity for a role, by its key or its id without the device’s name', () => {
    expect(
      roleOf(candidate({ id: 'button.x_firmware_update', key: 'firmware_update' })),
    ).toBeUndefined();
    expect(roleOf(candidate({ id: 'button.washer_reboot', object: 'reboot' }))).toBeUndefined();
    expect(
      roleOf(candidate({ id: 'button.washer_restart_system', object: 'restart_system' })),
    ).toBeUndefined();
    // a word of a name is not one: "update" inside another word, "system" inside the device's name
    expect(
      roleOf(candidate({ id: 'sensor.updater_state', object: 'updater_state', platform: 'x' })),
    ).toBe('state');
  });

  it('reads the "Coffee system" by its ids without its name: every id says "system", none is a system’s', () => {
    const found = applianceEntities(HOUSE, 'miele-coffee');
    expect(found.roles).toMatchObject(mieleCoffee(NOW).expected.roles ?? {});
    expect(found.counters).toEqual(['sensor.coffee_system_descaling_cycles']);
    // read whole, the id would be a system's
    expect(
      roleOf(
        candidate({
          id: 'sensor.coffee_system_status',
          object: 'coffee_system_status',
          platform: 'x',
        }),
      ),
    ).toBeUndefined();
  });

  it('knows a device’s slug by what its entities share, else by its name', () => {
    expect(
      deviceSlug(['coffee_system_status', 'coffee_system_power', 'coffee_system'], 'Mine'),
    ).toBe('coffee_system');
    // one entity alone: its name made an id
    expect(deviceSlug(['wasserkocher_status'], 'Wasserkocher')).toBe('wasserkocher');
    expect(slugify('Kühl-Gefrier-Kombination')).toBe('kuhl_gefrier_kombination');
    expect(slugify('Çamaşır makinesi')).toBe('camasir_makinesi');
    expect(withoutSlug('waschmaschine', 'waschmaschine')).toBe('');
    expect(withoutSlug('waschmaschine_run_state', 'waschmaschine')).toBe('run_state');
    expect(withoutSlug('other_state', 'waschmaschine')).toBe('other_state');
  });

  it('ranks its words: the integration’s own over a shared key, a key over an id, an id over what it is', () => {
    expect(
      partOf(
        candidate({ id: 'binary_sensor.w_mobilstart', key: 'mobile_start', platform: 'miele' }),
      ),
    ).toEqual({ role: 'remote', rank: 4 });
    expect(
      partOf(
        candidate({
          id: 'binary_sensor.w_fernsteuerung',
          key: 'remote_control',
          platform: 'miele',
        }),
      ),
    ).toEqual({ role: 'remote', rank: 3 });
    expect(
      partOf(candidate({ id: 'sensor.w_end_time', object: 'end_time', platform: 'x' })),
    ).toEqual({
      role: 'finish',
      rank: 2,
    });
    expect(
      partOf(
        candidate({ id: 'binary_sensor.w_tur', object: 'tur', deviceClass: 'door', platform: 'x' }),
      ),
    ).toEqual({ role: 'door', rank: 0 });
    // read strictly, what an entity is says nothing but a power reading (a plug's, anywhere)
    expect(
      roleOf(
        candidate({ id: 'binary_sensor.w_tur', object: 'tur', deviceClass: 'door' }),
        'strict',
      ),
    ).toBeUndefined();
    expect(roleOf(candidate({ id: 'sensor.w_power', unit: 'W' }), 'strict')).toBe('watts');
  });

  it('never acts through what Home Assistant files under diagnostics', () => {
    expect(
      roleOf(
        candidate({ id: 'button.w_stop', key: 'stop', platform: 'matter', category: 'diagnostic' }),
      ),
    ).toBeUndefined();
    expect(roleOf(candidate({ id: 'button.w_stop', key: 'stop', platform: 'matter' }))).toBe(
      'stop',
    );
  });

  it('reads a second drum or cavity apart: SmartThings’ upper washer, its second cavity, Whirlpool’s lower oven', () => {
    expect(applianceEntities(HOUSE, 'st-washer').twin).toEqual({
      unit: 'upper',
      roles: {
        state: 'sensor.samsung_waschmaschine_maschinenstatus_obere_waschmaschine',
        phase: 'sensor.samsung_waschmaschine_auftragsstatus_obere_waschmaschine',
        finish: 'sensor.samsung_waschmaschine_fertigstellungszeit_obere_waschmaschine',
        remote: 'binary_sensor.samsung_waschmaschine_fernsteuerung_obere_waschmaschine',
      },
    });
    expect(applianceEntities(HOUSE, 'st-oven').twin).toMatchObject({
      unit: 'second',
      roles: {
        state: 'sensor.samsung_backofen_maschinenstatus_zweiter_garraum',
        target: 'sensor.samsung_backofen_sollwert_zweiter_garraum',
        temperature: 'sensor.samsung_backofen_temperatur_zweiter_garraum',
      },
    });
    expect(applianceEntities(HOUSE, 'wp-oven').twin).toMatchObject({
      unit: 'lower',
      roles: {
        state: 'sensor.herd_zustand_unten',
        target: 'number.herd_zieltemperatur_unten',
        stop: 'button.herd_stopp_unten',
      },
    });
    // the first unit keeps its own
    expect(applianceEntities(HOUSE, 'wp-oven').roles).toMatchObject(
      whirlpoolOven(NOW).expected.roles ?? {},
    );
    expect(applianceEntities(HOUSE, 'st-washer').roles).toMatchObject(
      stWasher(NOW).expected.roles ?? {},
    );
    expect(applianceEntities(HOUSE, 'st-oven').roles).toMatchObject(
      stOven(NOW).expected.roles ?? {},
    );
  });

  it('takes no meter of a SmartThings machine’s years for its programme’s: no water, its energy the meter a cycle is read from', () => {
    // its water is its cumulative amount; its report's power energy, a window's (0 on Samsung's appliances)
    const { roles } = applianceEntities(HOUSE, 'st-washer');
    expect(roles.water).toBeUndefined();
    expect(roles.energy).toBe('sensor.samsung_waschmaschine_energie');
  });

  it('gathers the rest in kind: compartments, maintenance, quick modes, plates and counters', () => {
    expect(applianceEntities(HOUSE, 'hc-fridge')).toMatchObject({
      zones: [
        'number.kuhl_gefrier_kombination_kuhlschranktemperatur',
        'number.kuhl_gefrier_kombination_gefrierschranktemperatur',
        'binary_sensor.kuhl_gefrier_kombination_kuhlschranktur',
        'binary_sensor.kuhl_gefrier_kombination_gefrierschranktur',
      ],
      boosts: [
        'switch.kuhl_gefrier_kombination_super_kuhlen',
        'switch.kuhl_gefrier_kombination_super_gefrieren',
        'switch.kuhl_gefrier_kombination_eco_modus',
        'switch.kuhl_gefrier_kombination_urlaubsmodus',
      ],
    });
    expect(applianceEntities(HOUSE, 'hc-dish').maintenance).toEqual([
      'sensor.geschirrspuler_salzmangel',
      'sensor.geschirrspuler_klarspuler_fast_leer',
      'sensor.geschirrspuler_maschinenpflege',
    ]);
    expect(applianceEntities(HOUSE, 'miele-hob').hob).toHaveLength(4);
    expect(applianceEntities(HOUSE, 'hc-coffee').counters).toEqual([
      'sensor.kaffeevollautomat_kaffees',
      'sensor.kaffeevollautomat_milchkaffees',
    ]);
    // LG's fresh-air filter select is a setting, not a flag to look after
    expect(applianceEntities(HOUSE, 'lg-fridge').maintenance).toEqual([
      'sensor.kuhlschrank_wasserfilter',
    ]);
  });

  it('knows a device’s integration: one it reads by its words, else the one most of its entities are of, never a helper', () => {
    const of = (...platforms: string[]) =>
      platformOf(platforms.map((platform, n) => ({ entity_id: `sensor.e${n}`, platform })));
    expect(of('template', 'lg_thinq', 'template')).toBe('lg_thinq');
    // more helpers than its own entities, or registered before them
    expect(of('template', 'template', 'threshold', 'esphome')).toBe('esphome');
    expect(of('threshold', 'shelly')).toBe('shelly');
    // a power estimate of another integration's (Powercalc) is one of fewer
    expect(of('powercalc', 'localthings', 'localthings')).toBe('localthings');
    // a tie goes to the first registered
    expect(of('localthings', 'powercalc')).toBe('localthings');
    expect(of('template')).toBe('template');
    expect(of()).toBeUndefined();
  });

  it('plays a helper a person attached to the device only where nothing of its integration’s own does (#91)', () => {
    // an integration read by its ids, as many helpers on its device registered first: a template summing it up, a
    // door template known surer by its id than the integration's own door by its class, a programme only a template
    // says
    const esphome = entriesFor('esphome', 'esp-dish');
    const template = entriesFor('template', 'esp-dish');
    const house = houseOf(
      [
        {
          title: 'ESPHome dishwasher, helpers on its device',
          platform: 'esphome',
          device: device('esp-dish', 'Spülmaschine Keller', null),
          entities: [
            template('sensor.spulmaschine_keller_status'),
            template('binary_sensor.spulmaschine_keller_door'),
            template('sensor.spulmaschine_keller_program'),
            esphome('sensor.spulmaschine_keller_operation_state'),
            esphome('binary_sensor.spulmaschine_keller_tur'),
            esphome('switch.spulmaschine_keller_power'),
          ],
          states: [
            ['sensor.spulmaschine_keller_status', 'Off · 2 h left'],
            ['binary_sensor.spulmaschine_keller_door', 'off', { device_class: 'door' }],
            ['sensor.spulmaschine_keller_program', 'Eco 50'],
            ['sensor.spulmaschine_keller_operation_state', 'Ready'],
            ['binary_sensor.spulmaschine_keller_tur', 'off', { device_class: 'door' }],
            ['switch.spulmaschine_keller_power', 'off'],
          ],
          expected: {},
        },
      ],
      NOW,
    );
    expect(applianceEntities(house, 'esp-dish').roles).toEqual({
      state: 'sensor.spulmaschine_keller_operation_state',
      door: 'binary_sensor.spulmaschine_keller_tur',
      power: 'switch.spulmaschine_keller_power',
      program: 'sensor.spulmaschine_keller_program',
    });
    // LocalThings by its keys (#97): its machine state is the state, never its template's summary, named or not
    expect(applianceEntities(HOUSE, 'lt-dish').roles.state).toBe(
      'sensor.geschirrspuler_kuche_maschinenzustand',
    );
    expect(
      applianceEntities(HOUSE, 'lt-dish', [], 'sensor.geschirrspuler_kuche_status').roles.state,
    ).toBe('sensor.geschirrspuler_kuche_maschinenzustand');
    // a helper the card names never takes a role from the integration's own
    expect(
      applianceEntities(house, 'esp-dish', [], 'sensor.spulmaschine_keller_status').roles.state,
    ).toBe('sensor.spulmaschine_keller_operation_state');
  });

  it('takes a plug’s switch as its power, the entity a card names as what it plays, and a role named by hand over both', () => {
    expect(applianceEntities(HOUSE, 'plug-washer').roles).toMatchObject({
      power: 'switch.waschmaschine_keller',
      watts: 'sensor.waschmaschine_keller_leistung',
    });
    expect(applianceDevice(HOUSE, undefined, 'switch.waschmaschine_keller')).toBe('plug-washer');
    // a lone entity, no device: a switch is the power, a sensor the state
    expect(applianceEntities(HOUSE, undefined, [], 'switch.lone_plug').roles).toEqual({
      power: 'switch.lone_plug',
    });
    expect(
      applianceEntities(HOUSE, 'plug-washer', [
        { role: 'running', entity: 'binary_sensor.washer_running' },
      ]).roles.running,
    ).toBe('binary_sensor.washer_running');
  });
});
