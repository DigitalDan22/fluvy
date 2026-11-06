// @vitest-environment happy-dom
import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { catalogue, familiesDefined } from '../index.js';

// the lazy families (the players, the cameras, the printers, the cars, the automations) are defined before a card is drawn
await familiesDefined;

/*
 * A name as Home Assistant's own editor writes it since 2025.11 (#125): `name: { type: entity }`, its parts read with
 * the entity, over the whole catalogue. Every card is drawn from its own stub in a house where each thing is the
 * entity "Baum" of the device "EG_GA_L_Baum" (its friendly name both, as Home Assistant writes it), with that name
 * given to the card and to every item of its lists: nothing anywhere reads "[object Object]", and every card that
 * names its entity in its head reads "Baum" there, never the friendly name.
 */

const CATALOGUE = await catalogue();

type CardClass = { getStubConfig?(hass: unknown, entities: readonly string[]): LovelaceCardConfig };
type CardElement = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

const STAMP = '2026-11-06T19:00:00+00:00';
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}) => ({
  entity_id,
  state: value,
  attributes: { friendly_name: 'EG_GA_L_Baum Baum', ...attributes },
  last_changed: STAMP,
  last_updated: STAMP,
  context: { id: '', parent_id: null, user_id: null },
});

/** A house of every kind of thing a card is drawn from, each the entity "Baum" of the device "EG_GA_L_Baum". */
const STATES = [
  state('light.baum', 'on', {
    brightness: 180,
    supported_color_modes: ['color_temp', 'hs'],
    color_mode: 'hs',
    hs_color: [30, 60],
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6500,
  }),
  state('switch.baum', 'off'),
  state('fan.baum', 'on', { percentage: 50, supported_features: 1 }),
  state('cover.baum', 'open', { current_position: 70, supported_features: 15 }),
  state('lock.baum', 'locked'),
  state('alarm_control_panel.baum', 'disarmed', { supported_features: 3 }),
  state('climate.baum', 'heat', {
    current_temperature: 20.5,
    temperature: 21,
    hvac_modes: ['off', 'heat'],
    min_temp: 7,
    max_temp: 30,
  }),
  state('humidifier.baum', 'on', { humidity: 45, min_humidity: 30, max_humidity: 70 }),
  state('vacuum.baum', 'docked', { supported_features: 12 }),
  state('camera.baum', 'idle', { entity_picture: '/api/camera_proxy/camera.baum' }),
  state('media_player.baum', 'playing', { media_title: 'News', supported_features: 152463 }),
  state('person.baum', 'home'),
  state('zone.home', '1', { latitude: 41.4, longitude: 2.17, radius: 100 }),
  state('todo.baum', '2', { supported_features: 15 }),
  state('timer.baum', 'active', {
    duration: '0:10:00',
    remaining: '0:05:00',
    finishes_at: '2026-11-06T19:05:00+00:00',
  }),
  state('update.baum', 'on', { title: 'Core', installed_version: '1', latest_version: '2' }),
  state('weather.baum', 'sunny', { temperature: 21, temperature_unit: '°C' }),
  state('scene.baum', STAMP),
  state('script.baum', 'off'),
  state('automation.baum', 'on'),
  state('input_number.baum', '20', { min: 0, max: 40, step: 1 }),
  state('input_boolean.baum', 'off'),
  state('binary_sensor.baum', 'off', { device_class: 'door' }),
  state('calendar.baum', 'off'),
  state('sensor.baum_temperature', '21.4', {
    unit_of_measurement: '°C',
    device_class: 'temperature',
    state_class: 'measurement',
  }),
  state('sensor.baum_humidity', '48', {
    unit_of_measurement: '%',
    device_class: 'humidity',
    state_class: 'measurement',
  }),
  state('sensor.baum_power', '1200', {
    unit_of_measurement: 'W',
    device_class: 'power',
    state_class: 'measurement',
  }),
  state('sensor.baum_energy', '12.4', {
    unit_of_measurement: 'kWh',
    device_class: 'energy',
    state_class: 'total_increasing',
  }),
  state('sensor.baum_battery', '64', { unit_of_measurement: '%', device_class: 'battery' }),
  state('sun.sun', 'above_horizon'),
];

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24', first_weekday: 'monday' },
  states: Object.fromEntries(STATES.map((s) => [s.entity_id, s])),
  entities: Object.fromEntries(
    STATES.map((s) => [s.entity_id, { entity_id: s.entity_id, name: 'Baum', device_id: 'tree' }]),
  ),
  devices: {
    tree: { id: 'tree', name: 'EG_GA_L_Baum', name_by_user: null, area_id: 'garden' },
  },
  areas: { garden: { area_id: 'garden', name: 'Garten', picture: null, icon: null } },
  floors: {},
  user: { id: 'u1', name: 'Marta', is_admin: true, is_owner: true },
  config: {
    unit_system: { temperature: '°C', length: 'km' },
    time_zone: 'UTC',
    latitude: 41.4,
    longitude: 2.17,
  },
  themes: { darkMode: false, themes: {} },
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
  hassUrl: (path: string) => path,
  callService: () => Promise.resolve(),
  callWS: () => new Promise(() => undefined),
  callApi: () => new Promise(() => undefined),
  connection: {
    subscribeMessage: () => new Promise(() => undefined),
    subscribeEvents: () => new Promise(() => undefined),
  },
} as unknown as HomeAssistant;

const NAME = { type: 'entity' } as const;
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(value);

