import {
  dateFormat,
  houseZone,
  languageOf,
  localize,
  relativeTime,
  speaks,
  type HomeAssistant,
} from '@fluvy/core';
import { withUnit } from '../shared/duration.js';

/**
 * The value of a date/time helper. `input_datetime`, `date` and `time` hold wall-clock values with no
 * zone ("06:45:00", "2026-10-03"): they are kept as UTC fields and formatted in UTC, so neither the
 * browser's zone nor the server's can move them by a day or an hour. A `datetime` entity is an instant.
 */
export interface Moment {
  readonly date: Date;
  readonly hasDate: boolean;
  readonly hasTime: boolean;
  readonly wall: boolean;
}

const TIME = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/;

/** Parses a helper's state, or a bare value such as a to-do item's `due`. */
export function parseMomentText(text: string): Moment | null {
  const time = TIME.exec(text);
  if (time)
    return {
      date: new Date(Date.UTC(1970, 0, 1, Number(time[1]), Number(time[2]))),
      hasDate: false,
      hasTime: true,
      wall: true,
    };
  const date = DATE.exec(text);
  if (date) {
    const hasTime = date[4] !== undefined;
    return {
      date: new Date(
        Date.UTC(
          Number(date[1]),
          Number(date[2]) - 1,
          Number(date[3]),
          Number(date[4] ?? 0),
          Number(date[5] ?? 0),
        ),
      ),
      hasDate: true,
      hasTime,
      wall: true,
    };
  }
  const instant = new Date(text); // ISO with an offset
  return Number.isNaN(instant.getTime())
    ? null
    : { date: instant, hasDate: true, hasTime: true, wall: false };
}

const zoneOf = (hass: HomeAssistant | undefined, moment: Moment): string | undefined =>
  moment.wall ? 'UTC' : hass?.locale?.time_zone === 'server' ? hass.config?.time_zone : undefined;

const language = (hass: HomeAssistant | undefined): string => hass?.language ?? 'en';

function format(
  hass: HomeAssistant | undefined,
  moment: Moment,
  options: Intl.DateTimeFormatOptions,
): string {
  const zone = zoneOf(hass, moment);
  return dateFormat(language(hass), { ...options, ...(zone ? { timeZone: zone } : {}) }).format(
    moment.date,
  );
}

/** "06:45" — 12 or 24 hours as the user's profile says. */
export function timeText(hass: HomeAssistant | undefined, moment: Moment): string {
  const clock = hass?.locale?.time_format;
  return format(hass, moment, {
    hour: '2-digit',
    minute: '2-digit',
    ...(clock === '12' ? { hour12: true } : clock === '24' ? { hour12: false } : {}),
  });
}

/**
 * A day in the order of the user's profile (Home Assistant's `date_format`: DMY, MDY, YMD), else the language's own,
 * with the year once it is not this one: the month named ("3 Oct", "3 Oct 2027") or as a figure ("3/10", "3/10/27" —
 * the parts bare of what a language hangs on them, "10." or "10日", joined by a slash).
 */
function dayIn(
  hass: HomeAssistant | undefined,
  moment: Moment,
  month: 'short' | 'numeric',
  now = new Date(),
): string {
  const figures = month === 'numeric';
  const year = moment.wall ? moment.date.getUTCFullYear() : moment.date.getFullYear();
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month,
    ...(year === now.getFullYear() ? {} : { year: figures ? '2-digit' : 'numeric' }),
  };
  const order = hass?.locale?.date_format;
  if (order !== 'DMY' && order !== 'MDY' && order !== 'YMD') {
    const own = format(hass, moment, options);
    return figures ? own.replace(/\s+/g, '') : own;
  }
  const part = (type: 'day' | 'month' | 'year'): string =>
    format(hass, moment, { [type]: options[type] }).replace(figures ? /\D+$/ : /\.$/, '');
  const pieces = order === 'DMY' ? [part('day'), part('month')] : [part('month'), part('day')];
  if (options.year) pieces[order === 'YMD' ? 'unshift' : 'push'](part('year'));
  return pieces.join(figures ? '/' : ' ');
}

/** "3 Oct" — day and month in the order of the user's profile, with the year once it is not this one. */
export function dayText(hass: HomeAssistant | undefined, moment: Moment, now?: Date): string {
  return dayIn(hass, moment, 'short', now);
}

/**
 * "3/10" — the same day as figures, the year in two ("3/10/27"): what a row's pill shows where the month's name
 * would not hold in it ("10 de nov." at a third of a section).
 */
