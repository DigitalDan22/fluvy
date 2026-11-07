// @vitest-environment happy-dom
import {
  setLightDefaults,
  type HaFormSchemaItem,
  type HomeAssistant,
  type LovelaceCardConfig,
} from '@fluvy/core';
import { baseStyles, setFallbackTokens } from '@fluvy/ui';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';
import { cardForm, drawEditor, shownNames } from '../shared/fixtures/editor.js';
import { FluvyEntitiesCard } from '../entities/entities-card.js';
import { FluvyTileCard } from '../tile/tile-card.js';
import { FluvyTilesCard } from '../tiles/tiles-card.js';
import { FluvyLightCard } from './light-card.js';
import * as lightEditor from './light-editor.js';

// the index fetches the lazy families: they land before this file's page goes
afterAll(() => familiesDefined);

/**
 * #41: a lit light shows its colour. The light card's surface (`tint`, `tint_strength`) and what decides its colour
 * (its own, a tone, the bulb's, a group's, the one it last glowed); tiles, rows and rooms in their bulbs' colours
 * (`light_colors`); the house's defaults for both, repainting a mounted card.
 */

const STAMP = '2026-09-17T19:00:00+00:00';
const state = (id: string, value: string, attributes: Record<string, unknown> = {}) => ({
  entity_id: id,
  state: value,
  attributes,
  last_changed: STAMP,
  last_updated: STAMP,
});
const BULB = { supported_color_modes: ['hs', 'color_temp'] };
const STATES = {
  'light.lamp': state('light.lamp', 'on', {
    friendly_name: 'Lamp',
    brightness: 200,
    color_mode: 'hs',
    hs_color: [36, 100],
    rgb_color: [255, 152, 0],
    ...BULB,
  }),
  'light.dim': state('light.dim', 'on', {
    friendly_name: 'Night lamp',
    brightness: 26,
    color_mode: 'hs',
    rgb_color: [255, 152, 0],
    ...BULB,
  }),
  'light.white': state('light.white', 'on', {
    friendly_name: 'Desk lamp',
    brightness: 204,
    color_mode: 'color_temp',
    color_temp_kelvin: 2700,
    rgb_color: [255, 167, 87],
    ...BULB,
  }),
  'light.reading': state('light.reading', 'off', {
    friendly_name: 'Reading',
    supported_color_modes: ['brightness'],
  }),
  'light.porch': state('light.porch', 'unavailable', {
    friendly_name: 'Porch',
    supported_color_modes: ['brightness'],
  }),
  'light.group': state('light.group', 'on', {
    friendly_name: 'Living room',
    brightness: 200,
    // Home Assistant's own: the most common mode among the members, and the plain mean of their colours
    color_mode: 'color_temp',
    rgb_color: [255, 160, 44],
    entity_id: ['light.lamp', 'light.white', 'light.reading'],
    ...BULB,
  }),
  'switch.kettle': state('switch.kettle', 'on', { friendly_name: 'Kettle' }),
  // what says a status when it is on: shut, clear and dry at rest
  'binary_sensor.front_door': state('binary_sensor.front_door', 'off', {
    friendly_name: 'Front door',
    device_class: 'door',
  }),
  'binary_sensor.smoke': state('binary_sensor.smoke', 'off', {
    friendly_name: 'Smoke',
    device_class: 'smoke',
  }),
  'binary_sensor.leak': state('binary_sensor.leak', 'off', {
    friendly_name: 'Leak',
    device_class: 'moisture',
  }),
};

const house = (states: Record<string, unknown> = STATES): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states,
    entities: {
      'light.lamp': { entity_id: 'light.lamp', area_id: 'den', device_id: null },
      'light.white': { entity_id: 'light.white', area_id: 'den', device_id: null },
      'light.reading': { entity_id: 'light.reading', area_id: 'den', device_id: null },
    },
    devices: {},
    areas: { den: { area_id: 'den', name: 'Den', picture: null } },
    user: { id: 'u', is_admin: true },
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => path,
    callService: () => Promise.resolve(),
  }) as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

