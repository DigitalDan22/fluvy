import { isEntityId } from '@fluvy/core';
import { DEFAULT_THRESHOLD } from '../energy-model/sources.js';

/**
 * The arithmetic of the car charger card, kept apart from the drawing so every rule of it is tested: which way the
 * charger's power goes, what the target and the time it is due by say, whether a status says the car is charging.
 * Nothing is guessed: a figure that cannot be read is `null`, and what is not configured is `undefined`.
 */

/** `charging` the car, `feeding` the house from it (V2H), or `idle` below the threshold. */
export type CarWay = 'charging' | 'feeding' | 'idle';

export interface CarFlow {
  readonly way: CarWay;
  /** The power, always positive, in W. */
  readonly watts: number;
}

/** The charger's power as the card reads it: + charges the car (`invert` for a meter signed the other way). */
export function carFlow(
  watts: number | null,
  invert = false,
  threshold = DEFAULT_THRESHOLD,
): CarFlow | null {
  if (watts === null || !Number.isFinite(watts)) return null;
  const signed = invert ? -watts : watts;
  const way: CarWay = signed >= threshold ? 'charging' : signed <= -threshold ? 'feeding' : 'idle';
  return { way, watts: Math.abs(signed) };
}

/** A target as the config writes it: a percentage (a number, or a number in text) or an entity that holds one. */
export type Target = { readonly percent: number } | { readonly entity: string };

export function targetOf(raw: unknown): Target | undefined {
  if (typeof raw === 'number')
    return Number.isFinite(raw) ? { percent: clampPercent(raw) } : undefined;
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim().replace(/\s*%$/, '');
  if (text === '') return undefined;
  if (/^\d+([.,]\d+)?$/.test(text))
    return { percent: clampPercent(Number(text.replace(',', '.'))) };
  return isEntityId(text) ? { entity: text } : undefined;
}

export const clampPercent = (v: number): number => Math.min(100, Math.max(0, v));

/** A time of day written "07:00", "7:30" or "07:00:00" (an `input_datetime`, a `time` entity). */
export function clockOf(text: string): { readonly hours: number; readonly minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? { hours, minutes } : null;
}

/** When the car is due: a time of day, a moment (a timestamp sensor), or nothing readable. */
export type Due =
  | { readonly kind: 'clock'; readonly hours: number; readonly minutes: number }
  | { readonly kind: 'moment'; readonly at: Date };

export function dueOf(text: string): Due | null {
  const clock = clockOf(text);
  if (clock) return { kind: 'clock', ...clock };
  // a timestamp: an ISO date with its time (a bare number or a word is not one)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text.trim())) return null;
  const at = new Date(text.trim());
  return Number.isFinite(at.getTime()) ? { kind: 'moment', at } : null;
}

/** `ready_by` as the config writes it: a time, or the entity that holds one. */
export function readyByOf(
  raw: unknown,
): { readonly due: Due } | { readonly entity: string } | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const due = dueOf(raw);
  if (due) return { due };
  return isEntityId(raw.trim()) ? { entity: raw.trim() } : undefined;
}

const NOT_CHARGING = new Set([
  'not',
  'no',
  'discharging',
  'complete',
  'completed',
  'finished',
  'done',
  'stopped',
  'paused',
  'waiting',
]);

/**
 * Whether a status says the car is charging: a `battery_charging` binary sensor that is on, or a state that says
 * "charging" and nothing against it ("not_charging", "charging_completed" do not).
 */
export function statusCharging(domain: string, state: string, deviceClass: string): boolean {
  if (domain === 'binary_sensor') return state === 'on' && deviceClass === 'battery_charging';
  const words = state
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return words.includes('charging') && !words.some((w) => NOT_CHARGING.has(w));
}
