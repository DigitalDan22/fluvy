import type { EntityRegistryDisplayEntry, HassEntity, HomeAssistant } from '@fluvy/core';
import { deviceSlug, withoutSlug } from '../appliance/roles.js';

/*
 * A car's entities, found on its device. Each integration hangs a car's battery, range, charge, lock and climate on one
 * device, each with its own words: Tesla's three (Tesla Fleet, Teslemetry, Tessie), Renault, Volvo and Škoda from Home
 * Assistant's own (read from their source: their translation keys), and from HACS Kia and Hyundai (kia_uvo), MySkoda
 * and Polestar (their keys), MG (mg_saic), Volkswagen's two (volkswagencarnet, We Connect ID) and BMW's CarData
 * (their names fixed in English, read by the ends of their ids). A role is known by the integration's own key, then by
 * a key it holds as a second choice (an estimated range beside the rated one), then by the end of its id, then by what
 * it is (a battery by its class and its percent, a lock by its domain, a tracker by its own); the integration's own
 * plays a role over a helper a person attached to its device. A role the card names by hand (`roles`) wins, and with
 * `scan: false` only those play. What could move the car or wake it, sound it or open a garage — a horn, the lights,
 * keyless driving, a remote engine start, a forced refresh that drains the small battery, valet mode, the route's
 * tracker — is never a role, nor is a charge port's latch taken for the car's lock, or a 12 V battery for the car's.
 */

export type VehicleRole =
  /** Its battery's charge (%). */
  | 'battery'
  /** How far it goes on that charge. */
  | 'range'
  /** What its charging does: a state's word, or a charging binary sensor. */
  | 'charging'
  /** Whether its cable is in: a plug (or connectivity) binary sensor, or a sensor's word. */
  | 'plugged'
  | 'charge_power'
  /** How fast its range grows while it charges (km/h, mph). */
  | 'charge_rate'
  /** When it is full: a duration, or the moment (a timestamp). */
  | 'time_to_full'
  /** Where its charge stops (%): a number to set, else a sensor. */
  | 'charge_limit'
  /** A switch that starts and stops the charge, else buttons that do. */
  | 'charge_switch'
  | 'charge_start'
  | 'charge_stop'
  /** Its charge port's door: a cover, a switch or a binary sensor. */
  | 'charge_port'
  /** Its climate: a climate entity, else a switch, else buttons and a sensor that says it runs. */
  | 'climate'
  | 'climate_switch'
  | 'climate_start'
  | 'climate_stop'
  | 'climate_running'
  | 'inside'
  | 'outside'
  /** Its lock: a lock to act on, else what says it is locked (a binary sensor, a sensor's word). */
  | 'lock'
  /** Its boot and its front boot: a cover to open, else what says they are open. */
  | 'trunk'
  | 'frunk'
  /** A cover that vents and closes every window at once. */
  | 'windows'
  | 'sentry'
  | 'odometer'
  | 'location'
  /** Where it is, in words (an address). */
  | 'address'
  | 'software'
  /** Whether it is awake, asleep or out of reach (a connectivity sensor, a state's word). */
  | 'state'
  | 'shift'
  | 'speed'
  /** Whether it moves (a motion or a running engine's sensor). */
  | 'moving'
  /** When it last told the integration anything. */
  | 'updated'
  | 'fuel'
  | 'tyre_fl'
  | 'tyre_fr'
  | 'tyre_rl'
  | 'tyre_rr';

export const VEHICLE_ROLES: readonly VehicleRole[] = [
  'battery',
  'range',
  'charging',
  'plugged',
  'charge_power',
  'charge_rate',
  'time_to_full',
  'charge_limit',
  'charge_switch',
  'charge_start',
  'charge_stop',
  'charge_port',
  'climate',
  'climate_switch',
  'climate_start',
  'climate_stop',
  'climate_running',
  'inside',
  'outside',
  'lock',
  'trunk',
  'frunk',
  'windows',
  'sentry',
  'odometer',
  'location',
  'address',
  'software',
  'state',
  'shift',
  'speed',
  'moving',
  'updated',
  'fuel',
  'tyre_fl',
  'tyre_fr',
  'tyre_rl',
  'tyre_rr',
];

/** The integrations the card reads by their words: Home Assistant's own, then the community's from HACS. */
export const VEHICLE_PLATFORMS = [
  'tesla_fleet',
  'teslemetry',
  'tessie',
  'renault',
  'volvo',
  'skoda',
  'kia_uvo',
  'myskoda',
  'polestar_api',
  'mg_saic',
  'volkswagencarnet',
  'volkswagen_we_connect_id',
  'cardata',
] as const;
type Platform = (typeof VEHICLE_PLATFORMS)[number];
const known = (platform: string | undefined): platform is Platform =>
  (VEHICLE_PLATFORMS as readonly string[]).includes(platform ?? '');

