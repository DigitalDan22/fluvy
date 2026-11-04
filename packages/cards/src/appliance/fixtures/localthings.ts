import { device, entriesFor, minutesFrom, type FixtureAt } from './house.js';

/*
 * LocalThings (mbillow/localthings, from HACS): Samsung's appliances on the house's own network. Each of its entities
 * carries its translation key (entity.py: the descriptor's key where it names none), as registry/capabilities/*.py
 * write them: the machine state, the cycle's progress and its percentage, the time left and the finish while a cycle
 * runs, the start, pause and stop buttons, the remote control ("Smart Control"), the power switch, the course select
 * named after its table of courses. Its machine state is "idle" whether the appliance is switched off or on and waiting
 * (operational.py); its power switch says which (common.py POWER_GENERIC), and is a flag where the appliance cannot be
 * switched from afar. A template sensor its owner attached to the dishwasher sums it up in their own words: a helper,
 * which plays a part only where nothing of LocalThings' own does.
 */

const PLATFORM = 'localthings';
const MACHINE = { device_class: 'enum', options: ['idle', 'active', 'pause'] };
const PROGRESS = {
  device_class: 'enum',
  options: [
    'idle',
    'delaywash',
    'predrain',
    'prewash',
    'wash',
    'rinse',
    'spin',
    'drying',
    'finish',
  ],
};
const MINUTES = { device_class: 'duration', unit_of_measurement: 'min' };
const REMOTE = { device_class: 'connectivity' };

/** #91's dishwasher, switched off: its machine state idle all the same, a template's summary on its device. */
export const localthingsDishwasher: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'lt-dish');
  const helper = entriesFor('template', 'lt-dish');
  return {
    title: 'LocalThings dishwasher, switched off',
    platform: PLATFORM,
    device: device('lt-dish', 'Geschirrspüler Küche', 'DW60BG750B00ET', 'Samsung Electronics'),
    entities: [
      e('sensor.geschirrspuler_kuche_maschinenzustand', 'machine_state'),
      e('sensor.geschirrspuler_kuche_fortschritt', 'progress'),
      e('sensor.geschirrspuler_kuche_fortschritt_in_prozent', 'progress_percentage'),
      e('sensor.geschirrspuler_kuche_voraussichtliches_ende', 'finish_time'),
      e('sensor.geschirrspuler_kuche_fertigstellungszeit', 'completion_minutes'),
      e('switch.geschirrspuler_kuche_ein_aus', 'power_switch'),
      e('binary_sensor.geschirrspuler_kuche_lauft', 'cycle_active'),
      e('binary_sensor.geschirrspuler_kuche_intelligente_steuerung', 'remote_control'),
      e('select.geschirrspuler_kuche_programm', 'dishwasher_cycle'),
      e('switch.geschirrspuler_kuche_hygienespulung', 'sanitize'),
      e('number.geschirrspuler_kuche_startverzogerung', 'delay_start_hours'),
      e('button.geschirrspuler_kuche_start', 'start'),
      e('button.geschirrspuler_kuche_pause', 'pause'),
      e('button.geschirrspuler_kuche_stopp', 'stop'),
      e('sensor.geschirrspuler_kuche_wasserverbrauch', 'water_liters'),
      helper('sensor.geschirrspuler_kuche_status'),
    ],
    states: [
      ['sensor.geschirrspuler_kuche_maschinenzustand', 'idle', MACHINE],
      ['sensor.geschirrspuler_kuche_fortschritt', 'idle', PROGRESS],
      ['sensor.geschirrspuler_kuche_fortschritt_in_prozent', '0', { unit_of_measurement: '%' }],
      [
        'sensor.geschirrspuler_kuche_voraussichtliches_ende',
        'unknown',
        { device_class: 'timestamp' },
      ],
      // the firmware's estimate for its next cycle, said at rest too
      ['sensor.geschirrspuler_kuche_fertigstellungszeit', '255', MINUTES],
      ['switch.geschirrspuler_kuche_ein_aus', 'off'],
      ['binary_sensor.geschirrspuler_kuche_lauft', 'off', { device_class: 'running' }],
      ['binary_sensor.geschirrspuler_kuche_intelligente_steuerung', 'on', REMOTE],
      ['select.geschirrspuler_kuche_programm', '8a', { options: ['82', '8a', '84', 'a8', '8c'] }],
      ['switch.geschirrspuler_kuche_hygienespulung', 'off'],
      [
        'number.geschirrspuler_kuche_startverzogerung',
        '0',
        { min: 0, max: 24, step: 1, unit_of_measurement: 'h' },
      ],
      ['button.geschirrspuler_kuche_start', 'unknown'],
      ['button.geschirrspuler_kuche_pause', 'unknown'],
      ['button.geschirrspuler_kuche_stopp', 'unknown'],
      [
        'sensor.geschirrspuler_kuche_wasserverbrauch',
        '1843.2',
        { device_class: 'water', unit_of_measurement: 'L' },
      ],
      ['sensor.geschirrspuler_kuche_status', 'Off · 2 h left'],
    ],
    expected: {
      kind: 'dishwasher',
      status: 'off',
      listed: true,
      roles: {
        state: 'sensor.geschirrspuler_kuche_maschinenzustand',
        phase: 'sensor.geschirrspuler_kuche_fortschritt',
        progress: 'sensor.geschirrspuler_kuche_fortschritt_in_prozent',
        finish: 'sensor.geschirrspuler_kuche_voraussichtliches_ende',
        remaining: 'sensor.geschirrspuler_kuche_fertigstellungszeit',
        power: 'switch.geschirrspuler_kuche_ein_aus',
        remote: 'binary_sensor.geschirrspuler_kuche_intelligente_steuerung',
        program: 'select.geschirrspuler_kuche_programm',
        start: 'button.geschirrspuler_kuche_start',
        pause: 'button.geschirrspuler_kuche_pause',
        stop: 'button.geschirrspuler_kuche_stopp',
        water: 'sensor.geschirrspuler_kuche_wasserverbrauch',
      },
    },
  };
};

