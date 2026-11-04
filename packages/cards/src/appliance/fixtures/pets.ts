import { device, entriesFor, minutesFrom, type ApplianceFixture, type FixtureAt } from './house.js';

/*
 * Pet devices (#112), as PetKit (Jezza34000/homeassistant_petkit 1.29.0) and PetLibro (jjjonesjr33/petlibro 1.3)
 * register them: each entity with its translation key, its category and its state as their source writes it. PetKit's
 * entities are named in English whatever the house's language (the integration ships English alone), after the
 * device's own name; its feeder's meals are its plan's rows, in the attributes of its "Feeding schedule" switch, at
 * fixed times of the house's day (07:30, 12:00 and 18:00 given, 23:00 to come). A PetKit pet is a device of its own,
 * never an appliance.
 */

const config = { entity_category: 'config' } as const;
const diagnostic = { entity_category: 'diagnostic' } as const;

/** The plan of the PetKit feeder: three meals given today, one to come at 23:00, every day. */
export const PETKIT_PLAN = [
  { key: 'm1', hour: 7, minute: 30, values: [20], status: 'dispensed', enabled: true, today: true },
  { key: 'm2', hour: 12, minute: 0, values: [20], status: 'dispensed', enabled: true, today: true },
  { key: 'm3', hour: 18, minute: 0, values: [20], status: 'dispensed', enabled: true, today: true },
  { key: 'm4', hour: 23, minute: 0, values: [10], status: 'pending', enabled: true, today: true },
].map((row) => ({ ...row, weekdays: null, label: 'Meal', readonly: false }));

/** A PetKit YumShare Solo (D4H): its food fine, its desiccant twelve days from changing, its next meal at 23:00. */
export const petkitFeeder: FixtureAt = () => {
  const e = entriesFor('petkit', 'pk-feeder');
  return {
    title: 'PetKit feeder',
    platform: 'petkit',
    device: device('pk-feeder', 'Futterautomat', 'Yumshare Solo', 'Petkit', 'D4H'),
    entities: [
      e('sensor.futterautomat_device_status', 'device_status', diagnostic),
      e('sensor.futterautomat_error', 'error_message', diagnostic),
      e('sensor.futterautomat_desiccant_left_days', 'desiccant_left_days'),
      e('sensor.futterautomat_times_dispensed', 'times_dispensed', diagnostic),
      e('sensor.futterautomat_total_planned', 'total_planned', diagnostic),
      e('sensor.futterautomat_total_dispensed', 'total_dispensed', diagnostic),
      e('sensor.futterautomat_food_bowl_fill', 'food_bowl_percentage'),
      e('sensor.futterautomat_food_left', 'food_left', diagnostic),
      e('binary_sensor.futterautomat_feeding', 'feeding'),
      e('binary_sensor.futterautomat_eating', 'eating'),
      e('binary_sensor.futterautomat_food_level', 'food_level'),
      e('button.futterautomat_reset_desiccant', 'reset_desiccant', config),
      e('button.futterautomat_cancel_manual_feed', 'cancel_manual_feed'),
      e('button.futterautomat_food_replenished', 'food_replenished'),
      e('text.futterautomat_manual_feed', 'manual_feed_single'),
      e('switch.futterautomat_feeding_schedule', 'feeding_schedule'),
      e('switch.futterautomat_indicator_light', 'indicator_light', config),
      e('camera.futterautomat', 'camera'),
    ],
    states: [
      [
        'sensor.futterautomat_device_status',
        'online_ac',
        { device_class: 'enum', options: ['offline', 'online_ac', 'online_battery', 'unknown'] },
      ],
      ['sensor.futterautomat_error', 'No error'],
      ['sensor.futterautomat_desiccant_left_days', '12', { unit_of_measurement: 'd' }],
      ['sensor.futterautomat_times_dispensed', '3'],
      ['sensor.futterautomat_total_planned', '70', { unit_of_measurement: 'g' }],
      ['sensor.futterautomat_total_dispensed', '60', { unit_of_measurement: 'g' }],
      ['sensor.futterautomat_food_bowl_fill', '35', { unit_of_measurement: '%' }],
      ['sensor.futterautomat_food_left', '64', { unit_of_measurement: '%' }],
      ['binary_sensor.futterautomat_feeding', 'off', { device_class: 'running' }],
      ['binary_sensor.futterautomat_eating', 'off', { device_class: 'occupancy' }],
      ['binary_sensor.futterautomat_food_level', 'off', { device_class: 'problem' }],
      ['button.futterautomat_reset_desiccant', 'unknown'],
      ['button.futterautomat_cancel_manual_feed', 'unknown'],
      ['button.futterautomat_food_replenished', 'unknown'],
      [
        'text.futterautomat_manual_feed',
        '0',
        { min: 1, max: 3, mode: 'text', pattern: '^(10|20|30|40|50|0)$' },
      ],
      [
        'switch.futterautomat_feeding_schedule',
        'on',
        {
          device_id: 10014481,
          capabilities: {
            compartments: 1,
            amount: { min: 10, max: 50, step: 10, unit: 'g' },
            weekly: true,
          },
          schedule: PETKIT_PLAN,
        },
      ],
      ['switch.futterautomat_indicator_light', 'on'],
      ['camera.futterautomat', 'idle'],
    ],
    expected: {
      kind: 'feeder',
      listed: true,
      roles: {
        feed: 'text.futterautomat_manual_feed',
        schedule: 'switch.futterautomat_feeding_schedule',
        running: 'binary_sensor.futterautomat_feeding',
        online: 'sensor.futterautomat_device_status',
        error: 'sensor.futterautomat_error',
        fed_today: 'sensor.futterautomat_total_dispensed',
        meals_today: 'sensor.futterautomat_times_dispensed',
      },
    },
  };
};

