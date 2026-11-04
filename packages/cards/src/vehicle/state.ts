/*
 * What a car is doing, whatever its integration calls it: the charging states of Tesla's three integrations, BMW's,
 * Renault's, Volvo's, Kia's and Hyundai's, Volkswagen's two, Škoda's, Polestar's and MG's, each folded into the few a
 * card draws; whether it drives, sleeps or is parked; and the line under its battery, by what matters most now. The
 * words a card writes for an entity stay Home Assistant's (its state as it translates it); these decide the tone, the
 * badge and the line. Nothing is guessed: a reading that cannot be read is null, and what is not there is undefined.
 */

/**
 * Where its charge is: charging, at its limit, plugged in but not charging (stopped, or waiting for its time),
 * unplugged, failed; or not charging with nothing said of its cable (`idle`: Volvo's and Polestar's "idle", Renault's
 * "not in charge", BMW's "no charging" — their plug sensors, where they have one, say the rest).
 */
export type Charge =
  'charging' | 'complete' | 'stopped' | 'waiting' | 'unplugged' | 'error' | 'idle';

/**
 * A charging state's words, as `wordOf` writes them, by what they mean: Tesla's six; Renault's plug and charge states;
 * Volvo's; Škoda's and MySkoda's; Polestar's; MG's ("Charging (AC)"); Volkswagen's two, in words and run together
 * ("readyForCharging"); and a word anyone writes. "Off", "unsupported" and the like say nothing: the cable and the
 * power then do.
 */
const CHARGES: ReadonlyArray<readonly [Charge, RegExp]> = [
  [
    'charging',
    /^(charging|chargingactive|charging_active|charging_(ac|dc)|super_offboard_charging|charge_in_progress|charging_in_progress|v2g_charging_normal|smart_charging|fast_charging|ac_charging|dc_charging)$/,
  ],
  [
    'complete',
    /^(complete|completed|charged|fully_charged|finished_fully_charged|target_reached|chargingended|done|charge_ended|charging_finished|charge_complete|conserving|conservation|charge_purpose_reached_and_(not_)?conservation(_charging)?|chargepurposereachedand(not)?conservation(charging)?)$/,
  ],
  [
    'stopped',
    /^(stopped|charging_stopped|chargingpaused|charging_paused|ready|ready_for_charging|readyforcharging|plugged_in|charging_interrupted|no_power|discharging|v2g_discharging|v2x_discharging|v2l_connected|paused|finished_not_full)$/,
  ],
  ['idle', /^(idle|not_charging|not_in_charge|nocharging|no_charging|off)$/],
  [
    'waiting',
    /^(starting|initialization|connecting|scheduled|scheduled_charging|waiting|waiting_for_charging|waiting_for_a_planned_charge|waiting_for_current_charge|v2g_charging_waiting|energy_flap_opened|smart_charging_paused)$/,
  ],
  ['unplugged', /^(disconnected|unplugged|connect_cable|not_connected)$/],
  [
    'error',
    /^(error|fault|charge_error|chargingerror|charging_error|fault_charging|unrecognized_connection|plug_error)$/,
  ],
];

