import { describe, expect, it } from 'vitest';
import { domainOf, isActive, isEntityId, resolveEntity } from '../entity.js';
import type { HomeAssistant } from '../ha/types.js';

const hass = (
  states: Record<string, { state: string; attributes?: Record<string, unknown> }>,
  extra: Partial<HomeAssistant> = {},
): HomeAssistant =>
  ({
    states: Object.fromEntries(
      Object.entries(states).map(([id, s]) => [
        id,
        {
          entity_id: id,
          state: s.state,
          attributes: s.attributes ?? {},
          last_changed: '',
          last_updated: '',
        },
      ]),
    ),
    entities: {},
    devices: {},
    areas: {},
    ...extra,
  }) as unknown as HomeAssistant;

describe('resolveEntity', () => {
  it('treats missing, unavailable and unknown as first-class states', () => {
    const h = hass({
      'light.a': { state: 'unavailable' },
      'sensor.b': { state: 'unknown' },
      'switch.c': { state: 'on' },
    });
    expect(resolveEntity(h, 'light.ghost').status).toBe('missing');
    expect(resolveEntity(h, 'light.a').status).toBe('unavailable');
    expect(resolveEntity(h, 'sensor.b').status).toBe('unknown');
    expect(resolveEntity(h, 'switch.c').status).toBe('ok');
    expect(resolveEntity(undefined, undefined).status).toBe('missing');
  });

  it('never assumes a registry entry exists (group.*, sun.sun, zone.* have none)', () => {
    const view = resolveEntity(hass({ 'sun.sun': { state: 'above_horizon' } }), 'sun.sun');
    expect(view.name).toBe('Sun');
    expect(view.areaName).toBe('');
  });

  it('finds the area through the device when the entity has none', () => {
    const h = hass(
      { 'light.a': { state: 'on' } },
      {
        entities: { 'light.a': { entity_id: 'light.a', device_id: 'd1' } },
        devices: { d1: { id: 'd1', name: 'Lamp', name_by_user: null, area_id: 'living' } },
        areas: { living: { area_id: 'living', name: 'Living room' } },
      },
    );
    expect(resolveEntity(h, 'light.a').areaName).toBe('Living room');
  });

  it('parses numbers only when they are finite', () => {
    const h = hass({
      'sensor.t': { state: '21.5' },
      'sensor.d': { state: "{'a': 1}" },
      'sensor.u': { state: 'unavailable' },
      'sensor.e': { state: '' },
      'sensor.s': { state: '  ' },
      'sensor.n': { state: '-3' },
      'sensor.i': { state: 'Infinity' },
    });
    expect(resolveEntity(h, 'sensor.t').number).toBe(21.5);
    expect(resolveEntity(h, 'sensor.d').number).toBeNull();
    expect(resolveEntity(h, 'sensor.u').number).toBeNull();
    expect(resolveEntity(h, 'sensor.e').number).toBeNull(); // Number('') is 0, and 0 is a lie here
    expect(resolveEntity(h, 'sensor.s').number).toBeNull();
    expect(resolveEntity(h, 'sensor.n').number).toBe(-3);
    expect(resolveEntity(h, 'sensor.i').number).toBeNull();
  });

  it('survives null attributes and a null registry name', () => {
    const h = hass(
      {
        'sensor.t': {
          state: '1',
          attributes: {
            friendly_name: null,
            unit_of_measurement: null,
            device_class: null,
            supported_features: null,
          },
        },
      },
      {
        entities: { 'sensor.t': { entity_id: 'sensor.t', name: null as unknown as string } },
      },
    );
    const view = resolveEntity(h, 'sensor.t');
    expect(view.name).toBe('T');
    expect(view.unit).toBe('');
    expect(view.deviceClass).toBe('');
    expect(view.supports(1)).toBe(false);
    expect(view.attr('nothing')).toBeUndefined();
  });

  it('reads a name, an area’s name and a key a custom integration writes as a number as text (#129)', () => {
    const h = hass(
      { 'sensor.price': { state: '1.689', attributes: { friendly_name: 76380002 } } },
      {
        entities: {
          'sensor.price': {
            entity_id: 'sensor.price',
            area_id: 'forecourt',
            translation_key: 7 as never,
          },
          'sensor.gone': { entity_id: 'sensor.gone', name: 4711 as never },
        },
        areas: { forecourt: { area_id: 'forecourt', name: 3 as never } },
      },
    );
    const view = resolveEntity(h, 'sensor.price');
    expect(view.name).toBe('76380002');
    expect(view.areaName).toBe('3');
    expect(view.translationKey).toBe('7');
    expect(resolveEntity(h, 'sensor.gone').name).toBe('4711');
  });

  it('reads supported features as a bitmask and survives their absence', () => {
    const h = hass({
      'cover.a': { state: 'open', attributes: { supported_features: 15 } },
      'cover.b': { state: 'open' },
    });
    expect(resolveEntity(h, 'cover.a').supports(4)).toBe(true);
    expect(resolveEntity(h, 'cover.a').supports(128)).toBe(false);
    expect(resolveEntity(h, 'cover.b').supports(1)).toBe(false);
  });

  it('keeps what an entity gone missing could do as the page last read it, never what it was (1.9)', () => {
    const climate = {
      state: 'heat',
      attributes: {
        friendly_name: 'Hall',
        supported_features: 401,
        hvac_modes: ['off', 'heat'],
        min_temp: 7,
        target_temp_step: 0.5,
        unit_of_measurement: '°C',
        device_class: 'temperature',
        temperature: 21,
        current_temperature: 20.5,
        hvac_action: 'heating',
      },
    };
    resolveEntity(hass({ 'climate.hall': climate }), 'climate.hall');
    const gone = resolveEntity(hass({}), 'climate.hall');
    expect(gone.status).toBe('missing');
    expect(gone.stateObj).toBeUndefined();
    expect(gone.state).toBe('missing');
    // its description and capabilities, as Home Assistant writes them whatever the state
    expect(gone.name).toBe('Hall');
    expect(gone.unit).toBe('°C');
    expect(gone.deviceClass).toBe('temperature');
    expect(gone.supports(16)).toBe(true);
    expect(gone.attr('hvac_modes')).toEqual(['off', 'heat']);
    expect(gone.attr('min_temp')).toBe(7);
    expect(gone.attr('target_temp_step')).toBe(0.5);
    // its state's own: gone with it
    expect(gone.attr('temperature')).toBeUndefined();
    expect(gone.attr('current_temperature')).toBeUndefined();
    expect(gone.attr('hvac_action')).toBeUndefined();
    expect(gone.number).toBeNull();
    // an entity the page never read has nothing to keep
    const never = resolveEntity(hass({}), 'climate.never_read');
    expect(never.name).toBe('Never read');
    expect(never.attr('hvac_modes')).toBeUndefined();
    expect(never.supports(1)).toBe(false);
  });

  it('tells the icon the person set from the one its integration gives, and has neither once it is gone', () => {
    const h = hass(
      {
        // Home Assistant writes the person's icon into the state's attributes too
        'cover.gate': { state: 'closed', attributes: { icon: 'mdi:gate-arrow-right' } },
        'sensor.pollen': { state: '3', attributes: { icon: 'mdi:flower-pollen' } },
        'switch.pump': { state: 'on', attributes: { icon: 'mdi:pump' } },
        'light.hall': { state: 'on' },
      },
      {
        entities: {
          'cover.gate': { entity_id: 'cover.gate', icon: 'mdi:gate-arrow-right' },
          'switch.pump': { entity_id: 'switch.pump', icon: 'mdi:water-pump' },
          'light.hall': { entity_id: 'light.hall' },
        },
      },
    );
    const gate = resolveEntity(h, 'cover.gate');
    expect(gate.registryIcon).toBe('mdi:gate-arrow-right');
    expect(gate.ownIcon).toBeUndefined();
    // no registry entry at all: the icon is its integration's
    const pollen = resolveEntity(h, 'sensor.pollen');
    expect(pollen.registryIcon).toBeUndefined();
    expect(pollen.ownIcon).toBe('mdi:flower-pollen');
    // both, as a state written before the person's icon was saved has them
    const pump = resolveEntity(h, 'switch.pump');
    expect(pump.registryIcon).toBe('mdi:water-pump');
    expect(pump.ownIcon).toBe('mdi:pump');
    const hall = resolveEntity(h, 'light.hall');
    expect(hall.registryIcon).toBeUndefined();
    expect(hall.ownIcon).toBeUndefined();
    // an entity that is not there draws the ban glyph, whatever its registry still says
    const gone = resolveEntity({ ...h, states: {} }, 'cover.gate');
    expect(gone.status).toBe('missing');
    expect(gone.registryIcon).toBeUndefined();
    expect(gone.ownIcon).toBeUndefined();
  });

  it('reads the icon a helper’s, a scene’s or a template’s own settings hold as the person’s', () => {
    const h = hass(
      {
        'input_boolean.guests': { state: 'on', attributes: { icon: 'mdi:account-group' } },
        'timer.tea': { state: 'idle', attributes: { icon: 'mdi:tea' } },
        'scene.movie': { state: '2026-10-22T20:00:00+00:00', attributes: { icon: 'mdi:movie' } },
        'sensor.rain_today': { state: '3', attributes: { icon: 'mdi:weather-pouring' } },
        'sensor.pollen': { state: '3', attributes: { icon: 'mdi:flower-pollen' } },
      },
      {
        entities: {
          'sensor.rain_today': { entity_id: 'sensor.rain_today', platform: 'template' },
          'sensor.pollen': {
            entity_id: 'sensor.pollen',
            platform: 'pollen',
            translation_key: 'grass',
          },
        },
      },
    );
    for (const [id, icon] of [
      ['input_boolean.guests', 'mdi:account-group'],
      ['timer.tea', 'mdi:tea'],
      ['scene.movie', 'mdi:movie'],
      ['sensor.rain_today', 'mdi:weather-pouring'],
    ]) {
      expect(resolveEntity(h, id).registryIcon, id).toBe(icon);
      expect(resolveEntity(h, id).ownIcon, id).toBeUndefined();
    }
    // an integration's icon stays its own, and so does the key it names the entity by
    const pollen = resolveEntity(h, 'sensor.pollen');
    expect(pollen.registryIcon).toBeUndefined();
    expect(pollen.ownIcon).toBe('mdi:flower-pollen');
    expect(pollen.translationKey).toBe('grass');
    expect(resolveEntity(h, 'timer.tea').translationKey).toBeUndefined();
  });
});

