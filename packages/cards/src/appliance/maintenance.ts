import type { HassEntity } from '@fluvy/core';
import type { Candidate } from './roles.js';

/*
 * What an appliance asks to be looked after: salt and rinse aid, the detergent tanks, a filter to clean or replace,
 * machine care, descaling, the coffee machine's beans, water tank, drip tray and milk, a hood's grease filter, a leak.
 * Each integration says it its own way, and each is read into one item — its key, how pressing it is (due, soon, or
 * fine), and its level where it has one: Home Connect's events are present (due), confirmed (due, seen to) or off;
 * Miele's levels are percentages, due at half the low level and soon at it; LG's reminders are flags, its rinse aid's
 * dispenser a step of five (empty is due, the last step soon), its tub-clean count the cycles since (due at the
 * thirty its machines ask at), and its notification events count for a day, said with their age; SmartThings'
 * filters count how much they are used. A pet device's (#112) are its food, its desiccant, a fountain's water and
 * filter, a litter box's litter, waste drawer and deodorant: flags, levels, and the days a part has left (due when
 * none are, soon within `low_days`).
 */

export type MaintenanceKey =
  | 'salt'
  | 'rinse_aid'
  | 'detergent'
  | 'softener'
  | 'filter'
  | 'machine_care'
  | 'descale'
  | 'clean'
  | 'water_tank'
  | 'beans'
  | 'drip_tray'
  | 'milk'
  | 'water_filter'
  | 'air_filter'
  | 'grease_filter'
  | 'leak'
  | 'service'
  | 'food'
  | 'desiccant'
  | 'litter'
  | 'waste'
  | 'deodorant';
export const MAINTENANCE_KEYS: readonly MaintenanceKey[] = [
  'salt',
  'rinse_aid',
  'detergent',
  'softener',
  'filter',
  'machine_care',
  'descale',
  'clean',
  'water_tank',
  'beans',
  'drip_tray',
  'milk',
  'water_filter',
  'air_filter',
  'grease_filter',
  'leak',
  'service',
  'food',
  'desiccant',
  'litter',
  'waste',
  'deodorant',
];

/**
 * How an entity says it: `event` (Home Connect: present, confirmed, off), `level` (a percentage left), `used` (a
 * percentage used), `flag` (on when it is needed), `word` (a state that names it: Whirlpool's "empty", LG's "replace"),
 * `steps` (a dispenser's step, LG's "rinselevel_2" of its five), `count` (the cycles since it was last done, LG's
 * tub clean), `days` (the days a part has left: a pet device's desiccant and filters), `reset` (a button that says it
 * is done: SmartThings' filters, Matter's, a pet device's).
 */
export type MaintenanceForm =
  'event' | 'level' | 'used' | 'flag' | 'word' | 'steps' | 'count' | 'days' | 'reset';

/** The cycles after which LG's washers and dishwashers ask for a tub clean (their own "tCL" reminder). */
export const TUB_CLEAN_CYCLES = 30;

/** The days left within which a pet device's part is soon to change (its desiccant, its filter): a week. */
export const LOW_DAYS = 7;

export interface MaintenanceSpec {
  readonly key: MaintenanceKey;
  readonly form: MaintenanceForm;
  /** How pressing it is when it is said: a "nearly empty" is soon, a "lack" due. */
  readonly severity?: 'due' | 'soon';
}

const spec = (
  key: MaintenanceKey,
  form: MaintenanceForm,
  severity?: 'due' | 'soon',
): MaintenanceSpec => ({
  key,
  form,
  ...(severity ? { severity } : {}),
});