async function mount(config: Record<string, unknown>, states?: Record<string, unknown>) {
  const card = document.createElement(String(config['type'])) as CardElement;
  card.setConfig({ ...config, type: `custom:${String(config['type'])}` });
  card.hass = house(states);
  document.body.append(card);
  await card.updateComplete;
  return card;
}

/** A light card's surface as drawn: its classes, its colour, its lit surface. */
async function light(config: Record<string, unknown>, states?: Record<string, unknown>) {
  const card = await mount({ type: 'fluvy-light-card', entity: 'light.lamp', ...config }, states);
  const article = card.shadowRoot!.querySelector('article')!;
  return {
    card,
    article,
    lit: article.classList.contains('is-lit'),
    glow: article.classList.contains('is-glow'),
    tone: [...article.classList].find((c) => c.startsWith('fv-tone--')) ?? '',
    accent: article.dataset['accent'] ?? '',
    surface: article.dataset['surface'] ?? '',
  };
}

afterEach(() => {
  document.body.replaceChildren();
  setLightDefaults({ tint: 'off', colors: false });
});

describe('a light card shows its colour (`tint`, #41)', () => {
  it('draws as 1.8 did where neither the card nor the house says: its colour on its parts, never its surface', async () => {
    const plain = await light({});
    expect([plain.lit, plain.glow, plain.surface]).toEqual([false, false, '']);
    expect(plain.accent).toBe('#ff9800');
  });

  it('lit, wears a lit tile’s whole fill in its bulb’s colour (`full`, the default strength)', async () => {
    const full = await light({ tint: 'on' });
    expect([full.lit, full.tone, full.surface, full.accent]).toEqual([
      true,
      'fv-tone--light',
      '',
      '#ff9800',
    ]);
    // the rulers on the fill take its ink, as a lit tile's
    expect(full.card.shadowRoot!.querySelector('fluvy-ruler')!.hasAttribute('on-fill')).toBe(true);
  });

  it('reads `tint: on` and `tint: off` as a YAML-mode dashboard hands them over: true and false', async () => {
    expect((await light({ tint: true })).lit).toBe(true);
    // the card's off wins over the house's on
    setLightDefaults({ tint: 'on', colors: false });
    expect((await light({ tint: false })).lit).toBe(false);
  });

  it('a wash as soft as asked, or as the lamp is bright: a dim lamp reads lit', async () => {
    expect((await light({ tint: 'on', tint_strength: 'soft' })).surface).toBe('#ff9800-60');
    const bright = await light({ tint: 'on', tint_strength: 'brightness' });
    expect([bright.glow, bright.surface]).toEqual([true, '#ff9800-80']);
    // at 10 % it takes the floor, never the rest's wash
    const dim = await light({ entity: 'light.dim', tint: 'on', tint_strength: 'brightness' });
    expect(dim.surface).toBe('#ff9800-60');
  });

  it('as much of the whole fill as the lamp is bright (`full_brightness`, #131): a step of it, in the fill’s words', async () => {
    // Linen's fill takes the fill's words from the soft wash up: a lit tile's skin at every step, its fill the step's
    const bright = await light({ tint: 'on', tint_strength: 'full_brightness' });
    expect([bright.lit, bright.glow, bright.tone, bright.surface]).toEqual([
      true,
      false,
      'fv-tone--light',
      'full #ff9800-80',
    ]);
    expect(bright.card.shadowRoot!.querySelector('fluvy-ruler')!.hasAttribute('on-fill')).toBe(
      true,
    );
    const dim = await light({ entity: 'light.dim', tint: 'on', tint_strength: 'full_brightness' });
    expect([dim.lit, dim.surface]).toEqual([true, 'full #ff9800-10']);
    // a bulb that does not dim is at its brightest: the whole fill
    const plain = await light(
      {
        entity: 'light.kitchen',
        tint: 'on',
        tint_strength: 'full_brightness',
      },
      {
        ...STATES,
        'light.kitchen': state('light.kitchen', 'on', {
          friendly_name: 'Kitchen',
          supported_color_modes: ['onoff'],
        }),
      },
    );
    expect([plain.lit, plain.surface]).toEqual([true, '']);
  });

  it('where the fill takes words a dim wash cannot (Noir in dark), the card’s words under the flip, the fill’s from it', async () => {
    setFallbackTokens(':host([no-theme]){--fluvy-palette:noir}');
    try {
      const inDark = async (entity: string) => {
        const { card, article } = await light({
          entity,
          tint: 'on',
          tint_strength: 'full_brightness',
        });
        card.hass = { ...house(), themes: { darkMode: true } } as unknown as HomeAssistant;
        await card.updateComplete;
        return {
          lit: article.classList.contains('is-lit'),
          glow: article.classList.contains('is-glow'),
          surface: article.dataset['surface'],
          onFill: card.shadowRoot!.querySelector('fluvy-ruler')!.hasAttribute('on-fill'),
        };
      };
      expect(await inDark('light.dim')).toEqual({
        lit: false,
        glow: true,
        surface: 'full #ff9800-10',
        onFill: false,
      });
      expect(await inDark('light.lamp')).toEqual({
        lit: true,
        glow: false,
        surface: 'full #ff9800-80',
        onFill: true,
      });
    } finally {
      setFallbackTokens(baseStyles[0]!.cssText);
    }
  });

  it('at 100 % is the card `full` draws, to the rule', async () => {
    const states = {
      ...STATES,
      'light.lamp': state('light.lamp', 'on', {
        ...STATES['light.lamp'].attributes,
        brightness: 255,
      }),
    };
    const drawn = async (strength: string) => {
      const { card, article } = await light({ tint: 'on', tint_strength: strength }, states);
      return [
        article.outerHTML,
        card.shadowRoot!.adoptedStyleSheets.map((sheet) =>
          [...sheet.cssRules].map((rule) => rule.cssText).join(''),
        ),
      ];
    };
    expect(await drawn('full_brightness')).toEqual(await drawn('full'));
  });

  it('always: a quiet wash at rest, which a lit card never equals; a card colour of its own is its rest', async () => {
    const rest = await light({ entity: 'light.reading', tint: 'always' });
    expect([rest.lit, rest.glow, rest.surface]).toEqual([false, false, 'light-0']);
    const purple = await light({ entity: 'light.reading', tint: 'always', color: 'purple' });
    expect(purple.surface).toMatch(/^#[0-9a-f]{6}-0$/);
    const lit = await light({ entity: 'light.dim', tint: 'always', tint_strength: 'brightness' });
    expect(lit.surface).not.toBe(rest.surface.replace('light', '#ff9800'));
    expect(lit.surface).toBe('#ff9800-60');
    const own = await light({ entity: 'light.reading', tint: 'always', card_color: 'blue' });
    expect(own.surface).toBe('');
  });

  it('its own colour beats its bulb’s; Primary is the palette’s accent; State follows the light', async () => {
    const teal = await light({ tint: 'on', tint_strength: 'soft', color: 'teal' });
    expect(teal.accent).toBe('');
    expect(teal.surface).toMatch(/^#[0-9a-f]{6}-60$/);
    expect(teal.surface).not.toBe('#ff9800-60');
    const primary = await light({ tint: 'on', tint_strength: 'soft', color: 'primary' });
    expect([primary.accent, primary.surface]).toEqual(['', 'accent-60']);
    const full = await light({ tint: 'on', color: 'accent' });
    expect(full.tone).toBe('fv-tone--accent');
    const followed = await light({ tint: 'on', color: 'state' });
    expect([followed.accent, followed.tone]).toEqual(['#ff9800', 'fv-tone--light']);
  });

  it('honours a tone of its own, over the bulb', async () => {
    const heat = await light({ tint: 'on', tone: 'heat' });
    expect([heat.accent, heat.tone]).toEqual(['', 'fv-tone--heat']);
    expect((await light({ tint: 'on', tone: 'heat', tint_strength: 'soft' })).surface).toBe(
      'heat-60',
    );
  });

  it('a white: by its temperature (the default since 1.10, #58), or the palette’s lit light where asked', async () => {
    const warm = await light({ entity: 'light.white', tint: 'on', tint_strength: 'soft' });
    expect([warm.accent, warm.surface]).toEqual(['white #ffa757', 'white #ffa757-60']);
    const white = await light({
      entity: 'light.white',
      tint: 'on',
      tint_strength: 'soft',
      light_whites: 'palette',
    });
    expect([white.accent, white.surface]).toEqual(['', 'light-60']);
  });

  it('a group: its lit members’ colours by brightness, a white by its temperature or adding none (mixed modes)', async () => {
    expect((await light({ entity: 'light.group', tint: 'on' })).accent).toBe('#ffa02c');
    const palette = await light({ entity: 'light.group', tint: 'on', light_whites: 'palette' });
    expect(palette.accent).toBe('#ff9800');
  });

  it('switched on, shows the colour it last glowed before Home Assistant says', async () => {
    const id = 'light.flip';
    const lit = state(id, 'on', {
      friendly_name: 'Flip',
      brightness: 255,
      color_mode: 'hs',
      rgb_color: [244, 67, 54],
      ...BULB,
    });
    const seen = await light({ entity: id, tint: 'on' }, { ...STATES, [id]: lit });
    expect(seen.accent).toBe('#f44336');
    seen.card.hass = house({
      ...STATES,
      [id]: state(id, 'off', { friendly_name: 'Flip', ...BULB }),
    });
    await seen.card.updateComplete;
    expect(seen.article.dataset['accent']).toBeUndefined();
    seen.card.shadowRoot!.querySelector<HTMLElement>('.fv-hit')!.click();
    await seen.card.updateComplete;
    expect(seen.article.dataset['accent']).toBe('#f44336');
    expect(seen.article.classList.contains('is-lit')).toBe(true);
  });

  it('a light that cannot be read keeps the unavailable skin and the card’s whole anatomy, still', async () => {
    const live = await light({ entity: 'light.reading', tint: 'always' });
    const parts = (root: ShadowRoot): string[] =>
      [...root.querySelectorAll('.fv-hit, .fv-readout, .fv-stepper, fluvy-ruler')].map(
        (el) => el.classList[0] ?? el.tagName,
      );
    const gone = await light({ entity: 'light.porch', tint: 'always' });
    expect([gone.lit, gone.glow, gone.surface]).toEqual([false, false, '']);
    expect(gone.article.classList.contains('is-off')).toBe(true);
    expect(parts(gone.card.shadowRoot!)).toEqual(parts(live.card.shadowRoot!));
    expect(gone.card.shadowRoot!.querySelector('.fv-switch')!.getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(gone.card.shadowRoot!.querySelector('.fv-readout__value')!.textContent?.trim()).toBe(
      '—',
    );
    // gone altogether: the same
    const missing = await light({ entity: 'light.nowhere', tint: 'always' });
    expect(parts(missing.card.shadowRoot!)).toEqual(parts(live.card.shadowRoot!));
  });

  it('the house’s default (fluvy’s settings) repaints a card that says none, at once, and never one that does', async () => {
    const silent = await light({});
    const own = await light({ tint: 'off' });
    setLightDefaults({ tint: 'on', colors: false });
    await silent.card.updateComplete;
    await own.card.updateComplete;
    expect(silent.article.classList.contains('is-lit')).toBe(true);
    expect(own.article.classList.contains('is-lit')).toBe(false);
    setLightDefaults({ tint: 'off', colors: false });
    await silent.card.updateComplete;
    expect(silent.article.classList.contains('is-lit')).toBe(false);
  });
});

describe('the light card’s editor (#41)', () => {
  const fields = (schema: readonly HaFormSchemaItem[]): HaFormSchemaItem[] =>
    schema.flatMap((item) => (item.schema ? fields(item.schema) : [item]));
  const field = (name: string) =>
    fields(lightEditor.getConfigForm().schema).find((item) => item.name === name)!;
  const options = (name: string) =>
    (field(name).selector?.['select'] as { options: { value: string; label: string }[] }).options;

  it('offers the tint and its strength on one row, worded so they read beside "Show its colour"', () => {
    expect(options('tint').map((o) => [o.value, o.label])).toEqual([
      ['off', 'Never'],
      ['on', 'When on'],
      ['always', 'Always'],
    ]);
    expect(options('tint_strength').map((o) => [o.value, o.label])).toEqual([
      ['soft', 'Soft'],
      ['brightness', 'Soft, with the brightness'],
      ['full', 'Full colour'],
      ['full_brightness', 'Full colour, with the brightness'],
    ]);
    expect(options('light_whites').map((o) => o.value)).toEqual(['palette', 'temperature']);
    const row = lightEditor
      .getConfigForm()
      .schema.find((item) => item.schema?.some((inner) => inner.name === 'tint'));
    expect(row?.schema?.map((item) => item.name)).toEqual(['tint', 'tint_strength']);
  });

  it('its colour says State by default, as Home Assistant’s tile does', () => {
    expect(field('color').selector?.['ui_color']).toEqual({
      default_color: 'state',
      include_none: false,
      include_state: true,
    });
  });

  it('shows the house’s default where the card says none', () => {
    const defaults = () => lightEditor.defaults({ type: 'custom:fluvy-light-card' }, undefined);
    expect(defaults()).toMatchObject({
      tint: 'off',
      tint_strength: 'full',
      light_whites: 'temperature',
    });
    setLightDefaults({ tint: 'always', colors: true });
    expect(defaults()['tint']).toBe('always');
  });

  it('offers a strength only while the light shows its colour: by its own tint, else by the house’s', async () => {
    const strength = async (config: Record<string, unknown>): Promise<boolean> => {
      const editor = await drawEditor(await FluvyLightCard.getConfigElement(), {
        type: 'custom:fluvy-light-card',
        entity: 'light.lamp',
        ...config,
      });
      return shownNames(cardForm(editor).schema).includes('tint_strength');
    };
    expect(await strength({})).toBe(false);
    expect(await strength({ tint: 'on' })).toBe(true);
    expect(await strength({ tint: 'always' })).toBe(true);
    // a YAML-mode dashboard's unquoted off
    expect(await strength({ tint: false })).toBe(false);
    setLightDefaults({ tint: 'on', colors: false });
    expect(await strength({})).toBe(true);
    expect(await strength({ tint: 'off' })).toBe(false);
  });
});

describe('tiles, rows and rooms in their bulbs’ colours (`light_colors`, #41; one rule and whites, #58)', () => {
  const accents = (card: CardElement, selector: string): string[] =>
    [...card.shadowRoot!.querySelectorAll<HTMLElement>(selector)].map(
      (el) => el.dataset['accent'] ?? '',
    );
  const tones = (card: CardElement, selector: string): string[] =>
    [...card.shadowRoot!.querySelectorAll<HTMLElement>(selector)].map(
      (el) => [...el.classList].find((c) => /^fv-tile--(?!tap|inner|compact)/.test(c)) ?? '',
    );
  const ENTITIES = ['light.lamp', 'light.white', 'light.reading', 'switch.kettle'];

  it('a lit bulb’s tile wears its colour, a white its temperature; an off light and a plug keep their own', async () => {
    const card = await mount({ type: 'fluvy-tiles-card', light_colors: true, entities: ENTITIES });
    expect(accents(card, '.fv-tile')).toEqual(['#ff9800', 'white #ffa757', '', '']);
    const palette = await mount({
      type: 'fluvy-tiles-card',
      light_colors: true,
      light_whites: 'palette',
      entities: ENTITIES,
    });
    expect(accents(palette, '.fv-tile')).toEqual(['#ff9800', '', '', '']);
  });

  it('as 1.8 drew them where neither the card nor the house says; the house’s default where the card says none', async () => {
    const card = await mount({ type: 'fluvy-tiles-card', entities: ENTITIES });
    expect(accents(card, '.fv-tile')).toEqual(['', '', '', '']);
    setLightDefaults({ tint: 'off', colors: true });
    await card.updateComplete;
    expect(accents(card, '.fv-tile')).toEqual(['#ff9800', 'white #ffa757', '', '']);
    const own = await mount({ type: 'fluvy-tiles-card', light_colors: false, entities: ENTITIES });
    expect(accents(own, '.fv-tile')).toEqual(['', '', '', '']);
  });

  it('one rule: a tile’s own colour, then its tone, then its bulb’s, then the card’s colour, then the card’s tone', async () => {
    const items = await mount({
      type: 'fluvy-tiles-card',
      light_colors: true,
      tiles: [
        { entity: 'light.lamp', color: 'teal' },
        { entity: 'light.lamp', tone: 'heat' },
      ],
    });
    const [teal, heat] = accents(items, '.fv-tile');
    expect(teal).toMatch(/^#[0-9a-f]{6}$/);
    expect(teal).not.toBe('#ff9800');
    expect(heat).toBe('');
    expect(tones(items, '.fv-tile')[1]).toBe('fv-tile--heat');
    // the bulb's before the card's colour (1.10: the card's came first)
    const purple = await mount({
      type: 'fluvy-tiles-card',
      light_colors: true,
      color: 'purple',
      tone: 'cool',
      entities: ['light.lamp', 'light.reading'],
    });
    expect(accents(purple, '.fv-tile')).toEqual(['#ff9800', '']);
    // a light with no colour of its own wears the card's (its accent redefines the lit light), else the card's tone
    expect(tones(purple, '.fv-tile')).toEqual(['fv-tile--light', 'fv-tile--light']);
    const cool = await mount({
      type: 'fluvy-tiles-card',
      light_colors: false,
      tone: 'cool',
      entities: ['light.lamp', 'switch.kettle'],
    });
    expect(tones(cool, '.fv-tile')).toEqual(['fv-tile--cool', 'fv-tile--accent']);
  });

  it('a lone tile wears it on its own article; its own colour or tone before its bulb’s', async () => {
    const card = await mount({ type: 'fluvy-tile-card', entity: 'light.lamp', light_colors: true });
    expect(accents(card, 'article')).toEqual(['#ff9800']);
    const white = await mount({
      type: 'fluvy-tile-card',
      entity: 'light.white',
      light_colors: true,
    });
    expect(accents(white, 'article')).toEqual(['white #ffa757']);
    const own = await mount({
      type: 'fluvy-tile-card',
      entity: 'light.lamp',
      light_colors: true,
      tone: 'heat',
    });
    expect([accents(own, 'article')[0], tones(own, 'article')[0]]).toEqual(['', 'fv-tile--heat']);
  });

  it('a light group: its members’ colours by brightness, watched with it', async () => {
    const card = await mount({
      type: 'fluvy-tile-card',
      entity: 'light.group',
      light_colors: true,
    });
    expect(accents(card, 'article')).toEqual(['#ffa02c']);
    const watched = (card as unknown as { watched(): string[] }).watched();
    expect(watched).toEqual(['light.group', 'light.lamp', 'light.white', 'light.reading']);
  });

  it('a row of lights: each lit bulb in its colour, a white its temperature, before the card’s colour', async () => {
    const card = await mount({
      type: 'fluvy-entities-card',
      light_colors: true,
      color: 'purple',
      entities: ENTITIES,
    });
    expect(accents(card, '.fv-row')).toEqual(['#ff9800', 'white #ffa757', '', '']);
  });

  it('a room: its tiles each in its own, its lights’ row in the colour of what is lit', async () => {
    const tiles = await mount({
      type: 'fluvy-room-card',
      area: 'den',
      variant: 'tile',
      controls: 'tiles',
      light_colors: true,
    });
    expect(accents(tiles, '.fv-tile')).toEqual(
      expect.arrayContaining(['#ff9800', 'white #ffa757']),
    );
    const rows = await mount({
      type: 'fluvy-room-card',
      area: 'den',
      variant: 'tile',
      light_colors: true,
      color: 'purple',
    });
    // the colour bulb and the warm white by their brightness; the palette's whites: the bulb alone
    expect(accents(rows, '.fv-row')[0]).toBe('#ffa02c');
    const palette = await mount({
      type: 'fluvy-room-card',
      area: 'den',
      variant: 'tile',
      light_colors: true,
      light_whites: 'palette',
    });
    expect(accents(palette, '.fv-row')[0]).toBe('#ff9800');
  });

  it('a room’s lights row counts a group beside its members once: as its members', async () => {
    const card = document.createElement('fluvy-room-card') as CardElement;
    card.setConfig({
      type: 'custom:fluvy-room-card',
      area: 'den',
      variant: 'tile',
      light_colors: true,
    });
    // the group in the room with its members, its own colour one Home Assistant has not brought up to date
    const states = {
      ...STATES,
      'light.group': {
        ...STATES['light.group'],
        attributes: {
          ...STATES['light.group'].attributes,
          color_mode: 'hs',
          rgb_color: [0, 0, 255],
        },
      },
    };
    const hass = house(states);
    card.hass = {
      ...hass,
      entities: {
        ...hass.entities,
        'light.group': { entity_id: 'light.group', area_id: 'den', device_id: null },
      },
    } as unknown as HomeAssistant;
    document.body.append(card);
    await card.updateComplete;
    expect(accents(card, '.fv-row')[0]).toBe('#ffa02c');
  });
});

describe('a tile’s colour at rest (`tint: always`, #58)', () => {
  const tile = async (config: Record<string, unknown>): Promise<HTMLElement> => {
    const card = await mount({ type: 'fluvy-tile-card', tint: 'always', ...config });
    return card.shadowRoot!.querySelector<HTMLElement>('article')!;
  };
  const rest = (article: HTMLElement): [boolean, string | undefined] => [
    article.classList.contains('is-tinted'),
    article.dataset['surface'],
  ];

  it('a tile of a tone alone takes its tone’s rest wash, as a light card at rest does', async () => {
    expect(rest(await tile({ entity: 'light.reading' }))).toEqual([false, 'light-0']);
    expect(rest(await tile({ entity: 'light.reading', tone: 'heat' }))).toEqual([false, 'heat-0']);
  });

  it('a status at rest never washes in it: a shut door, a clear smoke alarm, a dry leak sensor keep the card’s', async () => {
    for (const entity of [
      'binary_sensor.front_door',
      'binary_sensor.smoke',
      'binary_sensor.leak',
    ]) {
      const article = await tile({ entity, size: 'compact' });
      expect(rest(article), entity).toEqual([false, undefined]);
      expect(article.classList.contains('fv-tile--warning'), entity).toBe(true);
    }
  });

  it('a status with a colour of its own, or in a coloured group, washes in that colour at rest, as 1.9.1 did', async () => {
    for (const entity of ['binary_sensor.front_door', 'binary_sensor.smoke', 'binary_sensor.leak'])
      expect(rest(await tile({ entity, size: 'compact', color: 'teal' })), entity).toEqual([
        true,
        undefined,
      ]);
    const group = await mount({
      type: 'fluvy-tiles-card',
      tint: 'always',
      tiles: [
        'binary_sensor.front_door',
        { entity: 'binary_sensor.smoke', color: 'teal' },
        'light.reading',
      ],
    });
    const tiles = [...group.shadowRoot!.querySelectorAll<HTMLElement>('article.fv-tile')];
    expect(tiles.map(rest)).toEqual([
      [false, undefined],
      [true, undefined],
      [false, 'light-0'],
    ]);
    const coloured = await mount({
      type: 'fluvy-tiles-card',
      tint: 'always',
      color: 'teal',
      tiles: ['binary_sensor.front_door', 'light.reading'],
    });
    expect(
      [...coloured.shadowRoot!.querySelectorAll<HTMLElement>('article.fv-tile')].map(rest),
    ).toEqual([
      [true, undefined],
      [true, undefined],
    ]);
  });

  it('a coloured one its colour’s rest wash; lit, unavailable or asked only when on, none', async () => {
    expect(rest(await tile({ entity: 'light.reading', color: 'teal' }))).toEqual([true, undefined]);
    for (const config of [
      { entity: 'light.lamp' },
      { entity: 'light.porch' },
      { entity: 'light.reading', tint: 'on' },
    ])
      expect(rest(await tile(config))).toEqual([false, undefined]);
  });
});

describe('the editors offer a light’s colours and a tile’s rest where they can act (#58)', () => {
  const shown = async (
    element: Promise<HTMLElement>,
    config: Record<string, unknown>,
  ): Promise<string[]> => {
    const editor = await element;
    (editor as HTMLElement & { hass: HomeAssistant }).hass = house();
    return shownNames(
      cardForm(await drawEditor(editor, config as unknown as LovelaceCardConfig)).schema,
    );
  };
  const tiles = (config: Record<string, unknown>) =>
    shown(FluvyTilesCard.getConfigElement(), { type: 'custom:fluvy-tiles-card', ...config });
  const rows = (config: Record<string, unknown>) =>
    shown(FluvyEntitiesCard.getConfigElement(), { type: 'custom:fluvy-entities-card', ...config });
  const lamp = (config: Record<string, unknown>) =>
    shown(FluvyLightCard.getConfigElement(), {
      type: 'custom:fluvy-light-card',
      entity: 'light.lamp',
      ...config,
    });
  const tile = (config: Record<string, unknown>) =>
    shown(FluvyTileCard.getConfigElement(), { type: 'custom:fluvy-tile-card', ...config });

  it('a group of tiles and a card of rows offer the lights’ colours while they hold a light', async () => {
    expect(await tiles({ tiles: ['switch.kettle'] })).not.toContain('light_colors');
    expect(await tiles({ tiles: ['switch.kettle', { entity: 'light.lamp' }] })).toContain(
      'light_colors',
    );
    expect(await tiles({ entities: ['light.white'] })).toContain('light_colors');
    expect(await rows({ rows: ['switch.kettle', 'binary_sensor.smoke'] })).not.toContain(
      'light_colors',
    );
    expect(await rows({ entities: ['switch.kettle', 'light.group'] })).toContain('light_colors');
  });

  it('the light card offers how its whites show while its bulb gives its colour: not under a colour or a tone of its own', async () => {
    expect(await lamp({})).toContain('light_whites');
    expect(await lamp({ color: 'state' })).toContain('light_whites');
    expect(await lamp({ color: 'purple' })).not.toContain('light_whites');
    expect(await lamp({ color: 'primary' })).not.toContain('light_whites');
    expect(await lamp({ tone: 'heat' })).not.toContain('light_whites');
  });

  it('a tile offers its colour at rest where something shows then: a colour, or a tone that washes', async () => {
    expect(await tile({ entity: 'light.reading' })).toContain('tint');
    expect(await tile({ entity: 'switch.kettle' })).toContain('tint');
    expect(await tile({ entity: 'binary_sensor.front_door' })).not.toContain('tint');
    expect(await tile({ entity: 'binary_sensor.front_door', color: 'teal' })).toContain('tint');
    expect(await tile({ entity: 'binary_sensor.front_door', tone: 'accent' })).toContain('tint');
    expect(await tile({ entity: 'switch.kettle', tone: 'danger' })).not.toContain('tint');
  });
});