/** What a role may be: the domains its entity lives in, the one preferred first (a lock to act on over a sensor's word). */
const DOMAINS: Readonly<Record<VehicleRole, readonly string[]>> = {
  battery: ['sensor'],
  range: ['sensor'],
  charging: ['sensor', 'binary_sensor'],
  plugged: ['binary_sensor', 'sensor'],
  charge_power: ['sensor'],
  charge_rate: ['sensor'],
  time_to_full: ['sensor'],
  charge_limit: ['number', 'sensor'],
  charge_switch: ['switch'],
  charge_start: ['button'],
  charge_stop: ['button'],
  charge_port: ['cover', 'switch', 'binary_sensor'],
  climate: ['climate'],
  climate_switch: ['switch'],
  climate_start: ['button'],
  climate_stop: ['button'],
  climate_running: ['binary_sensor'],
  inside: ['sensor'],
  outside: ['sensor'],
  lock: ['lock', 'binary_sensor', 'sensor'],
  trunk: ['cover', 'binary_sensor', 'sensor'],
  frunk: ['cover', 'binary_sensor', 'sensor'],
  windows: ['cover'],
  sentry: ['switch'],
  odometer: ['sensor'],
  location: ['device_tracker'],
  address: ['sensor'],
  software: ['update'],
  state: ['binary_sensor', 'sensor'],
  shift: ['sensor'],
  speed: ['sensor'],
  moving: ['binary_sensor'],
  updated: ['sensor'],
  fuel: ['sensor'],
  tyre_fl: ['sensor'],
  tyre_fr: ['sensor'],
  tyre_rl: ['sensor'],
  tyre_rr: ['sensor'],
};

/** The roles that act: never an entity Home Assistant files under diagnostics or configuration. */
const ACTING: ReadonlySet<string> = new Set([
  'charge_switch',
  'charge_start',
  'charge_stop',
  'climate_switch',
  'climate_start',
  'climate_stop',
  'sentry',
  'windows',
]);

/** A door, a window or a tyre's warning: what a car has several of, gathered rather than played. */
export type Gathered = 'doors' | 'windows' | 'warnings';
/** A wheel, by where it sits; `all` for a warning of every tyre at once. */
export type Wheel = 'fl' | 'fr' | 'rl' | 'rr';

/**
 * An integration's word for an entity: the role it plays (the first whose domains hold it, where one key names an
 * entity of each domain: Tesla's charging state is a sensor, its switch and Tessie's binary sensor), what it is one of,
 * or `null` — none at all, whatever its id ends in.
 */
type Word = VehicleRole | readonly VehicleRole[] | Gathered | null;

/** The Tesla integrations' keys: Tesla Fleet's, Teslemetry's and Tessie's are one table (their keys are the same). */
const TESLA: Readonly<Record<string, Word>> = {
  charge_state_battery_level: 'battery',
  charge_state_usable_battery_level: 'battery',
  charge_state_battery_range: 'range',
  charge_state_est_battery_range: 'range',
  charge_state_ideal_battery_range: 'range',
  rated_range: 'range',
  charge_state_charging_state: ['charging', 'charge_switch'],
  charge_state_charger_power: 'charge_power',
  charge_state_charge_rate: 'charge_rate',
  charge_rate_mile_per_hour: null,
  charge_state_minutes_to_full_charge: 'time_to_full',
  estimated_hours_to_charge_termination: 'time_to_full',
  charge_state_charge_limit_soc: 'charge_limit',
  // the binary sensor says the cable is in; the sensor of the same key, which cable it is
  charge_state_conn_charge_cable: 'plugged',
  charge_state_charge_port_door_open: 'charge_port',
  // the charge cable's latch, never the car's lock
  charge_state_charge_port_latch: null,
  driver_temp: 'climate',
  primary: 'climate',
  climate_state_cabin_overheat_protection: null,
  climate_state_inside_temp: 'inside',
  climate_state_outside_temp: 'outside',
  vehicle_state_locked: 'lock',
  vehicle_state_df: 'doors',
  vehicle_state_dr: 'doors',
  vehicle_state_pf: 'doors',
  vehicle_state_pr: 'doors',
  vehicle_state_fd_window: 'windows',
  vehicle_state_fp_window: 'windows',
  vehicle_state_rd_window: 'windows',
  vehicle_state_rp_window: 'windows',
  windows: 'windows',
  vehicle_state_rt: 'trunk',
  vehicle_state_ft: 'frunk',
  vehicle_state_sun_roof_state: null,
  vehicle_state_sentry_mode: 'sentry',
  sentry_mode: null,
  vehicle_state_odometer: 'odometer',
  vehicle_state_tpms_pressure_fl: 'tyre_fl',
  vehicle_state_tpms_pressure_fr: 'tyre_fr',
  vehicle_state_tpms_pressure_rl: 'tyre_rl',
  vehicle_state_tpms_pressure_rr: 'tyre_rr',
  vehicle_state_tpms_soft_warning_fl: 'warnings',
  vehicle_state_tpms_soft_warning_fr: 'warnings',
  vehicle_state_tpms_soft_warning_rl: 'warnings',
  vehicle_state_tpms_soft_warning_rr: 'warnings',
  location: 'location',
  // where it is going and where it came from, never where it is
  route: null,
  origin: null,
  vehicle_state_software_update_status: 'software',
  update: 'software',
  state: 'state',
  drive_state_shift_state: 'shift',
  drive_state_speed: 'speed',
};

