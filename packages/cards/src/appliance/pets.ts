import { wallClock, type EntityView, type HassEntity, type HomeAssistant } from '@fluvy/core';
import type { ApplianceKind } from './kinds.js';
import type { ApplianceRoles } from './roles.js';

/*
 * A pet device as the cards read it beyond its roles (#112): a feeder's meals, a litter box's last use, a fountain's
 * last drink. PetLibro says a feeder's last and next meal as sensors of their own, their amounts beside them; PetKit
 * says them only in its plan, the rows its "Feeding schedule" switch carries in its attributes (switch.py: hour,
 * minute, values, status, today, weekdays; the amount's unit in its capabilities) — PetLibro's plan has the same rows
 * (binary_sensor.py: time, amount_g, state, today, repeat_days). The plan's times are the house's, as the device keeps
 * them. A litter box's last use is when its count of uses last rose, by the pet its integration names; a fountain's
 * last drink is its own moment, or when its count of drinks last rose.
 */

export const PET_KINDS: readonly ApplianceKind[] = ['feeder', 'fountain', 'litter_box'];

/** Whether a kind is a pet device's: its hero is its tiles, its buttons its own. */
export const isPet = (kind: ApplianceKind): boolean => PET_KINDS.includes(kind);

/** A meal: when, and how much (none where it is not said). */
export interface Meal {
  readonly at: number;
  readonly amount: number | null;
}

/** A feeder's meals: the last given, the next to come, and the unit of their amounts. */
export interface Meals {
  readonly last: Meal | null;
  readonly next: Meal | null;
  /** The amounts' unit ("g", "mL"), or none where the feeder counts portions. */
  readonly unit: string;
}

/** A use of a litter box or a drink at a fountain: when, and by which pet where the integration says. */
export interface Visit {
  readonly at: number;
  readonly pet: string;
}

export interface PetReading {
  readonly meals: Meals;
  readonly visit: Visit | null;
}

/** A row of a feeder's plan, as either integration writes it. */
interface PlanRow {
  readonly hour?: unknown;
  readonly minute?: unknown;
  readonly time?: unknown;
  readonly values?: unknown;
  readonly amount_g?: unknown;
  readonly amount_raw?: unknown;
  readonly status?: unknown;
  readonly state?: unknown;
  readonly enabled?: unknown;
  readonly today?: unknown;
  readonly weekdays?: unknown;
  readonly repeat_days?: unknown;
}

/** A plan row's time of day, in minutes: PetKit's hour and minute, PetLibro's "07:30". */
function minutesOf(row: PlanRow): number | null {
  if (typeof row.hour === 'number' && typeof row.minute === 'number')
    return row.hour * 60 + row.minute;
  const clock = typeof row.time === 'string' ? /^(\d{1,2}):(\d{2})/.exec(row.time) : null;
  return clock ? Number(clock[1]) * 60 + Number(clock[2]) : null;
}