/** A PetKit Eversweet 3 Pro (W5, on the Bluetooth relay): its pump on, its filter at 62 %. */
export const petkitFountain: FixtureAt = (now) => {
  const e = entriesFor('petkit', 'pk-fountain');
  return {
    title: 'PetKit fountain',
    platform: 'petkit',
    device: device('pk-fountain', 'Trinkbrunnen', 'Eversweet 3 Pro', 'Petkit', 'W5'),
    entities: [
      e('sensor.trinkbrunnen_error', 'error_message', diagnostic),
      e('sensor.trinkbrunnen_energy', 'today_pump_run_time', diagnostic),
      e('sensor.trinkbrunnen_last_update', 'last_update', diagnostic),
      e('sensor.trinkbrunnen_filter_remaining', 'filter_percent'),
      e('sensor.trinkbrunnen_purified_water', 'purified_water', diagnostic),
      e('sensor.trinkbrunnen_drink_times', 'drink_times'),
      e('binary_sensor.trinkbrunnen_water_lack_warning', 'lack_warning'),
      e('binary_sensor.trinkbrunnen_replace_filter', 'replace_filter'),
      e('binary_sensor.trinkbrunnen_pump', 'pump_running'),
      e('binary_sensor.trinkbrunnen_pet_drinking', 'pet_detected'),
      e('button.trinkbrunnen_reset_filter', 'reset_filter'),
      e('button.trinkbrunnen_pause', 'pause'),
      e('button.trinkbrunnen_resume', 'resume'),
      e('select.trinkbrunnen_working_mode', 'working_mode'),
      e('switch.trinkbrunnen_power', 'power'),
    ],
    states: [
      ['sensor.trinkbrunnen_error', 'No error'],
      [
        'sensor.trinkbrunnen_energy',
        '0.0021',
        { device_class: 'energy', unit_of_measurement: 'kWh' },
      ],
      ['sensor.trinkbrunnen_last_update', minutesFrom(now, -2), { device_class: 'timestamp' }],
      ['sensor.trinkbrunnen_filter_remaining', '62', { unit_of_measurement: '%' }],
      ['sensor.trinkbrunnen_purified_water', '7'],
      ['sensor.trinkbrunnen_drink_times', '9', {}, 25 * 60],
      ['binary_sensor.trinkbrunnen_water_lack_warning', 'off', { device_class: 'problem' }],
      ['binary_sensor.trinkbrunnen_replace_filter', 'off', { device_class: 'problem' }],
      ['binary_sensor.trinkbrunnen_pump', 'on', { device_class: 'running' }],
      ['binary_sensor.trinkbrunnen_pet_drinking', 'off', { device_class: 'occupancy' }],
      ['button.trinkbrunnen_reset_filter', 'unknown'],
      ['button.trinkbrunnen_pause', 'unknown'],
      ['button.trinkbrunnen_resume', 'unavailable'],
      ['select.trinkbrunnen_working_mode', 'Normal', { options: ['Pause', 'Normal', 'Smart'] }],
      ['switch.trinkbrunnen_power', 'on'],
    ],
    expected: {
      kind: 'fountain',
      listed: true,
      roles: {
        pump: 'binary_sensor.trinkbrunnen_pump',
        purified: 'sensor.trinkbrunnen_purified_water',
        drinks_today: 'sensor.trinkbrunnen_drink_times',
        pause: 'button.trinkbrunnen_pause',
        resume: 'button.trinkbrunnen_resume',
        power: 'switch.trinkbrunnen_power',
      },
    },
  };
};