export function dayTextShort(hass: HomeAssistant | undefined, moment: Moment, now?: Date): string {
  return dayIn(hass, moment, 'numeric', now);
}

/**
 * The date line of a greeting: "Thursday 17 September" / "Thu 17 Sep" in the order the profile asks
 * for (Home Assistant's `date_format`: DMY, MDY, YMD), else the language's own; the year never, it is today.
 */
export function dateLine(
  hass: HomeAssistant | undefined,
  date: Date,
  style: 'full' | 'short',
): string {
  const lang = language(hass);
  const zone = houseZone(hass);
  const part = (options: Intl.DateTimeFormatOptions): string =>
    dateFormat(lang, { ...options, ...(zone ? { timeZone: zone } : {}) }).format(date);
  const long = style === 'full';
  const order = hass?.locale?.date_format;
  if (order !== 'DMY' && order !== 'MDY' && order !== 'YMD')
    return part({
      weekday: long ? 'long' : 'short',
      day: 'numeric',
      month: long ? 'long' : 'short',
    });
  const weekday = part({ weekday: long ? 'long' : 'short' }).replace(/\.$/, '');
  const day = part({ day: 'numeric' });
  const month = part({ month: long ? 'long' : 'short' }).replace(/\.$/, '');
  return order === 'DMY' ? `${weekday} ${day} ${month}` : `${weekday}, ${month} ${day}`;
}

/** Whole calendar days from today to the value's day. */
export function daysUntil(moment: Moment, now: Date = new Date()): number {
  const day = moment.wall
    ? Date.UTC(moment.date.getUTCFullYear(), moment.date.getUTCMonth(), moment.date.getUTCDate())
    : Date.UTC(moment.date.getFullYear(), moment.date.getMonth(), moment.date.getDate());
  return Math.round(
    (day - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000,
  );
}

/** A sub line starts as a sentence: "in 16 days" → "In 16 days". */
export const sentenceCase = (text: string): string =>
  text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** "In 16 days", "Tomorrow", "3 days ago" — whole words: a sub line has the room. */
export function relativeDays(hass: HomeAssistant | undefined, days: number): string {
  return sentenceCase(
    new Intl.RelativeTimeFormat(language(hass), { numeric: 'auto', style: 'long' }).format(
      days,
      'day',
    ),
  );
}

/** "3 days ago", "2 hours ago", "now" for a moment in the past (when something last ran or changed). */
export function relativeAgo(
  hass: HomeAssistant | undefined,
  from: Date,
  now: Date = new Date(),
): string {
  const seconds = Math.max(0, (now.getTime() - from.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(language(hass), { numeric: 'auto', style: 'long' });
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return rtf.format(0, 'second');
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(seconds / 3600);
  if (hours < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(seconds / 86_400), 'day');
}

/**
 * The sheets' short form for a row sub or a tile line — "4 min ago", "2 h ago", "yesterday", "3 days ago",
 * "just now" — in the two languages fluvy ships; elsewhere the platform's short form. (`Intl`'s narrow
 * English is "4m ago", which reads as metres.)
 */
/** Kept for the cards that already call it: the wording lives in `@fluvy/core` so every card says it the same way. */
export function agoShort(
  hass: HomeAssistant | undefined,
  from: Date,
  now: Date = new Date(),
): string {
  return relativeTime(hass, from, now);
}

/** How long something has been going on — "14 min", "2 h", "3 d" — the sheets' unit forms, else the platform's. */
export function durationShort(
  hass: HomeAssistant | undefined,
  from: Date,
  now: Date = new Date(),
): string {
  const minutes = Math.max(1, Math.round((now.getTime() - from.getTime()) / 60_000));
  const [value, unit] =
    minutes < 60
      ? [minutes, 'minute']
      : minutes < 1440
        ? [Math.round(minutes / 60), 'hour']
        : [Math.round(minutes / 1440), 'day'];
  if (speaks(languageOf(hass)))
    return withUnit(
      value,
      localize(
        hass,
        unit === 'minute' ? 'time.unit_min' : unit === 'hour' ? 'time.unit_h' : 'time.unit_d',
      ),
    );
  try {
    return new Intl.NumberFormat(language(hass), {
      style: 'unit',
      unit,
      unitDisplay: 'short',
    }).format(value);
  } catch {
    return `${value} ${unit === 'minute' ? 'min' : unit === 'hour' ? 'h' : 'd'}`;
  }
}

/** "HH:MM" as a preset is written → the helper's own "HH:MM:00", or null when it is not a time. */
export function presetTime(raw: string): string | null {
  const match = TIME.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}