/** Each integration's own keys: what it calls a role, and (`null`) what it has that is never one. */
const KEYS_BY_PLATFORM: Partial<Record<Platform, Readonly<Record<string, Word>>>> = {
  tesla_fleet: TESLA,
  teslemetry: TESLA,
  tessie: TESLA,
  // renault/sensor.py, binary_sensor.py, number.py, button.py (its battery, cable, charge and lock have no key)
  renault: {
    battery_autonomy: 'range',
    fuel_autonomy: null,
    charge_state: 'charging',
    plug_state: 'plugged',
    charging_power: 'charge_power',
    admissible_charging_power: null,
    charging_remaining_time: 'time_to_full',
    charge_limit_target: 'charge_limit',
    charge_limit_min: null,
    start_charge: 'charge_start',
    stop_charge: 'charge_stop',
    start_air_conditioner: 'climate_start',
    hvac_status: 'climate_running',
    outside_temperature: 'outside',
    driver_door_status: 'doors',
    passenger_door_status: 'doors',
    rear_left_door_status: 'doors',
    rear_right_door_status: 'doors',
    hatch_status: 'trunk',
    mileage: 'odometer',
    front_left_pressure: 'tyre_fl',
    front_right_pressure: 'tyre_fr',
    rear_left_pressure: 'tyre_rl',
    rear_right_pressure: 'tyre_rr',
    location: 'location',
    battery_last_activity: 'updated',
    hvac_last_activity: null,
    location_last_activity: null,
    charge_mode: null,
    fuel_quantity: null,
  },
  // volvo/sensor.py, binary_sensor.py, button.py, lock.py (its battery has no key)
  volvo: {
    distance_to_empty_battery: 'range',
    distance_to_empty_tank: null,
    charging_status: 'charging',
    charger_connection_status: 'plugged',
    charging_power_status: null,
    charging_power: 'charge_power',
    charging_current_limit: null,
    estimated_charging_time: 'time_to_full',
    target_battery_charge_level: 'charge_limit',
    climatization_start: 'climate_start',
    climatization_stop: 'climate_stop',
    lock: 'lock',
    lock_reduced_guard: null,
    door_front_left: 'doors',
    door_front_right: 'doors',
    door_rear_left: 'doors',
    door_rear_right: 'doors',
    hood: 'frunk',
    tailgate: 'trunk',
    tank_lid: null,
    window_front_left: 'windows',
    window_front_right: 'windows',
    window_rear_left: 'windows',
    window_rear_right: 'windows',
    sunroof: null,
    tire_front_left: 'warnings',
    tire_front_right: 'warnings',
    tire_rear_left: 'warnings',
    tire_rear_right: 'warnings',
    odometer: 'odometer',
    location: 'location',
    availability: 'state',
    engine_status: 'moving',
    fuel_amount: null,
  },
  // skoda/sensor.py, binary_sensor.py, switch.py (its lock and its tracker have no key)
  skoda: {
    battery_percentage: 'battery',
    electric_range: 'range',
    total_range: 'range',
    charging_state: 'charging',
    charge_type: null,
    charging_power: 'charge_power',
    remaining_time_to_full_battery: 'time_to_full',
    charging: 'charge_switch',
    active_ventilation: 'climate_switch',
    remaining_ac_time: null,
    doors: 'doors',
    windows: 'windows',
    sunroof: null,
    trunk: 'trunk',
    bonnet: 'frunk',
    mileage: 'odometer',
    fuel_level: 'fuel',
  },
  // Hyundai-Kia-Connect/kia_uvo: sensor.py, binary_sensor.py, lock.py, switch.py, number.py, climate.py
  kia_uvo: {
    ev_battery_percentage: 'battery',
    // the 12 V battery, never the car's
    car_battery_percentage: null,
    ev_driving_range: 'range',
    total_driving_range: 'range',
    fuel_driving_range: null,
    ev_battery_is_charging: 'charging',
    ev_battery_is_plugged_in: 'plugged',
    ev_charging_power: 'charge_power',
    // a power factor in percent, never a current
    ev_charging_current: null,
    ev_estimated_current_charge_duration: 'time_to_full',
    ev_estimated_fast_charge_duration: null,
    ev_estimated_portable_charge_duration: null,
    ev_estimated_station_charge_duration: null,
    ev_charge_limits_ac: 'charge_limit',
    ev_charge_limits_dc: null,
    ev_charging: 'charge_switch',
    ev_charge_port_door: 'charge_port',
    ev_charge_port_door_is_open: 'charge_port',
    climate_control: 'climate',
    climate: 'climate_switch',
    // the temperature it is set to, never one it reads
    air_temperature: null,
    outside_temperature: 'outside',
    door_lock: 'lock',
    is_locked: 'lock',
    front_left_door_is_open: 'doors',
    front_right_door_is_open: 'doors',
    back_left_door_is_open: 'doors',
    back_right_door_is_open: 'doors',
    trunk_is_open: 'trunk',
    hood_is_open: 'frunk',
    front_left_window_is_open: 'windows',
    front_right_window_is_open: 'windows',
    back_left_window_is_open: 'windows',
    back_right_window_is_open: 'windows',
    // each window as a cover of its own, filed under configuration: the sensors say the same
    front_left_window: null,
    front_right_window: null,
    back_left_window: null,
    back_right_window: null,
    sunroof_is_open: null,
    odometer: 'odometer',
    tire_pressure_front_left: 'tyre_fl',
    tire_pressure_front_right: 'tyre_fr',
    tire_pressure_rear_left: 'tyre_rl',
    tire_pressure_rear_right: 'tyre_rr',
    tire_pressure_front_left_warning_is_on: 'warnings',
    tire_pressure_front_right_warning_is_on: 'warnings',
    tire_pressure_rear_left_warning_is_on: 'warnings',
    tire_pressure_rear_right_warning_is_on: 'warnings',
    tire_pressure_all_warning_is_on: 'warnings',
    location: 'location',
    geocode_name: 'address',
    engine_is_running: 'moving',
    sleep_mode_check: null,
    gear_position: 'shift',
    last_updated_at: 'updated',
    location_last_updated_at: null,
    fuel_level: 'fuel',
    fuel_level_is_low: null,
    // what wakes the car (and drains its small battery), sounds it, lends it, or moves every window at once
    force_refresh: null,
    start_hazard_lights: null,
    start_hazard_lights_and_horn: null,
    start_valet_mode: null,
    stop_valet_mode: null,
    valet_mode_control: null,
    open_all_windows: null,
    close_all_windows: null,
    vent_all_windows: null,
    capture_svm_image: null,
  },
  // skodaconnect/homeassistant-myskoda: sensor.py, binary_sensor.py, lock.py, switch.py, number.py, climate.py
  myskoda: {
    battery_percentage: 'battery',
    electric_range: 'range',
    range: 'range',
    combustion_range: null,
    gas_range: null,
    adblue_range: null,
    charging_state: 'charging',
    charge_type: null,
    charging_power: 'charge_power',
    charging_rate: 'charge_rate',
    remaining_charging_time: 'time_to_full',
    charge_limit: 'charge_limit',
    target_battery_percentage: 'charge_limit',
    charger_connected: 'plugged',
    charger_lock: null,
    charging: 'charge_switch',
    climate: 'climate',
    auxiliary_heater: null,
    outside_temperature: 'outside',
    door_lock: 'lock',
    vehicle_lock: 'lock',
    doors_lock: 'lock',
    doors_open: 'doors',
    door_open_front_left: 'doors',
    door_open_front_right: 'doors',
    door_open_rear_left: 'doors',
    door_open_rear_right: 'doors',
    trunk_open: 'trunk',
    bonnet_open: 'frunk',
    windows_open: 'windows',
    window_open_front_left: 'windows',
    window_open_front_right: 'windows',
    window_open_rear_left: 'windows',
    window_open_rear_right: 'windows',
    sunroof_open: null,
    mileage: 'odometer',
    device_tracker: 'location',
    vehicle_reachable: 'state',
    vehicle_in_motion: 'moving',
    car_captured: 'updated',
    software_version: null,
    fuel_level: 'fuel',
    gas_level: null,
    honk_flash: null,
    flash: null,
    wakeup: null,
  },
  // pypolestar/polestar_api sensor.py, binary_sensor.py: every key is the integration's name before its own
  polestar_api: {
    polestar_battery_charge_level: 'battery',
    polestar_estimated_range: 'range',
    polestar_estimated_full_charge_range: null,
    polestar_charging_status: 'charging',
    polestar_charger_connection_status: 'plugged',
    polestar_charging_type: null,
    polestar_charging_power: 'charge_power',
    polestar_charging_current: null,
    polestar_charging_voltage: null,
    polestar_estimated_fully_charged_time: 'time_to_full',
    polestar_estimated_charging_time_to_full: 'time_to_full',
    polestar_charging_target_level: 'charge_limit',
    polestar_current_odometer: 'odometer',
    polestar_last_updated_battery_data: 'updated',
    polestar_api_connected: null,
  },
  // townsmcp/mg-saic-ha: the few it keys
  mg_saic: { vehicle_reachability: 'state', climate_mode: null },
  // kvanbiesen/bmw-cardata-ha device_tracker.py
  cardata: { car: 'location' },
};