/** Each integration's keys for what it asks: Home Connect's events (sensor.py:197-420), Miele's levels, LG's flags. */
const BY_KEY: Readonly<Record<string, Readonly<Record<string, MaintenanceSpec>>>> = {
  home_connect: {
    salt_lack: spec('salt', 'event'),
    program_blocked_salt_lack: spec('salt', 'event'),
    salt_nearly_empty: spec('salt', 'event', 'soon'),
    rinse_aid_lack: spec('rinse_aid', 'event'),
    rinse_aid_nearly_empty: spec('rinse_aid', 'event', 'soon'),
    machine_care_reminder: spec('machine_care', 'event'),
    machine_care_and_filter_cleaning_reminder: spec('machine_care', 'event'),
    machine_care_and_low_maintenance_filter_cleaning_reminder: spec('machine_care', 'event'),
    smart_filter_cleaning_reminder: spec('filter', 'event'),
    poor_i_dos_1_fill_level: spec('detergent', 'event', 'soon'),
    poor_i_dos_2_fill_level: spec('softener', 'event', 'soon'),
    bean_container_empty: spec('beans', 'event'),
    water_tank_empty: spec('water_tank', 'event'),
    drip_tray_full: spec('drip_tray', 'event'),
    keep_milk_tank_cool: spec('milk', 'event'),
    descaling_in_20_cups: spec('descale', 'event', 'soon'),
    descaling_in_15_cups: spec('descale', 'event', 'soon'),
    descaling_in_10_cups: spec('descale', 'event', 'soon'),
    descaling_in_5_cups: spec('descale', 'event', 'soon'),
    device_should_be_descaled: spec('descale', 'event'),
    device_descaling_overdue: spec('descale', 'event'),
    device_descaling_blockage: spec('descale', 'event'),
    calc_n_clean_in20cups: spec('descale', 'event', 'soon'),
    calc_n_clean_in15cups: spec('descale', 'event', 'soon'),
    calc_n_clean_in10cups: spec('descale', 'event', 'soon'),
    calc_n_clean_in5cups: spec('descale', 'event', 'soon'),
    device_should_be_calc_n_cleaned: spec('descale', 'event'),
    device_calc_n_clean_overdue: spec('descale', 'event'),
    device_calc_n_clean_blockage: spec('descale', 'event'),
    device_should_be_cleaned: spec('clean', 'event'),
    device_cleaning_overdue: spec('clean', 'event'),
    grease_filter_max_saturation_nearly_reached: spec('grease_filter', 'event', 'soon'),
    grease_filter_max_saturation_reached: spec('grease_filter', 'event'),
  },
  // miele/sensor.py: the dishwasher's salt and rinse aid, TwinDos' tanks, the PowerDisk
  miele: {
    salt_level: spec('salt', 'level'),
    rinse_aid_level: spec('rinse_aid', 'level'),
    twin_dos_1_level: spec('detergent', 'level'),
    twin_dos_2_level: spec('softener', 'level'),
    power_disk_level: spec('detergent', 'level'),
  },
  // lg_thinq/binary_sensor.py and sensor.py (the rinse aid's dispenser: rinselevel_0 … rinselevel_4)
  lg_thinq: {
    rinse_refill: spec('rinse_aid', 'flag'),
    rinse_level: spec('rinse_aid', 'steps'),
    machine_clean_reminder: spec('machine_care', 'flag'),
    clean_light_reminder: spec('clean', 'flag'),
    water_filter_1_remain_percent: spec('water_filter', 'level'),
    fresh_air_filter: spec('air_filter', 'word'),
    filter_lifetime: spec('filter', 'level'),
  },
  // smartthings/sensor.py, binary_sensor.py, button.py:33-56
  smartthings: {
    water_filter_usage: spec('water_filter', 'used'),
    hood_filter_usage: spec('grease_filter', 'used'),
    filter_status: spec('filter', 'flag'),
    microfiber_filter_blockage: spec('filter', 'flag'),
    reset_water_filter: spec('water_filter', 'reset'),
    reset_hood_filter: spec('grease_filter', 'reset'),
  },
  // matter/sensor.py, button.py: a filter's condition left, and its reset
  matter: {
    hepa_filter_condition: spec('air_filter', 'level'),
    activated_carbon_filter_condition: spec('filter', 'level'),
    reset_filter_condition: spec('filter', 'reset'),
  },
  // whirlpool/sensor.py: the bulk detergent tank, "25", "50", "100", "empty"
  whirlpool: { whirlpool_tank: spec('detergent', 'word') },
  // petkit binary_sensor.py, sensor.py, button.py: a feeder's food flag is on when its hopper is empty, a fountain's
  // lack warning when its water is low, a box's waste bin when its drawer is full
  petkit: {
    food_level: spec('food', 'flag'),
    food_level_1: spec('food', 'flag'),
    food_level_2: spec('food', 'flag'),
    food_left: spec('food', 'level'),
    food_replenished: spec('food', 'reset'),
    desiccant_left_days: spec('desiccant', 'days'),
    reset_desiccant: spec('desiccant', 'reset'),
    lack_warning: spec('water_tank', 'flag'),
    clean_water_tank_state: spec('water_tank', 'word'),
    clean_water_tank_low: spec('water_tank', 'flag', 'soon'),
    clean_water_tank_empty: spec('water_tank', 'flag'),
    filter_percent: spec('water_filter', 'level'),
    filter_left_days: spec('water_filter', 'days'),
    replace_filter: spec('water_filter', 'flag'),
    reset_filter: spec('water_filter', 'reset'),
    litter_level: spec('litter', 'level'),
    sand_lack: spec('litter', 'flag'),
    sand_tray_left_days: spec('litter', 'days'),
    waste_bin: spec('waste', 'flag'),
    waste_tank_full: spec('waste', 'flag'),
    odor_eliminator_n50_left_days: spec('deodorant', 'days'),
    odor_eliminator_n60_left_days: spec('deodorant', 'days'),
    purification_n60_left_days: spec('deodorant', 'days'),
    reset_n50_odor_eliminator: spec('deodorant', 'reset'),
    reset_n60_odor_eliminator: spec('deodorant', 'reset'),
  },
  // petlibro binary_sensor.py, sensor.py, button.py: a feeder's food flag on when it runs low; a fountain's water in
  // percent (the Luma's litter, under the same key: `forKind`), its filter's and its cleaning's days
  petlibro: {
    food_low: spec('food', 'flag', 'soon'),
    left_food_low: spec('food', 'flag', 'soon'),
    right_food_low: spec('food', 'flag', 'soon'),
    remaining_desiccant: spec('desiccant', 'days'),
    desiccant_reset: spec('desiccant', 'reset'),
    weight_percent: spec('water_tank', 'level'),
    remaining_filter_days: spec('water_filter', 'days'),
    remaining_replacement_days: spec('water_filter', 'days'),
    filter_reset: spec('water_filter', 'reset'),
    remaining_cleaning_days: spec('clean', 'days'),
    cleaning_reset: spec('clean', 'reset'),
    rubbish_full_state: spec('waste', 'flag'),
  },
};

