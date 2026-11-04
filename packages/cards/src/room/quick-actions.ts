import {
  actionRuns,
  isActiveState,
  isUsable,
  lightDefaults,
  localize,
  resolveEntity,
  TOGGLE_DOMAINS,
  type ActionConfig,
  type EntityView,
  type HomeAssistant,
} from '@fluvy/core';
import type { Tone } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { statusToneOf } from '../shared/colour.js';
import { GATEWAYS, iconOf, toneFor } from '../shared/domain.js';
import { DIMMABLE, lampsOf, lightLook, litColour, meanHex } from '../shared/light.js';
import { levelRound, ROUND, ROUND_GAP, type LevelRound } from '../shared/round.js';
import type { RoomCardConfig } from './room-card.js';

/*
 * A room's quick actions (#113): rounds at the end of its head, its row or its picture, each one of the room's sets —
 * its lights, its blinds, its fans, its players — or an entity of the person's choosing. Their own chunk, fetched with
 * the families as the bundle starts: the room card draws them from its first render in practice.
 */

/** The room's own sets a round may stand for, each by the domain its devices are of. */
const GROUPS = {
  lights: 'light',
  covers: 'cover',
  fans: 'fan',
  media: 'media_player',
} as const;
export type QuickGroup = keyof typeof GROUPS;
export const QUICK_GROUPS = Object.keys(GROUPS) as readonly QuickGroup[];

/** A set's word (its round's name) and glyph (where it holds more than one). */
const LOOKS = {
  lights: ['room.lights', 'bulb'],
  covers: ['room.covers', 'blinds'],
  fans: ['room.fans', 'fan'],
  media: ['room.media', 'speaker'],
} as const;

/** One round: one of the room's sets (`group`), or one entity; its own name, icon, colour and actions. */
export interface QuickAction {
  /** `lights`, `covers` (blinds, curtains, awnings: never a door or a gate), `fans`, `media`; `entity`: its own. */
  group?: QuickGroup | 'entity';
  /** The entity a round of its own acts on. */
  entity?: string;
  name?: string;
  icon?: string;
  tone?: Tone;
  /** Its own colour while on (a Home Assistant colour name or `#rrggbb`). */
  color?: string;
  /** Default: on and off (a set: all of it; blinds: open, close, or stop while they move). */
  tap_action?: ActionConfig;
  /** Default: its details (a set of several: where the room opens). */
  hold_action?: ActionConfig;
}

/** A config's entry as a round: a set's word, an entity's id, or an entry; anything else none. */
export function quickEntry(raw: unknown): QuickAction | null {
  if (typeof raw === 'string')
    return raw.includes('.') ? { group: 'entity', entity: raw } : { group: raw as QuickGroup };
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as QuickAction;
  return entry.group ? entry : { ...entry, group: 'entity' };
}

/** What a room asks for when it names no rounds: its lights, then its blinds. */
const DEFAULT: readonly QuickGroup[] = ['lights', 'covers'];

/** What the rounds reach of their card: its house, config and devices, its states as drawn, its calls, its colours. */
export interface QuickHost {
  readonly hass: HomeAssistant | undefined;
  readonly config?: RoomCardConfig | undefined;
  /** The room's devices as the card counts them. */
  readonly devices: readonly string[];
  /** A state as drawn: the one a tap expects until Home Assistant says it. */
  state(view: EntityView): string;
  expect(entityId: string, state: string): void;
  call(domain: string, service: string, data: Record<string, unknown>): void;
  run(action: ActionConfig, entityId: string | undefined): void;
  /** A colour as the card's sheet gives it (`data-accent`). */
  accent(colour: unknown): string | undefined;
  /** Where the room opens, where it opens anywhere. */
  readonly open: (() => void) | undefined;
}

/** The rounds drawn in the room the card gives them, and what they take of its line: their width and 12 before. */
export interface QuickRounds {
  readonly taken: number;
  readonly template: TemplateResult | typeof nothing;
}

/** A set's entities among a room's devices: those of its domain (its blinds, never its doors and gates). */
function membersOf(
  hass: HomeAssistant | undefined,
  devices: readonly string[],
  group: QuickGroup,
): string[] {
  return devices.filter(
    (id) =>
      id.startsWith(`${GROUPS[group]}.`) &&
      (group !== 'covers' || !GATEWAYS.has(resolveEntity(hass, id).deviceClass)),
  );
}

/** The sets a room's rounds stand for when the card names none: its lights, then its blinds, where it has them. */
export const defaultGroups = (
  hass: HomeAssistant | undefined,
  devices: readonly string[],
): QuickGroup[] => DEFAULT.filter((group) => membersOf(hass, devices, group).length);

/** The rounds asked for (`quick_actions`), else the room's lights and blinds; a set the room does not hold has none. */
function quickActions(host: QuickHost): QuickAction[] {
  const asked = host.config?.quick_actions;
  return (Array.isArray(asked) ? asked : DEFAULT)
    .map(quickEntry)
    .filter(
      (item): item is QuickAction =>
        item !== null &&
        (item.group === 'entity'
          ? Boolean(item.entity)
          : item.group !== undefined &&
            Object.hasOwn(GROUPS, item.group) &&
            membersOf(host.hass, host.devices, item.group).length > 0),
    );
}

/**
 * Where an entity stands, 0–100, while on: a light's brightness (where it dims), a blind's position, a fan's speed, a
 * player's volume; 100 where it says none.
 */
function levelOf(view: EntityView): number {
  const raw =
    view.domain === 'light'
      ? (view.attr<string[]>('supported_color_modes') ?? []).some((mode) => DIMMABLE.has(mode))
        ? (view.attr<number>('brightness') ?? NaN) / 2.55
        : NaN
      : view.domain === 'cover'
        ? view.attr<number>('current_position')
        : view.domain === 'fan'
          ? view.attr<number>('percentage')
          : view.domain === 'media_player'
            ? (view.attr<number>('volume_level') ?? NaN) * 100
            : NaN;
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 100;
}

