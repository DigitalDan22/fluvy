import { FluvyCalendarCard } from '../../../../packages/cards/src/calendar/calendar-card.js';
import type { LovelaceCardConfig } from '@fluvy/core';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-calendar-card'))
  customElements.define('fluvy-calendar-card', FluvyCalendarCard);

/**
 * The calendar sheet (`apps/design-lab/calendar.js`) on real cards. Its one table of events — DAYS,
 * September 2026 — is served the way Home Assistant serves it (`GET calendars/<entity>?start=…&end=…`,
 * filtered by the window that was asked for), one calendar per tone of the sheet. "Now" is frozen at
 * Thursday 17 September 2026, 21:47 through the card's `_now` hook, so every frame can be held against
 * `apps/design-lab/out/calendar/calendar-linen-900.png`.
 */
const NOW = '2026-09-17T21:47:12';

/** The sheet's tones, as the calendars that carry them (in the card's default tone order: cool, heat, water, media, grid). */
const SHEET = [
  'calendar.chores',
  'calendar.family',
  'calendar.ona',
  'calendar.personal',
  'calendar.services',
] as const;
const CALENDAR_OF = {
  cool: SHEET[0],
  heat: SHEET[1],
  water: SHEET[2],
  media: SHEET[3],
  grid: SHEET[4],
} as const;

/** day of September → [from, to (decimal hours; null = all day), title, place, tone] — DAYS of the sheet, verbatim. */
type SheetEvent = readonly [number | null, number | null, string, string, keyof typeof CALENDAR_OF];
const DAYS: Readonly<Record<number, readonly SheetEvent[]>> = {
  3: [[10, 11, 'Dentist', 'Ona · Clínica Sants', 'water']],
  9: [[19, 20, 'Yoga', 'Online', 'media']],
  12: [[9, 12, 'Market', 'Sant Antoni', 'heat']],
  14: [[9.5, 10, 'Team call', 'Online', 'media']],
  16: [
    [19, 20, 'Yoga', 'Online', 'media'],
    [21, 21.5, 'Bins out', 'Glass', 'cool'],
  ],
  17: [
    [9.5, 10.25, 'Dentist', 'Ona · Clínica Sants', 'water'],
    [13, 14.5, 'Lunch with Pau', 'Casa Lola', 'heat'],
    [18.5, 19.5, 'Yoga', 'Online', 'media'],
    [22, 22.5, 'Bins out', 'Paper & cardboard', 'cool'],
  ],
  18: [
    [8.25, 9, 'School run', 'Ona', 'water'],
    [19, 21, 'Dinner with Marta & Pau', 'Home', 'heat'],
  ],
  19: [[null, null, 'Grandparents visit', 'Lleida', 'heat']],
  21: [[10, 12, 'Boiler service', 'Technician', 'grid']],
  25: [[18.5, 19.5, 'Yoga', 'Online', 'media']],
  28: [[9, 9.5, 'Team call', 'Online', 'media']],
};

interface Seeded {
  readonly calendar: string;
  readonly start: Date;
  readonly end: Date;
  readonly body: Record<string, unknown>;
}

const pad = (value: number): string => String(value).padStart(2, '0');
const dateOnly = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const at = (month: number, day: number, hours: number): Date =>
  new Date(2026, month, day, Math.floor(hours), Math.round((hours % 1) * 60));