/**
 * A litter box's word for what a fountain's key says (PetLibro's Luma shares its fountains' keys): its litter's level
 * where a fountain's is its water, its own filter where a fountain's is its water filter.
 */
const LITTER_BOX_KEYS: Partial<Record<MaintenanceKey, MaintenanceKey>> = {
  water_tank: 'litter',
  water_filter: 'filter',
};

/** What a maintenance item is called on an appliance of a kind (a litter box's litter where a key says water). */
export const forKind = (key: MaintenanceKey, kind: string | undefined): MaintenanceKey =>
  (kind === 'litter_box' ? LITTER_BOX_KEYS[key] : undefined) ?? key;

/** The ends of ids of the integrations read by their ids. */
const BY_ID: Readonly<Record<string, ReadonlyArray<readonly [RegExp, MaintenanceSpec]>>> = {
  electrolux_status: [[/waterfilterstate$/, spec('water_filter', 'word')]],
  // and the device sensor's attributes (`roles.ts`): a dishwasher's refills, the tub-clean count
  smartthinq_sensors: [
    [/(^|_)water_filter_remaining$/, spec('water_filter', 'level')],
    [/(^|_)fresh_air_filter_remaining$/, spec('air_filter', 'level')],
    [/(^|_)rinse_refill$/, spec('rinse_aid', 'flag')],
    [/(^|_)salt_refill$/, spec('salt', 'flag')],
    [/(^|_)(tub_clean_counter|tubclean_count)$/, spec('machine_care', 'count')],
  ],
};