/**
 * The keys a role is known by as a second choice: Tessie's usable charge where the car's own is there too, an
 * estimated or ideal range beside the rated one, a total range beside the electric one, a limit's sensor beside its
 * number, a lock's sensor beside the lock, a port's sensor beside its switch.
 */
const SECOND: ReadonlySet<string> = new Set([
  'charge_state_usable_battery_level',
  'charge_state_est_battery_range',
  'charge_state_ideal_battery_range',
  'rated_range',
  'estimated_hours_to_charge_termination',
  'total_range',
  'total_driving_range',
  'range',
  'target_battery_percentage',
  'is_locked',
  'vehicle_lock',
  'doors_lock',
  'ev_charge_port_door_is_open',
  'polestar_estimated_charging_time_to_full',
]);

/** The end of an entity's id, for what an integration names without a key (its object id without the device's name). */
type Ends = ReadonlyArray<readonly [RegExp, Word]>;

/** The ends of ids of the integrations the card reads by their ids: their names are fixed, in English. */
const SUFFIXES_BY_PLATFORM: Partial<Record<Platform, Ends>> = {
  // mg_saic sensor.py, binary_sensor.py, lock.py, switch.py, number.py, climate.py, device_tracker.py: "<brand>
  // <model> <name>"; its fuel level wears the battery's class, and the buttons that open, vent or alarm are not the card's
  mg_saic: [
    [/^state_of_charge$/, 'battery'],
    [/^fuel_level$/, null],
    [/^electric_range$/, 'range'],
    [/^(fuel_range|estimated_range_after_charging)$/, null],
    [/^charging_status$/, 'charging'],
    [/^charging_power$/, 'charge_power'],
    [/^remaining_charging_time$/, 'time_to_full'],
    [/^target_soc$/, 'charge_limit'],
    [/^charging_gun_state$/, 'plugged'],
    [/^charging$/, 'charge_switch'],
    [/^climate$/, 'climate'],
    [/^air_conditioning$/, 'climate_switch'],
    [/^interior_temperature$/, 'inside'],
    [/^exterior_temperature$/, 'outside'],
    [/^(lock|lock_status)$/, 'lock'],
    [/^door_(front|rear)_(left|right)$/, 'doors'],
    [/^bonnet_status$/, 'frunk'],
    [/^boot_status$/, 'trunk'],
    [/^window_(front|rear)_(left|right)$/, 'windows'],
    [/^tyre_pressure_front_left$/, 'tyre_fl'],
    [/^tyre_pressure_front_right$/, 'tyre_fr'],
    [/^tyre_pressure_rear_left$/, 'tyre_rl'],
    [/^tyre_pressure_rear_right$/, 'tyre_rr'],
    [/^wheel_tyre_monitor_status$/, 'warnings'],
    [/^mileage$/, 'odometer'],
    [/^gps_location$/, 'location'],
    [/^speed$/, 'speed'],
    [/^last_update_time$/, 'updated'],
    [
      /^(trigger_alarm|open_boot|update_vehicle_data|open_windows|ventilate_windows|close_windows|holiday_mode|charging_port_lock|sunroof|sunroof_status)$/,
      null,
    ],
  ],
  // robinostlund/volkswagencarnet vw_dashboard.py: its instruments' names; its doors and windows "closed" sensors
  // wear the door's and the window's class, on while open
  volkswagencarnet: [
    [/^battery_level$/, 'battery'],
    [/^battery_power_level$/, null],
    [/^electric_range$/, 'range'],
    [/^(battery_cruising_range|combined_range)$/, 'range'],
    [/^(fuel_range|combustion_range)$/, null],
    [/^charging_state$/, 'charging'],
    [/^charging_power$/, 'charge_power'],
    [/^charging_rate$/, 'charge_rate'],
    [/^charging_time_left$/, 'time_to_full'],
    [/^battery_target_charge_level$/, 'charge_limit'],
    [/^charging_cable_connected$/, 'plugged'],
    [/^charging$/, 'charge_switch'],
    [/^electric_climatisation$/, 'climate'],
    [/^auxiliary_climatisation$/, null],
    [/^outside_temperature$/, 'outside'],
    [/^door_locked$/, 'lock'],
    [/^doors_locked(_2)?$/, 'lock'],
    [/^trunk_locked$/, null],
    [/^door_closed_(left|right)_(front|back|rear)$/, 'doors'],
    [/^trunk_closed$/, 'trunk'],
    [/^hood_closed$/, 'frunk'],
    [/^(windows_closed|window_closed_(left|right)_(front|back|rear))$/, 'windows'],
    [/^sunroof_closed$/, null],
    [/^odometer$/, 'odometer'],
    [/^position$/, 'location'],
    [/^vehicle_moving$/, 'moving'],
    [/^connection_online$/, 'state'],
    [/^last_data_refresh$/, 'updated'],
    [/^(last_connected|turn_signals|force_data_refresh|scan_interval)$/, null],
  ],
  // mitch-dc/volkswagen_we_connect_id: "<nickname> <name>"
  volkswagen_we_connect_id: [
    [/^state_of_charge$/, 'battery'],
    [/^range$/, 'range'],
    [/^gasoline_range$/, null],
    [/^charging_state$/, 'charging'],
    [/^plug_connection_state$/, 'plugged'],
    [/^charge_power$/, 'charge_power'],
    [/^charge_rate$/, 'charge_rate'],
    [/^remaining_charging_time$/, 'time_to_full'],
    [/^target_state_of_charge$/, 'charge_limit'],
    [/^start_charging$/, 'charge_start'],
    [/^stop_charging$/, 'charge_stop'],
    [/^start_climate$/, 'climate_start'],
    [/^stop_climate$/, 'climate_stop'],
    [/^odometer$/, 'odometer'],
    [/^tracker$/, 'location'],
    [/^car_is_online$/, 'state'],
    [/^toggle_ac_charge_speed$/, null],
  ],
  // kvanbiesen/bmw-cardata-ha descriptor_titles.py: "<vehicle> <title>"; its 12 V battery is never the car's
  cardata: [
    [/^battery_ev_state_of_charge$/, 'battery'],
    [/^battery_hv_state_of_charge$/, 'battery'],
    [/^battery_charge_level_12v$/, null],
    [/^range_ev_remaining_range$/, 'range'],
    [/^charging_ev_charging_state$/, 'charging'],
    [/^battery_ev_charging_power$/, 'charge_power'],
    [/^charging_ev_remaining_time_estimate$/, 'time_to_full'],
    [/^battery_ev_target_state_of_charge$/, 'charge_limit'],
    [/^charging_port_flap_state_any_position$/, 'charge_port'],
    [/^vehicle_mileage$/, 'odometer'],
    [/^tire_pressure_front_left$/, 'tyre_fl'],
    [/^tire_pressure_front_right$/, 'tyre_fr'],
    [/^tire_pressure_rear_left$/, 'tyre_rl'],
    [/^tire_pressure_rear_right$/, 'tyre_rr'],
    [/^door_state_(front|rear)_(driver|passenger)$/, 'doors'],
    [/^doors_lock$/, 'lock'],
    [/^tailgate_state$/, 'trunk'],
    [/^hood_state$/, 'frunk'],
    [/^window_state_(front|rear)_(driver|passenger)$/, 'windows'],
    [/^vehicle_motion_state$/, 'moving'],
  ],
};

