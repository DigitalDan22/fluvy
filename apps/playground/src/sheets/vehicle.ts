import { FluvyVehicleCard } from '../../../../packages/cards/src/vehicle/vehicle-card.js';
import type { StateSeed } from '../hass.js';
import type { SheetSpec } from '../scenes.js';

// its chunk lands after the page has drawn: the sheet defines the card from its module, as the web sheet does
if (!customElements.get('fluvy-vehicle-card'))
  customElements.define('fluvy-vehicle-card', FluvyVehicleCard);

/*
 * Issue #84's cars, each as its integration's registry and states say it: a Model Y on Teslemetry charging at home
 * (its translation keys: a charge cable's latch that is never the car's lock, the route's tracker that is never where
 * it is, a horn and a wake button that are never controls), a Model 3 on Tessie driving, a Model S on Tesla Fleet
 * parked and locked at work with sentry on, a Model X asleep on a cold night, an EV6 on Kia's integration plugged in
 * and not charging, unlocked, a window open, its 12 V battery beside its own and an hour-old report, an IONIQ 5 charging
 * away from home with its time to full as a duration, an i4 on BMW's CarData with a handful of entities read by their
 * names, and a Leaf that dropped off the network. Then the layouts: compact, the strip, the ring, the picture over the
 * battery and in the head, the tyres from above, the card's own controls and rows, half a section, a phone's column
 * and a desktop's. Last, a Model 3 on tesla_custom, whose charge port's latch is never its lock.
 */

/** The mock's moment: the times to full are counted from it. */
const NOW = '2026-09-17T21:47:12';
const at = (minutes: number): string => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

type Attributes = Record<string, unknown>;
const percent = (name: string, battery = true): Attributes => ({
  friendly_name: name,
  unit_of_measurement: '%',
  ...(battery ? { device_class: 'battery' } : {}),
});
const km = (name: string, value = true): Attributes => ({
  friendly_name: name,
  unit_of_measurement: 'km',
  device_class: 'distance',
  ...(value ? {} : {}),
});
const temp = (name: string): Attributes => ({
  friendly_name: name,
  unit_of_measurement: '°C',
  device_class: 'temperature',
});
const bar = (name: string, unit = 'bar'): Attributes => ({
  friendly_name: name,
  unit_of_measurement: unit,
  device_class: 'pressure',
});
const flag = (name: string, deviceClass: string): Attributes => ({
  friendly_name: name,
  device_class: deviceClass,
});
const climate = (name: string, current: number, target: number, action = 'off'): Attributes => ({
  friendly_name: name,
  hvac_modes: ['off', 'heat_cool'],
  hvac_action: action,
  current_temperature: current,
  temperature: target,
  min_temp: 15,
  max_temp: 28,
  target_temp_step: 0.5,
  temperature_unit: '°C',
  supported_features: 1 | 128 | 256,
});

