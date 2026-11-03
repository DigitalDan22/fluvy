import { device, entriesFor, type FixtureAt } from './house.js';

/*
 * LocalThings (mbillow/localthings, from HACS): Samsung's appliances on the house's own network. Each of its entities
 * carries its translation key (entity.py: the descriptor's key where it names none), and the card reads none of them
 * yet: a card on one names its roles by hand, as #91's reporter does. Its machine state is "idle" whether the
 * appliance is switched off or on and waiting (registry/capabilities/operational.py); its power switch says which
 * (common.py POWER_GENERIC). A template sensor its owner attached to the device sums it up in their own words: a
 * helper, which plays a part only where nothing of LocalThings' own does.
 */

/** A LocalThings dishwasher switched off: its machine state idle all the same, a template's summary on its device. */
export const localthingsDishwasher: FixtureAt = () => {
  const e = entriesFor('localthings', 'lt-dish');
  const helper = entriesFor('template', 'lt-dish');
  return {
    title: 'LocalThings dishwasher, switched off',
    platform: 'localthings',
    device: device('lt-dish', 'Geschirrspüler Küche', 'DW60BG750B00ET', 'Samsung Electronics'),
    entities: [
      e('sensor.geschirrspuler_kuche_maschinenzustand', 'machine_state'),
      e('sensor.geschirrspuler_kuche_fortschritt', 'progress'),
      e('sensor.geschirrspuler_kuche_fortschritt_in_prozent', 'progress_percentage'),
      e('switch.geschirrspuler_kuche_ein_aus', 'power_switch'),
      e('binary_sensor.geschirrspuler_kuche_lauft', 'cycle_active'),
      helper('sensor.geschirrspuler_kuche_status'),
    ],
    states: [
      [
        'sensor.geschirrspuler_kuche_maschinenzustand',
        'idle',
        { device_class: 'enum', options: ['idle', 'active', 'pause'] },
      ],
      [
        'sensor.geschirrspuler_kuche_fortschritt',
        'idle',
        { device_class: 'enum', options: ['idle', 'wash', 'rinse', 'drying', 'finish'] },
      ],
      ['sensor.geschirrspuler_kuche_fortschritt_in_prozent', '0', { unit_of_measurement: '%' }],
      ['switch.geschirrspuler_kuche_ein_aus', 'off'],
      ['binary_sensor.geschirrspuler_kuche_lauft', 'off', { device_class: 'running' }],
      ['sensor.geschirrspuler_kuche_status', 'Off · 2 h left'],
    ],
    expected: { kind: 'dishwasher' },
  };
};

/** The roles #91's reporter names on a LocalThings dishwasher: its machine state, its power switch, its progress. */
export const LOCALTHINGS_ROLES = [
  { role: 'state', entity: 'sensor.geschirrspuler_kuche_maschinenzustand' },
  { role: 'power', entity: 'switch.geschirrspuler_kuche_ein_aus' },
  { role: 'phase', entity: 'sensor.geschirrspuler_kuche_fortschritt' },
] as const;
