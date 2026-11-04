// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { familiesDefined } from '../index.js';

// the devices family lands with the index: the cards' tags are defined before a page needs them
await familiesDefined;

/*
 * The rows a device card ends in (`RowsCard`): the camera's as history — a chevron, the time of day unless the row asks
 * for another line (#57), a tone or a colour of the row's own on its circle — and the lock's and the alarm's as they
 * always were. A row with no tap of its own opens its entity's details, whatever the card's tap says.
 */

/** Five minutes ago: a time of day for history, an age for the lock's rows. */
const CHANGED = new Date(Date.now() - 5 * 60_000).toISOString();
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}) =>
  ({
    entity_id,
    state: value,
    attributes: { friendly_name: entity_id.split('.')[1]!.replace(/_/g, ' '), ...attributes },
    last_changed: CHANGED,
    last_updated: CHANGED,
  }) as HassEntity;

const STATES = [
  state('camera.driveway', 'idle', { entity_picture: '/api/camera_proxy/camera.driveway' }),
  state('cover.driveway_gate', 'closed', { device_class: 'gate', battery_level: 81 }),
  state('binary_sensor.person', 'on', { device_class: 'motion' }),
  state('lock.front_door', 'locked'),
  state('binary_sensor.front_door', 'off', { device_class: 'door' }),
  state('switch.auto_lock', 'on'),
  state('input_select.auto_lock_after', '2 minutes', {
    options: ['Off', '30 seconds', '1 minute', '2 minutes', '5 minutes', '10 minutes', '1 hour'],
  }),
  state('select.night_vision', 'auto', { options: ['auto', 'on', 'off'] }),
  state('select.lock_mode', 'unavailable', { options: ['normal', 'vacation', 'privacy'] }),
];

const callService = vi.fn(() => Promise.resolve());

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  config: { time_zone: 'UTC', unit_system: { temperature: '°C', length: 'km' } },
  states: Object.fromEntries(STATES.map((s) => [s.entity_id, s])),
  entities: { 'cover.driveway_gate': { entity_id: 'cover.driveway_gate', area_id: 'drive' } },
  devices: {},
  areas: { drive: { area_id: 'drive', name: 'Driveway' } },
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
  callService,
  hassUrl: (path: string) => path,
  callWS: () => new Promise(() => undefined),
  connection: { subscribeMessage: () => Promise.resolve(() => undefined) },
} as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
  headFit: { ruler: unknown };
};

/** A card drawn at 360 on a stub ruler (8 px a glyph): the layout happy-dom has none of. */
async function draw(tag: string, config: Record<string, unknown>) {
  const card = document.createElement(tag) as CardElement;
  Object.assign(card.headFit, {
    ruler: {
      width: (_cls: string, text: string) => text.length * 8,
      pill: (_cls: string, text: string, sides: number) => text.length * 8 + sides,
      clear() {},
    },
  });
  card.setConfig({ type: `custom:${tag}`, ...config });
  card.hass = hass;
  card.width = 360;
  document.body.append(card);
  await card.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await card.updateComplete;
  return card;
}

/** Each row as it reads: its line, its circle's tone, what ends it. */
const rows = (card: CardElement) =>
  [...card.shadowRoot!.querySelectorAll('.dv-rows .fv-row')].map((row) => ({
    sub: row.querySelector('.fv-row__sub')?.textContent?.trim() ?? '',
    tone: /fv-ico--(\w+)/.exec(row.querySelector('.fv-ico')?.className ?? '')?.[1] ?? '',
    accent: row.getAttribute('data-accent'),
    end: row.querySelector('.fv-row__chevron')
      ? 'chevron'
      : row.querySelector('.fv-switch, [role="switch"]')
        ? 'switch'
        : row.querySelector('.fv-row__value')
          ? 'value'
          : '',
  }));

const camera = (row: Record<string, unknown>, card: Record<string, unknown> = {}) =>
  draw('fluvy-camera-card', {
    entity: 'camera.driveway',
    rows: [{ entity: 'cover.driveway_gate', ...row }],
    ...card,
  });

afterEach(() => document.body.replaceChildren());

