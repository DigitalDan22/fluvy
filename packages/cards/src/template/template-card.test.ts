// @vitest-environment happy-dom
import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { glyphBody } from '@fluvy/ui';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';
import { cardForm, drawEditor, shownNames } from '../shared/fixtures/editor.js';
import { COMMON_ALIASES, normaliseConfig } from '../shared/config.js';
import { templateHeight } from '../template-family.js';
import { FluvyTemplateCard } from './template-card.js';

// the template card's chunk lands before a card is drawn
await familiesDefined;

const STAMP = '2026-10-22T19:00:00+00:00';
const state = (id: string, value: string, attributes: Record<string, unknown> = {}) => ({
  entity_id: id,
  state: value,
  attributes,
  last_changed: STAMP,
  last_updated: STAMP,
});

const LIVE = {
  'light.desk': state('light.desk', 'on', {
    friendly_name: 'Desk lamp',
    brightness: 128,
    supported_color_modes: ['brightness'],
  }),
  'switch.washer': state('switch.washer', 'on', { friendly_name: 'Washer' }),
  'sensor.office': state('sensor.office', '21.5', {
    friendly_name: 'Office',
    unit_of_measurement: '°C',
    device_class: 'temperature',
  }),
};
/** The same house out of reach, as Home Assistant writes it: the state unavailable, the capabilities kept. */
const DEAD = Object.fromEntries(
  Object.entries(LIVE).map(([id, s]) => [
    id,
    {
      ...s,
      state: 'unavailable',
      attributes: Object.fromEntries(
        Object.entries(s.attributes).filter(([key]) =>
          [
            'friendly_name',
            'supported_color_modes',
            'unit_of_measurement',
            'device_class',
          ].includes(key),
        ),
      ),
    },
  ]),
);

/** A socket that holds each `render_template` subscription, for the test to answer as Home Assistant would. */
function socket() {
  const open: Array<{ template: string; variables: unknown; answer: (event: unknown) => void }> =
    [];
  const connection = {
    subscribeMessage: (
      answer: (event: unknown) => void,
      message: { template: string; variables: unknown },
    ) => {
      open.push({ template: message.template, variables: message.variables, answer });
      return Promise.resolve(() => undefined);
    },
  };
  /** Answers every subscription to `template`: a result, or an error at its level. */
  const say = (template: string, event: unknown): void => {
    for (const entry of open) if (entry.template === template) entry.answer(event);
  };
  return { connection, open, say };
}

const house = (
  states: Record<string, unknown>,
  connection: unknown = socket().connection,
): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states,
    entities: Object.fromEntries(
      Object.keys(LIVE).map((id) => [id, { entity_id: id, area_id: 'office', device_id: null }]),
    ),
    devices: {},
    areas: { office: { area_id: 'office', name: 'Office', picture: null } },
    user: { id: 'u', name: 'Marta', is_admin: true },
    connection,
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => path,
    callService: () => Promise.resolve(),
  }) as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  config: LovelaceCardConfig;
  updateComplete: Promise<boolean>;
};

async function drawn(
  config: Omit<LovelaceCardConfig, 'type'>,
  states: Record<string, unknown> = LIVE,
  connection?: unknown,
  type = 'custom:fluvy-template-card',
): Promise<{ card: CardElement; tile: () => HTMLElement }> {
  const card = document.createElement(type.replace('custom:', '')) as CardElement;
  card.setConfig({ type, ...config });
  card.hass = house(states, connection);
  document.body.append(card);
  await card.updateComplete;
  return { card, tile: () => card.shadowRoot!.querySelector<HTMLElement>('.fv-tile')! };
}

/** Lets the socket's promises settle and the card draw what it was told. */
async function settled(card: CardElement): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await card.updateComplete;
}

const text = (tile: HTMLElement, selector: string): string | undefined =>
  tile.querySelector(selector)?.textContent?.trim().replace(/\s+/g, ' ');
const raw = (tile: HTMLElement, selector: string): string | undefined =>
  tile.querySelector(selector)?.textContent ?? undefined;

/** The parts a tile is drawn of, in their order, and the classes that size it (as the tile card's test reads them). */
const PARTS = [
  'fv-tile__tap',
  'fv-tile__head',
  'fv-ico',
  'fv-hit',
  'fv-tile__value',
  'fv-tile__text',
  'fv-tile__name',
  'fv-tile__state',
  'fv-tile__foot',
  'fv-readout',
];
const SIZING = ['fv-tile--compact', 'fv-tile--mini', 'fv-tile--footless', 'fv-tile--tight'];
const anatomy = (tile: HTMLElement): string[] => [
  ...SIZING.filter((cls) => tile.classList.contains(cls)),
  ...[...tile.querySelectorAll('*')].flatMap((el) =>
    el.tagName === 'FLUVY-RULER' ? ['ruler'] : PARTS.filter((part) => el.classList.contains(part)),
  ),
];

