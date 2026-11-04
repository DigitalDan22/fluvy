// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import '../vehicle/english.js';
import { vehicleHeight } from '../vehicle-family.js';
import { carHouse, KIA, RENAULT, TESLA } from './fixtures.js';
import { carControls, FluvyVehicleCard } from './vehicle-card.js';
import { vehicleEntities } from './roles.js';

if (!customElements.get('fluvy-vehicle-card'))
  customElements.define('fluvy-vehicle-card', FluvyVehicleCard);

const NOW = '2026-11-04T11:47:12Z';
type Mounted = FluvyVehicleCard & { updateComplete: Promise<boolean> };
type Calls = Array<{ domain: string; service: string; target: unknown }>;

/** The house, its calls recorded, with some states changed. */
function house(
  changes: Record<string, Partial<HassEntity>> = {},
): HomeAssistant & { calls: Calls } {
  const base = carHouse();
  const calls: Calls = [];
  const states = { ...base.states };
  for (const [id, change] of Object.entries(changes))
    states[id] = { ...(states[id] as HassEntity), ...change } as HassEntity;
  return {
    ...base,
    states,
    calls,
    callService: async (domain: string, service: string, _data: unknown, target: unknown) => {
      calls.push({ domain, service, target });
    },
  } as unknown as HomeAssistant & { calls: Calls };
}

async function mount(
  config: Record<string, unknown>,
  hass: HomeAssistant = house(),
  width = 360,
): Promise<Mounted> {
  const card = document.createElement('fluvy-vehicle-card') as Mounted;
  card.setConfig({ type: 'custom:fluvy-vehicle-card', _now: NOW, ...config } as LovelaceCardConfig);
  card.hass = hass;
  (card as unknown as { width: number }).width = width;
  document.body.append(card);
  await card.updateComplete;
  await card.updateComplete;
  return card;
}