describe('isActive', () => {
  it('knows what "on" means per domain', () => {
    const h = hass({
      'light.a': { state: 'on' },
      'cover.a': { state: 'closed' },
      'climate.a': { state: 'heat' },
      'climate.b': { state: 'off' },
      'lock.a': { state: 'locked' },
      'vacuum.a': { state: 'docked' },
      'light.b': { state: 'unavailable' },
    });
    expect(isActive(resolveEntity(h, 'light.a'))).toBe(true);
    expect(isActive(resolveEntity(h, 'cover.a'))).toBe(false);
    expect(isActive(resolveEntity(h, 'climate.a'))).toBe(true);
    expect(isActive(resolveEntity(h, 'climate.b'))).toBe(false);
    expect(isActive(resolveEntity(h, 'lock.a'))).toBe(false);
    expect(isActive(resolveEntity(h, 'vacuum.a'))).toBe(false);
    expect(isActive(resolveEntity(h, 'light.b'))).toBe(false);
  });

  it('never reads a weather condition as on', () => {
    const h = hass({ 'weather.home': { state: 'rainy' }, 'weather.away': { state: 'sunny' } });
    expect(isActive(resolveEntity(h, 'weather.home'))).toBe(false);
    expect(isActive(resolveEntity(h, 'weather.away'))).toBe(false);
  });

  it('never reads the moment a button was pressed, a scene applied or an event fired as on', () => {
    const at = '2026-10-28T10:00:00+00:00';
    const h = hass({
      'button.restart': { state: at },
      'input_button.doorbell': { state: at },
      'scene.evening': { state: at },
      'event.doorbell': { state: at },
    });
    for (const id of ['button.restart', 'input_button.doorbell', 'scene.evening', 'event.doorbell'])
      expect(isActive(resolveEntity(h, id)), id).toBe(false);
  });
});

describe('domainOf', () => {
  it('splits on the first dot', () => {
    expect(domainOf('sensor.a_b.c')).toBe('sensor');
    expect(domainOf('')).toBe('');
  });
});

describe('isEntityId', () => {
  it('tells an entity’s id from words, figures, addresses and another integration’s statistic', () => {
    for (const id of [
      'sensor.tv_status',
      'image.lounge_tv',
      'input_text.now_on',
      'sensor.ld2410_1',
    ])
      expect(isEntityId(id), id).toBe(true);
    for (const other of [
      'On · HDMI 1',
      '/local/tv.png',
      'Sensor.TV',
      'sensor.',
      '.tv',
      'sensor.tv status',
      'tibber:energy_consumption_home',
      '5.1',
      '2.4_ghz',
      undefined,
      42,
    ])
      expect(isEntityId(other), String(other)).toBe(false);
  });
});
