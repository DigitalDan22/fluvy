// @vitest-environment happy-dom
import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { familiesDefined } from '../index.js';
import {
  cardForm,
  drawEditor,
  listTitles,
  nextConfig,
  shownNames,
} from '../shared/fixtures/editor.js';
import { FluvyLightCard, lightHeight, type BulbDoes, type LightCardConfig } from './light-card.js';
import * as lightEditor from './light-editor.js';

// the index fetches the lazy families: they land before this file's page goes
afterAll(() => familiesDefined);

const list = lightEditor.lists[0]!;
const names = (schema: ReadonlyArray<{ name: string; schema?: readonly unknown[] }>): string[] =>
  schema.flatMap((item) =>
    item.schema ? names(item.schema as ReadonlyArray<{ name: string }>) : [item.name],
  );

/** A house with one bulb, reporting the colour modes given. */
const house = (modes: readonly string[]): HomeAssistant =>
  ({
    states: {
      'light.lamp': {
        entity_id: 'light.lamp',
        state: 'on',
        attributes: { supported_color_modes: modes },
      },
    },
  }) as unknown as HomeAssistant;

describe('the light card’s quick colours in the editor', () => {
  it('edits the list row by row: a colour first, the well and a name', () => {
    expect(list.key).toBe('colors');
    expect(list.idKey).toBe('color');
    expect(names(list.schema)).toEqual(['color', 'name', 'rgb']);
    expect(list.picker?.name).toBe('color');
    const options = (
      list.picker?.selector?.['select'] as { options: { value: string; label: string }[] }
    ).options;
    expect(options.map((o) => o.value)).toEqual([
      'warm',
      'cool',
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'pink',
      'picker',
      'custom',
    ]);
    expect(options.at(-1)?.label).toBe('Custom colour');
  });

  it('shows the well only while a row is Custom, and the same form for the same answer', () => {
    expect(names(list.schemaOf!({ color: 'custom' }))).toEqual(['color', 'name', 'rgb']);
    expect(names(list.schemaOf!({ color: 'warm' }))).toEqual(['color', 'name']);
    expect(names(list.schemaOf!({ color: 'blue', rgb: [1, 2, 3] }))).toEqual(['color', 'name']);
    expect(list.schemaOf!({ color: 'custom' })).toBe(
      list.schemaOf!({ color: 'custom', name: 'x' }),
    );
    expect(list.schemaOf!({ color: 'red' })).toBe(list.schemaOf!({ color: 'amber' }));
    expect(list.schemaOf!({ color: 'custom' })).toBe(list.schema);
  });

  it('says what the fields mean: how to pick a colour, what the name is for', () => {
    const t = (key: string): string => key;
    expect(list.computeHelper?.({ name: 'color' }, t)).toMatch(/Custom colour/);
    expect(list.computeHelper?.({ name: 'name' }, t)).toMatch(/round/);
    // the well carries no floating label (Home Assistant's colour input paints its whole box): its word is the helper
    expect(list.computeLabel?.({ name: 'rgb' }, t)).toBe('');
    expect(list.computeHelper?.({ name: 'rgb' }, t)).toMatch(/colour/i);
  });

  it('shows the bulb’s own default six as rows: whites first with a temperature, colours alone without', () => {
    const colours = (hass: HomeAssistant | undefined): unknown =>
      lightEditor.defaults({ type: 'custom:fluvy-light-card', entity: 'light.lamp' }, hass)[
        'colors'
      ];
    expect(colours(house(['hs', 'color_temp']))).toEqual([
      'warm',
      'cool',
      'red',
      'orange',
      'green',
      'blue',
    ]);
    expect(colours(house(['rgb']))).toEqual(['red', 'orange', 'green', 'blue', 'purple', 'pink']);
    expect(colours(undefined)).toEqual(['red', 'orange', 'green', 'blue', 'purple', 'pink']);
  });
});

describe('the light card’s height follows the count of its quick colours', () => {
  const height = (colors?: LightCardConfig['colors']): number =>
    FluvyLightCard.layoutHeight({
      type: 'custom:fluvy-light-card',
      entity: 'light.lamp',
      ...(colors ? { colors } : {}),
    });
  const six = height();

  it('counts six by default, a named entry as one, and wraps by six a row', () => {
    expect(six).toBe(268 + 100 + 8 + 52);
    expect(height(['warm', { color: '#ff2d55', name: 'Lila' }, [0, 128, 128]])).toBe(six); // one short row
    expect(height(Array.from({ length: 12 }, () => 'red'))).toBe(six + 52); // two rows
    expect(height(Array.from({ length: 13 }, () => 'red'))).toBe(six + 104); // and a third
  });

  it('draws no row for a list of none, and stays on the 4 px grid', () => {
    expect(height([])).toBe(268 + 100);
    for (const n of [0, 1, 3, 6, 7, 12, 25])
      expect(height(Array.from({ length: n }, () => 'red')) % 4).toBe(0);
  });
});