/** What an entity asks to be looked after, and how it says it; none for anything else. */
export function maintenanceOf(candidate: Candidate): MaintenanceSpec | undefined {
  const { platform, key, object, domain } = candidate;
  const keyed = key ? BY_KEY[platform ?? '']?.[key] : undefined;
  const found = keyed ?? BY_ID[platform ?? '']?.find(([pattern]) => pattern.test(object))?.[1];
  if (!found) return undefined;
  // a reset is a button; anything else is a reading (LG's fresh-air filter is a select too, a setting)
  const reading = domain === 'sensor' || domain === 'binary_sensor';
  return (found.form === 'reset' ? domain === 'button' : reading) ? found : undefined;
}

/** One thing to look after, as the card shows it. */
export interface MaintenanceItem {
  readonly key: MaintenanceKey;
  readonly entity: string;
  readonly severity: 'due' | 'soon' | 'ok';
  /** What is left, in percent, where the integration says it. */
  readonly level?: number;
  /** The days it has left, where the integration counts them (a desiccant's, a filter's). */
  readonly days?: number;
  /** Since when it has been asked for (ms): the event's, or the flag's last change. */
  readonly since?: number;
  /** Home Connect's "confirmed": seen to on the appliance, still to do (drawn in the secondary ink). */
  readonly confirmed?: boolean;
}

/** What a percentage left says: due at half the low level, soon at it. */
const byLevel = (level: number, low: number): MaintenanceItem['severity'] =>
  level <= low / 2 ? 'due' : level <= low ? 'soon' : 'ok';

/**
 * Words that say a thing needs doing (Whirlpool's tank, LG's fresh-air filter, Electrolux's water filter, PetKit's
 * water tank), and those of them that say it soon (Whirlpool's quarter, a tank low).
 */
const NEEDED = /^(empty|replace|change|buy|bad|expired|exhausted|25|low)$/;
const SOON = /^(25|low)$/;

/**
 * One maintenance entity, read: how pressing it is (`lowLevel` the percentage a level is low at, 20 by default), its
 * level, since when. None for a reset button (it is how one is done, not one), or a state the entity does not have.
 */
export function maintenanceItem(
  found: MaintenanceSpec,
  state: HassEntity | undefined,
  lowLevel = 20,
  lowDays = LOW_DAYS,
): MaintenanceItem | undefined {
  if (!state || found.form === 'reset') return undefined;
  const word = state.state.toLowerCase().replace(/[\s-]+/g, '_');
  if (word === 'unavailable' || word === 'unknown') return undefined;
  const since = Date.parse(state.last_changed);
  const base = { key: found.key, entity: state.entity_id };
  const said = (severity: MaintenanceItem['severity']): MaintenanceItem => ({
    ...base,
    severity,
    ...(severity !== 'ok' && Number.isFinite(since) ? { since } : {}),
  });
  switch (found.form) {
    case 'event':
      if (word === 'off') return said('ok');
      return {
        ...said(found.severity ?? 'due'),
        ...(word === 'confirmed' ? { confirmed: true } : {}),
      };
    case 'flag':
      return said(word === 'on' ? (found.severity ?? 'due') : 'ok');
    case 'word':
      return said(NEEDED.test(word) ? (SOON.test(word) ? 'soon' : 'due') : 'ok');
    case 'steps': {
      // "rinselevel_2": the step of as many as its options list (LG's five), empty due, the last step soon
      const step = Number(/\d+$/.exec(word)?.[0]);
      const options = state.attributes['options'];
      const last = (Array.isArray(options) ? options.length : 5) - 1;
      if (!Number.isFinite(step) || last < 1) return undefined;
      return {
        ...said(step === 0 ? 'due' : step === 1 ? 'soon' : 'ok'),
        level: Math.round((Math.min(step, last) / last) * 100),
      };
    }
    case 'level':
    case 'used':
    case 'count':
    case 'days': {
      const value = Number(state.state);
      if (!/\d/.test(state.state) || !Number.isFinite(value)) return undefined;
      // a count of cycles since: due at LG's thirty, soon from four fifths of them; what is left as its level
      if (found.form === 'count')
        return {
          ...said(
            value >= TUB_CLEAN_CYCLES ? 'due' : value >= TUB_CLEAN_CYCLES * 0.8 ? 'soon' : 'ok',
          ),
          level: Math.max(0, Math.round(100 - (value / TUB_CLEAN_CYCLES) * 100)),
        };
      // the days a part has left: due when none are, soon within `lowDays`
      if (found.form === 'days')
        return {
          ...said(value <= 0 ? 'due' : value <= lowDays ? 'soon' : 'ok'),
          days: Math.max(0, Math.round(value)),
        };
      const level = Math.min(100, Math.max(0, found.form === 'used' ? 100 - value : value));
      return { ...said(byLevel(level, lowLevel)), level };
    }
  }
}

