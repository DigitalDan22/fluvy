import { localize, type HomeAssistant } from '@fluvy/core';
import { addGlyphs, type Tone } from '@fluvy/ui';
import { statusToneOf, toneOf, type Coloured } from '../shared/colour.js';
import { durationText, spanText } from '../shared/duration.js';
import { jobWords, when, whenText, type JobClock } from '../shared/job-time.js';
import { APPLIANCE_GLYPHS } from './glyphs.js';
import { KIND_DEFAULTS, type ApplianceKind } from './kinds.js';
import type { ApplianceReading, Attention } from './reading.js';
import { busy, type ApplianceStatus } from './status.js';

/*
 * What both appliance cards say of an appliance, worded once: the unit a card shows (an appliance's, or its second
 * drum's or cavity's in its place), the tone its status draws in, how long things take and how long ago they were,
 * the line that says when ("Ready at 14:32", "Starts at 02:00", "Finished yesterday"), what asks for attention and
 * what a pet device at rest says of itself ("Next meal in 2 h 15 min", "Last used 14:32 · Luna").
 * The appliances' glyphs join the set here, as the family's chunk lands.
 */
addGlyphs(APPLIANCE_GLYPHS);

const s = (
  hass: HomeAssistant | undefined,
  key: Parameters<typeof localize>[1],
  values?: Parameters<typeof localize>[2],
): string => localize(hass, key, values);

/** Which of an appliance's units a card shows: its own, its second drum or cavity, or both (the second as a line). */
export type ApplianceUnit = 'main' | 'sub' | 'both';
export const APPLIANCE_UNITS: readonly ApplianceUnit[] = ['both', 'main', 'sub'];

/** The unit a card is about: what it is doing, in which words, and its times. */
export interface Shown {
  readonly status: ApplianceStatus;
  /** What it is doing, as the card says it: Home Assistant's word for its state, else the card's. */
  readonly word: string;
  /** The step it is at, in Home Assistant's words ('' where its word says it). */
  readonly phase: string;
  readonly clock: JobClock;
  readonly finishedAt: number | null;
}

/** The unit a card shows: the appliance's, or its twin's where the card asks for the second (`unit: sub`). */
export function shownOf(
  hass: HomeAssistant | undefined,
  r: ApplianceReading,
  unit: ApplianceUnit,
): Shown {
  const twin = unit === 'sub' ? r.twin : undefined;
  if (twin)
    return {
      status: twin.status,
      word: twin.word || s(hass, `appliance.status_${twin.status}`),
      phase: twin.phase,
      clock: twin.clock,
      finishedAt: twin.finishedAt,
    };
  return {
    status: r.status,
    word: r.word || s(hass, r.statusWord),
    phase: r.phase,
    clock: r.clock,
    finishedAt: r.finishedAt,
  };
}

/** A kind's glyph: one of the appliances' own, Fluvy's fan for a hood, its plug for an appliance on one. */
export const kindGlyph = (kind: ApplianceKind): string => KIND_DEFAULTS[kind].glyph;

/**
 * The tone a status draws in: the kind's while it works or is done (the card's colour stands in for the accent), the
 * warning while it waits, needs a hand or failed — whatever colour the card was given — the dashed skin out of reach,
 * the neutral at rest.
 */
export function statusTone(status: ApplianceStatus, config: Coloured, kind: ApplianceKind): Tone {
  switch (status) {
    case 'offline':
      return 'off';
    case 'off':
    case 'idle':
      return 'neutral';
    case 'paused':
    case 'attention':
    case 'error':
      return statusToneOf(config, 'warning');
    default:
      return toneOf(config, KIND_DEFAULTS[kind].tone);
  }
}

export { durationText, spanText };

/** What is said with how long it has lasted: a door left open, a load waiting to be taken out. */
const LASTING: ReadonlySet<string> = new Set(['appliance.door_open', 'appliance.unload']);

