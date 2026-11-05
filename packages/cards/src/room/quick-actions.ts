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
  readonly destination: string | undefined;
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

/* the `supported_features` of a blind and a player that say which service each takes */
const COVER_OPEN = 1;
const COVER_CLOSE = 2;
const COVER_STOP = 8;
const COVER_OPEN_TILT = 16;
const COVER_CLOSE_TILT = 32;
const COVER_STOP_TILT = 64;
const MEDIA_PAUSE = 1;
const MEDIA_TURN_ON = 128;
const MEDIA_TURN_OFF = 256;
const MEDIA_STOP = 4096;
const MEDIA_PLAY = 16384;

/** The services a move may be, best first, each with the feature a member needs for it (0: every member takes it). */
type Ways = readonly (readonly [service: string, feature: number])[];

/** A blind stops, closes and opens itself, else (one that only tilts) its slats. */
const STOPS: Ways = [
  ['stop_cover', COVER_STOP],
  ['stop_cover_tilt', COVER_STOP_TILT],
];
const CLOSES: Ways = [
  ['close_cover', COVER_CLOSE],
  ['close_cover_tilt', COVER_CLOSE_TILT],
];
const OPENS: Ways = [
  ['open_cover', COVER_OPEN],
  ['open_cover_tilt', COVER_OPEN_TILT],
];
/** A player that plays pauses, else stops (Home Assistant's own play button), else goes off. */
const PAUSES: Ways = [
  ['media_pause', MEDIA_PAUSE],
  ['media_stop', MEDIA_STOP],
  ['turn_off', MEDIA_TURN_OFF],
];
const PLAYS: Ways = [['media_play', MEDIA_PLAY]];
const WAKES: Ways = [['turn_on', MEDIA_TURN_ON]];

/** One call of a round's: a service of its domain and the members that take it. */
interface Call {
  readonly service: string;
  readonly ids: readonly string[];
}

/**
 * The calls that move `views`, one a service in the order of `ways`: each member by the first of them it supports, one
 * that supports none left out (Home Assistant refuses a whole call one of its entities cannot take).
 */
function callsOf(views: readonly EntityView[], ways: Ways): Call[] {
  const way = (view: EntityView): string | undefined =>
    ways.find(([, feature]) => !feature || view.supports(feature))?.[0];
  return ways
    .map(([service]) => ({
      service,
      ids: views.filter((view) => way(view) === service).map((view) => view.id),
    }))
    .filter((call) => call.ids.length > 0);
}

/** A round's on and off as it would go now: its calls (none: none of its members can), and the state they expect. */
interface Flip {
  readonly domain: string;
  readonly calls: readonly Call[];
  readonly expect?: string;
}

/**
 * A round's own on and off, for all of it at once: a set on goes off, a set off comes on; blinds that move stop, else
 * open ones close and closed ones open; players that play pause, else those on play and those off come on — each
 * member by what it takes (a blind that only tilts by its slats), one call a service.
 */
function flipOf(domain: string, views: readonly EntityView[], on: boolean): Flip {
  const usable = views.filter(isUsable);
  if (domain === 'cover') {
    const stops = callsOf(
      usable.filter((view) => MOVING.has(view.state)),
      STOPS,
    );
    if (stops.length) return { domain, calls: stops };
    return on
      ? { domain, calls: callsOf(usable, CLOSES), expect: 'closed' }
      : { domain, calls: callsOf(usable, OPENS), expect: 'open' };
  }
  if (domain === 'media_player') {
    const playing = usable.filter((view) => view.state === 'playing');
    if (playing.length) return { domain, calls: callsOf(playing, PAUSES) };
    const awake = usable.filter((view) => view.state !== 'off');
    return awake.length
      ? { domain, calls: callsOf(awake, PLAYS), expect: 'playing' }
      : { domain, calls: callsOf(usable, WAKES) };
  }
  return {
    domain,
    calls: callsOf(usable, [[on ? 'turn_off' : 'turn_on', 0]]),
    expect: on ? 'off' : 'on',
  };
}

/** Every call of a round's at once, its members drawn as they will be. */
function perform(host: QuickHost, flip: Flip): void {
  for (const { service, ids } of flip.calls) {
    if (flip.expect) for (const id of ids) host.expect(id, flip.expect);
    host.call(flip.domain, service, { entity_id: [...ids] });
  }
}