const VARIANTS = ['compact', 'mini', 'large'] as const;

afterEach(() => document.body.replaceChildren());

describe('a Mushroom template card pastes in', () => {
  const read = (config: Record<string, unknown>): LovelaceCardConfig =>
    normaliseConfig(
      { type: 'custom:fluvy-template-card', ...config } as LovelaceCardConfig,
      FluvyTemplateCard.aliases!,
      COMMON_ALIASES,
    );

  it('its words, its colour and its layout by their names here; what has no part here is let go', () => {
    expect(
      read({
        entity: 'light.desk',
        primary: '{{ states(entity) }}',
        secondary: 'Desk',
        icon: 'mdi:lamp',
        icon_color: 'amber',
        layout: 'vertical',
        fill_container: true,
        multiline_secondary: true,
        double_tap_action: { action: 'toggle' },
        entity_id: ['light.desk'],
        picture: '/local/lamp.png',
        badge_icon: 'mdi:alert',
        badge_color: 'red',
      }),
    ).toEqual({
      type: 'custom:fluvy-template-card',
      entity: 'light.desk',
      name: '{{ states(entity) }}',
      secondary: 'Desk',
      icon: 'mdi:lamp',
      color: 'amber',
      variant: 'mini',
      // not drawn this cycle, and kept for when they are
      picture: '/local/lamp.png',
      badge_icon: 'mdi:alert',
      badge_color: 'red',
    });
  });

  it('a horizontal or default layout is the compact tile; a layout of ours is a variant as on every card', () => {
    expect(read({ layout: 'horizontal' })['variant']).toBe('compact');
    expect(read({ layout: 'default' })['variant']).toBe('compact');
    expect(read({ layout: 'large' })['variant']).toBe('large');
    // a name of ours wins over Mushroom's
    expect(read({ name: 'Mine', primary: 'Theirs' })['name']).toBe('Mine');
  });

  it('Mushroom’s later `vertical: true` is the mini tile; `false` says nothing and is let go', () => {
    expect(read({ vertical: true })).toEqual({
      type: 'custom:fluvy-template-card',
      variant: 'mini',
    });
    expect(read({ vertical: false })).toEqual({ type: 'custom:fluvy-template-card' });
    // a variant or a layout of its own wins
    expect(read({ vertical: true, variant: 'large' })['variant']).toBe('large');
  });

  it('YAML’s `active: true` and `false` are always and never', () => {
    expect(read({ active: true })['active']).toBe('always');
    expect(read({ active: false })['active']).toBe('never');
  });
});

describe('heights: a tile as the tile card draws it', () => {
  it.each([
    [{}, 76],
    [{ variant: 'compact' }, 76],
    [{ variant: 'mini' }, 108],
    [{ variant: 'large' }, 168],
    [{ layout: 'vertical' }, 108],
    [{ layout: 'horizontal' }, 76],
    [{ vertical: true }, 108],
    [{ vertical: false }, 76],
  ])('%j: %i', (config, height) => {
    const full = { type: 'custom:fluvy-template-card', ...config };
    expect(templateHeight(full)).toBe(height);
    expect(FluvyTemplateCard.layoutHeight(full)).toBe(height);
  });

  it.each(VARIANTS)('%s draws that size of tile', async (variant) => {
    const { tile } = await drawn({ entity: 'light.desk', variant });
    expect(tile().classList.contains('fv-tile--compact')).toBe(variant === 'compact');
    expect(tile().classList.contains('fv-tile--mini')).toBe(variant === 'mini');
  });
});