/** States a blind moves in: a tap then stops it. */
const MOVING: ReadonlySet<string> = new Set(['opening', 'closing']);
const COVER_STOP = 8;

/**
 * A round's own on and off, for all of it at once: a set on goes off, a set off comes on (every one, in one call);
 * blinds that move stop, else open ones close and closed ones open; players that play pause, else those on play and
 * those off come on.
 */
function flip(host: QuickHost, domain: string, views: readonly EntityView[], on: boolean): void {
  const usable = views.filter(isUsable);
  const ids = (list: readonly EntityView[]): { entity_id: string[] } => ({
    entity_id: list.map((view) => view.id),
  });
  const expect = (list: readonly EntityView[], state: string): void => {
    for (const view of list) host.expect(view.id, state);
  };
  if (domain === 'cover') {
    const moving = usable.filter((view) => MOVING.has(view.state) && view.supports(COVER_STOP));
    if (moving.length) return host.call('cover', 'stop_cover', ids(moving));
    expect(usable, on ? 'closed' : 'open');
    return host.call('cover', on ? 'close_cover' : 'open_cover', ids(usable));
  }
  if (domain === 'media_player') {
    const playing = usable.filter((view) => view.state === 'playing');
    const awake = usable.filter((view) => view.state !== 'off');
    if (playing.length) return host.call(domain, 'media_pause', ids(playing));
    if (!awake.length) return host.call(domain, 'turn_on', ids(usable));
    expect(awake, 'playing');
    return host.call(domain, 'media_play', ids(awake));
  }
  expect(usable, on ? 'off' : 'on');
  host.call(domain, on ? 'turn_off' : 'turn_on', ids(usable));
}

/** The domains a round turns on and off itself (`flip`), all of a set in one call; the rest by the house's toggle. */
const FLIPS: ReadonlySet<string> = new Set([
  'light',
  'switch',
  'fan',
  'cover',
  'media_player',
  'input_boolean',
  'humidifier',
]);

const MORE_INFO: ActionConfig = { action: 'more-info' };
const TOGGLE: ActionConfig = { action: 'toggle' };

/**
 * A round as drawn: its name and glyph (its set's, else its entity's), on while any of it is, its ring the level of
 * all of it (an off one at 0: the room's light as a share of all it could give, its blinds' mean position), its colour
 * (a set of lights in what is lit, as the room's lights' row; else its own, else its kind's), its tap (on and off) and
 * its hold (its details; a set of several: where the room opens).
 */
function roundOf(host: QuickHost, item: QuickAction): LevelRound {
  const { hass, config } = host;
  const group = item.group === 'entity' ? undefined : item.group;
  const ids = group ? membersOf(hass, host.devices, group) : [item.entity ?? ''];
  const views = ids.map((id) => resolveEntity(hass, id));
  const first = views[0] ?? resolveEntity(hass, undefined);
  const lit = (view: EntityView): boolean =>
    isUsable(view) && isActiveState(view.domain, host.state(view));
  // a set of lights counts each lamp once (a group in the room is its members)
  const lamps =
    first.domain === 'light' ? lampsOf(ids, hass).map((id) => resolveEntity(hass, id)) : views;
  const on = views.some(lit);
  const level =
    lamps.reduce((sum, view) => sum + (lit(view) ? levelOf(view) : 0), 0) / lamps.length;
  const glow =
    first.domain === 'light' && on && (config?.light_colors ?? lightDefaults().colors)
      ? group
        ? meanHex(lamps, config?.light_whites)
        : litColour(first, true, config?.light_whites, hass)
      : undefined;
  const [colour, tone] =
    first.domain === 'light'
      ? lightLook(item, config, glow)
      : [item.color, statusToneOf(item, toneFor(first))];
  const single = ids.length === 1 ? ids[0] : undefined;
  const tap = item.tap_action ?? (group || TOGGLE_DOMAINS.has(first.domain) ? TOGGLE : MORE_INFO);
  const switches =
    tap.action === 'toggle' && !tap.entity && !tap.confirmation && FLIPS.has(first.domain);
  const hold = item.hold_action ?? (single ? MORE_INFO : undefined);
  return {
    name: item.name ?? (group ? localize(hass, LOOKS[group][0]) : first.name),
    glyph: item.icon ?? (group && !single ? LOOKS[group][1] : iconOf(first)),
    usable: views.some(isUsable),
    on,
    level: on ? Math.max(1, Math.round(level)) : 0,
    tone,
    accent: host.accent(colour),
    switches,
    onTap: switches
      ? () => flip(host, first.domain, views, on)
      : actionRuns(tap, item.entity)
        ? () => host.run(tap, item.entity)
        : undefined,
    onHold: hold
      ? actionRuns(hold, single)
        ? () => host.run(hold, single)
        : undefined
      : host.open,
  };
}

/** The rounds in `room` (44 each, 8 apart, 12 after what is before them): as many as it holds, in the card's order. */
export function quickRounds(host: QuickHost, room: number): QuickRounds {
  const fits = Math.floor((room - 12 + ROUND_GAP) / (ROUND + ROUND_GAP));
  const rounds =
    fits > 0
      ? quickActions(host)
          .slice(0, fits)
          .map((item) => roundOf(host, item))
      : [];
  return rounds.length
    ? {
        taken: 12 + rounds.length * (ROUND + ROUND_GAP) - ROUND_GAP,
        template: html`<div class="lt-bulbs rm-quick">${rounds.map(levelRound)}</div>`,
      }
    : { taken: 0, template: nothing };
}