const config = (more: Record<string, unknown> = {}): LightCardConfig => ({
  type: 'custom:fluvy-light-card',
  entity: 'light.lamp',
  ...more,
});
const STAMP = '2026-10-26T08:00:00+00:00';
/** A house with one lamp in the state given, with the attributes given (none: a light the house has not described). */
const lamp = (state: string, attributes?: Record<string, unknown>): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: {
      'light.lamp': {
        entity_id: 'light.lamp',
        state,
        attributes: { friendly_name: 'Pantry', ...attributes },
        last_changed: STAMP,
        last_updated: STAMP,
      },
    },
    entities: {},
    devices: {},
    areas: {},
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    callService: () => Promise.resolve(),
  }) as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
  getCardSize(): number;
};
/** The card for the lamp, drawn. */
async function card(more: Record<string, unknown>, hass: HomeAssistant): Promise<CardElement> {
  const element = document.createElement('fluvy-light-card') as CardElement;
  element.setConfig(config(more));
  element.hass = hass;
  document.body.append(element);
  await element.updateComplete;
  return element;
}
/** What the card drawn for the lamp is: its article's classes and what it holds. */
const anatomy = (element: CardElement) => {
  const root = element.shadowRoot!;
  return {
    classes: [...root.querySelector('article')!.classList],
    rulers: root.querySelectorAll('fluvy-ruler').length,
    level: root.querySelectorAll('.sl-value').length,
    switches: root.querySelectorAll('.fv-switch').length,
  };
};
const drawn = async (more: Record<string, unknown>, hass: HomeAssistant) =>
  anatomy(await card(more, hass));
/** The rows of the editor drawn for the config: the card's fields, its lists. */
const shown = async (
  hass: HomeAssistant | undefined,
  more: Record<string, unknown> = {},
): Promise<{ fields: string[]; lists: string[] }> => {
  const editor = await FluvyLightCard.getConfigElement();
  if (hass) (editor as HTMLElement & { hass: HomeAssistant }).hass = hass;
  const drawnEditor = await drawEditor(editor, config(more));
  return { fields: shownNames(cardForm(drawnEditor).schema), lists: listTitles(drawnEditor) };
};
const ONOFF = { supported_color_modes: ['onoff'] };
const DIMMER = ['variant', 'show_stepper', 'live_update'];
const WHITE = ['show_temperature', 'temperature_tint'];

/*
 * #65: a bulb that only switches (`supported_color_modes: ['onoff']`) is its head alone — the circle, the name, the
 * state line, the switch — in every style, 84 tall, and its editor offers only what the bulb does.
 */