/**
 * The rounds Home Assistant's dialog asks about, each by the very action handed to it: its yes hands that action back.
 * An action answered no is Home Assistant's to drop, and the question goes with it.
 */
const asked = new WeakMap<object, () => void>();

/**
 * Home Assistant's yes: its `fire-dom-event` comes back as `ll-custom` from the card that asked, which hears it on
 * itself, in the page or drawn anew since; only the action it asked about moves its round, and only once.
 */
export function answered(event: Event): void {
  // any other `ll-custom` (a frontend integration's, a page's) is no question of the rounds'
  const action = (event as CustomEvent<object>).detail;
  const yes = asked.get(action);
  if (!yes) return;
  asked.delete(action);
  yes();
}

/**
 * Runs a round's on and off: every call at once; or, asked first (`confirmation`), once Home Assistant's own dialog
 * has its answer, nothing moving before. One call goes to it whole (its words, where the tap says none, name its
 * service); several go as one `fire-dom-event` it hands back once answered yes, so every member is asked about (a
 * blind that only tilts beside blinds that close as well), its words where the tap says none Home Assistant's sentence
 * naming the round ("Are you sure you want to run action "Blinds"?"), else the round's name.
 */
function runFlip(
  host: QuickHost,
  flip: Flip,
  confirmation: ActionConfig['confirmation'],
  name: string,
): void {
  if (!confirmation) return perform(host, flip);
  const [first, ...rest] = flip.calls;
  if (!first) return;
  if (!rest.length)
    return host.run(
      {
        action: 'perform-action',
        perform_action: `${flip.domain}.${first.service}`,
        target: { entity_id: [...first.ids] },
        confirmation,
      },
      undefined,
    );
  const own = typeof confirmation === 'object' ? confirmation : {};
  const key = 'ui.panel.lovelace.cards.actions.action_confirmation';
  const said = host.hass?.localize?.(key, { action: name });
  const action: ActionConfig = {
    action: 'fire-dom-event',
    confirmation: { ...own, text: own.text ?? (said && said !== key ? said : name) },
  };
  asked.set(action, () => perform(host, flip));
  host.run(action, undefined);
}

/** The domains a round turns on and off itself (`flipOf`), all of a set at once; the rest by the house's toggle. */
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
 * (a set of lights in what is lit, as the room's lights' row; else its own, else its kind's), its tap (on and off; none
 * where none of it can, and then it is drawn as one that cannot) and its hold (its details).
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
  // what its actions are for: its own entity, else its one member; a set of several has none
  const own = item.entity ?? single;
  /**
   * An action of the round's, where it can run: a set of several's details are where the room opens, whose page lists
   * them as a group's own dialog lists its members (Home Assistant has no dialog for entities that are no group).
   */
  const runs = (asked: ActionConfig): (() => void) | undefined => {
    const action =
      asked.action === 'more-info' && !asked.entity && !own && host.destination
        ? { ...asked, action: 'navigate' as const, navigation_path: host.destination }
        : asked;
    return actionRuns(action, own) ? () => host.run(action, own) : undefined;
  };
  const tap = item.tap_action ?? (group || TOGGLE_DOMAINS.has(first.domain) ? TOGGLE : MORE_INFO);
  // its own on and off where its tap toggles it, asked first or not
  const flip =
    tap.action === 'toggle' && !tap.entity && FLIPS.has(first.domain)
      ? flipOf(first.domain, views, on)
      : undefined;
  const name = item.name ?? (group ? localize(hass, LOOKS[group][0]) : first.name);
  return {
    name,
    glyph: item.icon ?? (group && !single ? LOOKS[group][1] : iconOf(first)),
    usable: views.some(isUsable),
    on,
    level: on ? Math.max(1, Math.round(level)) : 0,
    tone,
    accent: host.accent(colour),
    switches: flip !== undefined,
    // a set none of whose members takes its call reads as it is and takes no tap
    onTap: flip
      ? flip.calls.length > 0
        ? () => runFlip(host, flip, tap.confirmation, name)
        : undefined
      : runs(tap),
    onHold: runs(item.hold_action ?? MORE_INFO),
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