/** A PetKit PuraMax 2 (T4) at rest: its litter at 72 %, its drawer fine, used three times today, last by Luna. */
export const petkitLitterBox: FixtureAt = () => {
  const e = entriesFor('petkit', 'pk-litter');
  return {
    title: 'PetKit litter box',
    platform: 'petkit',
    device: device('pk-litter', 'Katzenklo', 'Puramax 2', 'Petkit', 'T4'),
    entities: [
      e('sensor.katzenklo_device_status', 'device_status', diagnostic),
      e('sensor.katzenklo_error', 'error_message', diagnostic),
      e('sensor.katzenklo_litter_level', 'litter_level'),
      e('sensor.katzenklo_litter_weight', 'litter_weight', diagnostic),
      e('sensor.katzenklo_state', 'litter_state'),
      e('sensor.katzenklo_last_event', 'litter_last_event'),
      e('sensor.katzenklo_odor_eliminator_n50_left_days', 'odor_eliminator_n50_left_days'),
      e('sensor.katzenklo_times_used', 'times_used'),
      e('sensor.katzenklo_total_use', 'total_time'),
      e('sensor.katzenklo_last_used_by', 'last_used_by'),
      e('binary_sensor.katzenklo_sand_lack', 'sand_lack'),
      e('binary_sensor.katzenklo_wastebin_filled', 'waste_bin'),
      e('binary_sensor.katzenklo_wastebin_presence', 'waste_bin_presence'),
      e('binary_sensor.katzenklo_toilet_occupied', 'toilet_occupied'),
      e('button.katzenklo_scoop', 'start_scoop'),
      e('button.katzenklo_dump_litter', 'dump_litter'),
      e('button.katzenklo_level_litter', 'level_litter'),
      e('button.katzenklo_deodorize', 'deodorize'),
      e('button.katzenklo_action_pause', 'action_pause'),
      e('button.katzenklo_action_continue', 'action_continue'),
      e('button.katzenklo_action_reset', 'action_reset'),
      e('button.katzenklo_reset_n50_odor_eliminator', 'reset_n50_odor_eliminator'),
      e('switch.katzenklo_power', 'power'),
      e('switch.katzenklo_auto_clean', 'auto_clean', config),
    ],
    states: [
      [
        'sensor.katzenklo_device_status',
        'online_ac',
        { device_class: 'enum', options: ['offline', 'online_ac', 'online_battery', 'unknown'] },
      ],
      ['sensor.katzenklo_error', 'No error'],
      ['sensor.katzenklo_litter_level', '72', { unit_of_measurement: '%' }],
      [
        'sensor.katzenklo_litter_weight',
        '4.1',
        { device_class: 'weight', unit_of_measurement: 'kg' },
      ],
      ['sensor.katzenklo_state', 'idle'],
      ['sensor.katzenklo_last_event', 'auto_cleaning_completed', {}, 38 * 60],
      ['sensor.katzenklo_odor_eliminator_n50_left_days', '18', { unit_of_measurement: 'd' }],
      ['sensor.katzenklo_times_used', '3', {}, 42 * 60],
      ['sensor.katzenklo_total_use', '412', { unit_of_measurement: 's' }],
      ['sensor.katzenklo_last_used_by', 'Luna', {}, 42 * 60],
      ['binary_sensor.katzenklo_sand_lack', 'off', { device_class: 'problem' }],
      ['binary_sensor.katzenklo_wastebin_filled', 'off', { device_class: 'problem' }],
      ['binary_sensor.katzenklo_wastebin_presence', 'off', { device_class: 'problem' }],
      ['binary_sensor.katzenklo_toilet_occupied', 'off', { device_class: 'occupancy' }],
      ['button.katzenklo_scoop', 'unknown'],
      ['button.katzenklo_dump_litter', 'unknown'],
      ['button.katzenklo_level_litter', 'unknown'],
      ['button.katzenklo_deodorize', 'unknown'],
      ['button.katzenklo_action_pause', 'unavailable'],
      ['button.katzenklo_action_continue', 'unavailable'],
      ['button.katzenklo_action_reset', 'unavailable'],
      ['button.katzenklo_reset_n50_odor_eliminator', 'unknown'],
      ['switch.katzenklo_power', 'on'],
      ['switch.katzenklo_auto_clean', 'on'],
    ],
    expected: {
      kind: 'litter_box',
      status: 'idle',
      listed: true,
      roles: {
        state: 'sensor.katzenklo_state',
        clean: 'button.katzenklo_scoop',
        level: 'button.katzenklo_level_litter',
        deodorize: 'button.katzenklo_deodorize',
        uses_today: 'sensor.katzenklo_times_used',
        last_pet: 'sensor.katzenklo_last_used_by',
        pause: 'button.katzenklo_action_pause',
        resume: 'button.katzenklo_action_continue',
      },
    },
  };
};