describe('the card of a bulb that only switches (#65)', () => {
  const SWITCH: BulbDoes = { colour: false, temperature: false, dimmable: false };
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('declares 84 in every style, whatever its config asks', () => {
    for (const variant of ['auto', 'full', 'compact'] as const) {
      expect(lightHeight(config({ variant }), SWITCH)).toBe(84);
      expect(lightHeight(config({ variant, colors: ['red', 'blue'] }), SWITCH)).toBe(84);
    }
    expect(lightHeight(config({ variant: 'compact' }), { ...SWITCH, dimmable: true })).toBe(188);
  });

  it('draws its head alone — no level, no ruler — with its switch, in the full and the compact style alike', async () => {
    const full = await drawn({}, lamp('on', ONOFF));
    expect(full.classes).toContain('sl-card--switch');
    expect(full.classes).not.toContain('sl-card--compact');
    expect([full.rulers, full.level, full.switches]).toEqual([0, 0, 1]);
    const compact = await drawn({ variant: 'compact' }, lamp('off', ONOFF));
    expect(compact.classes).toContain('sl-card--switch');
    expect(compact.classes).not.toContain('sl-card--compact');
    expect([compact.rulers, compact.level]).toEqual([0, 0]);
  });

  it('keeps the on/off anatomy while it cannot be read, as a light the house has not described keeps the dimmer’s', async () => {
    const kept = await drawn({}, lamp('unavailable', ONOFF));
    expect(kept.classes).toContain('sl-card--switch');
    expect(kept.classes).toContain('is-unavailable');
    expect(kept.rulers).toBe(0);
    const gone = await drawn({}, lamp('unavailable'));
    expect(gone.classes).not.toContain('sl-card--switch');
    expect([gone.rulers, gone.level]).toEqual([1, 1]);
  });

  it('takes two rows of a masonry layout, where a dimmer takes four', () => {
    const element = document.createElement('fluvy-light-card') as CardElement;
    element.setConfig(config());
    element.hass = lamp('on', ONOFF);
    expect(element.getCardSize()).toBe(2);
    element.hass = lamp('on', { supported_color_modes: ['brightness'] });
    expect(element.getCardSize()).toBe(4);
  });

  describe('its editor offers what the bulb does', () => {
    it('a bulb that only switches: none of the dimmer’s, the white’s or the colours’ options, no quick colours', async () => {
      const { fields, lists } = await shown(lamp('on', ONOFF));
      for (const name of [...DIMMER, ...WHITE, 'show_color', 'light_whites', 'show_brightness'])
        expect(fields, name).not.toContain(name);
      expect(fields).toContain('tint');
      expect(lists).toEqual([]);
    });

    it('a dimmer: its layout, stepper and live update, nothing of a white or a colour', async () => {
      const { fields, lists } = await shown(lamp('on', { supported_color_modes: ['brightness'] }));
      for (const name of DIMMER) expect(fields, name).toContain(name);
      for (const name of [...WHITE, 'show_color', 'light_whites'])
        expect(fields, name).not.toContain(name);
      expect(lists).toEqual([]);
    });

    it('a white: the temperature ruler’s options and how whites show, no colours', async () => {
      const { fields, lists } = await shown(lamp('on', { supported_color_modes: ['color_temp'] }));
      for (const name of [...DIMMER, ...WHITE, 'light_whites'])
        expect(fields, name).toContain(name);
      expect(fields).not.toContain('show_color');
      expect(lists).toEqual([]);
    });

    it('a colour bulb, and a bulb the house has not described: everything', async () => {
      for (const hass of [lamp('on', { supported_color_modes: ['hs', 'color_temp'] }), undefined]) {
        const { fields, lists } = await shown(hass);
        for (const name of [...DIMMER, ...WHITE, 'show_color', 'light_whites'])
          expect(fields, name).toContain(name);
        expect(lists.length).toBe(1);
      }
    });
  });
});

/*
 * #124: the brightness always (the default), never (the card its head alone, as a bulb that only switches), or while
 * the light is on (its head alone while it is off or cannot be read, the rest folded under it and opened as it turns
 * on: the same element eases open and shut).
 */