/** The ends of ids anyone writes: for a role named by an integration the card does not know. */
const SUFFIXES: Ends = [
  [/(^|_)(battery_level|state_of_charge|soc|charge_level|ev_battery_level)$/, 'battery'],
  [/(^|_)(range|electric_range|ev_range|estimated_range|battery_range|remaining_range)$/, 'range'],
  [/(^|_)(charging_state|charging_status|charge_state|charge_status)$/, 'charging'],
  [
    /(^|_)(plugged_in|plug_status|plug_state|charger_connected|charge_cable|charging_cable_connected)$/,
    'plugged',
  ],
  [/(^|_)(charging_power|charger_power|charge_power)$/, 'charge_power'],
  [/(^|_)(charging_rate|charge_rate)$/, 'charge_rate'],
  [
    /(^|_)(time_to_full(_charge)?|time_charge_complete|charging_time_left|remaining_charging_time|charge_time_remaining)$/,
    'time_to_full',
  ],
  [
    /(^|_)(charge_limit|charging_limit|charge_limit_soc|target_soc|target_charge_level)$/,
    'charge_limit',
  ],
  [/(^|_)(charge_port(_door)?|charger_door|charge_flap|charging_port)$/, 'charge_port'],
  [/(^|_)(inside_temp(erature)?|interior_temp(erature)?|cabin_temp(erature)?)$/, 'inside'],
  [/(^|_)(outside_temp(erature)?|exterior_temp(erature)?)$/, 'outside'],
  [/(^|_)(trunk|boot|rear_trunk|tailgate|liftgate)$/, 'trunk'],
  [/(^|_)(frunk|front_trunk)$/, 'frunk'],
  [/(^|_)windows$/, 'windows'],
  [/(^|_)sentry(_mode)?$/, 'sentry'],
  [/(^|_)(odometer|mileage|milage)$/, 'odometer'],
  [/(^|_)(last_update(d)?(_at|_time)?|last_seen)$/, 'updated'],
  [/(^|_)(tpms|tyre_pressure|tire_pressure)_(front_left|fl)$/, 'tyre_fl'],
  [/(^|_)(tpms|tyre_pressure|tire_pressure)_(front_right|fr)$/, 'tyre_fr'],
  [/(^|_)(tpms|tyre_pressure|tire_pressure)_(rear_left|rl)$/, 'tyre_rl'],
  [/(^|_)(tpms|tyre_pressure|tire_pressure)_(rear_right|rr)$/, 'tyre_rr'],
];