/**
 * A washer rinsing, its softener low: its power a flag (it cannot be switched from afar), its course select named
 * after its table of courses, its wash's temperature and spin set before it started.
 */
export const localthingsWasher: FixtureAt = (now) => {
  const e = entriesFor(PLATFORM, 'lt-washer');
  return {
    title: 'LocalThings washer, rinsing, its softener low',
    platform: PLATFORM,
    device: device('lt-washer', 'Waschmaschine Flur', 'WW90DG6U25LE', 'Samsung Electronics'),
    entities: [
      e('sensor.waschmaschine_flur_maschinenzustand', 'machine_state'),
      e('sensor.waschmaschine_flur_fortschritt', 'progress'),
      e('sensor.waschmaschine_flur_fortschritt_in_prozent', 'progress_percentage'),
      e('sensor.waschmaschine_flur_voraussichtliches_ende', 'finish_time'),
      e('sensor.waschmaschine_flur_fertigstellungszeit', 'completion_minutes'),
      e('binary_sensor.waschmaschine_flur_ein_aus', 'power_switch'),
      e('binary_sensor.waschmaschine_flur_lauft', 'cycle_active'),
      e('binary_sensor.waschmaschine_flur_intelligente_steuerung', 'remote_control'),
      e('select.waschmaschine_flur_programm', 'washer_cycle_table_00'),
      e('select.waschmaschine_flur_waschtemperatur', 'wash_temperature', {
        entity_category: 'config',
      }),
      e('select.waschmaschine_flur_schleuderdrehzahl', 'spin_speed', { entity_category: 'config' }),
      e('button.waschmaschine_flur_start', 'start'),
      e('button.waschmaschine_flur_pause', 'pause'),
      e('button.waschmaschine_flur_stopp', 'stop'),
      e('binary_sensor.waschmaschine_flur_waschmittel_niedrig', 'detergent_low'),
      e('binary_sensor.waschmaschine_flur_weichspuler_niedrig', 'softener_low'),
      e('sensor.waschmaschine_flur_energie', 'energy_kwh'),
      e('sensor.waschmaschine_flur_wasserverbrauch', 'water_liters'),
    ],
    states: [
      ['sensor.waschmaschine_flur_maschinenzustand', 'active', MACHINE, 52 * 60],
      ['sensor.waschmaschine_flur_fortschritt', 'rinse', PROGRESS, 6 * 60],
      ['sensor.waschmaschine_flur_fortschritt_in_prozent', '62', { unit_of_measurement: '%' }],
      [
        'sensor.waschmaschine_flur_voraussichtliches_ende',
        minutesFrom(now, 34),
        { device_class: 'timestamp' },
      ],
      ['sensor.waschmaschine_flur_fertigstellungszeit', '34', MINUTES],
      ['binary_sensor.waschmaschine_flur_ein_aus', 'on', { device_class: 'power' }],
      ['binary_sensor.waschmaschine_flur_lauft', 'on', { device_class: 'running' }],
      ['binary_sensor.waschmaschine_flur_intelligente_steuerung', 'on', REMOTE],
      [
        'select.waschmaschine_flur_programm',
        '5b',
        { options: ['01', '5b', '5c', '5d', '5e', '65', '70'] },
      ],
      [
        'select.waschmaschine_flur_waschtemperatur',
        'warm',
        { options: ['cold', 'cool', 'warm', 'hot', 'extra_hot'] },
      ],
      [
        'select.waschmaschine_flur_schleuderdrehzahl',
        'high',
        { options: ['rinse_hold', 'no_spin', 'low', 'medium', 'high', 'extra_high'] },
      ],
      ['button.waschmaschine_flur_start', 'unknown'],
      ['button.waschmaschine_flur_pause', 'unknown'],
      ['button.waschmaschine_flur_stopp', 'unknown'],
      ['binary_sensor.waschmaschine_flur_waschmittel_niedrig', 'off', { device_class: 'problem' }],
      [
        'binary_sensor.waschmaschine_flur_weichspuler_niedrig',
        'on',
        { device_class: 'problem' },
        26 * 3600,
      ],
      [
        'sensor.waschmaschine_flur_energie',
        '214.7',
        { device_class: 'energy', unit_of_measurement: 'kWh' },
      ],
      [
        'sensor.waschmaschine_flur_wasserverbrauch',
        '9120.5',
        { device_class: 'water', unit_of_measurement: 'L' },
      ],
    ],
    expected: {
      kind: 'washer',
      status: 'running',
      listed: true,
      roles: {
        state: 'sensor.waschmaschine_flur_maschinenzustand',
        phase: 'sensor.waschmaschine_flur_fortschritt',
        progress: 'sensor.waschmaschine_flur_fortschritt_in_prozent',
        finish: 'sensor.waschmaschine_flur_voraussichtliches_ende',
        remaining: 'sensor.waschmaschine_flur_fertigstellungszeit',
        power: 'binary_sensor.waschmaschine_flur_ein_aus',
        program: 'select.waschmaschine_flur_programm',
        wash_temperature: 'select.waschmaschine_flur_waschtemperatur',
        spin: 'select.waschmaschine_flur_schleuderdrehzahl',
        start: 'button.waschmaschine_flur_start',
        pause: 'button.waschmaschine_flur_pause',
        stop: 'button.waschmaschine_flur_stopp',
        energy: 'sensor.waschmaschine_flur_energie',
        water: 'sensor.waschmaschine_flur_wasserverbrauch',
      },
    },
  };
};

