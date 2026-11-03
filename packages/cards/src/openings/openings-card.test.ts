// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';
import { cardForm, drawEditor, shownNames } from '../shared/fixtures/editor.js';
import { FluvyOpeningsCard } from './openings-card.js';
import * as openingsEditor from './openings-editor.js';

// the index defines the cards' tags before a page needs them
await familiesDefined;

/*
 * The real last change (#67): a row's `since` — a timestamp sensor, or `attribute:<name>` of its own — and the card's
 * `since_pattern` say where a row's time is read from; what does not read falls back to Home Assistant's own.
 */

const NOW = new Date('2026-10-26T12:00:00Z');
const at = (hoursAgo: number): string =>
  new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString();
/** An entity as Home Assistant has it a minute after a restart: its own last change is a minute old. */
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}) =>
  ({
    entity_id,
    state: value,
    attributes: { friendly_name: entity_id.split('.')[1]!.replace(/_/g, ' '), ...attributes },
    last_changed: at(1 / 60),
    last_updated: at(1 / 60),
  }) as HassEntity;

const STATES = [
  state('binary_sensor.front_door', 'off', { device_class: 'door' }),
  state('binary_sensor.garage_door', 'off', {
    device_class: 'garage_door',
    real_last_changed: Date.parse(at(6)) / 1000,
  }),
  state('binary_sensor.kitchen_window', 'on', { device_class: 'window' }),
  state('binary_sensor.shed', 'off', { device_class: 'door' }),
  state('sensor.front_door_real_last_changed', at(4), { device_class: 'timestamp' }),
  state('sensor.kitchen_window_real_last_changed', at(30), { device_class: 'timestamp' }),
  state('sensor.shed_real_last_changed', 'unknown', { device_class: 'timestamp' }),
  state('sensor.when', at(26), { device_class: 'timestamp' }),
  state('sensor.power', '12', { device_class: 'power', unit_of_measurement: 'W' }),
  // #105's covers: curtains open, one a third open by its position, one shut; a garage door shut
  state('cover.bank', 'open', { device_class: 'curtain', current_position: 100 }),
  state('cover.schuifpui', 'opening', { device_class: 'curtain' }),
  state('cover.kantoor', 'closed', { device_class: 'blind', current_position: 30 }),
  state('cover.slaapkamer', 'closed', { device_class: 'curtain', current_position: 0 }),
  state('cover.screen', 'closed', {}),
  state('cover.garage', 'closed', { device_class: 'garage', current_position: 0 }),
];

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  config: { time_zone: 'UTC' },
  states: Object.fromEntries(STATES.map((s) => [s.entity_id, s])),
  entities: {},
  devices: {},
  areas: {},
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
} as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
  headFit: { ruler: unknown };
  watched(): readonly string[];
};