const root = (card: Mounted): ShadowRoot => card.shadowRoot as ShadowRoot;
const text = (el: Element | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const words = (card: Mounted): string[] =>
  [...root(card).querySelectorAll('.vh-control__word')].map((el) => text(el));
const labels = (card: Mounted): string[] =>
  [...root(card).querySelectorAll('.vh-control')].map((el) => el.getAttribute('aria-label') ?? '');
/** The card's parts, in order: its anatomy, whatever it says. */
const sections = (card: Mounted): string[] =>
  [...(root(card).querySelector('article')?.children ?? [])].map(
    (el) =>
      `${el.tagName.toLowerCase()}.${[...el.classList]
        .filter((c) => !/^is-|^fv-tone--/.test(c))
        .sort()
        .join('.')}`,
  );
/** Every entity of a car out of reach. */
const away = (car: typeof TESLA): Record<string, Partial<HassEntity>> =>
  Object.fromEntries(car.seeds.map(([id]) => [id, { state: 'unavailable' }]));

afterEach(() => document.body.replaceChildren());

describe('the vehicle card', () => {
  it('draws a Tesla charging: its charge, range and limit, when it is done, what it does', async () => {
    const card = await mount({ device: TESLA.device });
    const r = root(card);
    expect(text(r.querySelector('.fv-badge'))).toBe('Charging · 7.2 kW');
    expect(text(r.querySelector('.ef-top'))).toContain('64');
    expect(text(r.querySelector('.ef-top__side'))).toBe('Range 320km');
    expect(text(r.querySelector('.en-mark-label.is-mark'))).toBe('Limit');
    // at 11:47 the charge ends at 13:12: "80 % at 13:12 · 1 h 25 min left · +46 km/h"
    expect(text(r.querySelector('.vh-line'))).toBe('80 % at 13:12 · 1 h 25 min left · +46 km/h');
    expect(words(card).slice(0, 3)).toEqual(['Locked', 'Off', 'Charging']);
    expect(text(r.querySelector('.vh-rows'))).toContain('Home');
    expect(text(r.querySelector('.vh-rows'))).toContain('24,318 km');
  });

  it('never lays a cell under 56, and wraps the card’s own list into even rows', async () => {
    // the words are the browser's to measure (`interactions-vehicle.mjs`); here the cells' floor alone decides: a 300
    // card's 260 holds four cells of 65 (five would be 52), the car's own in their order, the rest giving way
    const narrow = await mount({ device: TESLA.device }, house(), 300);
    expect(labels(narrow).map((label) => label.split(' · ')[0])).toEqual([
      'Lock',
      'Climate',
      'Charging',
      'Boot',
    ]);
    // seven of the card's own at 300: two rows of four and three, never a lone one on a row
    const listed = await mount(
      {
        device: TESLA.device,
        controls: ['lock', 'climate', 'trunk', 'frunk', 'windows', 'sentry', 'doors'],
      },
      house(),
      300,
    );
    expect(root(listed).querySelectorAll('.vh-control')).toHaveLength(7);
    expect(
      (root(listed).querySelector('.vh-controls') as HTMLElement).style.getPropertyValue(
        '--vh-cols',
      ),
    ).toBe('4');
  });

  it('says an opening’s name while it is shut, “Open” in the warning’s ink while it is not', async () => {
    const shut = await mount({ device: TESLA.device, controls: ['trunk'] });
    expect(words(shut)).toEqual(['Boot']);
    document.body.replaceChildren();
    const open = await mount(
      { device: TESLA.device, controls: ['trunk'] },
      house({ 'cover.model_y_trunk': { state: 'open' } }),
    );
    expect(words(open)).toEqual(['Open']);
    expect(root(open).querySelector('.vh-control__word.is-warning')).not.toBeNull();
  });

  it('asks before it unlocks, opens the boot or stops a charge; locks at once', async () => {
    const asked: unknown[] = [];
    const listen = (event: Event) => asked.push((event as CustomEvent).detail.config.tap_action);
    document.body.addEventListener('hass-action', listen);
    try {
      const hass = house();
      const card = await mount(
        { device: TESLA.device, controls: ['lock', 'trunk', 'charging'] },
        hass,
      );
      for (const button of root(card).querySelectorAll<HTMLButtonElement>('.vh-control'))
        button.click();
      expect(asked).toEqual([
        expect.objectContaining({
          perform_action: 'lock.unlock',
          confirmation: { text: 'Unlock the car?' },
        }),
        expect.objectContaining({
          perform_action: 'cover.open_cover',
          confirmation: { text: 'Open the boot?' },
        }),
        expect.objectContaining({
          perform_action: 'switch.turn_off',
          confirmation: { text: 'Stop charging?' },
        }),
      ]);
      expect(hass.calls).toEqual([]);
      document.body.replaceChildren();
      const kia = house();
      const unlocked = await mount({ device: KIA.device, controls: ['lock'] }, kia);
      root(unlocked).querySelector<HTMLButtonElement>('.vh-control')?.click();
      expect(kia.calls).toEqual([
        { domain: 'lock', service: 'lock', target: { entity_id: 'lock.ev6_door_lock' } },
      ]);
    } finally {
      document.body.removeEventListener('hass-action', listen);
    }
  });

  it('asks where the card says so, and never where it says not to', async () => {
    const asked: unknown[] = [];
    const listen = (event: Event) => asked.push((event as CustomEvent).detail.config.tap_action);
    document.body.addEventListener('hass-action', listen);
    try {
      const hass = house();
      const card = await mount(
        {
          device: TESLA.device,
          controls: [
            { control: 'climate', confirm: true },
            { control: 'lock', confirm: false },
          ],
        },
        hass,
      );
      for (const button of root(card).querySelectorAll<HTMLButtonElement>('.vh-control'))
        button.click();
      expect(asked).toEqual([
        expect.objectContaining({ perform_action: 'climate.turn_on', confirmation: true }),
      ]);
      expect(hass.calls).toEqual([
        { domain: 'lock', service: 'unlock', target: { entity_id: 'lock.model_y_lock' } },
      ]);
    } finally {
      document.body.removeEventListener('hass-action', listen);
    }
  });

  it('keeps the charging round still while the cable is out, and says why', async () => {
    const card = await mount(
      { device: TESLA.device, controls: ['charging'] },
      house({
        'sensor.model_y_charging': { state: 'disconnected' },
        'binary_sensor.model_y_charge_cable': { state: 'off' },
        'switch.model_y_charge': { state: 'off' },
        'sensor.model_y_charger_power': { state: '0' },
      }),
    );
    const round = root(card).querySelector('.vh-control');
    expect(round?.getAttribute('aria-disabled')).toBe('true');
    expect(round?.getAttribute('title')).toBe('Charging · Unplugged · Not plugged in');
    expect(text(root(card).querySelector('.vh-line'))).toBe('Unplugged · Limit 80 %');
  });

  it('says a window left open, a car that has not reported for a while, its address away from home', async () => {
    const card = await mount({ device: KIA.device });
    const r = root(card);
    expect(text(r.querySelector('.vh-line'))).toBe('Window open');
    expect(text(r.querySelector('.fv-card__sub'))).toBe('Updated 2 h ago');
    document.body.replaceChildren();
    const out = await mount(
      { device: KIA.device },
      house({ 'device_tracker.ev6_location': { state: 'not_home' } }),
    );
    expect(text(root(out).querySelector('.fv-card__sub'))).toBe(
      'Carrer de Mallorca 401 · Updated 2 h ago',
    );
  });

  it('says a cold cabin while the climate is off, and its temperature under the climate’s round', async () => {
    const card = await mount(
      { device: TESLA.device },
      house({
        'sensor.model_y_inside_temperature': { state: '2' },
        'sensor.model_y_charging': { state: 'disconnected' },
        'binary_sensor.model_y_charge_cable': { state: 'off' },
        'sensor.model_y_charger_power': { state: '0' },
      }),
    );
    expect(text(root(card).querySelector('.vh-line'))).toBe('Cold inside · 2 °C');
    expect(words(card)[1]).toBe('2 °C');
  });

  it('reads Renault’s planned charge and its lock from its sensor (off: locked)', async () => {
    const card = await mount({ device: RENAULT.device });
    expect(text(root(card).querySelector('.fv-badge'))).toBe('Plugged in');
    expect(text(root(card).querySelector('.vh-line'))).toBe('Waiting to charge');
    expect(words(card)[0]).toBe('Locked');
  });

  it('keeps its anatomy out of reach: every part in its place, its controls still, its values dashes (1.9)', async () => {
    const live = await mount({ device: TESLA.device, show_tyres: true });
    const anatomy = sections(live);
    document.body.replaceChildren();
    const gone = await mount({ device: TESLA.device, show_tyres: true }, house(away(TESLA)));
    expect(sections(gone)).toEqual(anatomy);
    expect(text(root(gone).querySelector('.fv-badge'))).toBe('Unavailable');
    expect(new Set(words(gone))).toEqual(new Set(['—']));
    for (const round of root(gone).querySelectorAll('.vh-control'))
      expect(round.hasAttribute('disabled')).toBe(true);
  });

  it('declares its height from its config alone, as its family does', () => {
    const at = (config: Record<string, unknown>) =>
      FluvyVehicleCard.layoutHeight({ type: 'x', ...config } as LovelaceCardConfig);
    expect(at({})).toBe(vehicleHeight({ type: 'x' }));
    expect(at({})).toBe(100 + 140 + 28 + 80 + 16 + 96);
    expect(at({ hero: 'ring' })).toBe(100 + 208 + 28 + 80 + 16 + 96);
    expect(at({ image: '/local/car.png' })).toBe(at({}) + 176);
    expect(at({ image: '/local/car.png', image_position: 'head' })).toBe(at({}));
    expect(at({ show_tyres: true, show_rows: false })).toBe(100 + 140 + 28 + 80 + 112);
    expect(at({ controls: ['lock', 'climate', 'charging', 'trunk', 'frunk', 'windows'] })).toBe(
      at({}) + 64 + 12,
    );
    expect(at({ variant: 'compact' })).toBe(100 + 20 + 28 + 60);
    expect(at({ variant: 'compact', show_status: false })).toBe(100 + 20 + 60);
    expect(at({ show_status: false, show_rows: false })).toBe(100 + 140 + 80);
    expect(at({ variant: 'mini' })).toBe(76);
  });

  it('reads its picture as every card reads one, and draws the car’s glyph where it would not load', async () => {
    const card = await mount({ device: TESLA.device, image: '/local/car.png' });
    const img = root(card).querySelector<HTMLImageElement>('.vh-picture img');
    expect(img?.getAttribute('src')).toBe('http://ha.local/local/car.png');
    img?.dispatchEvent(new Event('error'));
    await card.updateComplete;
    const plate = root(card).querySelector('.vh-picture');
    expect(plate?.classList.contains('is-empty')).toBe(true);
    expect(plate?.querySelector('img')).toBeNull();
    expect(plate?.querySelector('svg')).not.toBeNull();
  });

  it('draws its picture in the head, and a car glyph where none can be shown', async () => {
    const card = await mount({
      device: TESLA.device,
      image: 'javascript:alert(1)',
      image_position: 'head',
    });
    const face = root(card).querySelector('.vh-face');
    expect(face?.classList.contains('is-empty')).toBe(true);
    expect(face?.querySelector('img')).toBeNull();
  });

  it('offers the controls the car has, in their order, where the card names none', () => {
    expect(carControls(vehicleEntities(carHouse(), TESLA.device))).toEqual([
      'lock',
      'climate',
      'charging',
      'trunk',
      'windows',
      'frunk',
      'sentry',
    ]);
    expect(carControls(vehicleEntities(carHouse(), RENAULT.device))).toEqual([
      'lock',
      'climate',
      'charging',
      'trunk',
    ]);
  });

  it('draws the strip and the compact card from the same car', async () => {
    const mini = await mount({ device: TESLA.device, variant: 'mini' });
    expect(text(root(mini).querySelector('.fv-row__sub'))).toBe(
      '64 % · 320 km · Charging · 7.2 kW · Home',
    );
    document.body.replaceChildren();
    const compact = await mount({ device: TESLA.device, variant: 'compact' });
    expect(text(root(compact).querySelector('.fv-card__sub'))).toBe('320 km · Home');
    expect(text(root(compact).querySelector('.vh-bar__value'))).toBe('64 %');
    expect(root(compact).querySelector('.vh-control__word')).toBeNull();
  });

  it('says it has found no car, rather than draw an empty one', async () => {
    const card = await mount({ device: 'd-washer' });
    expect(root(card).querySelector('.fv-card--empty')).not.toBeNull();
  });
});