/** A PetKit pet: a device of its own, its weight and its last visits, never an appliance. */
export const petkitPet: FixtureAt = () => {
  const e = entriesFor('petkit', 'pk-pet');
  return {
    title: 'PetKit pet',
    platform: 'petkit',
    device: device('pk-pet', 'Luna', null, 'Petkit', 'PET'),
    entities: [
      e('sensor.luna_last_weight_measurement', 'pet_last_weight_measurement'),
      e('sensor.luna_last_litter_used', 'pet_last_device_used'),
      e('sensor.luna_last_use_date', 'pet_last_use_date'),
      e('number.luna_weight', 'pet_weight'),
    ],
    states: [
      [
        'sensor.luna_last_weight_measurement',
        '4.3',
        { device_class: 'weight', unit_of_measurement: 'kg' },
      ],
      ['sensor.luna_last_litter_used', 'Katzenklo'],
      ['sensor.luna_last_use_date', '2026-09-17 21:05:00'],
      ['number.luna_weight', '4.2', { min: 1, max: 100, step: 0.1, unit_of_measurement: 'kg' }],
    ],
    expected: { listed: false },
  };
};

/**
 * A PETLIBRO Granary Smart Feeder (PLAF103): its last and next meals as sensors of their own, its food running low,
 * its desiccant three days from changing; its manual feed a button that gives the amount its number holds.
 */
