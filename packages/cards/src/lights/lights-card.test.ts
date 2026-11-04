// @vitest-environment happy-dom
import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';
import { FluvyEntitiesCard } from '../entities/entities-card.js';
import { FluvyLockCard } from '../lock/lock-card.js';
import { FluvyRoomCard } from '../room/room-card.js';
import type { CardEditor } from '../shared/base.js';
import {
  cardForm,
  drawEditor,
  nextConfig,
  shownNames,
  type FormStub,
} from '../shared/fixtures/editor.js';
import type { FormLabeler } from '../shared/form.js';
import { FluvyTilesCard } from '../tiles/tiles-card.js';
import { FluvyLightsCard, type LightsCardConfig } from './lights-card.js';

// the index fetches the lazy families: they land before this file's page goes
afterAll(() => familiesDefined);
afterEach(() => document.body.replaceChildren());

/**
 * #58: the room lights card in its lights' colours whatever its style — a white by its temperature (the default) or as
 * the palette's light, the card's colour and tone after its bulbs' — its tiles saying their level as its line does, and
 * its editor offering only what acts in the style chosen.
 */

const STAMP = '2026-10-21T19:00:00+00:00';
const state = (id: string, value: string, attributes: Record<string, unknown>) => ({
  entity_id: id,
  state: value,
  attributes,
  last_changed: STAMP,
  last_updated: STAMP,
});
/** A Hue Play as Home Assistant reports it in colour temperature (the reporter's lamps): its colour beside it. */
const PLAY = { supported_color_modes: ['color_temp', 'xy'] };
const STATES = {
  'light.desk': state('light.desk', 'on', {
    friendly_name: 'Desk',
    ...PLAY,
    color_mode: 'color_temp',
    brightness: 61,
    color_temp_kelvin: 2732,
    rgb_color: [255, 167, 87],
  }),
  'light.floor': state('light.floor', 'on', {
    friendly_name: 'Floor lamp',
    ...PLAY,
    color_mode: 'xy',
    brightness: 255,
    rgb_color: [255, 0, 0],
  }),
  'light.shelf': state('light.shelf', 'on', {
    friendly_name: 'Shelf',
    supported_color_modes: ['onoff'],
    color_mode: 'onoff',
  }),
  'light.sconce': state('light.sconce', 'off', { friendly_name: 'Sconce', ...PLAY }),
};
const LIGHTS = Object.keys(STATES);

const house = (): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: STATES,
    entities: {},
    devices: {},
    areas: {},
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

async function mount(config: Record<string, unknown>): Promise<ShadowRoot> {
  const card = document.createElement('fluvy-lights-card') as CardElement;
  card.setConfig({ type: 'custom:fluvy-lights-card', lights: LIGHTS, ...config });
  card.hass = house();
  document.body.append(card);
  await card.updateComplete;
  return card.shadowRoot!;
}

/** What each light's control wears in the style asked: its colour (`data-accent`) and its tone. */
const worn = (root: ShadowRoot, selector: string): (readonly [string, string])[] =>
  [...root.querySelectorAll<HTMLElement>(selector)].map((el) => [
    el.dataset['accent'] ?? '',
    [...el.classList].find((c) => /^fv-(tile|ico|tone)--(?!tap|inner|compact)/.test(c)) ?? '',
  ]);

