import { device, entriesFor, type ApplianceFixture, type FixtureAt, type Seed } from './house.js';
import type { ApplianceStatus } from '../status.js';

/*
 * Devices of integrations the card does not know, found through MQTT discovery (#115): the reporter's Decent Espresso
 * DE1PRO, as the tablet's plugin publishes it (simpkins/de1plus-mqtt plugin.tcl: the device "Decent Espresso <model>"
 * by "Decent Espresso", its entities named "DE1+ <name>", so Home Assistant's ids are the device's name and theirs;
 * its states the machine's own camel-cased words, every entity out of reach when the tablet loses the machine), and a
 * Bosch washer and dryer on hcpy (hcpy2-0/hcpy HADiscovery.py: the device named by its type in lower case, its
 * entities by the last word of the appliance's own keys, its ids those keys whole and run together,
 * "sensor.washer_bsh_common_status_operationstate"; its states the keys' enum words).
 */

const PLATFORM = 'mqtt';

/** The DE1's profiles, as its select lists their titles (the de1app's own). */
export const DE1_PROFILES = [
  'Default',
  'Blooming espresso',
  'Londinium',
  'Gentle and sweet',
  'Best practice light roast',
];

/** The moments the DE1 is shown at: at rest, pulling a shot, steaming, asleep, its tank wanting water, failed, lost. */
export type De1Moment = 'idle' | 'espresso' | 'steam' | 'sleep' | 'refill' | 'fatal' | 'lost';
export const DE1_MOMENTS: readonly De1Moment[] = [
  'idle',
  'espresso',
  'steam',
  'sleep',
  'refill',
  'fatal',
  'lost',
];

/** What the machine says at each moment: its state, substate, tank, group head and power, and the status read. */
const SAID: Readonly<
  Record<De1Moment, readonly [string, string, string, string, string, ApplianceStatus]>
> = {
  idle: ['Idle', 'ready', '1240', '92.4', 'on', 'idle'],
  espresso: ['Espresso', 'pouring', '1180', '93.1', 'on', 'running'],
  steam: ['Steam', 'steaming', '1150', '91.8', 'on', 'running'],
  sleep: ['Sleep', 'ready', '1240', '24.6', 'off', 'off'],
  refill: ['Refill', 'ready', '60', '92.2', 'on', 'attention'],
  fatal: ['FatalError', 'error_tsensor', '1240', '92.4', 'on', 'error'],
  lost: ['unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'offline'],
};

/** The DE1 at a moment: its ids and names as Home Assistant makes them, the device's name then the plugin's. */
export const de1 =
  (moment: De1Moment = 'idle'): FixtureAt =>
  () => {
    const e = entriesFor(PLATFORM, 'de1');
    const id = (domain: string, name: string): string =>
      `${domain}.decent_espresso_de1pro_de1_${name.toLowerCase().replace(/ /g, '_')}`;
    const seed = (
      domain: string,
      name: string,
      state: string,
      attributes: Record<string, unknown> = {},
      ago = 7200,
    ): Seed => [
      id(domain, name),
      state,
      { friendly_name: `Decent Espresso DE1PRO DE1+ ${name}`, ...attributes },
      ago,
    ];
    const [state, substate, water, head, power, status] = SAID[moment];
    const lost = moment === 'lost';
    const reading = (value: string): string => (lost ? 'unavailable' : value);
    const celsius = {
      device_class: 'temperature',
      unit_of_measurement: '°C',
      state_class: 'measurement',
    };
    const counted = { state_class: 'total_increasing' };
    // in the order discovery registers them, but the steam heater's switch before the machine's own
    const states: Seed[] = [
      seed('sensor', 'State', state, {}, 5 * 60),
      seed('sensor', 'Substate', substate),
      seed('sensor', 'Water Level', water, {
        device_class: 'volume_storage',
        unit_of_measurement: 'mL',
        state_class: 'measurement',
      }),
      seed('sensor', 'Head Temperature', head, celsius),
      seed('sensor', 'Mix Temperature', reading('88.0'), celsius),
      seed('sensor', 'Steam Temperature', reading('160.0'), celsius),
      seed('sensor', 'Espresso Count', reading('1834'), counted, 25 * 60),
      seed('sensor', 'Steaming Count', reading('642'), counted, 26 * 60),
      seed('sensor', 'Steam Heater Mode', reading('On')),
      seed('switch', 'Steam Heater On', reading('on')),
      seed('switch', 'On', power),
      seed('select', 'Profile', reading('Blooming espresso'), { options: DE1_PROFILES }),
    ];
    return {
      title: `Decent Espresso DE1PRO, ${moment}`,
      platform: PLATFORM,
      device: device('de1', 'Decent Espresso DE1PRO', 'DE1PRO', 'Decent Espresso'),
      entities: states.map(([entity]) => e(entity)),
      states,
      expected: {
        kind: 'coffee',
        status,
        listed: false,
        roles: {
          state: id('sensor', 'State'),
          power: id('switch', 'On'),
          program: id('select', 'Profile'),
          temperature: id('sensor', 'Head Temperature'),
        },
      },
    };
  };

/** The DE1 at every moment, each alone in its house. */
export const de1Moments = (now: number): readonly ApplianceFixture[] =>
  DE1_MOMENTS.map((moment) => de1(moment)(now));

/** A hcpy appliance's entity id: its device's name and the appliance's key run together. */
const hcpy = (device: string, domain: string, key: string): string => `${domain}.${device}_${key}`;

/** A seconds' duration, as hcpy publishes the appliance's times. */
const SECONDS = { device_class: 'duration', unit_of_measurement: 's' };
/** BSH's operation states, hcpy's enum. */
const OPERATION = {
  device_class: 'enum',
  options: [
    'Inactive',
    'Ready',
    'DelayedStart',
    'Run',
    'Pause',
    'ActionRequired',
    'Finished',
    'Error',
    'Aborting',
  ],
};
const DOOR = { device_class: 'enum', options: ['Open', 'Closed', 'Locked'] };

/** A Bosch washer on hcpy, washing Cotton at 40: 47 minutes left of 1 h 16, its door locked. */
export const hcpyWasher: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'hcpy-washer');
  const id = (domain: string, key: string): string => hcpy('washer', domain, key);
  const states: Seed[] = [
    [id('sensor', 'bsh_common_status_operationstate'), 'Run', OPERATION, 29 * 60],
    [id('sensor', 'bsh_common_status_doorstate'), 'Locked', DOOR],
    [id('switch', 'bsh_common_setting_powerstate'), 'on'],
    [id('binary_sensor', 'bsh_common_status_remotecontrolstartallowed'), 'off'],
    [id('sensor', 'bsh_common_option_remainingprogramtime'), '2820', SECONDS],
    [id('sensor', 'bsh_common_option_estimatedtotalprogramtime'), '4560', SECONDS],
    [id('sensor', 'bsh_common_option_programprogress'), '38', { unit_of_measurement: '%' }],
    [
      id('select', 'bsh_common_root_selectedprogram'),
      'Cotton',
      { options: ['Cotton', 'EasyCare', 'Mix', 'DelicatesSilk', 'Wool'] },
    ],
    [id('sensor', 'laundrycare_washer_option_temperature'), 'GC40', { device_class: 'enum' }],
    [id('sensor', 'laundrycare_washer_option_spinspeed'), 'RPM1400', { device_class: 'enum' }],
    [id('button', 'bsh_common_command_pauseprogram'), 'unknown'],
    [id('button', 'bsh_common_command_resumeprogram'), 'unknown'],
    [id('button', 'bsh_common_command_abortprogram'), 'unknown'],
    [id('sensor', 'rssi'), '-58', { unit_of_measurement: 'dBm' }],
  ];
  return {
    title: 'A Bosch washer on hcpy, washing',
    platform: PLATFORM,
    device: device('hcpy-washer', 'washer', 'Washer', 'Bosch', 'WAX32M40'),
    entities: states.map(([entity]) =>
      e(entity, undefined, entity.endsWith('_rssi') ? { entity_category: 'diagnostic' } : {}),
    ),
    states,
    expected: {
      kind: 'washer',
      status: 'running',
      listed: false,
      roles: {
        state: id('sensor', 'bsh_common_status_operationstate'),
        door: id('sensor', 'bsh_common_status_doorstate'),
        power: id('switch', 'bsh_common_setting_powerstate'),
        remaining: id('sensor', 'bsh_common_option_remainingprogramtime'),
        total: id('sensor', 'bsh_common_option_estimatedtotalprogramtime'),
        progress: id('sensor', 'bsh_common_option_programprogress'),
        program: id('select', 'bsh_common_root_selectedprogram'),
        pause: id('button', 'bsh_common_command_pauseprogram'),
        resume: id('button', 'bsh_common_command_resumeprogram'),
        stop: id('button', 'bsh_common_command_abortprogram'),
      },
    },
  };
};