export const petlibroFeeder: FixtureAt = (now) => {
  const e = entriesFor('petlibro', 'pl-feeder');
  return {
    title: 'PetLibro feeder',
    platform: 'petlibro',
    device: device('pl-feeder', 'Granary', 'PLAF103', 'PETLIBRO'),
    entities: [
      e('sensor.granary_wi_fi_signal_strength', 'wifi_rssi'),
      e('sensor.granary_battery_ac', 'electric_quantity'),
      e('sensor.granary_today_s_feeding_quantity_weight', 'today_feeding_quantity_weight'),
      e('sensor.granary_today_s_feeding_times', 'today_feeding_times'),
      e('sensor.granary_last_feed_time', 'last_feed_time'),
      e('sensor.granary_last_feed_quantity_weight', 'last_feed_quantity_weight'),
      e('sensor.granary_next_feed_time', 'next_feed_time'),
      e('sensor.granary_next_feed_quantity_weight', 'next_feed_quantity_weight'),
      e('sensor.granary_desiccant_remaining_days', 'remaining_desiccant'),
      e('binary_sensor.granary_wi_fi', 'online'),
      e('binary_sensor.granary_food_status', 'food_low'),
      e('binary_sensor.granary_food_dispenser', 'food_dispenser_state'),
      e('binary_sensor.granary_feeding_schedule', 'feeding_schedule'),
      e('button.granary_manual_feed', 'manual_feed', config),
      e('button.granary_desiccant_reset', 'desiccant_reset', config),
      e('number.granary_manual_feed_quantity', 'manual_feed_quantity'),
    ],
    states: [
      [
        'sensor.granary_wi_fi_signal_strength',
        '-52',
        { device_class: 'signal_strength', unit_of_measurement: 'dBm' },
      ],
      ['sensor.granary_battery_ac', '100', { device_class: 'battery', unit_of_measurement: '%' }],
      [
        'sensor.granary_today_s_feeding_quantity_weight',
        '40',
        { device_class: 'weight', unit_of_measurement: 'g' },
      ],
      ['sensor.granary_today_s_feeding_times', '2'],
      ['sensor.granary_last_feed_time', minutesFrom(now, -227), { device_class: 'timestamp' }],
      [
        'sensor.granary_last_feed_quantity_weight',
        '20',
        { device_class: 'weight', unit_of_measurement: 'g' },
      ],
      ['sensor.granary_next_feed_time', minutesFrom(now, 43), { device_class: 'timestamp' }],
      [
        'sensor.granary_next_feed_quantity_weight',
        '20',
        { device_class: 'weight', unit_of_measurement: 'g' },
      ],
      [
        'sensor.granary_desiccant_remaining_days',
        '3',
        { device_class: 'duration', unit_of_measurement: 'd' },
      ],
      ['binary_sensor.granary_wi_fi', 'on', { device_class: 'connectivity' }],
      ['binary_sensor.granary_food_status', 'on', { device_class: 'problem' }],
      ['binary_sensor.granary_food_dispenser', 'off', { device_class: 'problem' }],
      ['binary_sensor.granary_feeding_schedule', 'on'],
      ['button.granary_manual_feed', 'unknown'],
      ['button.granary_desiccant_reset', 'unknown'],
      ['number.granary_manual_feed_quantity', '2', { min: 1, max: 48, step: 1 }],
    ],
    expected: {
      kind: 'feeder',
      listed: true,
      roles: {
        feed: 'button.granary_manual_feed',
        next_feed: 'sensor.granary_next_feed_time',
        last_feed: 'sensor.granary_last_feed_time',
        fed_today: 'sensor.granary_today_s_feeding_quantity_weight',
        online: 'binary_sensor.granary_wi_fi',
        error: 'binary_sensor.granary_food_dispenser',
      },
    },
  };
};