/** A car's picture as a person would give one: its side on nothing, no brand (a stand-in for `/local/car.png`). */
const PICTURE = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
    <defs>
      <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9ecef"/><stop offset=".55" stop-color="#c9ced4"/><stop offset="1" stop-color="#8e959d"/></linearGradient>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a3138"/><stop offset="1" stop-color="#454f59"/></linearGradient>
      <radialGradient id="s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="320" cy="262" rx="270" ry="16" fill="url(#s)"/>
    <path d="M58 214c-6-26 4-44 30-52l92-24c34-34 76-56 132-60 74-5 138 16 186 58l58 10c28 6 40 24 40 52v14c0 10-8 18-18 18H82c-14 0-22-6-24-16z" fill="url(#b)"/>
    <path d="M196 136c30-28 66-44 114-46 58-2 104 14 140 44z" fill="url(#g)"/>
    <path d="M318 92v44" stroke="#c9ced4" stroke-width="5"/>
    <path d="M64 196h512" stroke="#7d848c" stroke-width="2" opacity=".5"/>
    <path d="M552 168l26 6" stroke="#d8442f" stroke-width="6" stroke-linecap="round"/>
    <path d="M70 172l24-6" stroke="#f3f5f7" stroke-width="6" stroke-linecap="round"/>
    <circle cx="164" cy="232" r="38" fill="#22272c"/><circle cx="164" cy="232" r="20" fill="#9aa1a8"/><circle cx="164" cy="232" r="6" fill="#3a4148"/>
    <circle cx="486" cy="232" r="38" fill="#22272c"/><circle cx="486" cy="232" r="20" fill="#9aa1a8"/><circle cx="486" cy="232" r="6" fill="#3a4148"/>
  </svg>`,
)}`;

/** A Model Y on Teslemetry, charging at home to its limit; its route's tracker and its cable's latch beside it. */
const MODEL_Y: readonly StateSeed[] = [
  ['sensor.model_y_battery_level', '64', percent('Model Y Battery level')],
  ['sensor.model_y_estimate_battery_range', '312', km('Model Y Estimate battery range')],
  [
    'sensor.model_y_charging',
    'charging',
    { friendly_name: 'Model Y Charging', device_class: 'enum' },
  ],
  ['switch.model_y_charge', 'on', { friendly_name: 'Model Y Charge' }],
  ['binary_sensor.model_y_charge_cable', 'on', flag('Model Y Charge cable', 'connectivity')],
  [
    'sensor.model_y_charger_power',
    '7.2',
    { friendly_name: 'Model Y Charger power', unit_of_measurement: 'kW', device_class: 'power' },
  ],
  [
    'sensor.model_y_charge_rate',
    '46',
    { friendly_name: 'Model Y Charge rate', unit_of_measurement: 'km/h', device_class: 'speed' },
  ],
  [
    'sensor.model_y_time_to_full_charge',
    at(72),
    { friendly_name: 'Model Y Time to full charge', device_class: 'timestamp' },
  ],
  [
    'number.model_y_charge_limit',
    '80',
    { friendly_name: 'Model Y Charge limit', min: 50, max: 100, step: 1, unit_of_measurement: '%' },
  ],
  [
    'cover.model_y_charge_port_door',
    'open',
    { friendly_name: 'Model Y Charge port door', device_class: 'door', supported_features: 3 },
  ],
  ['lock.model_y_charge_cable_lock', 'locked', { friendly_name: 'Model Y Charge cable lock' }],
  ['climate.model_y_climate', 'off', climate('Model Y Climate', 14, 21)],
  ['sensor.model_y_inside_temperature', '14', temp('Model Y Inside temperature')],
  ['sensor.model_y_outside_temperature', '11', temp('Model Y Outside temperature')],
  ['lock.model_y_lock', 'locked', { friendly_name: 'Model Y Lock' }],
  [
    'cover.model_y_trunk',
    'closed',
    { friendly_name: 'Model Y Trunk', device_class: 'door', supported_features: 3 },
  ],
  [
    'cover.model_y_frunk',
    'closed',
    { friendly_name: 'Model Y Frunk', device_class: 'door', supported_features: 1 },
  ],
  [
    'cover.model_y_windows',
    'closed',
    { friendly_name: 'Model Y Windows', device_class: 'window', supported_features: 3 },
  ],
  ['switch.model_y_sentry_mode', 'off', { friendly_name: 'Model Y Sentry mode' }],
  ['sensor.model_y_odometer', '24318', km('Model Y Odometer')],
  ['sensor.model_y_tire_pressure_front_left', '2.9', bar('Model Y Tire pressure front left')],
  ['sensor.model_y_tire_pressure_front_right', '2.9', bar('Model Y Tire pressure front right')],
  ['sensor.model_y_tire_pressure_rear_left', '2.8', bar('Model Y Tire pressure rear left')],
  ['sensor.model_y_tire_pressure_rear_right', '2.3', bar('Model Y Tire pressure rear right')],
  [
    'binary_sensor.model_y_tire_pressure_warning_rear_right',
    'on',
    flag('Model Y Tire pressure warning rear right', 'problem'),
  ],
  ['binary_sensor.model_y_front_driver_door', 'off', flag('Model Y Front driver door', 'door')],
  [
    'binary_sensor.model_y_front_driver_window',
    'off',
    flag('Model Y Front driver window', 'window'),
  ],
  [
    'device_tracker.model_y_location',
    'home',
    { friendly_name: 'Model Y Location', source_type: 'gps' },
  ],
  [
    'device_tracker.model_y_route',
    'not_home',
    { friendly_name: 'Model Y Route', source_type: 'gps' },
  ],
  [
    'update.model_y_update',
    'off',
    {
      friendly_name: 'Model Y Update',
      installed_version: '2026.32.4',
      latest_version: '2026.32.4',
    },
  ],
  ['binary_sensor.model_y_status', 'on', flag('Model Y Status', 'connectivity')],
  [
    'sensor.model_y_shift_state',
    'p',
    { friendly_name: 'Model Y Shift state', device_class: 'enum' },
  ],
  ['button.model_y_honk_horn', 'unknown', { friendly_name: 'Model Y Honk horn' }],
  ['button.model_y_wake', 'unknown', { friendly_name: 'Model Y Wake' }],
];

/** A Model 3 on Tessie, driving: its usable charge (Tessie's only), in gear at 64 km/h, the cabin cooled to 20. */
const MODEL_3: readonly StateSeed[] = [
  ['sensor.model_3_usable_battery_level', '58', percent('Model 3 Usable battery level')],
  ['sensor.model_3_battery_range', '287', km('Model 3 Battery range')],
  [
    'sensor.model_3_charging',
    'disconnected',
    { friendly_name: 'Model 3 Charging', device_class: 'enum' },
  ],
  ['binary_sensor.model_3_charge_cable', 'off', flag('Model 3 Charge cable', 'connectivity')],
  [
    'number.model_3_charge_limit',
    '90',
    { friendly_name: 'Model 3 Charge limit', min: 50, max: 100, step: 1 },
  ],
  ['climate.model_3_climate', 'heat_cool', climate('Model 3 Climate', 24, 20, 'cooling')],
  ['lock.model_3_lock', 'locked', { friendly_name: 'Model 3 Lock' }],
  [
    'cover.model_3_trunk',
    'closed',
    { friendly_name: 'Model 3 Trunk', device_class: 'door', supported_features: 3 },
  ],
  [
    'cover.model_3_frunk',
    'closed',
    { friendly_name: 'Model 3 Frunk', device_class: 'door', supported_features: 1 },
  ],
  ['cover.model_3_windows', 'closed', { friendly_name: 'Model 3 Windows', supported_features: 3 }],
  ['switch.model_3_sentry_mode', 'off', { friendly_name: 'Model 3 Sentry mode' }],
  ['sensor.model_3_odometer', '51207', km('Model 3 Odometer')],
  ['device_tracker.model_3_location', 'not_home', { friendly_name: 'Model 3 Location' }],
  [
    'sensor.model_3_shift_state',
    'd',
    { friendly_name: 'Model 3 Shift state', device_class: 'enum' },
  ],
  [
    'sensor.model_3_speed',
    '64',
    { friendly_name: 'Model 3 Speed', unit_of_measurement: 'km/h', device_class: 'speed' },
  ],
  ['binary_sensor.model_3_status', 'on', flag('Model 3 Status', 'connectivity')],
];

/** A Model S on Tesla Fleet, parked and locked at work, sentry on, unplugged. */
const MODEL_S: readonly StateSeed[] = [
  ['sensor.model_s_battery_level', '81', percent('Model S Battery level')],
  ['sensor.model_s_battery_range', '486', km('Model S Battery range')],
  [
    'sensor.model_s_charging',
    'disconnected',
    { friendly_name: 'Model S Charging', device_class: 'enum' },
  ],
  ['binary_sensor.model_s_charge_cable', 'off', flag('Model S Charge cable', 'connectivity')],
  ['switch.model_s_charge', 'off', { friendly_name: 'Model S Charge' }],
  [
    'number.model_s_charge_limit',
    '80',
    { friendly_name: 'Model S Charge limit', min: 50, max: 100, step: 1 },
  ],
  ['climate.model_s_climate', 'off', climate('Model S Climate', 19, 21)],
  ['sensor.model_s_inside_temperature', '19', temp('Model S Inside temperature')],
  ['lock.model_s_lock', 'locked', { friendly_name: 'Model S Lock' }],
  ['cover.model_s_trunk', 'closed', { friendly_name: 'Model S Trunk', supported_features: 3 }],
  ['cover.model_s_frunk', 'closed', { friendly_name: 'Model S Frunk', supported_features: 1 }],
  ['cover.model_s_windows', 'closed', { friendly_name: 'Model S Windows', supported_features: 3 }],
  ['switch.model_s_sentry_mode', 'on', { friendly_name: 'Model S Sentry mode' }],
  ['sensor.model_s_odometer', '88412', km('Model S Odometer')],
  ['device_tracker.model_s_location', 'Work', { friendly_name: 'Model S Location' }],
  ['binary_sensor.model_s_status', 'on', flag('Model S Status', 'connectivity')],
  [
    'sensor.model_s_shift_state',
    'p',
    { friendly_name: 'Model S Shift state', device_class: 'enum' },
  ],
];

/** A Model X on Tesla Fleet, asleep in the street on a cold night: the cabin at 2 °C, the climate off. */
const MODEL_X: readonly StateSeed[] = [
  ['sensor.model_x_battery_level', '47', percent('Model X Battery level')],
  ['sensor.model_x_battery_range', '241', km('Model X Battery range')],
  [
    'sensor.model_x_charging',
    'disconnected',
    { friendly_name: 'Model X Charging', device_class: 'enum' },
  ],
  ['binary_sensor.model_x_charge_cable', 'off', flag('Model X Charge cable', 'connectivity')],
  ['switch.model_x_charge', 'off', { friendly_name: 'Model X Charge' }],
  [
    'number.model_x_charge_limit',
    '90',
    { friendly_name: 'Model X Charge limit', min: 50, max: 100, step: 1 },
  ],
  ['climate.model_x_climate', 'off', climate('Model X Climate', 2, 21)],
  ['sensor.model_x_inside_temperature', '2', temp('Model X Inside temperature')],
  ['lock.model_x_lock', 'locked', { friendly_name: 'Model X Lock' }],
  ['cover.model_x_trunk', 'closed', { friendly_name: 'Model X Trunk', supported_features: 3 }],
  ['cover.model_x_frunk', 'closed', { friendly_name: 'Model X Frunk', supported_features: 1 }],
  ['cover.model_x_windows', 'closed', { friendly_name: 'Model X Windows', supported_features: 3 }],
  ['switch.model_x_sentry_mode', 'off', { friendly_name: 'Model X Sentry mode' }],
  ['sensor.model_x_odometer', '112940', km('Model X Odometer')],
  ['device_tracker.model_x_location', 'not_home', { friendly_name: 'Model X Location' }],
  ['binary_sensor.model_x_status', 'off', flag('Model X Status', 'connectivity')],
];

/**
 * An EV6 on Kia's integration (kia_uvo): plugged in and not charging, left unlocked, a front window open; its 12 V
 * battery beside its own (never the car's), a refresh that would wake it (never a control), last heard from an hour
 * and a half ago, its address in words.
 */
const EV6: readonly StateSeed[] = [
  ['sensor.ev6_ev_battery_level', '76', percent('EV6 EV battery level')],
  ['sensor.ev6_car_battery_level', '88', percent('EV6 Car battery level')],
  ['sensor.ev6_ev_range', '402', km('EV6 EV range')],
  ['binary_sensor.ev6_ev_battery_charge', 'off', flag('EV6 EV battery charge', 'battery_charging')],
  ['binary_sensor.ev6_ev_battery_plug', 'on', flag('EV6 EV battery plug', 'plug')],
  [
    'number.ev6_ac_charging_limit',
    '90',
    {
      friendly_name: 'EV6 AC charging limit',
      min: 50,
      max: 100,
      step: 10,
      unit_of_measurement: '%',
    },
  ],
  ['switch.ev6_ev_charging', 'off', { friendly_name: 'EV6 EV charging' }],
  [
    'climate.ev6_climate',
    'off',
    { ...climate('EV6 Climate', 0, 22), current_temperature: null, hvac_modes: ['off', 'auto'] },
  ],
  ['sensor.ev6_outside_temperature', '12', temp('EV6 Outside temperature')],
  ['lock.ev6_door_lock', 'unlocked', { friendly_name: 'EV6 Door lock' }],
  ['binary_sensor.ev6_front_left_door', 'off', flag('EV6 Front left door', 'door')],
  ['binary_sensor.ev6_front_right_door', 'off', flag('EV6 Front right door', 'door')],
  ['binary_sensor.ev6_trunk', 'off', flag('EV6 Trunk', 'door')],
  ['binary_sensor.ev6_hood', 'off', flag('EV6 Hood', 'door')],
  ['binary_sensor.ev6_front_left_window', 'on', flag('EV6 Front left window', 'window')],
  ['binary_sensor.ev6_front_right_window', 'off', flag('EV6 Front right window', 'window')],
  ['sensor.ev6_odometer', '18233', km('EV6 Odometer')],
  ['sensor.ev6_tire_pressure_front_left', '36', bar('EV6 Tire pressure front left', 'psi')],
  ['sensor.ev6_tire_pressure_front_right', '36', bar('EV6 Tire pressure front right', 'psi')],
  ['sensor.ev6_tire_pressure_rear_left', '35', bar('EV6 Tire pressure rear left', 'psi')],
  ['sensor.ev6_tire_pressure_rear_right', '35', bar('EV6 Tire pressure rear right', 'psi')],
  ['device_tracker.ev6_location', 'home', { friendly_name: 'EV6 Location' }],
  [
    'sensor.ev6_geocoded_location',
    'Carrer de Mallorca 401, Barcelona',
    { friendly_name: 'EV6 Geocoded location' },
  ],
  [
    'sensor.ev6_last_updated_at',
    at(-94),
    { friendly_name: 'EV6 Last updated at', device_class: 'timestamp' },
  ],
  ['button.ev6_force_update', 'unknown', { friendly_name: 'EV6 Force update' }],
];

/** An IONIQ 5 on the same integration, charging away from home: its time to full as a duration (minutes). */
const IONIQ5: readonly StateSeed[] = [
  ['sensor.ioniq_5_ev_battery_level', '38', percent('IONIQ 5 EV battery level')],
  ['sensor.ioniq_5_ev_range', '161', km('IONIQ 5 EV range')],
  [
    'binary_sensor.ioniq_5_ev_battery_charge',
    'on',
    flag('IONIQ 5 EV battery charge', 'battery_charging'),
  ],
  ['binary_sensor.ioniq_5_ev_battery_plug', 'on', flag('IONIQ 5 EV battery plug', 'plug')],
  [
    'sensor.ioniq_5_ev_charging_power',
    '10.5',
    {
      friendly_name: 'IONIQ 5 EV charging power',
      unit_of_measurement: 'kW',
      device_class: 'power',
    },
  ],
  [
    'sensor.ioniq_5_estimated_charge_duration',
    '95',
    {
      friendly_name: 'IONIQ 5 Estimated charge duration',
      unit_of_measurement: 'min',
      device_class: 'duration',
    },
  ],
  [
    'number.ioniq_5_ac_charging_limit',
    '100',
    { friendly_name: 'IONIQ 5 AC charging limit', min: 50, max: 100, step: 10 },
  ],
  ['switch.ioniq_5_ev_charging', 'on', { friendly_name: 'IONIQ 5 EV charging' }],
  [
    'climate.ioniq_5_climate',
    'off',
    {
      ...climate('IONIQ 5 Climate', 0, 21),
      current_temperature: null,
      hvac_modes: ['off', 'auto'],
    },
  ],
  ['lock.ioniq_5_door_lock', 'locked', { friendly_name: 'IONIQ 5 Door lock' }],
  ['binary_sensor.ioniq_5_trunk', 'off', flag('IONIQ 5 Trunk', 'door')],
  ['binary_sensor.ioniq_5_front_left_window', 'off', flag('IONIQ 5 Front left window', 'window')],
  ['sensor.ioniq_5_odometer', '42110', km('IONIQ 5 Odometer')],
  ['device_tracker.ioniq_5_location', 'not_home', { friendly_name: 'IONIQ 5 Location' }],
  [
    'sensor.ioniq_5_geocoded_location',
    'Ionity Montseny, AP-7 km 113',
    { friendly_name: 'IONIQ 5 Geocoded location' },
  ],
  [
    'sensor.ioniq_5_last_updated_at',
    at(-6),
    { friendly_name: 'IONIQ 5 Last updated at', device_class: 'timestamp' },
  ],
];

/** An i4 on BMW's CarData: a handful of entities, its names in English, its lock a sensor's word, nothing to act on. */
const I4: readonly StateSeed[] = [
  ['sensor.i4_battery_ev_state_of_charge', '54', percent('i4 Battery EV State Of Charge')],
  ['sensor.i4_battery_charge_level_12v', '91', percent('i4 Battery charge level (12V)')],
  ['sensor.i4_range_ev_remaining_range', '241', km('i4 Range EV Remaining range')],
  [
    'sensor.i4_charging_ev_charging_state',
    'NOCHARGING',
    { friendly_name: 'i4 Charging EV Charging state' },
  ],
  [
    'sensor.i4_battery_ev_target_state_of_charge',
    '80',
    percent('i4 Battery EV Target state of charge', false),
  ],
  ['sensor.i4_vehicle_mileage', '12840', km('i4 Vehicle mileage')],
  ['sensor.i4_doors_lock', 'SECURED', { friendly_name: 'i4 Doors lock' }],
  ['binary_sensor.i4_tailgate_state', 'off', flag('i4 Tailgate state', 'opening')],
  ['device_tracker.i4_location', 'home', { friendly_name: 'i4 Location' }],
];

/**
 * A Model 3 on tesla_custom (from HACS), read by what its entities are: its charge port's latch is a lock as its doors'
 * is, and first in its registry, yet never the car's lock; its doors left unlocked.
 */
const MIDNIGHT: readonly StateSeed[] = [
  ['sensor.midnight_battery', '73', percent('Midnight Battery')],
  ['sensor.midnight_range', '341', km('Midnight Range')],
  ['lock.midnight_charge_port_latch', 'locked', { friendly_name: 'Midnight Charge port latch' }],
  ['lock.midnight_doors', 'unlocked', { friendly_name: 'Midnight Doors' }],
  [
    'device_tracker.midnight_location_tracker',
    'home',
    { friendly_name: 'Midnight Location tracker', source_type: 'gps' },
  ],
  ['sensor.midnight_mileage', '30215', km('Midnight Mileage')],
];

/** A Leaf whose integration dropped it: everything out of reach. */
const GONE: readonly StateSeed[] = [
  ['sensor.leaf_battery_level', 'unavailable', percent('Leaf Battery level')],
  ['sensor.leaf_battery_range', 'unavailable', km('Leaf Battery range')],
  ['sensor.leaf_charging', 'unavailable', { friendly_name: 'Leaf Charging', device_class: 'enum' }],
  ['lock.leaf_lock', 'unavailable', { friendly_name: 'Leaf Lock' }],
  ['climate.leaf_climate', 'unavailable', climate('Leaf Climate', 0, 21)],
  ['cover.leaf_trunk', 'unavailable', { friendly_name: 'Leaf Trunk', supported_features: 3 }],
  ['sensor.leaf_odometer', 'unavailable', km('Leaf Odometer')],
  ['device_tracker.leaf_location', 'unavailable', { friendly_name: 'Leaf Location' }],
];

/** Registry entries: each entity on its device, of its integration, with its key where the integration gives one. */
const entries = (
  device: string,
  platform: string,
  seeds: readonly StateSeed[],
  keys: Readonly<Record<string, string>> = {},
  diagnostic: readonly string[] = [],
) =>
  seeds.map(([id]) => [
    id,
    {
      entity_id: id,
      device_id: device,
      platform,
      labels: [],
      ...(keys[id] ? { translation_key: keys[id] } : {}),
      ...(diagnostic.includes(id) ? { entity_category: 'diagnostic' } : {}),
    },
  ]);

const device = (id: string, name: string, model: string) => [
  id,
  {
    id,
    name,
    name_by_user: null,
    model,
    manufacturer: '',
    area_id: null,
    labels: [],
    via_device_id: null,
  },
];

/** The Tesla integrations' keys, by the end of each id (their keys are the same on all three). */
const teslaKeys = (prefix: string, seeds: readonly StateSeed[]): Record<string, string> => {
  const KEYS: Readonly<Record<string, string>> = {
    battery_level: 'charge_state_battery_level',
    usable_battery_level: 'charge_state_usable_battery_level',
    estimate_battery_range: 'charge_state_est_battery_range',
    battery_range: 'charge_state_battery_range',
    charging: 'charge_state_charging_state',
    charge: 'charge_state_charging_state',
    charge_cable: 'charge_state_conn_charge_cable',
    charger_power: 'charge_state_charger_power',
    charge_rate: 'charge_state_charge_rate',
    time_to_full_charge: 'charge_state_minutes_to_full_charge',
    charge_limit: 'charge_state_charge_limit_soc',
    charge_port_door: 'charge_state_charge_port_door_open',
    charge_cable_lock: 'charge_state_charge_port_latch',
    climate: 'driver_temp',
    inside_temperature: 'climate_state_inside_temp',
    outside_temperature: 'climate_state_outside_temp',
    lock: 'vehicle_state_locked',
    trunk: 'vehicle_state_rt',
    frunk: 'vehicle_state_ft',
    windows: 'windows',
    sentry_mode: 'vehicle_state_sentry_mode',
    odometer: 'vehicle_state_odometer',
    tire_pressure_front_left: 'vehicle_state_tpms_pressure_fl',
    tire_pressure_front_right: 'vehicle_state_tpms_pressure_fr',
    tire_pressure_rear_left: 'vehicle_state_tpms_pressure_rl',
    tire_pressure_rear_right: 'vehicle_state_tpms_pressure_rr',
    tire_pressure_warning_rear_right: 'vehicle_state_tpms_soft_warning_rr',
    front_driver_door: 'vehicle_state_df',
    front_driver_window: 'vehicle_state_fd_window',
    location: 'location',
    route: 'route',
    update: 'vehicle_state_software_update_status',
    status: 'state',
    shift_state: 'drive_state_shift_state',
    speed: 'drive_state_speed',
    honk_horn: 'honk',
    wake: 'wake',
  };
  return Object.fromEntries(
    seeds.flatMap(([id]) => {
      const end = id.slice(id.indexOf('.') + 1).slice(prefix.length + 1);
      const key = KEYS[end];
      return key ? [[id, key]] : [];
    }),
  );
};

/** Kia's integration's keys, by the end of each id. */
const kiaKeys = (prefix: string, seeds: readonly StateSeed[]): Record<string, string> => {
  const KEYS: Readonly<Record<string, string>> = {
    ev_battery_level: 'ev_battery_percentage',
    car_battery_level: 'car_battery_percentage',
    ev_range: 'ev_driving_range',
    ev_battery_charge: 'ev_battery_is_charging',
    ev_battery_plug: 'ev_battery_is_plugged_in',
    ev_charging_power: 'ev_charging_power',
    estimated_charge_duration: 'ev_estimated_current_charge_duration',
    ac_charging_limit: 'ev_charge_limits_ac',
    ev_charging: 'ev_charging',
    climate: 'climate_control',
    outside_temperature: 'outside_temperature',
    door_lock: 'door_lock',
    front_left_door: 'front_left_door_is_open',
    front_right_door: 'front_right_door_is_open',
    trunk: 'trunk_is_open',
    hood: 'hood_is_open',
    front_left_window: 'front_left_window_is_open',
    front_right_window: 'front_right_window_is_open',
    odometer: 'odometer',
    tire_pressure_front_left: 'tire_pressure_front_left',
    tire_pressure_front_right: 'tire_pressure_front_right',
    tire_pressure_rear_left: 'tire_pressure_rear_left',
    tire_pressure_rear_right: 'tire_pressure_rear_right',
    location: 'location',
    geocoded_location: 'geocode_name',
    last_updated_at: 'last_updated_at',
    force_update: 'force_refresh',
  };
  return Object.fromEntries(
    seeds.flatMap(([id]) => {
      const key = KEYS[id.slice(id.indexOf('.') + 1).slice(prefix.length + 1)];
      return key ? [[id, key]] : [];
    }),
  );
};

const CAR = 'custom:fluvy-vehicle-card';
const card = (device: string, extra: Record<string, unknown> = {}) => ({
  type: CAR,
  device,
  _now: NOW,
  ...extra,
});

export const sheet: SheetSpec = {
  states: [
    ...MODEL_Y,
    ...MODEL_3,
    ...MODEL_S,
    ...MODEL_X,
    ...EV6,
    ...IONIQ5,
    ...I4,
    ...GONE,
    ...MIDNIGHT,
  ],
  registry: {
    entities: Object.fromEntries([
      ...entries('d-model-y', 'teslemetry', MODEL_Y, teslaKeys('model_y', MODEL_Y), [
        'sensor.model_y_charge_rate',
        'sensor.model_y_time_to_full_charge',
        'sensor.model_y_odometer',
        'sensor.model_y_tire_pressure_front_left',
        'sensor.model_y_tire_pressure_front_right',
        'sensor.model_y_tire_pressure_rear_left',
        'sensor.model_y_tire_pressure_rear_right',
        'binary_sensor.model_y_front_driver_door',
        'binary_sensor.model_y_front_driver_window',
      ]),
      ...entries('d-model-3', 'tessie', MODEL_3, teslaKeys('model_3', MODEL_3)),
      ...entries('d-model-s', 'tesla_fleet', MODEL_S, teslaKeys('model_s', MODEL_S)),
      ...entries('d-model-x', 'tesla_fleet', MODEL_X, teslaKeys('model_x', MODEL_X)),
      ...entries('d-ev6', 'kia_uvo', EV6, kiaKeys('ev6', EV6)),
      ...entries('d-ioniq-5', 'kia_uvo', IONIQ5, kiaKeys('ioniq_5', IONIQ5)),
      // CarData names its entities in English and keys only its tracker
      ...entries('d-i4', 'cardata', I4, { 'device_tracker.i4_location': 'car' }),
      ...entries('d-leaf', 'tesla_fleet', GONE, teslaKeys('leaf', GONE)),
      // tesla_custom keys none of them: the card reads it by its ids' ends and by what its entities are
      ...entries('d-midnight', 'tesla_custom', MIDNIGHT),
    ]),
    devices: Object.fromEntries([
      device('d-model-y', 'Model Y', 'Model Y Long Range'),
      device('d-model-3', 'Model 3', 'Model 3 Performance'),
      device('d-model-s', 'Model S', 'Model S Plaid'),
      device('d-model-x', 'Model X', 'Model X'),
      device('d-ev6', 'EV6', 'EV6 GT-Line'),
      device('d-ioniq-5', 'IONIQ 5', 'IONIQ 5'),
      device('d-i4', 'i4 eDrive40', 'i4'),
      device('d-leaf', 'Leaf', 'Leaf'),
      device('d-midnight', 'Midnight', 'Model 3'),
    ]),
  },
  frames: [
    { title: 'Teslemetry · charging at home', cards: [card('d-model-y')] },
    { title: 'Tessie · driving', cards: [card('d-model-3')] },
    { title: 'Tesla Fleet · parked at work, sentry on', cards: [card('d-model-s')] },
    { title: 'Tesla Fleet · asleep on a cold night', cards: [card('d-model-x')] },
    { title: 'Kia · plugged in, not charging, unlocked', cards: [card('d-ev6')] },
    { title: 'Hyundai · charging away from home', cards: [card('d-ioniq-5')] },
    { title: 'BMW CarData · a few entities', cards: [card('d-i4')] },
    { title: 'Out of reach', cards: [card('d-leaf')] },
    { title: 'The battery as a ring', cards: [card('d-model-y', { hero: 'ring' })] },
    {
      title: 'Its picture over the battery',
      cards: [card('d-model-y', { image: PICTURE, show_rows: false })],
    },
    {
      title: 'Its picture in the head · the tyres',
      cards: [card('d-model-y', { image: PICTURE, image_position: 'head', show_tyres: true })],
    },
    {
      title: 'Kia · the tyres in psi, its address',
      cards: [card('d-ev6', { show_tyres: true, rows: ['location', 'odometer', 'outside'] })],
    },
    {
      title: 'Its own controls and rows',
      cards: [
        card('d-model-y', {
          name: 'Family car',
          color: 'teal',
          controls: [
            { control: 'lock', color: 'green' },
            'climate',
            'charging',
            'charge_port',
            'trunk',
            'frunk',
            'windows',
            'doors',
            'sentry',
          ],
          rows: [
            'location',
            'odometer',
            'charge_power',
            'charge_rate',
            'time_to_full',
            { entity: 'sensor.model_y_outside_temperature', name: 'Outside', icon: 'fluvy:thermo' },
          ],
        }),
      ],
    },
    {
      title: 'Compact',
      cards: [card('d-model-y', { variant: 'compact' }), card('d-ev6', { variant: 'compact' })],
    },
    {
      title: 'Strips',
      cards: [
        card('d-model-y', { variant: 'mini' }),
        card('d-model-3', { variant: 'mini' }),
        card('d-ev6', { variant: 'mini' }),
        card('d-model-x', { variant: 'mini' }),
        card('d-leaf', { variant: 'mini' }),
      ],
    },
    {
      title: 'Strips · half a section',
      width: 320,
      heights: [152, 172],
      cards: [
        card('d-model-y', { variant: 'mini', cols: 6 }),
        card('d-ev6', { variant: 'mini', cols: 6 }),
        card('d-leaf', { variant: 'mini', cols: 6 }),
      ],
    },
    {
      title: 'Compact · half a section',
      width: 360,
      cards: [
        card('d-model-y', { variant: 'compact', cols: 6 }),
        card('d-ioniq-5', { variant: 'compact', cols: 6 }),
      ],
    },
    {
      title: 'Whole card · half a section',
      width: 360,
      cards: [card('d-model-y', { cols: 6 }), card('d-model-x', { cols: 6 })],
    },
    { title: 'A phone’s column', width: 360, cards: [card('d-ioniq-5')] },
    {
      title: 'A desktop’s column',
      width: 352,
      cards: [card('d-model-s', { image: PICTURE, show_tyres: true })],
    },
    {
      title: 'Without its range, its limit and its line',
      cards: [
        card('d-model-y', {
          show_range: false,
          show_limit: false,
          show_status: false,
          show_rows: false,
        }),
      ],
    },
    {
      title: 'Only what is named by hand',
      cards: [
        card('d-model-y', {
          scan: false,
          name: 'Model Y',
          roles: [
            { role: 'battery', entity: 'sensor.model_y_battery_level' },
            { role: 'range', entity: 'sensor.model_y_estimate_battery_range' },
            { role: 'lock', entity: 'lock.model_y_lock' },
          ],
          rows: ['odometer'],
        }),
      ],
    },
    {
      title: 'Miles and its own low range',
      cards: [card('d-model-x', { range_unit: 'mi', low_range: 160, variant: 'compact' })],
    },
    {
      title: 'tesla_custom · its charge port’s latch, never its lock',
      cards: [card('d-midnight')],
    },
  ],
};
