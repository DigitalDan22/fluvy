import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import {
  allFixtures,
  de1,
  de1Moments,
  hcDishwasherDone,
  hcFridge,
  hcpyDryer,
  houseOf,
  lgDryer,
  LOCALTHINGS_ROLES,
  type ApplianceFixture,
  type De1Moment,
} from './fixtures/index.js';
import { findAppliance, readAppliance, type ApplianceConfig } from './reading.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const MINUTE = 60_000;
const FIXTURES = allFixtures(NOW);
const HOUSE = houseOf(FIXTURES, NOW);

const read = (
  device: string,
  config: ApplianceConfig = {},
  hass: HomeAssistant = HOUSE,
  now = NOW,
  unloaded: number | null = null,
) =>
  readAppliance(
    hass,
    findAppliance(hass, { device, ...config }),
    { device, ...config },
    now,
    unloaded,
  );

/** A fixture alone in a house, at its own moment, read a while later. */
const later = (
  fixture: (now: number) => ApplianceFixture,
  minutes: number,
  config: ApplianceConfig = {},
  unloaded: number | null = null,
) => {
  const at = houseOf([fixture(NOW)], NOW);
  const id = fixture(NOW).device.id;
  return readAppliance(
    at,
    findAppliance(at, { device: id }),
    { device: id, ...config },
    NOW + minutes * MINUTE,
    unloaded,
  );
};