/** A PETLIBRO Dockstream Smart Fountain (PLWF105): its water at 54 %, its filter twelve days from changing. */
export const petlibroFountain: FixtureAt = () => {
  const e = entriesFor('petlibro', 'pl-fountain');
  return {
    title: 'PetLibro fountain',
    platform: 'petlibro',
    device: device('pl-fountain', 'Dockstream', 'PLWF105', 'PETLIBRO'),
    entities: [
      e('sensor.dockstream_remaining_water', 'remaining_water'),
      e('sensor.dockstream_remaining_water_2', 'weight_percent'),
      e('sensor.dockstream_today_s_water_consumption', 'today_drinking_amount'),
      e('sensor.dockstream_today_s_total_drinking_times', 'today_drinking_count'),
      e('sensor.dockstream_remaining_filter_day', 'remaining_filter_days'),
      e('sensor.dockstream_remaining_cleaning_days', 'remaining_cleaning_days'),
      e('binary_sensor.dockstream_wi_fi', 'online'),
      e('button.dockstream_filter_reset', 'filter_reset', config),
      e('button.dockstream_cleaning_reset', 'cleaning_reset', config),
      e('select.dockstream_water_dispensing_mode', 'water_dispensing_mode'),
    ],
    states: [
      [
        'sensor.dockstream_remaining_water',
        '1080',
        { device_class: 'volume', unit_of_measurement: 'mL' },
      ],
      ['sensor.dockstream_remaining_water_2', '54', { unit_of_measurement: '%' }],
      [
        'sensor.dockstream_today_s_water_consumption',
        '320',
        { device_class: 'volume', unit_of_measurement: 'mL' },
      ],
      ['sensor.dockstream_today_s_total_drinking_times', '7'],
      [
        'sensor.dockstream_remaining_filter_day',
        '12',
        { device_class: 'duration', unit_of_measurement: 'd' },
      ],
      [
        'sensor.dockstream_remaining_cleaning_days',
        '5',
        { device_class: 'duration', unit_of_measurement: 'd' },
      ],
      ['binary_sensor.dockstream_wi_fi', 'on', { device_class: 'connectivity' }],
      ['button.dockstream_filter_reset', 'unknown'],
      ['button.dockstream_cleaning_reset', 'unknown'],
      [
        'select.dockstream_water_dispensing_mode',
        'Flowing Water (Constant)',
        { options: ['Flowing Water (Constant)', 'Intermittent Water (Scheduled)'] },
      ],
    ],
    expected: {
      kind: 'fountain',
      listed: true,
      roles: {
        drank_today: 'sensor.dockstream_today_s_water_consumption',
        drinks_today: 'sensor.dockstream_today_s_total_drinking_times',
      },
    },
  };
};

/** A PETLIBRO Luma Smart Litter Box (PLLB001): its litter in percent under its fountains' key, its bin fine. */
export const petlibroLitterBox: FixtureAt = () => {
  const e = entriesFor('petlibro', 'pl-litter');
  return {
    title: 'PetLibro litter box',
    platform: 'petlibro',
    device: device('pl-litter', 'Luma', 'PLLB001', 'PETLIBRO'),
    entities: [
      e('sensor.luma_remaining_water', 'weight_percent'),
      e('sensor.luma_running_state', 'running_state'),
      e('sensor.luma_exception_message', 'exception_message'),
      e('sensor.luma_filter_replacement_days', 'remaining_replacement_days'),
      e('binary_sensor.luma_wi_fi', 'online'),
      e('binary_sensor.luma_waste_bin_full', 'rubbish_full_state'),
      e('button.luma_start_clean_cycle', 'trigger_clean', config),
      e('button.luma_level_litter', 'trigger_level_litter', config),
      e('button.luma_stop_current_action', 'trigger_stop_action', config),
      e('button.luma_filter_reset', 'filter_reset', config),
    ],
    states: [
      ['sensor.luma_remaining_water', '81', { unit_of_measurement: '%' }],
      ['sensor.luma_running_state', 'IDLE'],
      ['sensor.luma_exception_message', 'unknown'],
      [
        'sensor.luma_filter_replacement_days',
        '40',
        { device_class: 'duration', unit_of_measurement: 'd' },
      ],
      ['binary_sensor.luma_wi_fi', 'on', { device_class: 'connectivity' }],
      ['binary_sensor.luma_waste_bin_full', 'off', { device_class: 'problem' }],
      ['button.luma_start_clean_cycle', 'unknown'],
      ['button.luma_level_litter', 'unknown'],
      ['button.luma_stop_current_action', 'unknown'],
      ['button.luma_filter_reset', 'unknown'],
    ],
    expected: {
      kind: 'litter_box',
      status: 'idle',
      listed: true,
      roles: {
        state: 'sensor.luma_running_state',
        clean: 'button.luma_start_clean_cycle',
        level: 'button.luma_level_litter',
        stop: 'button.luma_stop_current_action',
      },
    },
  };
};

/** Every pet device fixture at a moment, and a pet that is never one: one house. */
export const petFixtures = (now: number): readonly ApplianceFixture[] => [
  petkitFeeder(now),
  petkitFountain(now),
  petkitLitterBox(now),
  petkitPet(now),
  petlibroFeeder(now),
  petlibroFountain(now),
  petlibroLitterBox(now),
];