describe('a camera’s rows (history)', () => {
  it('say the time of day by default, and the line asked for otherwise (#57)', async () => {
    const [time] = rows(await camera({}));
    expect(time?.sub).toMatch(/^\d\d:\d\d$/);
    const line = async (secondary: string) => rows(await camera({ secondary }))[0]?.sub;
    expect(await line('state')).toBe('Closed');
    expect(await line('area')).toBe('Driveway');
    expect(await line('battery_level')).toBe('81');
    expect(await line('last-changed')).toBe(time?.sub);
    expect(await line('none')).toBe('');
    // a template is rendered by Home Assistant: a blank line until it answers, never the template itself
    expect(await line("{{ states('cover.driveway_gate') }}")).toBe('');
  });

  it('end in a chevron, the circle neutral unless the row names a tone or a colour of its own', async () => {
    expect(rows(await camera({}))[0]).toMatchObject({ tone: 'neutral', end: 'chevron' });
    expect(rows(await camera({ tone: 'warning' }))[0]).toMatchObject({
      tone: 'warning',
      end: 'chevron',
    });
    const coloured = rows(await camera({ color: '#3a86ff' }))[0];
    expect(coloured?.tone).toBe('accent');
    expect(coloured?.accent).toBeTruthy();
  });

  it('open their entity’s details, whatever the card’s tap', async () => {
    const card = await camera({}, { tap_action: { action: 'navigate', navigation_path: '/x' } });
    const opened: string[] = [];
    card.addEventListener('hass-more-info', (event) =>
      opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId),
    );
    const path = location.pathname;
    card.shadowRoot!.querySelector<HTMLElement>('.dv-rows .fv-row')!.click();
    expect(opened).toEqual(['cover.driveway_gate']);
    expect(location.pathname).toBe(path);
  });
});

describe('a lock’s rows', () => {
  it('read as they always have: an age, a switch or a value, the tone while on', async () => {
    const card = await draw('fluvy-lock-card', {
      entity: 'lock.front_door',
      rows: ['switch.auto_lock', 'binary_sensor.front_door', 'binary_sensor.person'],
    });
    expect(rows(card)).toEqual([
      { sub: '5 min ago', tone: 'accent', accent: null, end: 'switch' },
      { sub: '5 min ago', tone: 'neutral', accent: null, end: 'value' },
      { sub: '5 min ago', tone: 'accent', accent: null, end: 'value' },
    ]);
  });
});

/* #96: a select's row ends in its value, which opens Fluvy's dropdown, on a lock, an alarm and a camera alike. */
describe('a select’s row on a device card', () => {
  const ends = (card: CardElement) =>
    [...card.shadowRoot!.querySelectorAll('.dv-rows .fv-row')].map((row) => ({
      value: row.querySelector('.in-value')?.textContent?.trim(),
      disabled: row.querySelector<HTMLButtonElement>('.in-value')?.disabled,
      menu: row.querySelector('.in-value + fluvy-select[anchored]') !== null,
      tap: row.getAttribute('role') === 'button',
    }));

  it('opens the dropdown from its value and chooses with select_option, out of reach a "—" that does nothing beside a row that opens its details', async () => {
    callService.mockClear();
    const card = await draw('fluvy-lock-card', {
      entity: 'lock.front_door',
      rows: [
        { entity: 'input_select.auto_lock_after', labels: { '2 minutes': '2 min' } },
        'select.lock_mode',
      ],
    });
    expect(ends(card)).toEqual([
      { value: '2 min', disabled: false, menu: true, tap: false },
      { value: '—', disabled: true, menu: true, tap: true },
    ]);
    card
      .shadowRoot!.querySelector('fluvy-select')!
      .dispatchEvent(new CustomEvent('fluvy-change', { detail: { value: '5 minutes' } }));
    expect(callService.mock.calls).toEqual([
      [
        'input_select',
        'select_option',
        { option: '5 minutes' },
        { entity_id: 'input_select.auto_lock_after' },
      ],
    ]);
    await card.updateComplete;
    expect(ends(card)[0]?.value).toBe('5 minutes');
  });

  it('keeps a tap of its own, and draws its dropdown on a camera’s rows too', async () => {
    const lock = await draw('fluvy-lock-card', {
      entity: 'lock.front_door',
      rows: [{ entity: 'select.night_vision', tap_action: { action: 'more-info' } }],
    });
    expect(ends(lock)).toEqual([{ value: undefined, disabled: undefined, menu: false, tap: true }]);
    expect(rows(lock)[0]?.end).toBe('value');
    const camera = await draw('fluvy-camera-card', {
      entity: 'camera.driveway',
      rows: ['select.night_vision'],
    });
    expect(ends(camera)).toEqual([{ value: 'auto', disabled: false, menu: true, tap: false }]);
  });
});