describe('an appliance read', () => {
  it.each(
    FIXTURES.filter((fixture) => fixture.expected.status).map((fixture) => [
      fixture.title,
      fixture,
    ]),
  )('says what %s is doing', (_, fixture) => {
    expect(read(fixture.device.id).status).toBe(fixture.expected.status);
  });

  it.each(de1Moments(NOW).map((fixture) => [fixture.title, fixture]))(
    'reads the %s as its words say (#115)',
    (_, fixture) => {
      const house = houseOf([fixture], NOW);
      const r = read(fixture.device.id, {}, house);
      expect(r.kind).toBe('coffee');
      expect(r.status).toBe(fixture.expected.status);
      expect(r.roles).toMatchObject(fixture.expected.roles ?? {});
      expect(r.counters).toEqual([
        'sensor.decent_espresso_de1pro_de1_espresso_count',
        'sensor.decent_espresso_de1pro_de1_steaming_count',
      ]);
    },
  );

  it('reads the DE1’s tank as what is left in its millilitres, its profile as its programme, its power its own (#115)', () => {
    const r = read('de1');
    expect(r.maintenance).toEqual([
      {
        key: 'water_tank',
        entity: 'sensor.decent_espresso_de1pro_de1_water_level',
        severity: 'ok',
      },
    ]);
    expect(r.program).toBe('Blooming espresso');
    expect(r.commands.map((command) => command.call)).toEqual([
      {
        domain: 'switch',
        service: 'turn_off',
        data: { entity_id: 'switch.decent_espresso_de1pro_de1_on' },
      },
    ]);
    // an empty tank is due
    const dry = houseOf([de1('refill')(NOW)], NOW);
    dry.states['sensor.decent_espresso_de1pro_de1_water_level']!.state = '0';
    expect(read('de1', {}, dry).maintenance[0]).toMatchObject({ severity: 'due' });
    // and so is one with water left in it while the machine says it wants more ("Refill"), the tank's entity still its
    const wants = read('de1', {}, houseOf([de1('refill')(NOW)], NOW));
    expect(wants.maintenance).toEqual([
      {
        key: 'water_tank',
        entity: 'sensor.decent_espresso_de1pro_de1_water_level',
        severity: 'due',
        since: NOW - 5 * MINUTE,
      },
    ]);
    expect(wants.attention.map((item) => item.key)).toEqual([
      'appliance.status_attention',
      'appliance.m_water_tank',
    ]);
  });

  it('says the DE1’s failure and its call for a hand in the card’s words, its own English their detail', () => {
    const at = (moment: De1Moment) => read('de1', {}, houseOf([de1(moment)(NOW)], NOW));
    const refill = at('refill');
    expect(refill.word).toBe('');
    // each with the entity that says it, which a tap on its alarm row opens: its state
    const state = 'sensor.decent_espresso_de1pro_de1_state';
    expect(refill.attention[0]).toEqual({
      key: 'appliance.status_attention',
      detail: 'Refill',
      entity: state,
    });
    const fatal = at('fatal');
    expect(fatal.word).toBe('');
    expect(fatal.attention[0]).toEqual({
      key: 'appliance.failure',
      detail: 'Fatal error',
      entity: state,
    });
    // what it is doing otherwise is said in its words
    expect(at('espresso').word).toBe('Espresso');
    expect(at('espresso').attention).toEqual([]);
  });

  it('reads a washer and a dryer on hcpy by their own keys run together (#115): times, programme, door, buttons', () => {
    const washer = read('hcpy-washer');
    expect(washer.clock).toMatchObject({ left: 2820, total: 4560, progress: 38 });
    expect(washer.program).toBe('Cotton');
    expect(washer.door).toMatchObject({ open: false });
    expect(washer.commands.map((command) => command.action)).toEqual([
      'pause',
      'stop',
      'power_off',
    ]);
    const dryer = read('hcpy-dryer');
    expect(dryer.status).toBe('finished');
    expect(dryer.finishedAt).toBe(NOW - 20 * MINUTE);
    // its door opened, in Bosch's own word
    const opened = houseOf([hcpyDryer(NOW)], NOW);
    opened.states['sensor.dryer_bsh_common_status_doorstate']!.state = 'Open';
    expect(read('hcpy-dryer', {}, opened).door).toMatchObject({ open: true });
  });

  it('works its times out of whatever the integration says (findings 08 § D)', () => {
    // LG: a finish time and a total in minutes; the progress from both
    expect(read('lg-washer').clock).toEqual({
      left: 42 * 60,
      at: NOW + 42 * MINUTE,
      total: 120 * 60,
      elapsed: 78 * 60,
      progress: 65,
    });
    // Miele: remaining and elapsed minutes; its finish time says when
    expect(read('miele-washer').clock).toMatchObject({
      left: 42 * 60,
      at: NOW + 42 * MINUTE,
      total: 105 * 60,
      progress: 60,
    });
    // Home Connect: its progress as it says it, its finish time; started when its state turned to running
    expect(read('hc-dish').clock).toMatchObject({
      progress: 60,
      left: 50 * 60,
      at: NOW + 50 * MINUTE,
    });
    // Electrolux: seconds; SmartThinQ: "0:35:00" and "1:45:00"
    expect(read('aeg-washer').clock).toMatchObject({ left: 1800, elapsed: 3600, total: 5400 });
    expect(read('stq-washer').clock).toMatchObject({ left: 2100, total: 6300 });
    // a state that changes with every step (LG's) never says when the cycle began
    expect(read('wp-washer').clock).toMatchObject({ left: 25 * 60, total: null, progress: null });
    // at rest, no times
    expect(read('hc-coffee').clock).toEqual({
      left: null,
      at: null,
      total: null,
      elapsed: null,
      progress: null,
    });
  });

  it('says the step it is at, and the words Home Assistant says', () => {
    expect(read('miele-washer')).toMatchObject({
      step: 'rinse',
      steps: ['wash', 'rinse', 'spin'],
      word: 'In use',
      phase: 'Rinses',
    });
    expect(read('lg-washer')).toMatchObject({ step: 'spin', word: 'Spinning', phase: '' });
    // hOn's numbers say nothing: the card's own word is said
    expect(read('hon-washer')).toMatchObject({ word: '', statusWord: 'appliance.status_running' });
    expect(read('hc-oven').statusWord).toBe('appliance.status_running');
    // where the status is not what the state says, the card's own word: LG's "Power off" when done, a stopped
    // machine whose job finished
    expect(later(lgDryer, 0)).toMatchObject({ word: '', statusWord: 'appliance.status_finished' });
    expect(read('st-dish')).toMatchObject({ word: '', statusWord: 'appliance.status_finished' });
  });

  it('says an untranslated word run together as it is on an integration it reads, apart on one it does not (#115)', () => {
    const state = findAppliance(HOUSE, { device: 'lg-washer' }).entities.roles.state;
    expect(state).toBeDefined();
    const hass = {
      ...HOUSE,
      states: { ...HOUSE.states, [state!]: { ...HOUSE.states[state!]!, state: 'TurboWash' } },
    } as HomeAssistant;
    expect(read('lg-washer', {}, hass).word).toBe('TurboWash');
  });

  it('waits to be unloaded from half an hour after a finish, until its door opens', () => {
    // done an hour ago, its door shut since before: waiting
    const done = houseOf([hcDishwasherDone(NOW)], NOW);
    expect(read('hc-dish', {}, done)).toMatchObject({
      status: 'finished',
      finishedAt: NOW - 60 * MINUTE,
      unload: { since: NOW - 60 * MINUTE },
    });
    expect(read('hc-dish', {}, done).attention[0]).toEqual({
      key: 'appliance.unload',
      since: NOW - 60 * MINUTE,
    });
    // its door opened after the finish: unloaded
    const opened = {
      ...done,
      states: {
        ...done.states,
        'sensor.geschirrspuler_tur': {
          ...(done.states['sensor.geschirrspuler_tur'] ?? {
            entity_id: 'sensor.geschirrspuler_tur',
            attributes: {},
          }),
          state: 'closed',
          last_changed: new Date(NOW - 10 * MINUTE).toISOString(),
        },
      },
    } as HomeAssistant;
    expect(read('hc-dish', {}, opened).unload).toBeNull();
    // the person said so, for this finish
    expect(read('hc-dish', {}, done, NOW, NOW - 60 * MINUTE).unload).toBeNull();
    // the reminder turned off, or not yet half an hour
    expect(read('hc-dish', { unload_reminder: false }, done).unload).toBeNull();
    expect(read('hc-dish', { unload_after: 90 }, done).unload).toBeNull();
  });

  it('reads LG’s washer that powers off when done, with no door: done for two hours, waiting from half an hour', () => {
    // finished 40 minutes ago (its notification), powered off since
    expect(later(lgDryer, 0)).toMatchObject({
      status: 'finished',
      finishedAt: NOW - 40 * MINUTE,
      unload: { since: NOW - 40 * MINUTE },
    });
    // the person tapped "Unloaded" for this finish
    expect(later(lgDryer, 0, {}, NOW - 40 * MINUTE).unload).toBeNull();
    // past the done time, it is off and asks nothing
    expect(later(lgDryer, 81)).toMatchObject({ status: 'off', unload: null });
    expect(later(lgDryer, 60, { done_for: 60 })).toMatchObject({ status: 'off', unload: null });
    // one that stays at "end" (it did not power off) waits too, until LG says its door was opened after the finish
    const ended = houseOf([lgDryer(NOW)], NOW);
    const state = ended.states['sensor.trockner_aktueller_status'];
    const note = ended.states['event.trockner_benachrichtigung'];
    if (!state || !note) throw new Error('the dryer has a state and a notification');
    const at = (notification: { state: string; event_type: string }) =>
      ({
        ...ended,
        states: {
          ...ended.states,
          [state.entity_id]: {
            ...state,
            state: 'end',
            last_changed: new Date(NOW - 40 * MINUTE).toISOString(),
          },
          [note.entity_id]: {
            ...note,
            state: notification.state,
            attributes: { ...note.attributes, event_type: notification.event_type },
          },
        },
      }) as HomeAssistant;
    const dryer = (hass: HomeAssistant) =>
      readAppliance(hass, findAppliance(hass, { device: 'lg-dryer' }), {}, NOW);
    const before = at({
      state: new Date(NOW - 50 * MINUTE).toISOString(),
      event_type: 'door_is_open',
    });
    expect(dryer(before)).toMatchObject({
      status: 'finished',
      unload: { since: NOW - 40 * MINUTE },
    });
    const after = at({
      state: new Date(NOW - 5 * MINUTE).toISOString(),
      event_type: 'door_is_open',
    });
    expect(dryer(after)).toMatchObject({ status: 'finished', unload: null });
  });

  it('reads #91’s LocalThings dishwasher by the roles its owner names: off by its switch, a cycle never hidden by it', () => {
    const config: ApplianceConfig = {
      entity: 'switch.geschirrspuler_kuche_ein_aus',
      kind: 'dishwasher',
      roles: LOCALTHINGS_ROLES,
    };
    const at = (states: Readonly<Record<string, string>>): HomeAssistant =>
      ({
        ...HOUSE,
        states: {
          ...HOUSE.states,
          ...Object.fromEntries(
            Object.entries(states).map(([id, state]) => [id, { ...HOUSE.states[id], state }]),
          ),
        },
      }) as HomeAssistant;
    // switched off, its machine state idle all the same; switched on and waiting
    expect(read('lt-dish', config)).toMatchObject({
      status: 'off',
      statusWord: 'appliance.status_off',
    });
    expect(
      read('lt-dish', config, at({ 'switch.geschirrspuler_kuche_ein_aus': 'on' })),
    ).toMatchObject({ status: 'idle', statusWord: 'appliance.status_idle' });
    // washing or paused while its switch has not caught up; the finish its progress holds after the cycle
    const lagging = { 'switch.geschirrspuler_kuche_ein_aus': 'off' };
    expect(
      read(
        'lt-dish',
        config,
        at({
          ...lagging,
          'sensor.geschirrspuler_kuche_maschinenzustand': 'active',
          'sensor.geschirrspuler_kuche_fortschritt': 'wash',
        }),
      ),
    ).toMatchObject({ status: 'running', step: 'wash' });
    expect(
      read(
        'lt-dish',
        config,
        at({ ...lagging, 'sensor.geschirrspuler_kuche_maschinenzustand': 'pause' }),
      ).status,
    ).toBe('paused');
    expect(
      read(
        'lt-dish',
        config,
        at({ ...lagging, 'sensor.geschirrspuler_kuche_fortschritt': 'finish' }),
      ).status,
    ).toBe('finished');
    // a power role named on a reading of watts says neither on nor off
    expect(
      read('lt-dish', {
        roles: [
          { role: 'state', entity: 'sensor.geschirrspuler_kuche_maschinenzustand' },
          { role: 'power', entity: 'sensor.waschmaschine_keller_leistung' },
        ],
      }).status,
    ).toBe('idle');
  });

  it('reads LocalThings by its keys (#97): at work, paused, waiting to start, done, and what it can be told', () => {
    const at = (states: Readonly<Record<string, string>>): HomeAssistant =>
      ({
        ...HOUSE,
        states: {
          ...HOUSE.states,
          ...Object.fromEntries(
            Object.entries(states).map(([id, state]) => [id, { ...HOUSE.states[id], state }]),
          ),
        },
      }) as HomeAssistant;
    const actions = (r: ReturnType<typeof read>) => r.commands.map((command) => command.action);
    const machine = 'sensor.waschmaschine_flur_maschinenzustand';
    const progress = 'sensor.waschmaschine_flur_fortschritt';
    // rinsing: its time left and progress, its pause and its stop (its power is a flag), its softener to refill
    const rinsing = read('lt-washer');
    expect(rinsing).toMatchObject({
      kind: 'washer',
      status: 'running',
      step: 'rinse',
      clock: { left: 34 * 60, progress: 62 },
      readouts: { program: 'select.waschmaschine_flur_programm' },
    });
    expect(actions(rinsing)).toEqual(['pause', 'stop']);
    expect(rinsing.maintenance.map((item) => [item.key, item.severity])).toEqual([
      ['softener', 'soon'],
      ['detergent', 'ok'],
    ]);
    expect(actions(read('lt-washer', {}, at({ [machine]: 'pause' })))).toEqual(['resume', 'stop']);
    // a delayed start counts down with its machine running; its finish held after the cycle, the machine on or not
    const waiting = read('lt-washer', {}, at({ [progress]: 'delaywash' }));
    expect(waiting.status).toBe('scheduled');
    expect(actions(waiting)).toEqual(['stop']);
    for (const state of ['active', 'idle'])
      expect(read('lt-washer', {}, at({ [machine]: state, [progress]: 'finish' })).status).toBe(
        'finished',
      );
    expect(actions(read('lt-washer', {}, at({ [machine]: 'idle', [progress]: 'idle' })))).toEqual([
      'start',
    ]);
    // the dishwasher switched off, and on: its power, its start
    expect(actions(read('lt-dish'))).toEqual(['power_on']);
    expect(
      actions(read('lt-dish', {}, at({ 'switch.geschirrspuler_kuche_ein_aus': 'on' }))),
    ).toEqual(['start', 'power_off']);
    // the oven preheating: its cavity's heat on its way to its target, its stop, its power, its lamp
    const oven = read('lt-oven');
    expect(oven).toMatchObject({
      status: 'preheating',
      statusWord: 'appliance.status_preheating',
      heat: { current: 148, target: 200, ready: false },
    });
    expect(actions(oven)).toEqual(['stop', 'power_off', 'light']);
  });

  it('reads only the entities a card names where it scans nothing (#98): its device still says what it is', () => {
    const roles = [
      { role: 'state', entity: 'sensor.waschmaschine_flur_maschinenzustand' },
      { role: 'stop', entity: 'button.waschmaschine_flur_stopp' },
    ];
    const found = findAppliance(HOUSE, { device: 'lt-washer', scan: false, roles });
    expect(found).toMatchObject({
      device: 'lt-washer',
      platform: 'localthings',
      verdict: { kind: 'washer' },
      candidates: [],
      entities: { maintenance: [], zones: [] },
    });
    expect(found.entities.roles).toEqual({
      state: 'sensor.waschmaschine_flur_maschinenzustand',
      stop: 'button.waschmaschine_flur_stopp',
    });
    const washer = read('lt-washer', { scan: false, roles });
    expect(washer).toMatchObject({ status: 'running', readouts: {}, maintenance: [] });
    expect(washer.commands.map((command) => command.action)).toEqual(['stop']);
    // the entity it names plays its part all the same; its device, its own name
    const dish = findAppliance(HOUSE, {
      entity: 'switch.geschirrspuler_kuche_ein_aus',
      scan: false,
    });
    expect(dish.entities.roles).toEqual({ power: 'switch.geschirrspuler_kuche_ein_aus' });
    expect(
      read('lt-dish', { entity: 'switch.geschirrspuler_kuche_ein_aus', scan: false }).name,
    ).toBe('Geschirrspüler Küche');
  });

  it('reads no device at all where a card names `device: none` (#98), as before 1.13: what it names, and its words', () => {
    const entity = 'switch.geschirrspuler_kuche_ein_aus';
    const phase = 'sensor.geschirrspuler_kuche_fortschritt';
    const hass: HomeAssistant = {
      ...HOUSE,
      states: {
        ...HOUSE.states,
        [entity]: { ...HOUSE.states[entity]!, attributes: { friendly_name: 'Spülmaschine' } },
      },
    };
    const found = findAppliance(hass, {
      device: 'none',
      entity,
      roles: [{ role: 'phase', entity: phase }],
    });
    // never its entity's device: neither its entities, nor what the device says it is
    expect(found).toMatchObject({ device: undefined, platform: 'localthings', candidates: [] });
    expect(found.entities.roles).toEqual({ power: entity, phase });
    expect(found.verdict).toEqual({ kind: 'dishwasher', by: 'words' });
    expect(read('none', { entity }, hass).name).toBe('Spülmaschine');
    expect(findAppliance(hass, { device: 'none', entity, kind: 'washer' }).verdict).toEqual({
      kind: 'washer',
      by: 'config',
    });
    // one naming only its roles reads them, under no name of a device's
    const roles = [{ role: 'state', entity: 'sensor.waschmaschine_flur_maschinenzustand' }];
    expect(findAppliance(hass, { device: 'none', roles })).toMatchObject({
      device: undefined,
      entities: { roles: { state: 'sensor.waschmaschine_flur_maschinenzustand' } },
    });
    expect(read('none', { roles }, hass)).toMatchObject({ name: '', status: 'running' });
  });

  it('says a fridge’s door has stood open after a minute, with when it opened', () => {
    const fridge = later(hcFridge, 0);
    expect(fridge.door).toEqual({ open: true, since: NOW - 180_000, changed: NOW - 180_000 });
    expect(fridge.attention).toEqual([{ key: 'appliance.door_open', since: NOW - 180_000 }]);
    expect(later(hcFridge, 0, { door_alert: 300 }).attention).toEqual([]);
    // a washer's door alert is off by default
    expect(read('st-fridge').attention.map((line) => line.key)).toContain('appliance.door_open');
  });

  it('says what it asks to be looked after, due first, and puts the due on the attention line', () => {
    expect(read('hc-dish').maintenance.map((item) => `${item.key} ${item.severity}`)).toEqual([
      'salt due',
      'rinse_aid soon',
      'machine_care ok',
    ]);
    expect(read('hc-dish').attention).toEqual([
      { key: 'appliance.m_salt', since: NOW - 3 * 3_600_000 },
    ]);
    expect(read('hc-coffee').attention.map((line) => line.key)).toEqual([
      'appliance.m_descale',
      'appliance.m_beans',
    ]);
    expect(read('miele-washer').maintenance).toEqual([
      {
        key: 'detergent',
        entity: 'sensor.miele_waschmaschine_twindos_1_fullstand',
        severity: 'soon',
        level: 15,
        since: NOW - 7_200_000,
      },
    ]);
  });

  it('says why it failed, in the integration’s words where it has them', () => {
    const failed = (changes: Record<string, string>, attributes: Record<string, unknown> = {}) => {
      const states = { ...HOUSE.states };
      for (const [id, value] of Object.entries(changes)) {
        const state = states[id];
        if (state)
          states[id] = {
            ...state,
            state: value,
            attributes: { ...state.attributes, ...attributes },
          };
      }
      return { ...HOUSE, states } as HomeAssistant;
    };
    // LG's error event, within half an hour; Home Assistant translates its type
    const lg = {
      ...failed({ 'event.waschmaschine_fehler': new Date(NOW - 5 * MINUTE).toISOString() }),
      formatEntityAttributeValue: () => 'Out-of-balance load',
    } as HomeAssistant;
    expect(read('lg-washer', {}, lg)).toMatchObject({
      status: 'error',
      attention: [
        {
          key: 'appliance.failure',
          text: 'Out-of-balance load',
          entity: 'event.waschmaschine_fehler',
        },
      ],
    });
    // Miele's failure flag
    expect(
      read('miele-washer', {}, failed({ 'binary_sensor.miele_waschmaschine_storung': 'on' }))
        .status,
    ).toBe('error');
    // Home Connect's aborted programme
    expect(
      read('hc-dish', {}, failed({ 'sensor.geschirrspuler_programm_abgebrochen': 'present' }))
        .attention[0],
    ).toEqual({
      key: 'appliance.aborted',
      entity: 'sensor.geschirrspuler_programm_abgebrochen',
    });
    // LG's older integration's message
    expect(
      read('stq-washer', {}, failed({ 'sensor.lg_waschmaschine_error_message': 'UE' }))
        .attention[0],
    ).toEqual({
      key: 'appliance.failure',
      text: 'UE',
      entity: 'sensor.lg_waschmaschine_error_message',
    });
    // an old error is not one
    expect(read('lg-washer').status).toBe('running');
  });

  it('reads an oven’s and a kettle’s heat, at temperature within 2 °C or when the integration says so', () => {
    expect(read('hc-oven').heat).toEqual({
      current: 142,
      target: 180,
      unit: '°C',
      ready: false,
      progress: 76.25,
    });
    const preheated = {
      ...HOUSE,
      states: {
        ...HOUSE.states,
        'sensor.backofen_vorheizen_beendet': {
          ...HOUSE.states['sensor.backofen_vorheizen_beendet'],
          state: 'present',
        },
      },
    } as HomeAssistant;
    expect(read('hc-oven', {}, preheated)).toMatchObject({
      heat: { ready: true },
      statusWord: 'appliance.status_at_temperature',
    });
    expect(read('st-oven').heat).toMatchObject({ current: 179, target: 180, ready: true });
    expect(read('tuya-kettle').heat).toMatchObject({
      current: 62,
      target: 100,
      ready: false,
      progress: 52.5,
    });
  });

  it('reads its twin: SmartThings’ upper drum at rest, Whirlpool’s lower oven cooking', () => {
    expect(read('st-washer').twin).toMatchObject({ unit: 'upper', status: 'idle' });
    expect(read('wp-oven').twin).toMatchObject({ unit: 'lower', status: 'running' });
    expect(read('hc-dish').twin).toBeUndefined();
  });

  it('reads its compartments, quick modes, plates and counters, and the readouts it has', () => {
    expect(read('st-fridge').zones).toHaveLength(2);
    expect(read('st-fridge').boosts).toHaveLength(3);
    expect(read('miele-hob').hob).toHaveLength(4);
    expect(read('hc-coffee').counters).toHaveLength(2);
    expect(read('miele-washer').readouts).toEqual({
      program: 'sensor.miele_waschmaschine_programm',
      spin: 'sensor.miele_waschmaschine_schleuderdrehzahl',
      energy: 'sensor.miele_waschmaschine_energieverbrauch',
      elapsed: 'sensor.miele_waschmaschine_verstrichene_zeit',
      this_cycle: 'sensor.miele_waschmaschine_energieverbrauch',
    });
  });

  it('reads a plug’s appliance as far as its switch and power go, by the words of its name', () => {
    expect(read('plug-washer')).toMatchObject({
      kind: 'washer',
      plug: true,
      status: 'idle',
      name: 'Waschmaschine Keller',
      readouts: {
        power: 'sensor.waschmaschine_keller_leistung',
        energy: 'sensor.waschmaschine_keller_energie',
      },
    });
    // a card on a plug's switch alone, named for what it powers
    const lone = {
      ...HOUSE,
      states: {
        ...HOUSE.states,
        'switch.lone': {
          entity_id: 'switch.lone',
          state: 'off',
          attributes: { friendly_name: 'Dishwasher plug' },
          last_changed: '',
          last_updated: '',
        },
      },
    } as HomeAssistant;
    expect(
      readAppliance(
        lone,
        findAppliance(lone, { entity: 'switch.lone' }),
        { entity: 'switch.lone' },
        NOW,
      ),
    ).toMatchObject({
      kind: 'dishwasher',
      status: 'off',
      name: 'Dishwasher plug',
    });
  });

  it('reads an appliance gone from reach as offline, with nothing to do', () => {
    const away = {
      ...HOUSE,
      states: {
        ...HOUSE.states,
        'sensor.geschirrspuler_betriebszustand': {
          ...HOUSE.states['sensor.geschirrspuler_betriebszustand'],
          state: 'unavailable',
        },
      },
    } as HomeAssistant;
    expect(read('hc-dish', {}, away)).toMatchObject({
      status: 'offline',
      unavailable: true,
      commands: [],
    });
  });
});