/**
 * Never a role, by a key or an id without the device's name, whole words of it: what wakes, sounds, flashes or lends
 * the car, opens a garage, starts its engine or drives it without its key, forces it to report (draining its small
 * battery), and the integration's system and connection entities.
 */
const NEVER =
  /(^|_)(wake|wake_up|wakeup|honk|horn|sound_horn|flash|flash_lights|honk_flash|boombox|homelink|trigger_homelink|keyless|enable_keyless_driving|keep_accessory_power_mode|remote_start|engine_start|engine_stop|res_state|valet|valet_mode|guest_mode|guest_mode_enabled|speed_limit|force_refresh|force_data_refresh|refresh_data|hazard|panic|firmware|reboot|restart|identify|rssi|signal_strength|wifi)(_|$)/;

/**
 * A charge port's latch or its cable's lock, by a key or an id without the device's name, whatever its integration:
 * never the doors' lock (tesla_custom's `charge_port_latch` is a lock as the doors' is, and would play it by the
 * registry's order alone).
 */
const LATCH = /(^|_)(latch|cable_lock|charger_lock|charge_port_lock)$/;

/** How surely a role is known: by the integration's own key, a key it holds second, an id's end, what it is. */
const RANK = { platform: 4, second: 3, suffix: 2, domain: 0 } as const;

/** An entity of the device as the registry and the states say it. */
export interface Candidate {
  readonly id: string;
  readonly domain: string;
  readonly key: string | undefined;
  readonly platform: string | undefined;
  readonly deviceClass: string | undefined;
  readonly unit: string | undefined;
  readonly category: string | undefined;
  /** Its object id without the device's name: what the ends of ids and `NEVER` read. */
  readonly object: string;
}

/** A role (or a gathering) an entity plays, how surely. */
export interface Part {
  readonly role: VehicleRole | Gathered;
  readonly rank: number;
}

const domainOf = (id: string): string => id.slice(0, id.indexOf('.'));

/** The first role a word names whose domains hold the entity; a gathering where it names one. */
function fitting(word: Word | undefined, candidate: Candidate): VehicleRole | Gathered | undefined {
  if (word === undefined || word === null) return undefined;
  if (word === 'doors' || word === 'windows' || word === 'warnings') return word;
  const roles = typeof word === 'string' ? [word as VehicleRole] : word;
  return roles.find(
    (role) =>
      DOMAINS[role].includes(candidate.domain) &&
      !(
        ACTING.has(role) &&
        (candidate.category === 'diagnostic' || candidate.category === 'config')
      ),
  );
}