describe('the brightness always, never, or while the light is on (#124)', () => {
  const COLOUR = {
    supported_color_modes: ['hs', 'color_temp'],
    brightness: 128,
    hs_color: [30, 60],
  };
  /** What the fold holds and says: open or not, out of reach of a finger or not. */
  const fold = (element: CardElement) => {
    const el = element.shadowRoot!.querySelector('.sl-fold');
    return el ? { open: el.classList.contains('is-open'), inert: el.hasAttribute('inert') } : null;
  };
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('declares the head alone, never and while the light is on (the grid’s auto row follows it), the dimmer always', () => {
    for (const variant of ['auto', 'full', 'compact'] as const) {
      expect(lightHeight(config({ variant, show_brightness: false }))).toBe(84);
      expect(lightHeight(config({ variant, show_brightness: 'when_on' }))).toBe(84);
      expect(lightHeight(config({ variant, show_brightness: true }))).toBe(
        lightHeight(config({ variant })),
      );
    }
    expect(lightHeight(config())).toBe(268 + 100 + 8 + 52);
  });

  it('never: its head alone, on and off, in every style, nothing of its colours either', async () => {
    for (const variant of ['auto', 'full', 'compact'])
      for (const state of ['on', 'off']) {
        const element = await card({ variant, show_brightness: false }, lamp(state, COLOUR));
        const drawnCard = anatomy(element);
        expect(drawnCard.classes, `${variant} ${state}`).toContain('sl-card--switch');
        expect([drawnCard.rulers, drawnCard.level, drawnCard.switches]).toEqual([0, 0, 1]);
        expect(fold(element)).toBeNull();
        expect(element.shadowRoot!.querySelector('.lc-swatch')).toBeNull();
      }
  });

  it('always: today’s card, nothing folded', async () => {
    for (const shows of [true, undefined]) {
      const element = await card({ show_brightness: shows }, lamp('off', COLOUR));
      expect(fold(element)).toBeNull();
      expect(anatomy(element).classes).not.toContain('sl-card--switch');
      expect(anatomy(element).rulers).toBeGreaterThan(0);
      expect(anatomy(element).level).toBe(1);
    }
  });

  it('while on: the whole card open while the light is on, folded and out of reach while it is off or cannot be read', async () => {
    const on = await card({ show_brightness: 'when_on' }, lamp('on', COLOUR));
    expect(anatomy(on).classes).toContain('sl-card--fold');
    expect(fold(on)).toEqual({ open: true, inert: false });
    expect([anatomy(on).level, anatomy(on).switches]).toEqual([1, 1]);
    for (const state of ['off', 'unavailable']) {
      const shut = await card({ show_brightness: 'when_on' }, lamp(state, COLOUR));
      expect(fold(shut), state).toEqual({ open: false, inert: true });
      // laid out at its own size under the fold, for the card to ease to it
      expect(anatomy(shut).rulers).toBeGreaterThan(0);
    }
    // the compact style folds its ruler alone
    const compact = await card(
      { show_brightness: 'when_on', variant: 'compact' },
      lamp('off', COLOUR),
    );
    expect(anatomy(compact).classes).toEqual(
      expect.arrayContaining(['sl-card--compact', 'sl-card--fold']),
    );
    expect(fold(compact)).toEqual({ open: false, inert: true });
  });

  it('opens the same fold as the light turns on, and shuts it as it turns off: the card eases, never redrawn', async () => {
    const element = await card({ show_brightness: 'when_on' }, lamp('off', COLOUR));
    const before = element.shadowRoot!.querySelector('.sl-fold');
    element.hass = lamp('on', COLOUR);
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('.sl-fold')).toBe(before);
    expect(fold(element)).toEqual({ open: true, inert: false });
    element.hass = lamp('off', COLOUR);
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('.sl-fold')).toBe(before);
    expect(fold(element)).toEqual({ open: false, inert: true });
  });

  it('takes the rows of a masonry layout it has now: two while its head alone, four open', () => {
    const element = document.createElement('fluvy-light-card') as CardElement;
    const sized = (more: Record<string, unknown>, state: string): number => {
      element.setConfig(config(more));
      element.hass = lamp(state, COLOUR);
      return element.getCardSize();
    };
    expect(sized({ show_brightness: false }, 'on')).toBe(2);
    expect(sized({ show_brightness: 'when_on' }, 'off')).toBe(2);
    expect(sized({ show_brightness: 'when_on' }, 'on')).toBe(4);
    expect(sized({ show_brightness: true }, 'off')).toBe(4);
    // its grid row is the card's own, whatever it shows: a number of rows would cut it or leave a hole
    expect((element as unknown as FluvyLightCard).getGridOptions().rows).toBe('auto');
  });

  describe('its editor', () => {
    it('offers when to show it where the bulb dims, always by default', async () => {
      const editor = await FluvyLightCard.getConfigElement();
      (editor as HTMLElement & { hass: HomeAssistant }).hass = lamp('on', COLOUR);
      const drawnEditor = await drawEditor(editor, config());
      const form = cardForm(drawnEditor);
      expect(shownNames(form.schema)).toContain('show_brightness');
      expect(form.data['show_brightness']).toBe('true');
      expect((await shown(lamp('on', ONOFF))).fields).not.toContain('show_brightness');
    });

    it('never: none of what the head is over — the layout, the stepper, live update, the rulers’ and the colours’', async () => {
      const { fields, lists } = await shown(lamp('on', COLOUR), { show_brightness: false });
      for (const name of [...DIMMER, ...WHITE, 'show_color'])
        expect(fields, name).not.toContain(name);
      // its surface still wears the light's colour
      for (const name of ['show_brightness', 'tint', 'light_whites'])
        expect(fields, name).toContain(name);
      expect(lists).toEqual([]);
      const open = await shown(lamp('off', COLOUR), { show_brightness: 'when_on' });
      for (const name of [...DIMMER, ...WHITE, 'show_color'])
        expect(open.fields, name).toContain(name);
      expect(open.lists.length).toBe(1);
    });

    it('writes what is picked as the config says it: false, when_on, true', async () => {
      const editor = await drawEditor(await FluvyLightCard.getConfigElement(), config());
      const written = (word: string): Promise<LovelaceCardConfig> => {
        const next = nextConfig(editor);
        cardForm(editor).change('show_brightness', word);
        return next;
      };
      expect((await written('false'))['show_brightness']).toBe(false);
      await editor.updateComplete;
      expect(cardForm(editor).data['show_brightness']).toBe('false');
      expect((await written('when_on'))['show_brightness']).toBe('when_on');
      await editor.updateComplete;
      expect((await written('true'))['show_brightness']).toBe(true);
    });
  });
});
