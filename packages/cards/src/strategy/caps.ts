import type { MessageKey } from '@fluvy/core';
import { flowed, full, headed, heading, type Loose } from './layout.js';
import type { Card, CapKey, Caps, MoreHost, StrategyContext } from './types.js';

/*
 * The automatic dashboards' capped lists (#78): a view shows the first of a long list, so a big house still reads,
 * and what is past the cap is one row away — "N more", which opens a subview of every one, back to the view. The
 * dashboard's `caps` raises a list's cap, lifts it, or lifts them all.
 */

/** How many of each list a view shows (design/language.md "Capped lists"); a view may keep its own (`ListSpec.cap`). */
export const CAPS: Readonly<Record<CapKey, number>> = {
  lights: 6,
  appliances: 4,
  covers: 6,
  gates: 2,
  thermostats: 4,
  fans: 2,
  humidity: 3,
  temperatures: 4,
  readings: 3,
  security: 5,
  alarms: 2,
  locks: 4,
  cameras: 4,
  media: 6,
  calendars: 3,
  lists: 3,
  timers: 3,
  actions: 6,
  scenes: 6,
  batteries: 8,
  phones: 8,
  plants: 4,
  helpers: 6,
  updates: 8,
  consumption: 8,
  today: 4,
  meters: 9,
  devices: 8,
  // the lists a card folds itself (`foldAt`), at the card's own fold
  openings: 4,
  automations: 6,
};

/**
 * The lists of rows and tiles: one past the cap is shown there, as every fold of the house shows it, since it takes no
 * more room than a "1 more" row would (a fourth reading holds its card, two by two). A list of whole cards (a
 * thermostat, a camera) says "1 more" instead.
 */
const ROWS: ReadonlySet<CapKey> = new Set<CapKey>([
  'lights',
  'appliances',
  'covers',
  'readings',
  'security',
  'actions',
  'scenes',
  'batteries',
  'phones',
  'plants',
  'helpers',
  'updates',
  'consumption',
  'devices',
]);

const isCapKey = (key: string): key is CapKey => Object.hasOwn(CAPS, key);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/**
 * A dashboard's `caps`, well formed: `none`, or the lists it names, each a whole number from 1 or `none`; anything else
 * leaves the house's caps.
 */
export function capsOf(raw: unknown): Caps {
  if (raw === 'none') return 'none';
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([key, value]) => isCapKey(key) && (value === 'none' || isCount(value)),
    ),
  ) as Caps;
}

/** How many of a list a view shows: the dashboard's number for it, else the view's own cap, else the house's. */
export function capOf(caps: Caps, key: CapKey, own = CAPS[key]): number {
  const asked = caps === 'none' ? 'none' : caps[key];
  return asked === 'none' ? Number.POSITIVE_INFINITY : (asked ?? own);
}

/**
 * A list a card folds itself (the openings, a room's automations), its fold the list's cap: every one where the
 * dashboard lifts it, the card then folding none.
 */
export function foldAt(
  ctx: StrategyContext,
  key: CapKey,
  items: readonly string[],
): { readonly max_rows: number } {
  const cap = capOf(ctx.caps, key);
  return { max_rows: Number.isFinite(cap) ? cap : Math.max(1, items.length) };
}

/** A capped list, as a view lays it out. */
export interface ListSpec {
  /** Its name in `caps`; its subview's path is the view's and this (`climate-humidity`). */
  readonly key: CapKey;
  /** The subview's title and icon. */
  readonly title: MessageKey;
  readonly icon: string;
  /** This view's own cap where it is not the house's (the wall's security rows, the Cameras view's twelve). */
  readonly cap?: number;
}

/** What a view shows of a list, and what it leaves to the subview. */
export interface Capped<T> {
  readonly shown: readonly T[];
  /** How many the subview holds besides (0: the list is whole). */
  readonly rest: number;
  /** The subview's url, where the list leaves some to it. */
  readonly path: string | undefined;
}

/** A view to gather on: its path, its title and icon for the way back, the template's columns. */
export const moreHost = (path: string, title: string, icon: string, columns: number): MoreHost => ({
  path,
  title,
  icon,
  columns,
  views: [],
});

/**
 * A list at its cap: its first `cap` items, and past them the subview of every one (`every` lays them out in blocks,
 * which `flowed` cuts into its columns), gathered on the view being built, under the way back to it. One past the cap
 * of a list of rows or tiles is shown instead.
 */
export function capped<T>(
  ctx: StrategyContext,
  list: ListSpec,
  items: readonly T[],
  every: (items: readonly T[]) => readonly (readonly Card[])[],
): Capped<T> {
  const cap = capOf(ctx.caps, list.key, list.cap);
  if (items.length <= cap || (ROWS.has(list.key) && items.length === cap + 1))
    return { shown: items, rest: 0, path: undefined };
  const host = ctx.more;
  const path = `${host.path}-${list.key}`;
  const back = `${ctx.base}/${host.path}`;
  if (!host.views.some((view) => view.path === path))
    host.views.push({
      title: ctx.t(list.title),
      icon: list.icon,
      path,
      type: 'sections',
      max_columns: host.columns,
      subview: true,
      back_path: back,
      sections: flowed(
        ctx,
        headed(
          heading(host.title, host.icon, [], back),
          every(items).map((block) => [...block]),
        ),
        [],
        host.columns,
      ),
    });
  return { shown: items.slice(0, cap), rest: items.length - cap, path: `${ctx.base}/${path}` };
}

/** The keys that end a card of rows (the entities card's) with the "N more" row, where the list leaves some. */
export const moreKeys = ({ rest, path }: Capped<unknown>): Record<string, unknown> =>
  path ? { more: rest, more_path: path } : {};

/** The "N more" row on a card of its own, where the list leaves some. */
export const moreCard = (list: Capped<unknown>): Card[] =>
  list.path ? [full('entities', moreKeys(list))] : [];

/** A list's blocks, its "N more" row riding on the last: a block never splits, so the row stays under its list. */
export function moreAfter(blocks: readonly (readonly Card[])[], list: Capped<unknown>): Card[][] {
  const rows = blocks.map((block) => [...block]);
  rows.at(-1)?.push(...moreCard(list));
  return rows;
}

/** A list's cards, each where the columns are shortest, its "N more" row kept under the last of them. */
export function looseAfter(cards: readonly Card[], list: Capped<unknown>): Loose[] {
  const more = moreCard(list);
  const last = cards.at(-1);
  return more.length && last ? [...cards.slice(0, -1), [last, ...more]] : [...cards];
}

/**
 * Every one of a list, a card a room (`block` draws a room's: its card, or a heading and its card), the biggest first,
 * as the Security dashboard's Openings view lays its openings; those in no room under the list's own name.
 */
export function byArea(
  ctx: StrategyContext,
  ids: readonly string[],
  title: string,
  block: (title: string, ids: readonly string[]) => readonly Card[],
): Card[][] {
  const { home } = ctx;
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const key = home.areaName(home.areaOf(id)) ?? title;
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, group]) => [...block(name, group)]);
}

/** Every one of a list of whole cards, a block each. */
export const each =
  <T>(build: (item: T) => Card) =>
  (items: readonly T[]): Card[][] =>
    items.map((item) => [build(item)]);