/** An oven preheating for a convection bake: its cavity's state the step, its start the cook it holds, its lamp on. */
export const localthingsOven: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'lt-oven');
  const temperature = { device_class: 'temperature', unit_of_measurement: '°C' };
  return {
    title: 'LocalThings oven, preheating',
    platform: PLATFORM,
    device: device('lt-oven', 'Backofen Küche', 'NV7B4040VBB', 'Samsung Electronics'),
    entities: [
      e('sensor.backofen_kuche_maschinenzustand', 'machine_state'),
      e('sensor.backofen_kuche_garraumstatus', 'oven_state'),
      e('sensor.backofen_kuche_aktuelle_temperatur', 'current_temp_c'),
      e('number.backofen_kuche_solltemperatur', 'oven_setpoint'),
      e('select.backofen_kuche_garmodus', 'oven_mode'),
      e('binary_sensor.backofen_kuche_tur', 'door_open'),
      e('switch.backofen_kuche_lampe', 'lamp'),
      e('button.backofen_kuche_garen_starten', 'start_cooking'),
      e('button.backofen_kuche_stopp', 'stop'),
      e('switch.backofen_kuche_ein_aus', 'power_switch'),
      e('binary_sensor.backofen_kuche_intelligente_steuerung', 'remote_control'),
    ],
    states: [
      ['sensor.backofen_kuche_maschinenzustand', 'active', MACHINE, 9 * 60],
      [
        'sensor.backofen_kuche_garraumstatus',
        'preheat',
        { device_class: 'enum', options: ['ready', 'preheat', 'cooking', 'finish'] },
        9 * 60,
      ],
      ['sensor.backofen_kuche_aktuelle_temperatur', '148', temperature],
      [
        'number.backofen_kuche_solltemperatur',
        '200',
        { ...temperature, min: 30, max: 275, step: 5 },
      ],
      [
        'select.backofen_kuche_garmodus',
        'convection_bake',
        { options: ['bake', 'convection_bake', 'convection_roast', 'broil', 'air_fry'] },
      ],
      ['binary_sensor.backofen_kuche_tur', 'off', { device_class: 'door' }],
      ['switch.backofen_kuche_lampe', 'on'],
      ['button.backofen_kuche_garen_starten', 'unknown'],
      ['button.backofen_kuche_stopp', 'unknown'],
      ['switch.backofen_kuche_ein_aus', 'on'],
      ['binary_sensor.backofen_kuche_intelligente_steuerung', 'on', REMOTE],
    ],
    expected: {
      kind: 'oven',
      status: 'preheating',
      listed: true,
      roles: {
        state: 'sensor.backofen_kuche_maschinenzustand',
        phase: 'sensor.backofen_kuche_garraumstatus',
        temperature: 'sensor.backofen_kuche_aktuelle_temperatur',
        target: 'number.backofen_kuche_solltemperatur',
        program: 'select.backofen_kuche_garmodus',
        door: 'binary_sensor.backofen_kuche_tur',
        light: 'switch.backofen_kuche_lampe',
        start: 'button.backofen_kuche_garen_starten',
        stop: 'button.backofen_kuche_stopp',
        power: 'switch.backofen_kuche_ein_aus',
      },
    },
  };
};

/** The roles #91's reporter named on the dishwasher before the card read LocalThings: its state, power and progress. */
export const LOCALTHINGS_ROLES = [
  { role: 'state', entity: 'sensor.geschirrspuler_kuche_maschinenzustand' },
  { role: 'power', entity: 'switch.geschirrspuler_kuche_ein_aus' },
  { role: 'phase', entity: 'sensor.geschirrspuler_kuche_fortschritt' },
] as const;