/** The card drawn at 360 on a stub ruler (8 px a glyph): the layout happy-dom has none of. */
async function draw(config: Record<string, unknown>): Promise<CardElement> {
  const card = document.createElement('fluvy-openings-card') as CardElement;
  Object.assign(card.headFit, {
    ruler: {
      width: (_cls: string, text: string) => text.length * 8,
      pill: (_cls: string, text: string, sides: number) => text.length * 8 + sides,
      clear() {},
    },
  });
  card.setConfig({ type: 'custom:fluvy-openings-card', _now: NOW.toISOString(), ...config });
  card.hass = hass;
  card.width = 360;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

/** Each row's line under its name. */
const lines = (card: CardElement): string[] =>
  [...card.shadowRoot!.querySelectorAll('.am-rows .fv-row')].map(
    (row) => row.querySelector('.fv-row__sub')?.textContent?.trim() ?? '',
  );

afterEach(() => {
  document.body.replaceChildren();
});

describe('the openings card’s real last change (#67)', () => {
  it('reads a row’s time from its since — a timestamp sensor — where Home Assistant’s own is a restart’s', async () => {
    const card = await draw({
      rows: [
        { entity: 'binary_sensor.front_door', since: 'sensor.front_door_real_last_changed' },
        'binary_sensor.kitchen_window',
      ],
    });
    const [door, window] = lines(card);
    expect(door).toMatch(/4 h/);
    expect(window).toMatch(/1 min/);
  });

  it('reads an attribute of the row’s own entity (attribute:name), an epoch in seconds', async () => {
    const card = await draw({
      rows: [{ entity: 'binary_sensor.garage_door', since: 'attribute:real_last_changed' }],
    });
    expect(lines(card)[0]).toMatch(/6 h/);
  });

  it('falls back to Home Assistant’s own where the since does not read', async () => {
    const card = await draw({
      rows: [
        { entity: 'binary_sensor.shed', since: 'sensor.shed_real_last_changed' },
        { entity: 'binary_sensor.front_door', since: 'sensor.missing' },
        { entity: 'binary_sensor.front_door', since: 'attribute:missing' },
      ],
    });
    for (const line of lines(card)) expect(line).toMatch(/1 min/);
  });

  it('derives a since for every row from the card’s pattern; a row’s own wins; none by default', async () => {
    const patterned = await draw({
      since_pattern: 'sensor.{id}_real_last_changed',
      rows: [
        'binary_sensor.front_door',
        { entity: 'binary_sensor.kitchen_window', since: 'sensor.when' },
        'binary_sensor.shed',
      ],
    });
    const [door, window, shed] = lines(patterned);
    expect(door).toMatch(/4 h/);
    expect(window).toMatch(/1 d/); // open for 26 hours: a duration
    expect(shed).toMatch(/1 min/); // its helper says unknown
    const plain = await draw({ rows: ['binary_sensor.front_door'] });
    expect(lines(plain)[0]).toMatch(/1 min/);
  });

  it('watches the sensors the rows read — their own, the pattern’s — never an attribute', async () => {
    const card = await draw({
      since_pattern: 'sensor.{id}_real_last_changed',
      rows: [
        'binary_sensor.front_door',
        { entity: 'binary_sensor.kitchen_window', since: 'sensor.when' },
        { entity: 'binary_sensor.garage_door', since: 'attribute:real_last_changed' },
      ],
    });
    expect(card.watched()).toEqual([
      'binary_sensor.front_door',
      'binary_sensor.kitchen_window',
      'binary_sensor.garage_door',
      'sensor.front_door_real_last_changed',
      'sensor.when',
    ]);
  });

  describe('its editor', () => {
    it('offers a row’s since among the house’s timestamp sensors, any other typed', () => {
      const list = openingsEditor.lists[0]!;
      const since = list.schema.find((item) => item.name === 'since');
      expect(list.keys).toContain('since');
      expect(since?.selector?.['select']).toMatchObject({ custom_value: true, options: [] });
      expect(since?.helper).toBe('editor.since_help');
      const choices = openingsEditor.choices({ type: 'custom:fluvy-openings-card' }, hass);
      expect(choices['since']?.map((option) => option.value)).toEqual([
        'sensor.front_door_real_last_changed',
        'sensor.kitchen_window_real_last_changed',
        'sensor.shed_real_last_changed',
        'sensor.when',
      ]);
      expect(choices['since']?.[0]?.label).toBe('front door real last changed');
    });

    it('offers the pattern while the rows say their times: not compact, not with the times off', async () => {
      const shown = async (config: Record<string, unknown>): Promise<string[]> => {
        const editor = await FluvyOpeningsCard.getConfigElement();
        return shownNames(
          cardForm(
            await drawEditor(editor, {
              type: 'custom:fluvy-openings-card',
              ...config,
            } as LovelaceCardConfig),
          ).schema,
        );
      };
      expect(await shown({})).toContain('since_pattern');
      expect(await shown({ variant: 'tiles' })).toContain('since_pattern');
      expect(await shown({ variant: 'compact' })).not.toContain('since_pattern');
      expect(await shown({ show_time: false })).not.toContain('since_pattern');
    });
  });
});

describe('the openings card’s covers (#105)', () => {
  /** The head's badge, and each row's circle tone and value. */
  const read = (card: CardElement) => ({
    badge: card.shadowRoot!.querySelector('.fv-card__head .fv-badge')?.textContent?.trim(),
    rows: [...card.shadowRoot!.querySelectorAll('.am-rows .fv-row')].map((row) => [
      row.querySelector('.fv-ico')?.className.match(/fv-ico--(\w+)/)?.[1],
      row.querySelector('.fv-row__value')?.textContent?.trim(),
    ]),
  });

  it('counts an open cover of any class in the head and lights it, as a window: open, opening, partly open', async () => {
    const card = await draw({
      rows: ['cover.bank', 'cover.schuifpui', 'cover.kantoor', 'cover.slaapkamer', 'cover.screen'],
      max_rows: 5,
    });
    expect(read(card)).toEqual({
      badge: '3 open',
      rows: [
        ['warning', 'Open'],
        ['warning', 'Open'],
        ['warning', 'Open'],
        ['neutral', 'Closed'],
        ['neutral', 'Closed'],
      ],
    });
  });

  it('reads a garage door as it did, and says all clear while every cover is shut', async () => {
    const card = await draw({ rows: ['cover.garage', 'cover.slaapkamer'] });
    expect(read(card)).toEqual({
      badge: 'All clear',
      rows: [
        ['neutral', 'Closed'],
        ['neutral', 'Closed'],
      ],
    });
  });
});