/** A plan row's amount: PetKit's hoppers' values summed, PetLibro's grams, else its portions. */
function amountOf(row: PlanRow): number | null {
  if (Array.isArray(row.values)) {
    const values = row.values.filter((value): value is number => typeof value === 'number');
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  const amount = typeof row.amount_g === 'number' ? row.amount_g : row.amount_raw;
  return typeof amount === 'number' ? amount : null;
}

/** The ISO weekdays a row repeats on (PetKit's `weekdays`, PetLibro's `repeat_days`); none: every day. */
function weekdaysOf(row: PlanRow): number[] | null {
  const days = Array.isArray(row.weekdays) ? row.weekdays : row.repeat_days;
  return Array.isArray(days) && days.length ? days.map(Number) : null;
}

/** A plan's rows, from its entity's attributes. */
function rowsOf(state: HassEntity | undefined): PlanRow[] {
  const rows = state?.attributes['schedule'];
  return Array.isArray(rows)
    ? rows.filter((row): row is PlanRow => typeof row === 'object' && row !== null)
    : [];
}

/**
 * A feeder's last and next meal from its plan, at `now` in the house's time zone: the last of today's rows given, the
 * first of today's still to come (a row due a minute ago is on its way), else the first of tomorrow's. A plan that is
 * off has no next meal.
 */
export function planMeals(
  hass: Pick<HomeAssistant, 'config'> | undefined,
  state: HassEntity | undefined,
  now: number,
): Omit<Meals, 'unit'> {
  if (!state || state.state === 'unavailable') return { last: null, next: null };
  const wall = wallClock(new Date(now), hass?.config?.time_zone);
  const minute = wall.hour * 60 + wall.minute;
  // a moment of today's (or tomorrow's) at a time of day, in the house's clock
  const at = (minutes: number, days = 0): number =>
    now + ((minutes - minute) * 60 + days * 86_400 - wall.second) * 1000;
  const rows = rowsOf(state).filter((row) => row.enabled !== false);
  const word = (row: PlanRow): string => String(row.status ?? row.state ?? '');
  const today = rows.filter((row) => row.today !== false);
  const timed = (list: PlanRow[]) =>
    list
      .map((row) => ({ row, minutes: minutesOf(row) }))
      .filter((item): item is { row: PlanRow; minutes: number } => item.minutes !== null)
      .sort((a, b) => a.minutes - b.minutes);
  const given = timed(today).filter(
    (item) => word(item.row) === 'dispensed' && item.minutes <= minute,
  );
  const last = given.at(-1);
  const on = state.state !== 'off';
  const coming = on
    ? timed(today).find(
        (item) =>
          (word(item.row) === 'pending' || word(item.row) === 'dispensing') &&
          item.minutes >= minute - 1,
      )
    : undefined;
  // tomorrow's first: an ISO weekday is Monday's 1 to Sunday's 7
  const weekday =
    ((new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay() + 6) % 7) + 1;
  const tomorrow = (weekday % 7) + 1;
  const first =
    on && !coming
      ? timed(rows).find((item) => weekdaysOf(item.row)?.includes(tomorrow) ?? true)
      : undefined;
  return {
    last: last ? { at: at(last.minutes), amount: amountOf(last.row) } : null,
    next: coming
      ? { at: at(coming.minutes), amount: amountOf(coming.row) }
      : first
        ? { at: at(first.minutes, 1), amount: amountOf(first.row) }
        : null,
  };
}

/** A timestamp sensor's moment (ms). */
const moment = (v: EntityView | undefined): number | null => {
  if (!v || v.status !== 'ok') return null;
  const at = Date.parse(v.state);
  return Number.isFinite(at) ? at : null;
};

/** A reading's figure, where it says one. */
const figure = (v: EntityView | undefined): number | null =>
  v && v.status === 'ok' ? v.number : null;

/** When a count last rose (its last change, while it counts any today). */
const risen = (v: EntityView | undefined): number | null => {
  if (!v || v.status !== 'ok' || !v.number || v.number <= 0) return null;
  const at = Date.parse(v.stateObj?.last_changed ?? '');
  return Number.isFinite(at) ? at : null;
};

/**
 * A pet device's reading at a moment: a feeder's meals (its sensors', else its plan's), a litter box's last use or a
 * fountain's last drink (and by whom).
 */
export function petReading(
  hass: HomeAssistant | undefined,
  roles: ApplianceRoles,
  view: (id: string | undefined) => EntityView | undefined,
  now: number,
): PetReading {
  const plan = roles.schedule ? hass?.states?.[roles.schedule] : undefined;
  const planned = planMeals(hass, plan, now);
  const meal = (time: string | undefined, amount: string | undefined): Meal | null => {
    const at = moment(view(time));
    return at === null ? null : { at, amount: figure(view(amount)) };
  };
  const last = meal(roles.last_feed, roles.last_amount) ?? planned.last;
  const next = meal(roles.next_feed, roles.next_amount);
  const capabilities = plan?.attributes['capabilities'] as
    { readonly amount?: { readonly unit?: unknown } } | undefined;
  const planUnit = capabilities?.amount?.unit;
  const unit =
    view(roles.next_amount ?? roles.last_amount)?.unit ||
    (planUnit === 'g' || (!planUnit && plan) ? 'g' : '');
  const at =
    moment(view(roles.last_drink)) ??
    risen(view(roles.uses_today)) ??
    risen(view(roles.drinks_today));
  const pet = view(roles.last_pet);
  const name = pet?.status === 'ok' && !/^unknown$/i.test(pet.state) ? pet.state : '';
  return {
    meals: { last, next: next && next.at > now ? next : planned.next, unit },
    visit: at !== null ? { at, pet: name } : null,
  };
}