/**
 * The part an entity plays on a car and how surely it is known: by its integration's own key (4, or 3 for a key it
 * holds second), by the end of its id — its integration's, then anyone's (2) — by what it is (0: a battery's charge,
 * a lock, a climate, a tracker, an update, a cable, a charge). None where the integration says it is not the card's
 * business, nor for what could move, wake or sound the car; a charge port's latch never plays its lock.
 */
export function partOf(candidate: Candidate): Part | undefined {
  const { key, object } = candidate;
  const part = played(candidate);
  return part?.role === 'lock' && (LATCH.test(object) || (key && LATCH.test(key)))
    ? undefined
    : part;
}

/** The part an entity plays by its words and by what it is, before the latch is told from the lock. */
function played(candidate: Candidate): Part | undefined {
  const { key, object } = candidate;
  if (NEVER.test(object) || (key && NEVER.test(key))) return undefined;
  const platform = known(candidate.platform) ? candidate.platform : undefined;
  const own = platform && key ? KEYS_BY_PLATFORM[platform]?.[key] : undefined;
  if (own === null) return undefined;
  const role = fitting(own, candidate);
  if (role) return { role, rank: key && SECOND.has(key) ? RANK.second : RANK.platform };
  const tiers: ReadonlyArray<Ends> = [
    platform ? (SUFFIXES_BY_PLATFORM[platform] ?? []) : [],
    platform && KEYS_BY_PLATFORM[platform] && key ? [] : SUFFIXES,
  ];
  for (const ends of tiers)
    for (const [pattern, word] of ends) {
      if (!pattern.test(object)) continue;
      if (word === null) return undefined;
      const found = fitting(word, candidate);
      if (found) return { role: found, rank: RANK.suffix };
    }
  return whatItIs(candidate);
}

/** What an entity is, where no word says what it plays. */
function whatItIs(candidate: Candidate): Part | undefined {
  const { domain, deviceClass, unit } = candidate;
  const at = (role: VehicleRole | Gathered): Part => ({ role, rank: RANK.domain });
  if (domain === 'sensor' && deviceClass === 'battery' && unit === '%') return at('battery');
  if (domain === 'binary_sensor' && deviceClass === 'battery_charging') return at('charging');
  if (domain === 'binary_sensor' && deviceClass === 'plug') return at('plugged');
  if (domain === 'binary_sensor' && deviceClass === 'lock') return at('lock');
  if (domain === 'binary_sensor' && deviceClass === 'door') return at('doors');
  if (domain === 'binary_sensor' && deviceClass === 'window') return at('windows');
  if (candidate.category === 'diagnostic' || candidate.category === 'config') return undefined;
  if (domain === 'lock') return at('lock');
  if (domain === 'climate') return at('climate');
  if (domain === 'device_tracker') return at('location');
  if (domain === 'update') return at('software');
  if (
    domain === 'sensor' &&
    deviceClass === 'distance' &&
    /odometer|mileage/.test(candidate.object)
  )
    return at('odometer');
  return undefined;
}

/** The wheel a tyre's warning is about, by its key or its id: front or rear, left or right; `all` for every one. */
export function wheelOf(text: string): Wheel | 'all' {
  const t = text.replace(/[-\s]+/g, '_');
  if (/(^|_)(fl|front_left|left_front)(_|$)/.test(t)) return 'fl';
  if (/(^|_)(fr|front_right|right_front)(_|$)/.test(t)) return 'fr';
  if (/(^|_)(rl|rear_left|back_left|left_rear)(_|$)/.test(t)) return 'rl';
  if (/(^|_)(rr|rear_right|back_right|right_rear)(_|$)/.test(t)) return 'rr';
  return 'all';
}

/* ---------- the device ---------- */

/** The house as discovery reads it: the registries, and the states for what the registry does not say. */
export type House = Pick<HomeAssistant, 'entities' | 'devices' | 'states'>;

/** Home Assistant's helpers, which a person may attach to any device: never the integration a car is of. */
const HELPERS: ReadonlySet<string> = new Set([
  'template',
  'group',
  'utility_meter',
  'derivative',
  'integration',
  'threshold',
  'statistics',
  'min_max',
  'filter',
  'trend',
  'history_stats',
]);

/** The integration a car is of: one the card reads by its words, else the one most of its entities are of. */
export function platformOf(entries: readonly EntityRegistryDisplayEntry[]): string | undefined {
  const all = entries.flatMap((entry) =>
    entry.platform && !HELPERS.has(entry.platform) ? [entry.platform] : [],
  );
  const count = (platform: string): number => all.filter((other) => other === platform).length;
  return (
    all.find(known) ??
    all.reduce<string | undefined>(
      (most, platform) => (most === undefined || count(platform) > count(most) ? platform : most),
      undefined,
    )
  );
}

function candidateOf(
  entry: EntityRegistryDisplayEntry,
  state: HassEntity | undefined,
  object: string,
): Candidate {
  return {
    id: entry.entity_id,
    domain: domainOf(entry.entity_id),
    key: entry.translation_key,
    platform: entry.platform,
    deviceClass: state?.attributes.device_class,
    unit: state?.attributes.unit_of_measurement,
    category: entry.entity_category,
    object,
  };
}

export type VehicleRoles = Partial<Record<VehicleRole, string>>;