describe('twins', () => {
  it.each(VARIANTS)(
    'with no template, a %s tile is the tile card’s tile of the same entity',
    async (variant) => {
      for (const entity of ['light.desk', 'switch.washer', 'sensor.office']) {
        const ours = (await drawn({ entity, variant })).tile().outerHTML;
        document.body.replaceChildren();
        const tile = (
          await drawn({ entity, size: variant }, LIVE, undefined, 'custom:fluvy-tile-card')
        )
          .tile()
          .outerHTML.replace(/<!--[^>]*-->/g, '');
        document.body.replaceChildren();
        expect(ours.replace(/<!--[^>]*-->/g, ''), entity).toBe(tile);
      }
    },
  );

  it.each(VARIANTS)(
    'out of reach, a %s tile keeps the live one’s anatomy and size, its templates still answered',
    async (variant) => {
      const config = {
        entity: 'switch.washer',
        variant,
        name: '{{ states(entity) }}',
        secondary: 'Laundry',
        readouts: ['sensor.office'],
      };
      const live = await drawn(config);
      const liveParts = anatomy(live.tile());
      document.body.replaceChildren();
      const dead = await drawn(config, DEAD);
      expect(anatomy(dead.tile())).toEqual(liveParts);
      expect(dead.tile().classList.contains('fv-tile--off')).toBe(true);
      // what cannot be read says so, whatever the line was asked to say
      expect(text(dead.tile(), '.fv-tile__state')).toContain('Unavailable');
    },
  );
});