/** LG's notification events that ask for something (lg_thinq strings.json, event.notification). */
const NOTIFIED: Readonly<Record<string, MaintenanceKey>> = {
  salt_refill_is_needed: 'salt',
  rinse_is_not_enough: 'rinse_aid',
  time_to_clean_filter: 'filter',
  time_to_change_water_filter: 'water_filter',
  time_to_change_filter: 'air_filter',
  time_to_clean: 'clean',
  water_leak_has_occurred: 'leak',
  lack_of_water: 'water_tank',
};

/** How long an LG notification asks for something: a day (an event is a moment, not a state). */
export const NOTIFIED_FOR = 24 * 3_600_000;

/**
 * What LG's notification event asks for, while it is recent: its type, due for a day after it fired, said with its
 * age. None for a notification of anything else ("Washing is completed").
 */
export function notifiedItem(
  state: HassEntity | undefined,
  now: number,
): MaintenanceItem | undefined {
  const type = state?.attributes['event_type'];
  const key = typeof type === 'string' ? NOTIFIED[type] : undefined;
  if (!state || !key) return undefined;
  const at = Date.parse(state.state);
  if (!Number.isFinite(at) || now - at > NOTIFIED_FOR || at > now + 60_000) return undefined;
  return { key, entity: state.entity_id, severity: 'due', since: at };
}

const SEVERITY = { due: 0, soon: 1, ok: 2 } as const;

/**
 * The maintenance a card shows: one item a key (the most pressing of those that say it: two tanks, an event and a
 * level), due first, then soon, then fine, each in the order of `MAINTENANCE_KEYS`; of two as pressing, the first —
 * each with what is left as the other says it, where it does not say it (a litter box's flag that its litter is short
 * keeps its level's percentage, a filter's percentage its days).
 */
export function maintenanceList(
  items: ReadonlyArray<MaintenanceItem | undefined>,
): MaintenanceItem[] {
  const byKey = new Map<MaintenanceKey, MaintenanceItem>();
  for (const item of items) {
    if (!item) continue;
    const held = byKey.get(item.key);
    if (!held) {
      byKey.set(item.key, item);
      continue;
    }
    const [main, other] =
      SEVERITY[item.severity] < SEVERITY[held.severity] ? [item, held] : [held, item];
    byKey.set(item.key, {
      ...main,
      ...(main.level === undefined && other.level !== undefined ? { level: other.level } : {}),
      ...(main.days === undefined && other.days !== undefined ? { days: other.days } : {}),
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      SEVERITY[a.severity] - SEVERITY[b.severity] ||
      MAINTENANCE_KEYS.indexOf(a.key) - MAINTENANCE_KEYS.indexOf(b.key),
  );
}