/** A Bosch dryer on hcpy, done with Cotton twenty minutes ago, its door shut. */
export const hcpyDryer: FixtureAt = () => {
  const e = entriesFor(PLATFORM, 'hcpy-dryer');
  const id = (domain: string, key: string): string => hcpy('dryer', domain, key);
  const states: Seed[] = [
    [id('sensor', 'bsh_common_status_operationstate'), 'Finished', OPERATION, 20 * 60],
    [id('sensor', 'bsh_common_status_doorstate'), 'Closed', DOOR],
    [id('switch', 'bsh_common_setting_powerstate'), 'on'],
    [id('sensor', 'bsh_common_option_remainingprogramtime'), '0', SECONDS],
    [id('sensor', 'bsh_common_option_programprogress'), '100', { unit_of_measurement: '%' }],
    [
      id('select', 'bsh_common_root_selectedprogram'),
      'Cotton',
      { options: ['Cotton', 'Synthetic', 'Mix', 'Delicates'] },
    ],
    [
      id('sensor', 'laundrycare_dryer_option_dryingtarget'),
      'CupboardDry',
      { device_class: 'enum' },
    ],
    [id('button', 'bsh_common_command_abortprogram'), 'unknown'],
  ];
  return {
    title: 'A Bosch dryer on hcpy, done',
    platform: PLATFORM,
    device: device('hcpy-dryer', 'dryer', 'Dryer', 'Bosch', 'WQB246C9'),
    entities: states.map(([entity]) => e(entity)),
    states,
    expected: {
      kind: 'dryer',
      status: 'finished',
      listed: false,
      roles: {
        state: id('sensor', 'bsh_common_status_operationstate'),
        door: id('sensor', 'bsh_common_status_doorstate'),
        power: id('switch', 'bsh_common_setting_powerstate'),
        remaining: id('sensor', 'bsh_common_option_remainingprogramtime'),
        progress: id('sensor', 'bsh_common_option_programprogress'),
        program: id('select', 'bsh_common_root_selectedprogram'),
        stop: id('button', 'bsh_common_command_abortprogram'),
      },
    },
  };
};