describe('pending: the entity’s own, and a blank line where the words will land', () => {
  const config = {
    entity: 'light.desk',
    name: "{{ 'Reading' if is_state(entity, 'on') else 'Dark' }}",
    secondary: '{{ user }}',
    icon: "{{ 'mdi:lamp' }}",
    color: "{{ 'warning' }}",
    active: "{{ is_state('light.desk', 'off') }}",
  };

  it('its glyph, its palette and its fill are the entity’s; its name and line a blank line each', async () => {
    const { tile } = await drawn(config);
    expect(raw(tile(), '.fv-tile__name')).toBe('\u00a0');
    expect(raw(tile(), '.fv-tile__state')).toBe('\u00a0');
    // the bulb, in the light's tone, lit as the light is
    expect(tile().querySelector('.fv-ico ha-icon')).toBeNull();
    expect(tile().classList.contains('fv-tile--light')).toBe(true);
    expect(tile().classList.contains('is-on')).toBe(true);
    // a reader hears the entity's name, never a blank
    expect(tile().querySelector('.fv-tile__tap')!.getAttribute('aria-label')).toBe('Desk lamp');
  });

  it('answered, every field is what its template says; the switch still says the light', async () => {
    const wire = socket();
    const { card, tile } = await drawn({ ...config, variant: 'large' }, LIVE, wire.connection);
    await settled(card);
    expect(wire.open.map((o) => o.template).sort()).toEqual(
      Object.values(config)
        .filter((value) => value.includes('{{'))
        .sort(),
    );
    // the variables Home Assistant renders with: the entity and the person
    expect(wire.open[0]!.variables).toEqual({ entity: 'light.desk', user: 'Marta' });
    wire.say(config.name, { result: 'Reading' });
    wire.say(config.secondary, { result: 'Marta' });
    wire.say(config.icon, { result: 'mdi:lamp' });
    wire.say(config.color, { result: 'warning' });
    wire.say(config.active, { result: false });
    await settled(card);
    expect(text(tile(), '.fv-tile__name')).toBe('Reading');
    expect(text(tile(), '.fv-tile__state')).toBe('Marta');
    // the person's own words: what fits of them ends in an ellipsis as a name does, never left out
    expect(tile().querySelector('.fv-tile__state')!.hasAttribute('data-name')).toBe(true);
    expect((tile().querySelector('.fv-ico ha-icon') as HTMLElement & { icon?: string }).icon).toBe(
      'mdi:lamp',
    );
    expect(tile().classList.contains('fv-tile--warning')).toBe(true);
    // the fill says what the template says; the switch what the light is
    expect(tile().classList.contains('is-on')).toBe(false);
    expect(tile().querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('a warning is not an answer; an answer that follows lands', async () => {
    const wire = socket();
    const { card, tile } = await drawn(config, LIVE, wire.connection);
    await settled(card);
    wire.say(config.secondary, { error: "'room' is undefined", level: 'WARNING' });
    await settled(card);
    expect(raw(tile(), '.fv-tile__state')).toBe('\u00a0');
    wire.say(config.secondary, { result: 'Marta' });
    await settled(card);
    expect(text(tile(), '.fv-tile__state')).toBe('Marta');
  });

  it('a template edited keeps the last answer until the new one lands', async () => {
    const wire = socket();
    const { card, tile } = await drawn(config, LIVE, wire.connection);
    await settled(card);
    wire.say(config.name, { result: 'Reading' });
    await settled(card);
    card.setConfig({ type: 'custom:fluvy-template-card', ...config, name: '{{ "Desk" }}' });
    await settled(card);
    expect(text(tile(), '.fv-tile__name')).toBe('Reading');
    wire.say('{{ "Desk" }}', { result: 'Desk' });
    await settled(card);
    expect(text(tile(), '.fv-tile__name')).toBe('Desk');
  });
});

describe('a template that fails shows nothing of itself', () => {
  it('no name (its blank line kept), no line; its icon, colour and fill the entity’s; a reader hears the entity', async () => {
    const wire = socket();
    const config = {
      entity: 'light.desk',
      name: '{{ nonsense( }}',
      secondary: '{{ nonsense( }}',
      icon: '{{ nonsense( }}',
      color: '{{ nonsense( }}',
    };
    const { card, tile } = await drawn(config, LIVE, wire.connection);
    await settled(card);
    wire.say(config.name, { error: 'TemplateSyntaxError', level: 'ERROR' });
    await settled(card);
    // the name's line stays, blank, as it was while pending: a large tile's line never climbs into its place
    expect(raw(tile(), '.fv-tile__name')).toBe('\u00a0');
    expect(raw(tile(), '.fv-tile__state')).toBe('');
    expect(tile().innerHTML).not.toContain('nonsense');
    expect(tile().querySelector('.fv-ico ha-icon')).toBeNull();
    expect(tile().classList.contains('fv-tile--light')).toBe(true);
    expect(tile().classList.contains('is-on')).toBe(true);
    expect(tile().querySelector('.fv-tile__tap')!.getAttribute('aria-label')).toBe('Desk lamp');
  });

  it('an icon that names no icon is the entity’s glyph; a colour no palette knows is the entity’s', async () => {
    const wire = socket();
    const config = { entity: 'switch.washer', icon: '{{ "lamp" }}', color: '{{ "banana" }}' };
    const { card, tile } = await drawn(config, LIVE, wire.connection);
    await settled(card);
    wire.say(config.icon, { result: 'lamp' });
    wire.say(config.color, { result: 'banana' });
    await settled(card);
    expect(tile().querySelector('.fv-ico ha-icon')).toBeNull();
    expect(tile().hasAttribute('data-accent')).toBe(false);
    expect(tile().classList.contains('fv-tile--accent')).toBe(true);
  });
});

describe('a tile of nothing', () => {
  it.each(VARIANTS)(
    '%s: the live skin, no reading, no button where nothing runs; a reader hears “Template”',
    async (variant) => {
      const { tile } = await drawn({ variant, icon: 'mdi:home' });
      expect(tile().classList.contains('fv-tile--off')).toBe(false);
      expect(tile().classList.contains('is-on')).toBe(false);
      expect(tile().querySelector('.fv-tile__value')).toBeNull();
      expect(tile().querySelector('.fv-tile__tap')).toBeNull();
      expect(text(tile(), '.fv-tile__state')).toBe('');
      expect(
        (tile().querySelector('.fv-ico ha-icon') as HTMLElement & { icon?: string }).icon,
      ).toBe('mdi:home');
    },
  );

  it('a button for an action that runs without an entity, named by its words or “Template”', async () => {
    const { tile } = await drawn({ tap_action: { action: 'navigate', navigation_path: '/x' } });
    expect(tile().querySelector('.fv-tile__tap')!.getAttribute('aria-label')).toBe('Template');
    document.body.replaceChildren();
    const named = await drawn({
      name: 'Garden',
      tap_action: { action: 'navigate', navigation_path: '/x' },
    });
    expect(named.tile().querySelector('.fv-tile__tap')!.getAttribute('aria-label')).toBe('Garden');
  });

  it('on as it is asked: always, or as its template answers', async () => {
    expect((await drawn({ active: 'always' })).tile().classList.contains('is-on')).toBe(true);
    document.body.replaceChildren();
    const wire = socket();
    const { card, tile } = await drawn({ active: '{{ 3 }}' }, LIVE, wire.connection);
    await settled(card);
    // pending, a tile of nothing has no state of its own to hold: off
    expect(tile().classList.contains('is-on')).toBe(false);
    wire.say('{{ 3 }}', { result: 3 });
    await settled(card);
    expect(tile().classList.contains('is-on')).toBe(true);
    expect(wire.open[0]!.variables).toEqual({ entity: undefined, user: 'Marta' });
  });

  it('its icon is the template’s code braces until it is given one, never the three dots of a “more” round', async () => {
    const { tile } = await drawn({ name: 'Garden' });
    expect(tile().querySelector('.fv-ico ha-icon')).toBeNull();
    const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map(([, d]) => d);
    expect(paths(tile().querySelector('.fv-ico svg')!.innerHTML)).toEqual(
      paths(glyphBody('code').body),
    );
  });
});

describe('the line under the name', () => {
  it.each([
    [{}, 'On'],
    [{ secondary: 'area' }, 'Office'],
    [{ secondary: 'none' }, ''],
    [{ secondary: 'Plugged in by the window' }, 'Plugged in by the window'],
    // YAML's figure where words were meant, and its `name: 2`, are words
    [{ secondary: 2, name: 2 }, '2'],
  ])('%j says %j', async (config, line) => {
    const { tile } = await drawn({ entity: 'switch.washer', ...config });
    expect(text(tile(), '.fv-tile__state') ?? '').toBe(line);
  });

  // a button never pressed is `unknown`, its normal state (#92): the person's line is said, the state only when asked
  const NEVER_PRESSED = {
    ...LIVE,
    'button.dishwasher_start': state('button.dishwasher_start', 'unknown', {
      friendly_name: 'Start',
    }),
  };
  it.each(VARIANTS)('%s: a button never pressed says the person’s line', async (variant) => {
    const wire = socket();
    const template = "{{ 'Starts the selected cycle' }}";
    const config = { entity: 'button.dishwasher_start', variant, secondary: template };
    const { card, tile } = await drawn(config, NEVER_PRESSED, wire.connection);
    await settled(card);
    wire.say(template, { result: 'Starts the selected cycle' });
    await settled(card);
    expect(text(tile(), '.fv-tile__state')).toBe('Starts the selected cycle');
    expect(tile().querySelector('.fv-tile__state')!.hasAttribute('data-name')).toBe(true);
    expect(tile().classList.contains('fv-tile--off')).toBe(false);
  });

  it.each([
    [{}, 'Unknown'],
    [{ secondary: 'state' }, 'Unknown'],
    [{ secondary: 'Starts the selected cycle' }, 'Starts the selected cycle'],
    [{ secondary: 'none' }, ''],
  ])('a button never pressed, %j, says %j', async (config, line) => {
    const { tile } = await drawn({ entity: 'button.dishwasher_start', ...config }, NEVER_PRESSED);
    expect(text(tile(), '.fv-tile__state') ?? '').toBe(line);
  });
});

describe('the stub', () => {
  it('names its entity by a template, or greets the person without one', () => {
    expect(FluvyTemplateCard.getStubConfig(undefined, ['sensor.x', 'switch.washer'])).toEqual({
      type: 'custom:fluvy-template-card',
      entity: 'switch.washer',
      name: "{{ state_attr(entity, 'friendly_name') }}",
    });
    expect(FluvyTemplateCard.getStubConfig(undefined, [])).toEqual({
      type: 'custom:fluvy-template-card',
      name: '{{ user }}',
      icon: 'mdi:account',
    });
  });
});

describe('the editor offers the colour at rest where it can act', () => {
  const STATES = {
    ...LIVE,
    'binary_sensor.door': state('binary_sensor.door', 'off', {
      friendly_name: 'Front door',
      device_class: 'door',
    }),
  };
  const tint = async (config: Record<string, unknown>): Promise<boolean> => {
    const editor = await FluvyTemplateCard.getConfigElement();
    (editor as HTMLElement & { hass: HomeAssistant }).hass = house(STATES);
    const drawnEditor = await drawEditor(editor, { type: 'custom:fluvy-template-card', ...config });
    return shownNames(cardForm(drawnEditor).schema).includes('tint');
  };

  it('a colour, or a tone that washes at rest — its own, else its entity’s', async () => {
    expect(await tint({ color: 'teal' })).toBe(true);
    expect(await tint({ tone: 'heat' })).toBe(true);
    // a tile of nothing in the accent, a switch in its own
    expect(await tint({})).toBe(true);
    expect(await tint({ entity: 'switch.washer' })).toBe(true);
    // a shut door says nothing at rest, unless it is given a colour or a tone
    expect(await tint({ entity: 'binary_sensor.door' })).toBe(false);
    expect(await tint({ entity: 'binary_sensor.door', color: 'teal' })).toBe(true);
    expect(await tint({ tone: 'warning' })).toBe(false);
  });

  it('never for a tile that is never at rest', async () => {
    expect(await tint({ color: 'teal', active: 'always' })).toBe(false);
    expect(await tint({ color: 'teal', active: 'never' })).toBe(true);
  });
});