/** The stub with Home Assistant's name on the card and on every item of its lists that names an entity. */
function named(stub: LovelaceCardConfig): LovelaceCardConfig {
  const config: Record<string, unknown> = { ...stub, name: NAME };
  for (const [key, value] of Object.entries(stub)) {
    if (!Array.isArray(value)) continue;
    const items = value as unknown[];
    const entries = items.filter(
      (item) =>
        isId(item) ||
        (typeof item === 'object' && item !== null && isId((item as { entity?: unknown }).entity)),
    );
    if (!entries.length || entries.length !== items.length) continue;
    config[key] = items.map((item) =>
      isId(item) ? { entity: item, name: NAME } : { ...(item as object), name: NAME },
    );
  }
  return config as LovelaceCardConfig;
}

/** Every word a card shows or says, through its parts' own shadow roots: its text and its labels. */
function said(root: ShadowRoot | Element): string {
  const words: string[] = [];
  const walk = (node: ShadowRoot | Element): void => {
    for (const el of node.querySelectorAll('*')) {
      for (const attribute of ['aria-label', 'title', 'label', 'alt'])
        if (el.hasAttribute(attribute)) words.push(el.getAttribute(attribute) ?? '');
      if (el.shadowRoot) walk(el.shadowRoot);
    }
    words.push(node.textContent ?? '');
  };
  walk(root);
  return words.join(' ');
}

async function drawn(
  tag: string,
  card: CardClass,
  dress: (stub: LovelaceCardConfig) => LovelaceCardConfig = named,
): Promise<{ root: ShadowRoot; config: LovelaceCardConfig } | null> {
  let config: LovelaceCardConfig;
  try {
    config = dress({
      ...card.getStubConfig?.(hass, Object.keys(hass.states)),
      type: `custom:${tag}`,
    });
  } catch {
    return null;
  }
  const element = document.createElement(tag) as CardElement;
  try {
    element.setConfig(config);
  } catch {
    return null;
  }
  element.hass = hass;
  (element as unknown as { width: number }).width = 360;
  document.body.append(element);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
  return element.shadowRoot ? { root: element.shadowRoot, config } : null;
}

/**
 * The cards whose head names something else than their entity, or names none: a room's area (its lights' too), a
 * greeting's person, a strip of chips, a heading, a clock, the items card's `title`; and the devices' cards this house
 * cannot fill (a printer, an appliance, a car).
 */
const HEADLESS = new Set([
  'fluvy-chips-card',
  'fluvy-clock-card',
  'fluvy-hello-card',
  'fluvy-heading-card',
  'fluvy-items-card',
  'fluvy-lights-card',
  'fluvy-room-card',
  'fluvy-printer-card',
  'fluvy-appliance-card',
  'fluvy-vehicle-card',
]);

const cards = CATALOGUE.map(([tag, element]) => ({ tag, card: element as unknown as CardClass }));

/** The lists whose items take no name of their own: the map's people, the updates. */
const UNNAMED_ITEMS = new Set(['fluvy-map-card', 'fluvy-updates-card']);

/** The lists whose items' names the card's face does not say: a heading's badges, a calendar's (its events do). */
const FACELESS_ITEMS = new Set(['fluvy-heading-card', 'fluvy-calendar-card']);

/** Whether a config carries a list of entities. */
const lists = (config: LovelaceCardConfig): boolean =>
  Object.values(config).some(
    (value) =>
      Array.isArray(value) &&
      value.some((item) => isId(item) || isId((item as { entity?: unknown })?.entity)),
  );

/** Whether a stub carries a list of entities, each item given the name. */
const listing = (config: LovelaceCardConfig): boolean =>
  Object.values(config).some(
    (value) =>
      Array.isArray(value) && value.some((item) => (item as { name?: unknown })?.name === NAME),
  );

describe('Home Assistant’s names in every card (#125)', () => {
  afterEach(() => document.body.replaceChildren());

  it.each(cards)('$tag: never reads [object Object]', async ({ tag, card }) => {
    const drawnCard = await drawn(tag, card);
    if (!drawnCard) return;
    expect(said(drawnCard.root)).not.toContain('[object Object]');
  });

  it.each(cards.filter(({ tag }) => !UNNAMED_ITEMS.has(tag)))(
    '$tag: names each item of its lists "Baum"',
    async ({ tag, card }) => {
      const drawnCard = await drawn(tag, card);
      if (!drawnCard || isId(drawnCard.config['entity']) || !listing(drawnCard.config)) return;
      expect(said(drawnCard.root), `${tag} reads an item's friendly name`).not.toContain(
        'EG_GA_L_Baum Baum',
      );
    },
  );

  it.each(cards.filter(({ tag }) => !FACELESS_ITEMS.has(tag)))(
    '$tag: an item without a name of its own reads its own, never the card’s',
    async ({ tag, card }) => {
      const drawnCard = await drawn(tag, card, (stub) => ({ ...stub, name: 'Kartenname' }));
      if (!drawnCard || isId(drawnCard.config['entity']) || !lists(drawnCard.config)) return;
      expect(said(drawnCard.root), `${tag} reads its items' own names`).toContain(
        'EG_GA_L_Baum Baum',
      );
    },
  );

  it.each(cards.filter(({ tag }) => !HEADLESS.has(tag)))(
    '$tag: names its entity "Baum" where its stub names one',
    async ({ tag, card }) => {
      const drawnCard = await drawn(tag, card);
      if (!drawnCard || !isId(drawnCard.config['entity'])) return;
      const head = drawnCard.root.querySelector('.fv-card__head, [data-name], .fv-card__title');
      const words = said(drawnCard.root);
      expect(words, `${tag} names its entity`).toMatch(/\bBaum\b/);
      expect(head ? said(head as Element) : words, `${tag} reads the friendly name`).not.toContain(
        'EG_GA_L_Baum Baum',
      );
    },
  );
});