/** A car's entities: one per role, its doors and windows, and its tyres' warnings by wheel. */
export interface VehicleEntities {
  readonly roles: VehicleRoles;
  readonly doors: readonly string[];
  readonly windows: readonly string[];
  readonly warnings: Readonly<Partial<Record<Wheel | 'all', string>>>;
  /** The integration the car is of, as the registry says. */
  readonly platform: string | undefined;
}

/** An entity holding a role, how surely, and whether it is of the car's integration (not a helper on it). */
interface Holder {
  readonly id: string;
  readonly rank: number;
  readonly own: boolean;
}

/** Whether an entity takes a role from its holder: the integration's own over a helper, then a higher rank, else the preferred domain. */
function surer(role: VehicleRole, next: Holder, held: Holder): boolean {
  if (next.own !== held.own) return next.own;
  if (next.rank !== held.rank) return next.rank > held.rank;
  return DOMAINS[role].indexOf(domainOf(next.id)) < DOMAINS[role].indexOf(domainOf(held.id));
}

/** A role named by hand: the role, and its entity. */
export interface NamedRole {
  readonly role: string;
  readonly entity: string;
}

/**
 * Every role the car's device fills — by the entity known most surely to play it, its integration's own over a helper
 * a person attached to it — its doors, windows and tyres' warnings gathered; then the roles named by hand over them
 * (with `scan: false`, those alone). Hidden entities are left out of the search. The entity the card names plays the
 * part it is known by, where nothing of the car's own plays it.
 */
export function vehicleEntities(
  hass: House | undefined,
  device: string | undefined,
  named: readonly NamedRole[] = [],
  entity?: string,
  scan = true,
): VehicleEntities {
  const held: Partial<Record<VehicleRole, Holder>> = {};
  const doors: string[] = [];
  const windows: string[] = [];
  const warnings: Partial<Record<Wheel | 'all', string>> = {};
  const entries = device
    ? Object.values(hass?.entities ?? {}).filter((entry) => entry.device_id === device)
    : [];
  const platform = platformOf(entries);
  const objects = entries.map((entry) => entry.entity_id.slice(entry.entity_id.indexOf('.') + 1));
  const name = device
    ? (hass?.devices?.[device]?.name_by_user ?? hass?.devices?.[device]?.name)
    : undefined;
  const slug = deviceSlug(objects, name);
  const take = (candidate: Candidate): void => {
    const part = partOf(candidate);
    if (!part) return;
    if (part.role === 'doors') doors.push(candidate.id);
    else if (part.role === 'windows' && candidate.domain !== 'cover') windows.push(candidate.id);
    else if (part.role === 'warnings')
      warnings[wheelOf(candidate.key ?? candidate.object)] ??= candidate.id;
    else {
      const role = part.role;
      const next = { id: candidate.id, rank: part.rank, own: candidate.platform === platform };
      const holder = held[role];
      if (!holder || surer(role, next, holder)) held[role] = next;
    }
  };
  if (scan)
    entries.forEach((entry, index) => {
      if (entry.hidden) return;
      take(
        candidateOf(
          entry,
          hass?.states?.[entry.entity_id],
          withoutSlug(objects[index] ?? '', slug),
        ),
      );
    });
  const roles: VehicleRoles = {};
  for (const [role, holder] of Object.entries(held) as Array<[VehicleRole, Holder]>)
    roles[role] = holder.id;
  // the entity the card names plays what it is known by, where none of the car's own does
  if (scan && entity && !Object.values(roles).includes(entity)) {
    const entry = hass?.entities?.[entity] ?? { entity_id: entity };
    const part = partOf(
      candidateOf(
        entry as EntityRegistryDisplayEntry,
        hass?.states?.[entity],
        entity.slice(entity.indexOf('.') + 1),
      ),
    );
    if (
      part &&
      typeof part.role === 'string' &&
      part.role in DOMAINS &&
      !roles[part.role as VehicleRole]
    )
      roles[part.role as VehicleRole] = entity;
  }
  for (const { role, entity: id } of named)
    if ((VEHICLE_ROLES as readonly string[]).includes(role) && id) roles[role as VehicleRole] = id;
    else if ((role === 'doors' || role === 'windows') && id)
      (role === 'doors' ? doors : windows).push(id);
  return { roles, doors, windows, warnings, platform };
}

/** The device the card is about: the one it names, else the device of the entity it names. */
export function vehicleDevice(
  hass: Pick<HomeAssistant, 'entities'> | undefined,
  device: string | undefined,
  entity: string | undefined,
): string | undefined {
  if (device) return device;
  return entity ? (hass?.entities?.[entity]?.device_id ?? undefined) : undefined;
}

/**
 * The house's cars: devices of an integration the card reads whose entities give a battery's charge or a place —
 * a car the card can draw — in the registry's order.
 */
export function vehicleDevices(hass: House | undefined): string[] {
  const byDevice = new Map<string, EntityRegistryDisplayEntry[]>();
  for (const entry of Object.values(hass?.entities ?? {})) {
    if (!entry.device_id || !known(entry.platform)) continue;
    const list = byDevice.get(entry.device_id) ?? [];
    list.push(entry);
    byDevice.set(entry.device_id, list);
  }
  return [...byDevice.keys()].filter((device) => {
    const { roles } = vehicleEntities(hass, device);
    return Boolean(roles.battery ?? roles.range ?? roles.location);
  });
}