/** A word as the tables read it: lower case, anything between its letters an underscore ("Charging (AC)" → `charging_ac`). */
export const wordOf = (state: string | undefined): string =>
  (state ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** What a plug state's words say of the cable (Renault's, Volvo's, Polestar's, We Connect ID's): in, out, or not said. */
export function pluggedWord(state: string | undefined): boolean | null {
  const word = wordOf(state);
  if (/^(plugged|connected|plugged_waiting_for_charge|on)$/.test(word)) return true;
  if (/^(unplugged|disconnected|off)$/.test(word)) return false;
  return null;
}

/** What a charging sensor's state means; null for a word it does not know (the card then reads its other roles). */
export function chargeWord(state: string | undefined): Charge | null {
  const word = wordOf(state);
  if (!word) return null;
  for (const [charge, words] of CHARGES) if (words.test(word)) return charge;
  return null;
}

/** What a car says of its charge, each null where it cannot be read and undefined where it has no such entity. */
export interface ChargeSources {
  /** A charging state sensor's word, or a charging binary sensor's (`on` / `off`). */
  readonly state?: { readonly word: string; readonly binary: boolean } | null | undefined;
  /** Whether its cable is in (a plug binary sensor). */
  readonly plugged?: boolean | null | undefined;
  /** What it draws now, in W. */
  readonly watts?: number | null | undefined;
  readonly level?: number | null | undefined;
  readonly limit?: number | null | undefined;
}

/** Under this much a car draws nothing worth calling a charge (a charger's standby, a sensor's rounding). */
const CHARGING_FROM = 50;

/**
 * Where the car's charge is, from what it says: its charging state's word (a binary sensor's `on` charges), else its
 * power while its cable is in, else its cable alone; a car plugged in at its limit is complete. Null where it says
 * nothing at all.
 */
export function chargeOf(sources: ChargeSources): Charge | null {
  const { state, plugged, watts, level, limit } = sources;
  const atLimit = typeof level === 'number' && typeof limit === 'number' && level >= limit;
  let charge: Charge | null = null;
  if (state)
    charge = state.binary ? (state.word === 'on' ? 'charging' : null) : chargeWord(state.word);
  if (charge === null && typeof watts === 'number' && watts >= CHARGING_FROM && plugged !== false)
    charge = 'charging';
  if ((charge === null || charge === 'idle') && typeof plugged === 'boolean')
    charge = plugged ? (atLimit ? 'complete' : 'stopped') : 'unplugged';
  // a charge that says it stopped with the car at its limit stopped because it is full
  if (charge === 'stopped' && atLimit) return 'complete';
  // a state that knows nothing of the cable is told by the cable
  if (plugged === false && charge !== null && charge !== 'error') return 'unplugged';
  return charge;
}

/** Whether a charge has the cable in: charging, done, stopped, waiting or failed (idle says nothing of it). */
export const plugged = (charge: Charge | null): boolean =>
  charge !== null && charge !== 'unplugged' && charge !== 'idle';

/* ---------- what the car does ---------- */

/** What the car does: drives, sleeps, is parked, or cannot be reached at all. */
export type Activity = 'driving' | 'asleep' | 'parked' | 'offline';

/** A vehicle state's words that say it sleeps, or that the car cannot be reached. */
const ASLEEP = /^(asleep|sleep|sleeping|suspended|likely_asleep|power_saving_mode|deep_sleep)$/;
const OFFLINE = /^(offline|unavailable|unreachable|no_internet|not_connected)$/;
const DRIVING = /^(driving|moving|car_in_use|in_motion)$/;
/** A gear other than park: drive, reverse, neutral. */
const GEAR = /^(d|r|n|b|drive|reverse|neutral)$/;

/** What the car says of itself, each null where it cannot be read and undefined where it has no such entity. */
export interface ActivitySources {
  /** Its vehicle state's word (Tesla's online, asleep or offline; a "car is on" binary sensor's on/off). */
  readonly state?: string | null | undefined;
  /** Its gear: P, R, N or D. */
  readonly shift?: string | null | undefined;
  /** Its speed now, in its unit. */
  readonly speed?: number | null | undefined;
  /** A driving binary sensor (moving, ignition, engine on). */
  readonly moving?: boolean | null | undefined;
  /** Whether everything it says is out of reach (its battery, its state and its lock alike). */
  readonly reachless: boolean;
}

/**
 * What the car does: out of reach where nothing of it can be read or its state says so; driving in a gear other than
 * park, at a speed, or by its driving sensor; asleep where its state says so; parked otherwise.
 */
export function activityOf(sources: ActivitySources): Activity {
  const state = wordOf(sources.state ?? '');
  if (sources.reachless || OFFLINE.test(state)) return 'offline';
  const shift = wordOf(sources.shift ?? '');
  if (
    GEAR.test(shift) ||
    (typeof sources.speed === 'number' && sources.speed > 0) ||
    sources.moving === true ||
    DRIVING.test(state)
  )
    return 'driving';
  if (ASLEEP.test(state)) return 'asleep';
  return 'parked';
}

/* ---------- the battery's line ---------- */

/** Below this charge, with no `low_range` of its own, a car's range is low (the house's low battery). */
export const LOW_CHARGE = 20;

/** Whether the range is low: under the card's `low_range` in the range's unit, else the charge at 20 % or less. */
export function lowRange(
  range: number | null,
  level: number | null,
  threshold: number | undefined,
): boolean {
  if (typeof threshold === 'number' && Number.isFinite(threshold))
    return range !== null && range <= threshold;
  return level !== null && level <= LOW_CHARGE;
}

/** Whether the cabin is cold or hot enough to say so (while the climate is off), by the house's unit. */
export type Cabin = 'cold' | 'hot' | null;

/** Cold at 5 °C and under (41 °F), hot at 35 °C and over (95 °F): weather to warm it, or cool it, before a drive. */
const CABIN = { c: [5, 35], f: [41, 95] } as const;

export function cabinOf(inside: number | null, unit: string): Cabin {
  if (inside === null) return null;
  const [cold, hot] = CABIN[/F$/.test(unit) ? 'f' : 'c'];
  return inside <= cold ? 'cold' : inside >= hot ? 'hot' : null;
}

/** What of the car can stand open: its windows, its doors, its boot, its front boot. */
export type Opening = 'windows' | 'doors' | 'trunk' | 'frunk';

/**
 * What the line under the battery says, the most pressing first: why charging failed; while it charges, when it is
 * done; a range that is low; something left open; done at its limit; plugged in and waiting (for its time, or for
 * nothing); a cabin too cold or too hot to get into; else where its limit stands, or that it is unplugged.
 */
export type LineKind =
  | 'error'
  | 'charging'
  | 'low'
  | 'open'
  | 'complete'
  | 'waiting'
  | 'stopped'
  | 'cabin'
  | 'unplugged'
  | 'none';

export function lineOf(o: {
  readonly charge: Charge | null;
  readonly low: boolean;
  readonly open: Opening | null;
  readonly cabin: Cabin;
}): LineKind {
  if (o.charge === 'error') return 'error';
  if (o.charge === 'charging') return 'charging';
  if (o.low) return 'low';
  if (o.open) return 'open';
  if (o.charge === 'complete') return 'complete';
  if (o.charge === 'waiting') return 'waiting';
  if (o.charge === 'stopped') return 'stopped';
  if (o.cabin) return 'cabin';
  return o.charge === 'unplugged' ? 'unplugged' : 'none';
}

/* ---------- units ---------- */

/** A distance's metres, by its unit; null for a unit that is not a distance. */
const METRES: Readonly<Record<string, number>> = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048 };

/** A distance in another unit (km ↔ mi); the same where either unit is not one the card converts. */
export function convertDistance(value: number, from: string, to: string): number {
  const a = METRES[from.trim()];
  const b = METRES[to.trim()];
  return a && b ? (value * a) / b : value;
}