/** What asks for attention, in words: the integration's own where it has them, how long a door or a load has waited. */
export function attentionText(
  hass: HomeAssistant | undefined,
  item: Attention,
  now: number,
): string {
  const said = item.text || s(hass, item.key);
  return LASTING.has(item.key) && item.since !== undefined && now - item.since >= 60_000
    ? `${said} · ${spanText(hass, (now - item.since) / 1000)}`
    : said;
}

/**
 * What asks for attention, other than a reminder, in one shorter word: "Empty" for a load, "Error" for a failure,
 * "Check" for a call for a hand; none for anything else.
 */
export function needWord(hass: HomeAssistant | undefined, item: Attention): string | undefined {
  switch (item.key) {
    case 'appliance.unload':
    case 'appliance.anti_crease':
      return s(hass, 'appliance.do_empty');
    case 'appliance.failure':
    case 'appliance.aborted':
      return s(hass, 'appliance.status_error');
    case 'appliance.status_attention':
      return s(hass, 'appliance.do_check');
    default:
      return undefined;
  }
}

/** How the times are said: both the time left and when it is ready, the time left alone, or when alone (`time`). */
export type TimeShown = 'both' | 'left' | 'end';
export const TIMES_SHOWN: readonly TimeShown[] = ['both', 'left', 'end'];

/**
 * The line's parts that say when, most important first: when it will be ready (and how long it has run) while it
 * works; when it starts, and when it will be ready, while it waits to; when it finished (and how long it took).
 */
export function whenParts(
  hass: HomeAssistant | undefined,
  shown: Shown,
  startAt: number | null,
  now: number,
  time: TimeShown = 'both',
  elapsed = true,
): string[] {
  const { clock } = shown;
  if (busy(shown.status))
    return [
      time === 'both' && clock.at !== null ? whenText(hass, 'ready', clock.at, now) : '',
      elapsed && clock.elapsed !== null
        ? jobWords(hass, 'elapsed_text', { time: spanText(hass, clock.elapsed) })
        : '',
    ].filter(Boolean);
  if (shown.status === 'scheduled')
    return [startAt !== null ? whenText(hass, 'start', startAt, now) : ''].filter(Boolean);
  if (shown.status === 'finished')
    return [
      shown.finishedAt !== null ? whenText(hass, 'done', shown.finishedAt, now) : '',
      clock.total !== null
        ? jobWords(hass, 'total_text', { time: spanText(hass, clock.total) })
        : '',
    ].filter(Boolean);
  return [];
}

/**
 * A moment as a readout says it: its time today, "Fri 05:27" another day this week or next, "yesterday" for a
 * finish before today — by the house's calendar.
 */
export function momentText(hass: HomeAssistant | undefined, at: number, now: number): string {
  const { time, days, day, ago } = when(hass, at, now);
  if (days === 0) return time;
  return days < 0 && ago ? ago : `${day} ${time}`;
}

/**
 * What a pet device at rest says of itself, most telling first: a feeder its next meal ("Next meal in 2 h 15 min"),
 * else its last; a litter box its last use and by whom ("Last used 14:32", "Luna"), a fountain its last drink.
 */
export function petWords(
  hass: HomeAssistant | undefined,
  r: ApplianceReading,
  now: number,
): string[] {
  if (!r.pet) return [];
  const { next, last } = r.pet.meals;
  if (r.kind === 'feeder')
    return next
      ? [s(hass, 'appliance.next_meal_in', { time: spanText(hass, (next.at - now) / 1000) })]
      : last
        ? [`${s(hass, 'appliance.row_last_meal')} ${momentText(hass, last.at, now)}`]
        : [];
  const visit = r.pet.visit;
  if (!visit) return [];
  const label = s(
    hass,
    r.kind === 'fountain' ? 'appliance.row_last_drink' : 'appliance.row_last_use',
  );
  return [`${label} ${momentText(hass, visit.at, now)}`, visit.pet].filter(Boolean);
}

/** "1 h 12 min left", for a line. */
export const leftText = (hass: HomeAssistant | undefined, seconds: number): string =>
  jobWords(hass, 'left_text', { time: spanText(hass, seconds) });