let serial = 0;
/** A timed event. `to` may be on a later day (`days` ahead). */
const timed = (
  calendar: string,
  month: number,
  day: number,
  from: number,
  to: number,
  summary: string,
  location = '',
  days = 0,
): Seeded => {
  const start = at(month, day, from);
  const end = at(month, day + days, to);
  return {
    calendar,
    start,
    end,
    body: {
      summary,
      location,
      uid: `pg-${serial++}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  };
};
/** An all-day event of `days` days: the end DATE is exclusive, as Home Assistant sends it. */
const allDay = (
  calendar: string,
  month: number,
  day: number,
  summary: string,
  location = '',
  days = 1,
): Seeded => {
  const start = new Date(2026, month, day);
  const end = new Date(2026, month, day + days);
  return {
    calendar,
    start,
    end,
    body: {
      summary,
      location,
      uid: `pg-${serial++}`,
      start: { date: dateOnly(start) },
      end: { date: dateOnly(end) },
    },
  };
};

const SEPTEMBER = 8;
const EVENTS: readonly Seeded[] = [
  ...Object.entries(DAYS).flatMap(([day, events]) =>
    events.map(([from, to, title, place, tone]) =>
      from === null || to === null
        ? allDay(CALENDAR_OF[tone], SEPTEMBER, Number(day), title, place)
        : timed(CALENDAR_OF[tone], SEPTEMBER, Number(day), from, to, title, place),
    ),
  ),

  /* August 2026 needs six weeks when the week starts on Monday */
  timed('calendar.ona', 7, 5, 10, 11, 'Dentist', 'Ona · Clínica Sants'),
  timed('calendar.family', 7, 14, 19, 21, 'Dinner with Marta & Pau', 'Home'),
  allDay('calendar.family', 7, 22, 'Grandparents visit', 'Lleida'),
  timed('calendar.personal', 7, 31, 9, 9.5, 'Team call', 'Online'),

  /* a working Thursday: nine events */
  timed('calendar.busy', SEPTEMBER, 17, 9, 9.25, 'Standup', 'Online'),
  timed('calendar.busy', SEPTEMBER, 17, 10, 11, 'One to one · Ana', 'Room 3'),
  timed('calendar.busy', SEPTEMBER, 17, 11, 12, 'Design review', 'Room 1'),
  timed('calendar.busy', SEPTEMBER, 17, 12, 12.5, 'Sprint demo', 'Online'),
  timed('calendar.busy', SEPTEMBER, 17, 13, 14, 'Lunch', 'Canteen'),
  timed('calendar.busy', SEPTEMBER, 17, 14, 15, 'Interview', 'Room 2'),
  timed('calendar.busy', SEPTEMBER, 17, 15.5, 16.5, 'Roadmap', 'Room 1'),
  timed('calendar.busy', SEPTEMBER, 17, 17, 17.5, 'Retro', 'Online'),
  timed('calendar.busy', SEPTEMBER, 17, 18.5, 19.5, 'Gym', 'Club Sants'),

  /* a trip: an early start, a reminder without a duration, three all-day days, a night that crosses midnight, no place at all */
  timed('calendar.trips', SEPTEMBER, 17, 6.25, 7, 'Airport run', 'T1'),
  timed('calendar.trips', SEPTEMBER, 18, 7, 7, 'Passports'),
  allDay('calendar.trips', SEPTEMBER, 18, 'Costa Brava', 'Cadaqués', 3),
  timed('calendar.trips', SEPTEMBER, 19, 22.5, 7.25, 'Night train', 'Portbou', 1),

  /* a morning that collides: three at once, then two back to back */
  timed('calendar.clash', SEPTEMBER, 17, 10, 11, 'Call'),
  timed('calendar.clash', SEPTEMBER, 17, 10.5, 11.5, 'Visit'),
  timed('calendar.clash', SEPTEMBER, 17, 10.75, 11.25, 'Bus'),
  timed('calendar.clash', SEPTEMBER, 17, 12, 12.5, 'Prep'),
  timed('calendar.clash', SEPTEMBER, 17, 12.5, 13.25, 'Demo'),
  allDay('calendar.clash', SEPTEMBER, 17, 'Release day', 'Office'),
];

/** Two tiles share a column with a 16 gap: on a multiple of 8 both land on the 4 px grid (300 → 296), as the clocks sheet does. */
const column = Number(new URLSearchParams(location.search).get('width') ?? 360);
const TILES = Math.floor(column / 8) * 8;

const base = (
  view: string,
  extra: Record<string, unknown> = {},
): LovelaceCardConfig & { cols?: number } => ({
  type: 'custom:fluvy-calendar-card',
  entities: [...SHEET],
  view,
  first_weekday: 'monday', // the sheet's household starts its week on Monday; the language alone ('en') would say Sunday
  _now: NOW,
  ...extra,
});

export const sheet: SheetSpec = {
  states: [
    ['calendar.chores', 'off', { friendly_name: 'Chores' }],
    ['calendar.family', 'on', { friendly_name: 'Family' }],
    ['calendar.ona', 'off', { friendly_name: 'Ona' }],
    ['calendar.personal', 'off', { friendly_name: 'Personal' }],
    ['calendar.services', 'off', { friendly_name: 'Services' }],
    ['calendar.busy', 'off', { friendly_name: 'Work' }],
    ['calendar.trips', 'off', { friendly_name: 'Trips' }],
    ['calendar.clash', 'off', { friendly_name: 'Office' }],
    ['calendar.empty', 'off', { friendly_name: 'Holidays' }],
    ['calendar.offline', 'unavailable', { friendly_name: 'Shared' }],
    ['calendar.broken', 'off', { friendly_name: 'Team' }],
    ['calendar.slow', 'off', { friendly_name: 'Slow' }],
  ],
  api: (method, path) => {
    if (method !== 'GET' || !path.startsWith('calendars/')) return undefined;
    const [id = '', query = ''] = path.slice('calendars/'.length).split('?');
    if (id === 'calendar.broken') throw new Error('500 Internal Server Error');
    if (id === 'calendar.slow') return new Promise(() => undefined); // never answers: the skeleton stays
    const params = new URLSearchParams(query);
    const start = new Date(params.get('start') ?? '').getTime();
    const end = new Date(params.get('end') ?? '').getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    return EVENTS.filter(
      (event) =>
        event.calendar === id &&
        event.start.getTime() < end &&
        (event.end.getTime() > start || event.start.getTime() >= start),
    ).map((event) => event.body);
  },
  frames: [
    /* the sheet, card by card, in its order (its eighth frame — month + day in dark — is `?mode=dark`) */
    { title: 'Agenda', cards: [base('agenda')] },
    { title: 'Month', cards: [base('month')] },
    // today while another day is the selected one: the primary fill on the 21st, today in its mark or pastel
    { title: 'Month · another day', cards: [base('month', { _picked: '2026-09-21' })] },
    { title: 'Week', cards: [base('week')] },
    { title: 'Month + day', cards: [base('month-day')] },
    { title: 'Timeline', cards: [base('timeline')] },
    { title: 'Upcoming', cards: [base('upcoming')] },
    {
      title: 'Tiles',
      width: TILES,
      cards: [
        { ...base('tile', { tile: 'date' }), cols: 6 },
        { ...base('tile', { tile: 'next' }), cols: 6 },
      ],
    },

    /* hard states */
    {
      title: 'Unavailable',
      width: TILES,
      cards: [
        base('agenda', { entities: ['calendar.offline'] }),
        { ...base('tile', { entities: ['calendar.offline'] }), cols: 6 },
        { ...base('tile', { tile: 'next', entities: ['calendar.broken'] }), cols: 6 },
      ],
    },
    {
      title: 'Read failed · one of two',
      cards: [
        base('month-day', { entities: ['calendar.broken'] }),
        base('agenda', { entities: ['calendar.family', 'calendar.broken'] }),
      ],
    },
    {
      title: 'Loading',
      width: TILES,
      cards: [
        base('month-day', { entities: ['calendar.slow'] }),
        { ...base('tile', { entities: ['calendar.slow'] }), cols: 6 },
        { ...base('tile', { tile: 'next', entities: ['calendar.slow'] }), cols: 6 },
      ],
    },
    {
      title: 'Empty',
      width: TILES,
      cards: [
        base('month-day', { entities: ['calendar.empty'] }),
        base('agenda', { entities: ['calendar.empty'] }),
        base('timeline', { entities: ['calendar.empty'] }),
        base('upcoming', { entities: ['calendar.empty'] }),
        { ...base('tile', { entities: ['calendar.empty'] }), cols: 6 },
        { ...base('tile', { tile: 'next', entities: ['calendar.empty'] }), cols: 6 },
      ],
    },
    {
      title: 'Nine events',
      cards: [
        base('agenda', { entities: ['calendar.busy'], tones: { 'calendar.busy': 'grid' } }),
        base('agenda', {
          entities: ['calendar.busy'],
          tones: { 'calendar.busy': 'accent' },
          _now: '2026-09-17T13:20:00',
        }),
      ],
    },
    { title: 'Six weeks', cards: [base('month-day', { _now: '2026-08-17T21:47:12' })] },
    // calendars with a name, a tone or a colour of their own (`calendars` wins over the sheet's `entities`)
    {
      title: 'Calendars · named and coloured',
      cards: [
        base('agenda', {
          calendars: [
            { entity: SHEET[0], name: 'Home', color: 'teal' },
            { entity: SHEET[1], tone: 'heat' },
            SHEET[2],
          ],
        }),
      ],
    },
    {
      title: 'Week from Sunday',
      cards: [
        base('week', { first_weekday: 'sunday' }),
        base('month', { first_weekday: 'sunday' }),
      ],
    },
    // #111: a rolling week — today and the six days after it — on the sheet's Thursday, and on a Sunday, the day the
    // reporter's Monday week showed nothing ahead, with Thursday picked in it
    {
      title: 'Week · rolling from today (#111)',
      cards: [
        base('week', { first_weekday: 'today' }),
        base('week', {
          first_weekday: 'today',
          _now: '2026-09-13T09:30:00',
          _picked: '2026-09-17',
        }),
      ],
    },
    {
      title: 'All day · multi-day',
      cards: [
        base('week', {
          entities: ['calendar.family', 'calendar.trips'],
          _now: '2026-09-19T10:05:00',
        }),
        base('upcoming', { entities: ['calendar.family', 'calendar.trips'], days: 3 }),
      ],
    },
    {
      title: 'Timeline · overlaps',
      cards: [
        base('timeline', {
          entities: ['calendar.clash', 'calendar.trips', 'calendar.personal', 'calendar.chores'],
          tones: {
            'calendar.clash': 'fan',
            'calendar.trips': 'dry',
            'calendar.personal': 'media',
            'calendar.chores': 'solar',
          },
          _now: '2026-09-17T10:20:00',
        }),
      ],
    },
    { title: 'Narrow', width: 300, cards: [base('month-day'), base('week'), base('timeline')] },
    { title: 'Wide', width: 480, cards: [base('month-day'), base('timeline')] },
  ],
};