describe('the room lights in their bulbs’ colours, in every style (#58)', () => {
  const SELECTORS = { row: '.lt-bulb', chips: '.fv-chip', tiles: '.fv-tile' } as const;

  it('a white in its warmth, a colour bulb in its colour, one that only switches and an off one in the palette’s', async () => {
    for (const [variant, selector] of Object.entries(SELECTORS)) {
      const accents = worn(await mount({ variant }), selector).map(([accent]) => accent);
      expect(accents, variant).toEqual(['white #ffa757', '#ff0000', '', '']);
    }
  });

  it('a white as the palette’s light where the card asks (`light_whites: palette`)', async () => {
    for (const [variant, selector] of Object.entries(SELECTORS)) {
      const accents = worn(await mount({ variant, light_whites: 'palette' }), selector);
      expect(
        accents.map(([accent]) => accent),
        variant,
      ).toEqual(['', '#ff0000', '', '']);
    }
  });

  it('its tiles take the card’s tone and colour where a lamp shows none of its own, as its rounds and chips do', async () => {
    const heat = worn(
      await mount({ variant: 'tiles', tone: 'heat', light_colors: false }),
      '.fv-tile',
    );
    expect(heat.slice(0, 3)).toEqual([
      ['', 'fv-tile--heat'],
      ['', 'fv-tile--heat'],
      ['', 'fv-tile--heat'],
    ]);
    const rounds = worn(await mount({ tone: 'heat', light_colors: false }), '.lt-bulb');
    expect(rounds[0]).toEqual(['', 'fv-ico--heat']);
    // the bulb's colour first (each tile given its lamp's, in the accent), then the card's (in the lit light it redefines)
    const purple = worn(
      await mount({ variant: 'tiles', color: 'purple', tone: 'heat' }),
      '.fv-tile',
    );
    expect(purple.slice(0, 3)).toEqual([
      ['white #ffa757', 'fv-tile--accent'],
      ['#ff0000', 'fv-tile--accent'],
      ['', 'fv-tile--light'],
    ]);
  });

  it('its tiles say their level only where the card shows levels (`show_level`)', async () => {
    const line = async (config: Record<string, unknown>): Promise<string> =>
      (await mount({ variant: 'tiles', ...config }))
        .querySelector('.fv-tile__state')!
        .textContent!.trim();
    expect(await line({})).toBe('On · 24 %');
    expect(await line({ show_level: false })).toBe('On');
  });

  it('its tiles take a name in two lines where asked, each a line taller, from the config alone (#100)', async () => {
    const tiles = (await mount({ variant: 'tiles', name_lines: 2 })).querySelectorAll('.fv-tile');
    expect([...tiles].every((tile) => tile.classList.contains('fv-tile--lines'))).toBe(true);
    const config: LightsCardConfig = {
      type: 'custom:fluvy-lights-card',
      variant: 'tiles',
      lights: ['light.a', 'light.b'],
    };
    expect(
      FluvyLightsCard.layoutHeight({ ...config, name_lines: 2 }) -
        FluvyLightsCard.layoutHeight(config),
    ).toBe(12);
    // the rounds and the chips have no tile to make taller
    expect(FluvyLightsCard.layoutHeight({ ...config, variant: 'row', name_lines: 2 })).toBe(
      FluvyLightsCard.layoutHeight({ ...config, variant: 'row' }),
    );
  });
});

describe('the room lights card’s editor (#58)', () => {
  const shown = async (config: Record<string, unknown>): Promise<string[]> =>
    shownNames(
      cardForm(
        await drawEditor(await FluvyLightsCard.getConfigElement(), {
          type: 'custom:fluvy-lights-card',
          lights: LIGHTS,
          ...config,
        }),
      ).schema,
    );

  it('offers the colour at rest in tiles alone: the rounds and the chips have no surface to wash', async () => {
    expect(await shown({ variant: 'tiles' })).toContain('tint');
    expect(await shown({})).not.toContain('tint');
    expect(await shown({ variant: 'chips' })).not.toContain('tint');
  });

  it('offers how whites show beside the bulbs’ colours, while they show', async () => {
    const names = await shown({});
    expect(names.slice(names.indexOf('light_colors'), names.indexOf('light_colors') + 2)).toEqual([
      'light_colors',
      'light_whites',
    ]);
    expect(await shown({ light_colors: false })).not.toContain('light_whites');
  });
});

describe('a light’s own colour in a list: none chosen by default, its bulb’s (#58)', () => {
  /** An item's colour field in a card's first list, through its rows. */
  const colourOf = async (card: { editor(): Promise<CardEditor> }) =>
    ((await card.editor()).lists ?? [])[0]!.schema
      .flatMap((item) => item.schema ?? [item])
      .find((item) => item.name === 'color')!;

  it('says none chosen where the item wears its bulb’s, else the card’s: lights, tiles, a room’s tiles, rows', async () => {
    for (const card of [FluvyLightsCard, FluvyTilesCard, FluvyRoomCard, FluvyEntitiesCard])
      expect((await colourOf(card)).selector?.['ui_color'], card.name).toEqual({
        include_none: false,
        include_state: false,
      });
    // a lock's rows have no bulb: none chosen either, the row wearing the card's colour until one is
    const lock = await colourOf(FluvyLockCard);
    expect(lock.selector?.['ui_color']).toEqual({ include_none: false, include_state: false });
    expect(lock.helper).toBe('editor.item_color_card_helper');
  });

  it('says what the light wears while none is chosen, and writes none', async () => {
    const editor = await drawEditor(await FluvyLightsCard.getConfigElement(), {
      type: 'custom:fluvy-lights-card',
      lights: ['light.desk'],
    });
    const item = editor.shadowRoot!.querySelectorAll<FormStub & { computeHelper: FormLabeler }>(
      'ha-form',
    )[1]!;
    const field = await colourOf(FluvyLightsCard);
    expect(item.computeHelper(field, (key: string) => key)).toBe(
      'Empty: the light’s bulb colour where the card shows bulbs’ colours, else the card’s',
    );
    expect(item.data).toEqual({ entity: 'light.desk' });
    const written = nextConfig(editor);
    item.change('name', 'Desk lamp');
    expect(await written).toEqual({
      type: 'custom:fluvy-lights-card',
      lights: [{ entity: 'light.desk', name: 'Desk lamp' }],
    });
  });
});
