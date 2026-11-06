// @vitest-environment happy-dom
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { setCardDefaults, type HomeAssistant } from '@fluvy/core';
import { familiesDefined } from '../index.js';

// the index fetches the media and energy families: they land before this file's page goes
afterAll(() => familiesDefined);

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  states: {
    'switch.kitchen': {
      entity_id: 'switch.kitchen',
      state: 'off',
      attributes: { friendly_name: 'Kitchen' },
      last_changed: '',
      last_updated: '',
    },
    'switch.porch': {
      entity_id: 'switch.porch',
      state: 'on',
      attributes: { friendly_name: 'Porch' },
      last_changed: '',
      last_updated: '',
    },
  },
  entities: {},
  devices: {},
  areas: {},
  localize: (key: string) => key,
  formatEntityState: (s: { state: string }) => s.state,
} as unknown as HomeAssistant;

async function group(config: Record<string, unknown>) {
  const card = document.createElement('fluvy-tiles-card') as HTMLElement & {
    setConfig(config: unknown): void;
    hass: HomeAssistant;
    updateComplete: Promise<boolean>;
    getCardSize(): number;
  };
  card.setConfig({
    type: 'custom:fluvy-tiles-card',
    entities: ['switch.kitchen', 'switch.porch'],
    ...config,
  });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

describe('a group of tiles', () => {
  afterEach(() => document.body.replaceChildren());

  it('stays compact by default: one row each, the tile itself the button', async () => {
    const card = await group({});
    const tiles = card.shadowRoot!.querySelectorAll('.fv-tile');
    expect(tiles.length).toBe(2);
    expect(tiles[0]!.classList.contains('fv-tile--compact')).toBe(true);
    expect(card.getCardSize()).toBe(1);
  });

  it('draws large tiles when asked: icon circle and a switch of their own, as a lone large tile', async () => {
    const card = await group({ size: 'large' });
    const root = card.shadowRoot!;
    expect(root.querySelector('.fv-tiles--large')).not.toBeNull();
    expect(root.querySelector('.fv-tile--compact')).toBeNull();
    expect(root.querySelectorAll('.fv-tile .fv-ico').length).toBe(2);
    expect(card.getCardSize()).toBe(3);
  });

  it('lays out fewer mini columns than asked while the group cannot hold 84 px tiles', async () => {
    const card = await group({
      size: 'mini',
      columns: 4,
      entities: ['switch.kitchen', 'switch.porch', 'switch.kitchen', 'switch.porch'],
    });
    const sized = card as unknown as { width: number };
    const grid = (): string => card.shadowRoot!.querySelector('.fv-tiles')!.className;
    sized.width = 360;
    await card.updateComplete;
    expect(grid()).toContain('fv-tiles--3');
    sized.width = 412;
    await card.updateComplete;
    expect(grid()).toContain('fv-tiles--4');
  });
});

/*
 * A tile out of reach (#126): dashed, as before, the house's until it says otherwise; quiet, the same anatomy as it rests
 * — its own glyph, its words and its dashes, its switch still — marked for the quiet sheet, the group's or its own.
 */
describe('a tile out of reach', () => {
  const away = {
    ...hass,
    states: {
      ...hass.states,
      'switch.printer': {
        entity_id: 'switch.printer',
        state: 'unavailable',
        attributes: { friendly_name: '3D printer' },
        last_changed: '',
        last_updated: '',
      },
    },
  } as unknown as HomeAssistant;
  /** The ban glyph, by its stroke. */
  const BAN = 'path[d="m6.5 6.5 11 11"]';
  async function tiles(config: Record<string, unknown>) {
    const card = await group({ entities: undefined, ...config });
    card.hass = away;
    await card.updateComplete;
    return [...card.shadowRoot!.querySelectorAll<HTMLElement>('.fv-tile')];
  }
  const printer = (all: HTMLElement[]): HTMLElement => all.at(-1)!;

  afterEach(() => {
    setCardDefaults({ opacity: 100, blur: true, unavailable: 'dashed' });
    document.body.replaceChildren();
  });

  it('is dashed by default, as before: its classes, the ban glyph, its words, no mark', async () => {
    for (const size of ['large', 'compact'] as const) {
      const tile = printer(await tiles({ size, tiles: ['switch.kitchen', 'switch.printer'] }));
      expect(tile.className).toBe(
        size === 'large'
          ? 'fv-tile fv-tile--off fv-tile--tap fv-tile--footless'
          : 'fv-tile fv-tile--off fv-tile--tap fv-tile--compact',
      );
      expect(tile.querySelector('.fv-ico')!.className).toBe('fv-ico fv-ico--off');
      expect(tile.querySelector(BAN)).not.toBeNull();
      expect(tile.querySelector('.fv-tile__state')!.textContent!.trim()).toMatch(/^Unavailable/);
      expect(tile.hasAttribute('data-unavailable')).toBe(false);
    }
  });

  it('is quiet where the group says so: its anatomy, its own glyph in its resting circle, its switch still', async () => {
    const tile = printer(
      await tiles({
        size: 'large',
        unavailable: 'quiet',
        tiles: ['switch.kitchen', 'switch.printer'],
      }),
    );
    expect(tile.getAttribute('data-unavailable')).toBe('quiet');
    expect(tile.className).toBe('fv-tile fv-tile--off fv-tile--tap fv-tile--footless');
    expect(tile.querySelector(BAN)).toBeNull();
    expect(tile.querySelector('.fv-ico')!.className).toBe('fv-ico fv-ico--accent');
    expect(tile.querySelector('.fv-tile__state')!.textContent!.trim()).toMatch(/^Unavailable/);
    expect(tile.querySelector('.fv-switch')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('takes a tile’s own word over its group’s, and the house’s where neither says one', async () => {
    const own = await tiles({
      unavailable: 'quiet',
      tiles: ['switch.kitchen', { entity: 'switch.printer', unavailable: 'dashed' }],
    });
    expect(own.map((tile) => tile.getAttribute('data-unavailable'))).toEqual(['quiet', null]);
    expect(printer(own).querySelector(BAN)).not.toBeNull();
    setCardDefaults({ opacity: 100, blur: true, unavailable: 'quiet' });
    const house = await tiles({
      tiles: ['switch.kitchen', { entity: 'switch.printer', unavailable: 'dashed' }],
    });
    expect(house.map((tile) => tile.getAttribute('data-unavailable'))).toEqual(['quiet', null]);
  });
});
