// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { applianceHeight } from '../appliances-family.js';
import { FluvyApplianceCard } from './appliance-card.js';
import { FluvyAppliancesCard } from './appliances-card.js';
import { callFor, commandsOf, mealAmount, resetCall, writable } from './commands.js';
import { houseOf, PETKIT_PLAN, petFixtures, type ApplianceFixture } from './fixtures/index.js';
import { applianceDevices, byWords, kindOf, signalsOf } from './kinds.js';
import { forKind, maintenanceItem, maintenanceList } from './maintenance.js';
import { planMeals } from './pets.js';
import { findAppliance, readAppliance } from './reading.js';
import { applianceEntities } from './roles.js';
import { statusOfWord } from './status.js';

if (!customElements.get('fluvy-appliance-card'))
  customElements.define('fluvy-appliance-card', FluvyApplianceCard);
if (!customElements.get('fluvy-appliances-card'))
  customElements.define('fluvy-appliances-card', FluvyAppliancesCard);

/*
 * Pet devices (#112), as PetKit (Jezza34000/homeassistant_petkit@79131c8, 2026-11-03) and PETLIBRO
 * (jjjonesjr33/petlibro@a28fe35, 2026-10-24) register them: what they are, who plays what, what they ask to be looked
 * after, what they are doing, their meals and visits, the writes their source pins, and the card that draws them.
 * The house's clock is UTC (`config.time_zone`), so the plan's times are the house's.
 */

/** Thursday 17 September 2026, 21:47:12 in the house (UTC). */
const NOW = Date.parse('2026-09-17T21:47:12Z');
const AT = new Date(NOW).toISOString();
const FIXTURES = petFixtures(NOW);
const byDevice = (id: string): ApplianceFixture =>
  FIXTURES.find((fixture) => fixture.device.id === id) as ApplianceFixture;

/** A house of the pet devices, some states changed, Home Assistant's calls recorded. */
function house(changes: Record<string, Partial<HassEntity>> = {}): HomeAssistant & {
  calls: Array<{ domain: string; service: string; data: Record<string, unknown> }>;
} {
  const calls: Array<{ domain: string; service: string; data: Record<string, unknown> }> = [];
  const base = houseOf(FIXTURES, NOW, {
    config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'UTC' },
  } as Partial<HomeAssistant>);
  const states = { ...base.states };
  for (const [id, change] of Object.entries(changes))
    states[id] = {
      ...(states[id] as HassEntity),
      ...change,
      attributes: { ...states[id]?.attributes, ...change.attributes },
    } as HassEntity;
  return {
    ...base,
    states,
    calls,
    themes: { darkMode: false },
    user: { id: 'u', name: 'U', is_admin: true },
    callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
      calls.push({ domain, service, data });
    },
    callWS: async () => ({}),
  } as unknown as HomeAssistant & { calls: typeof calls };
}

const HOUSE = house();

type Mounted = HTMLElement & { updateComplete: Promise<boolean>; shadowRoot: ShadowRoot };

async function mount(
  config: Record<string, unknown>,
  hass: HomeAssistant = HOUSE,
  tag = 'fluvy-appliance-card',
): Promise<Mounted> {
  const card = document.createElement(tag) as Mounted & {
    setConfig(config: LovelaceCardConfig): void;
    hass: HomeAssistant;
  };
  card.setConfig({ type: `custom:${tag}`, _now: AT, ...config } as LovelaceCardConfig);
  card.hass = hass;
  (card as unknown as { width: number }).width = 360;
  document.body.append(card);
  await card.updateComplete;
  await card.updateComplete;
  return card;
}

const text = (el: Element | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const all = (card: Mounted, selector: string): string[] =>
  [...card.shadowRoot.querySelectorAll(selector)].map((el) => text(el));
/** A row's words: its name and its value. */
const rows = (card: Mounted): string[] =>
  [...card.shadowRoot.querySelectorAll('.ap-item')].map((el) =>
    [...el.querySelectorAll('.ap-item__text, .ap-item__value')].map((part) => text(part)).join(' '),
  );
/** A tile's words: its name and its value. */
const tiles = (card: Mounted, selector = '.ap-tile'): string[] =>
  [...card.shadowRoot.querySelectorAll(selector)].map(
    (el) =>
      `${text(el.querySelector('.ap-tile__label'))} ${text(el.querySelector('.ap-tile__value'))}`,
  );
const sections = (card: Mounted): string[] =>
  [...(card.shadowRoot.querySelector('article')?.children ?? [])].map(
    (el) =>
      `${el.tagName.toLowerCase()}.${[...el.classList]
        .filter((c) => !/^is-|^fv-tone--|^fv-round--/.test(c))
        .sort()
        .join('.')}`,
  );

afterEach(() => {
  document.body.replaceChildren();
});

describe('what a pet device is', () => {
  it('is known by PetKit’s device type, PETLIBRO’s product code, else by its keys', () => {
    for (const fixture of FIXTURES) {
      const verdict = kindOf(signalsOf(HOUSE, fixture.device.id));
      if (fixture.expected.kind)
        expect(verdict, fixture.title).toEqual({
          kind: fixture.expected.kind,
          by: 'model',
        });
      else expect(verdict, fixture.title).toBeUndefined();
    }
    // without the model the integration's keys say it
    const anonymous = {
      ...HOUSE,
      devices: Object.fromEntries(
        Object.entries(HOUSE.devices).map(([id, entry]) => [
          id,
          { ...entry, model: null, model_id: null },
        ]),
      ),
    } as HomeAssistant;
    for (const device of [
      'pk-feeder',
      'pk-fountain',
      'pk-litter',
      'pl-feeder',
      'pl-fountain',
      'pl-litter',
    ])
      expect(kindOf(signalsOf(anonymous, device)), device).toEqual({
        kind: byDevice(device).expected.kind,
        by: 'keys',
      });
  });

  it('is known by its name in the house’s languages, and a glitter lamp is no litter box', () => {
    expect(byWords('Cat feeder')).toEqual({ kind: 'feeder', by: 'words' });
    expect(byWords('Futterautomat Küche')).toEqual({ kind: 'feeder', by: 'words' });
    expect(byWords('自動給餌器')).toEqual({ kind: 'feeder', by: 'words' });
    expect(byWords('Trinkbrunnen')).toEqual({ kind: 'fountain', by: 'words' });
    expect(byWords('Fontaine à eau du chat')).toEqual({ kind: 'fountain', by: 'words' });
    expect(byWords('Arenero')).toEqual({ kind: 'litter_box', by: 'words' });
    expect(byWords('Kattenbak')).toEqual({ kind: 'litter_box', by: 'words' });
    expect(byWords('猫トイレ')).toEqual({ kind: 'litter_box', by: 'words' });
    expect(byWords('Glitter lamp')).toBeUndefined();
  });

  it('is one of the house’s appliances; a pet of its own never is', () => {
    const listed = applianceDevices(HOUSE);
    for (const fixture of FIXTURES)
      expect(listed.includes(fixture.device.id), fixture.title).toBe(fixture.expected.listed);
  });

  it('finds its roles by its integration’s keys', () => {
    for (const fixture of FIXTURES) {
      const { roles } = applianceEntities(HOUSE, fixture.device.id);
      for (const [role, entity] of Object.entries(fixture.expected.roles ?? {}))
        expect(roles[role as keyof typeof roles], `${fixture.title}: ${role}`).toBe(entity);
    }
    // a second hopper's meal, a box's occupancy, a camera are none of the card's business
    const feeder = applianceEntities(HOUSE, 'pk-feeder');
    expect(Object.values(feeder.roles)).not.toContain('camera.futterautomat');
    expect(Object.values(feeder.roles)).not.toContain('binary_sensor.futterautomat_eating');
  });
});

describe('what it asks to be looked after', () => {
  const items = (device: string, hass = HOUSE) =>
    readAppliance(hass, findAppliance(hass, { device }), {}, NOW).maintenance;

  it('reads a feeder’s food and desiccant, a fountain’s water and filter, a box’s litter, drawer and deodorant', () => {
    expect(items('pk-feeder')).toEqual([
      expect.objectContaining({ key: 'food', severity: 'ok', level: 64 }),
      expect.objectContaining({ key: 'desiccant', severity: 'ok', days: 12 }),
    ]);
    expect(items('pk-fountain').map(({ key, severity }) => [key, severity])).toEqual([
      ['water_tank', 'ok'],
      ['water_filter', 'ok'],
    ]);
    expect(items('pk-litter')).toEqual([
      expect.objectContaining({ key: 'litter', severity: 'ok', level: 72 }),
      expect.objectContaining({ key: 'waste', severity: 'ok' }),
      expect.objectContaining({ key: 'deodorant', severity: 'ok', days: 18 }),
    ]);
  });

  it('says what is out due and what will be soon, keeping what is left beside a flag', () => {
    const low = house({
      'binary_sensor.futterautomat_food_level': { state: 'on' },
      'sensor.futterautomat_food_left': { state: '3' },
      'sensor.futterautomat_desiccant_left_days': { state: '2' },
      'binary_sensor.granary_food_status': { state: 'on' },
      'sensor.granary_desiccant_remaining_days': { state: '0' },
    });
    expect(items('pk-feeder', low)).toEqual([
      expect.objectContaining({ key: 'food', severity: 'due', level: 3 }),
      expect.objectContaining({ key: 'desiccant', severity: 'soon', days: 2 }),
    ]);
    // PETLIBRO's food flag says it runs low (soon); a desiccant with no day left is due
    expect(items('pl-feeder', low).map(({ key, severity }) => [key, severity])).toEqual([
      ['desiccant', 'due'],
      ['food', 'soon'],
    ]);
    // a week's days is soon by default, the card's own otherwise
    const found = { key: 'desiccant', form: 'days' } as const;
    const days = (state: string, lowDays?: number) =>
      maintenanceItem(
        found,
        { ...HOUSE.states['sensor.futterautomat_desiccant_left_days'], state } as HassEntity,
        20,
        lowDays,
      )?.severity;
    expect(days('7')).toBe('soon');
    expect(days('8')).toBe('ok');
    expect(days('8', 10)).toBe('soon');
    expect(days('0')).toBe('due');
  });

  it('reads the Luma’s fountain keys as its litter and its filter', () => {
    expect(forKind('water_tank', 'litter_box')).toBe('litter');
    expect(forKind('water_filter', 'litter_box')).toBe('filter');
    expect(forKind('water_tank', 'fountain')).toBe('water_tank');
    expect(items('pl-litter')).toEqual([
      expect.objectContaining({ key: 'filter', severity: 'ok', days: 40 }),
      expect.objectContaining({ key: 'litter', severity: 'ok', level: 81 }),
      expect.objectContaining({ key: 'waste', severity: 'ok' }),
    ]);
  });

  it('keeps of two as pressing the first, with what the other says that it does not', () => {
    const a = { key: 'water_filter', entity: 'a', severity: 'ok', level: 62 } as const;
    const b = { key: 'water_filter', entity: 'b', severity: 'ok', days: 18 } as const;
    expect(maintenanceList([a, b])).toEqual([{ ...a, days: 18 }]);
  });
});

describe('what it is doing', () => {
  const status = (device: string, hass = HOUSE) =>
    readAppliance(hass, findAppliance(hass, { device }), {}, NOW);

  it('folds a litter box’s work states into the card’s: at rest, at work, paused for a pet', () => {
    expect(statusOfWord('idle', 'petkit')).toBe('idle');
    expect(statusOfWord('cleaning', 'petkit')).toBe('running');
    expect(statusOfWord('leveling', 'petkit')).toBe('running');
    expect(statusOfWord('cleaning_paused_pet_entered', 'petkit')).toBe('paused');
    expect(statusOfWord('dumping_paused', 'petkit')).toBe('paused');
    expect(statusOfWord('IDLE', 'petlibro')).toBe('idle');
    // a word every integration shares keeps its own: a delayed start paused is still waiting
    expect(statusOfWord('delay_paused')).toBe('scheduled');
  });

  it('knows a litter box lit, calibrating or resetting itself: at rest with its light on, busy with nothing to pause', () => {
    // utils.py map_work_state: its light (work mode 7) is no job; a calibration (5), a reset (3), a levelling (4) and a
    // clean's own reset (its process at 3) say no pause; only a clean, a dump and its maintenance say they paused
    const at = (word: string) => {
      const hass = house({ 'sensor.katzenklo_state': { state: word } });
      return readAppliance(hass, findAppliance(hass, { device: 'pk-litter' }), {}, NOW);
    };
    const actions = (word: string): string[] => at(word).commands.map((c) => c.action);
    expect(statusOfWord('light', 'petkit')).toBe('idle');
    expect(at('light')).toMatchObject({ status: 'idle', word: 'Light on' });
    expect(actions('light')).not.toContain('pause');
    for (const word of ['calibrating', 'resetting', 'resetting_device', 'leveling']) {
      expect(at(word).status, word).toBe('running');
      expect(actions(word), word).not.toContain('pause');
    }
    for (const word of ['cleaning', 'dumping', 'maintenance'])
      expect(actions(word), word).toContain('pause');
    // its deodorizing and its deodorant's resets, which its translations leave unnamed: our words, no pause
    expect(at('odor_removal')).toMatchObject({ status: 'running', word: 'Removing odours' });
    for (const word of ['reset_deodorant', 'reset_max_deodorant']) {
      expect(at(word), word).toMatchObject({ status: 'running', word: 'Resetting deodorant' });
      expect(actions(word), word).not.toContain('pause');
    }
  });

  it('feeds while its flag says so, and is out of reach where it says it is not reached', () => {
    const feeding = house({ 'binary_sensor.futterautomat_feeding': { state: 'on' } });
    expect(status('pk-feeder', feeding)).toMatchObject({
      status: 'running',
      statusWord: 'appliance.feeding',
    });
    const offline = house({
      'sensor.futterautomat_device_status': { state: 'offline' },
      'binary_sensor.granary_wi_fi': { state: 'off' },
    });
    expect(status('pk-feeder', offline).status).toBe('offline');
    expect(status('pl-feeder', offline).status).toBe('offline');
  });

  it('fails as it says: PetKit’s message (“No error” is none), PETLIBRO’s dispenser flag', () => {
    expect(status('pk-feeder').status).toBe('idle');
    const failed = house({
      'sensor.futterautomat_error': { state: 'Food outlet blocked' },
      'binary_sensor.granary_food_dispenser': { state: 'on' },
    });
    expect(status('pk-feeder', failed)).toMatchObject({
      status: 'error',
      attention: [expect.objectContaining({ text: 'Food outlet blocked' })],
    });
    expect(status('pl-feeder', failed).status).toBe('error');
  });
});

describe('its meals and visits', () => {
  const zone = { config: { time_zone: 'UTC' } } as HomeAssistant;
  const plan = (rows: unknown[], state = 'on') =>
    ({ entity_id: 'switch.plan', state, attributes: { schedule: rows } }) as unknown as HassEntity;
  const at = (iso: string): number => Date.parse(iso);

  it('reads PetKit’s plan in the house’s time: the last given, the next to come, else tomorrow’s first', () => {
    expect(planMeals(zone, plan(PETKIT_PLAN), NOW)).toEqual({
      last: { at: at('2026-09-17T18:00:00Z'), amount: 20 },
      next: { at: at('2026-09-17T23:00:00Z'), amount: 10 },
    });
    // after the last meal of the day, tomorrow's first; a plan switched off has none to come
    const late = at('2026-09-17T23:30:00Z');
    expect(planMeals(zone, plan(PETKIT_PLAN), late).next).toEqual({
      at: at('2026-09-18T07:30:00Z'),
      amount: 20,
    });
    expect(planMeals(zone, plan(PETKIT_PLAN, 'off'), NOW).next).toBeNull();
    // the house's zone, not the browser's: 23:00 in Madrid is 21:00 UTC, gone by the sheet's evening
    const madrid = { config: { time_zone: 'Europe/Madrid' } } as HomeAssistant;
    expect(planMeals(madrid, plan(PETKIT_PLAN), NOW).next?.at).toBe(at('2026-09-18T05:30:00Z'));
  });

  it('reads PETLIBRO’s rows, a meal skipped today and one on another day', () => {
    const rows = [
      { time: '08:00', amount_g: 20, state: 'dispensed', today: true, enabled: true },
      { time: '22:00', amount_g: 10, state: 'skipped', today: true, enabled: true },
      {
        time: '06:30',
        amount_g: 15,
        state: 'pending',
        today: false,
        enabled: true,
        repeat_days: [5],
      },
      {
        time: '07:00',
        amount_g: 25,
        state: 'pending',
        today: false,
        enabled: true,
        repeat_days: [6],
      },
    ];
    // Thursday evening: the 22:00 is skipped, tomorrow is Friday (5), the 06:30's day
    expect(planMeals(zone, plan(rows), NOW)).toEqual({
      last: { at: at('2026-09-17T08:00:00Z'), amount: 20 },
      next: { at: at('2026-09-18T06:30:00Z'), amount: 15 },
    });
  });

  it('takes PETLIBRO’s sensors over its plan; a box’s last use is when its count rose, by whom', () => {
    const pet = (device: string, hass = HOUSE) =>
      readAppliance(hass, findAppliance(hass, { device }), {}, NOW).pet;
    expect(pet('pl-feeder')?.meals).toEqual({
      last: { at: NOW - 227 * 60_000, amount: 20 },
      next: { at: NOW + 43 * 60_000, amount: 20 },
      unit: 'g',
    });
    expect(pet('pk-feeder')?.meals.unit).toBe('g');
    expect(pet('pk-litter')?.visit).toEqual({ at: NOW - 42 * 60_000, pet: 'Luna' });
    expect(pet('pk-fountain')?.visit).toEqual({ at: NOW - 25 * 60_000, pet: '' });
    // none today, no use to say
    const none = house({ 'sensor.katzenklo_times_used': { state: '0' } });
    expect(pet('pk-litter', none)?.visit).toBeNull();
  });
});

describe('the writes their source pins', () => {
  const call = (device: string, action: Parameters<typeof callFor>[3], amount?: number) => {
    const found = findAppliance(HOUSE, { device });
    return callFor(HOUSE, found.platform, found.entities.roles, action, amount);
  };

  it('PetKit: a meal is its amount written to the text, the smallest it takes unless the card names one', () => {
    // petkit text.py:66-108, :174-181 (the pattern of the amounts), :196-213 (the meal sent as the value is set)
    expect(call('pk-feeder', 'feed')).toEqual({
      domain: 'text',
      service: 'set_value',
      data: { entity_id: 'text.futterautomat_manual_feed', value: '10' },
    });
    expect(call('pk-feeder', 'feed', 30)?.data['value']).toBe('30');
    // an amount the feeder does not take is never sent: its smallest instead
    expect(call('pk-feeder', 'feed', 35)?.data['value']).toBe('10');
    // number.py:107-122: the first Fresh Element's meal is its number's value, in its steps
    const fresh = { attributes: { min: 0, max: 400, step: 20 } } as unknown as HassEntity;
    expect(mealAmount(fresh)).toBe(20);
    expect(mealAmount(fresh, 60)).toBe(60);
  });

  it('PetKit: a box’s scoop, deodorizing and levelling are presses; its pause and continue, a fountain’s power', () => {
    // petkit button.py:107-265, :486-494
    for (const [action, entity] of [
      ['clean', 'button.katzenklo_scoop'],
      ['deodorize', 'button.katzenklo_deodorize'],
      ['level', 'button.katzenklo_level_litter'],
      ['pause', 'button.katzenklo_action_pause'],
      ['resume', 'button.katzenklo_action_continue'],
    ] as const)
      expect(call('pk-litter', action)).toEqual({
        domain: 'button',
        service: 'press',
        data: { entity_id: entity },
      });
    expect(call('pk-fountain', 'power_off')).toEqual({
      domain: 'switch',
      service: 'turn_off',
      data: { entity_id: 'switch.trinkbrunnen_power' },
    });
    // the dump that empties the whole box is never a card's
    expect(
      JSON.stringify(
        commandsOf({
          hass: HOUSE,
          platform: 'petkit',
          roles: applianceEntities(HOUSE, 'pk-litter').roles,
          status: 'idle',
        }),
      ),
    ).not.toContain('dump');
  });

  it('PETLIBRO: its manual feed, the Luma’s clean, level and stop are presses', () => {
    // petlibro button.py:60-64, :755-777
    expect(call('pl-feeder', 'feed')).toEqual({
      domain: 'button',
      service: 'press',
      data: { entity_id: 'button.granary_manual_feed' },
    });
    expect(call('pl-litter', 'clean')?.data).toEqual({
      entity_id: 'button.luma_start_clean_cycle',
    });
    expect(call('pl-litter', 'level')?.data).toEqual({ entity_id: 'button.luma_level_litter' });
    expect(call('pl-litter', 'stop')?.data).toEqual({
      entity_id: 'button.luma_stop_current_action',
    });
    expect(writable('petlibro', 'pause')).toBe(false);
  });

  it('asks first for a meal, a clean and a levelling; the meal says its amount', () => {
    const commands = (device: string) => {
      const found = findAppliance(HOUSE, { device });
      return commandsOf({
        hass: HOUSE,
        platform: found.platform,
        roles: found.entities.roles,
        status: 'idle',
        amount: 20,
      });
    };
    expect(commands('pk-feeder').find((c) => c.action === 'feed')).toMatchObject({
      confirm: 'feed',
      amount: 20,
    });
    const litter = commands('pk-litter');
    expect(litter.find((c) => c.action === 'clean')?.confirm).toBe('clean');
    expect(litter.find((c) => c.action === 'level')?.confirm).toBe('level');
    expect(litter.find((c) => c.action === 'deodorize')?.confirm).toBeUndefined();
    // a clean a cat paused restarts the drum: its resume asks as the clean does
    const paused = findAppliance(HOUSE, { device: 'pk-litter' });
    const resume = commandsOf({
      hass: HOUSE,
      platform: paused.platform,
      roles: paused.entities.roles,
      status: 'paused',
      kind: 'litter_box',
    }).find((c) => c.action === 'resume');
    expect(resume?.confirm).toBe('clean');
    // the PETLIBRO meal is its own amount: none said
    expect(commands('pl-feeder').find((c) => c.action === 'feed')?.amount).toBeUndefined();
  });

  it('resets a filter, a desiccant and a deodorant by their buttons, as the reminders ask', () => {
    expect(resetCall('petkit', 'button.trinkbrunnen_reset_filter')).toEqual({
      domain: 'button',
      service: 'press',
      data: { entity_id: 'button.trinkbrunnen_reset_filter' },
    });
    expect(resetCall('petlibro', 'button.granary_desiccant_reset')?.service).toBe('press');
    expect(resetCall('hon', 'button.x')).toBeUndefined();
  });
});

describe('the card', () => {
  it('draws a feeder’s tiles, its rows, its next meal counting down and its meal now as its round', async () => {
    const card = await mount({ device: 'pk-feeder' });
    expect(text(card.shadowRoot.querySelector('.ap-head__sub'))).toBe('Next meal in 1 h 13 min');
    expect(tiles(card)).toEqual(['Food 64 %', 'Next meal 23:00']);
    expect(rows(card)).toEqual(['Last meal 18:00 · 20 g', 'Fed today 60 g', 'Desiccant 12 d']);
    // its food's ring: what is left
    expect(card.shadowRoot.querySelector('.ap-tile__ring svg')).not.toBeNull();
    expect(card.shadowRoot.querySelector('.ap-power')?.getAttribute('aria-label')).toBe('Feed now');
  });

  it('keeps its tiles two a row all day: a meal tomorrow says its time alone where its weekday would not hold', async () => {
    const twelve = {
      ...HOUSE,
      locale: { ...HOUSE.locale, language: 'en', time_format: '12' },
    } as HomeAssistant;
    const columns = (card: Mounted): string | undefined =>
      card.shadowRoot.querySelector<HTMLElement>('.ap-tiles')?.style.getPropertyValue('--ap-tiles');
    const evening = await mount({ device: 'pk-feeder' }, twelve);
    // past its last meal of the day: the next is tomorrow morning
    const night = await mount(
      { device: 'pk-feeder', _now: new Date(NOW + 100 * 60_000).toISOString() },
      twelve,
    );
    expect(columns(evening)).toBe('2');
    expect(columns(night)).toBe('2');
    // its weekday where the tile holds it, else its time alone (the head says how long until it)
    expect(tiles(night)[1]).toMatch(/^Next meal (Fri )?0?7:30\s?AM$/);
  });

  it('feeds only after Home Assistant’s dialog has asked, saying how much', async () => {
    const handed: unknown[] = [];
    const listen = (event: Event): void => {
      handed.push((event as CustomEvent).detail);
    };
    document.body.addEventListener('hass-action', listen);
    try {
      const hass = house();
      const card = await mount({ device: 'pk-feeder', feed_amount: 20 }, hass);
      card.shadowRoot.querySelector<HTMLButtonElement>('.ap-power')?.click();
      expect(hass.calls).toEqual([]);
      expect(JSON.stringify(handed)).toContain('"perform_action":"text.set_value"');
      expect(JSON.stringify(handed)).toContain('Feed 20 g now?');
      const litter = await mount({ device: 'pk-litter' }, hass);
      litter.shadowRoot.querySelector<HTMLButtonElement>('.ap-power')?.click();
      expect(JSON.stringify(handed)).toContain('Check that no pet is inside.');
      // PETLIBRO's meal is the amount set on the device: asked as it is
      const granary = await mount({ device: 'pl-feeder' }, hass);
      granary.shadowRoot.querySelector<HTMLButtonElement>('.ap-power')?.click();
      expect(JSON.stringify(handed)).toContain('"text":"Feed now?"');
      expect(hass.calls).toEqual([]);
    } finally {
      document.body.removeEventListener('hass-action', listen);
    }
  });

  it('says what is due in its head, its tiles in the danger’s ink, never twice in its rows', async () => {
    const low = house({
      'binary_sensor.katzenklo_sand_lack': { state: 'on' },
      'sensor.katzenklo_litter_level': { state: '9' },
      'binary_sensor.katzenklo_wastebin_filled': { state: 'on' },
    });
    const card = await mount({ device: 'pk-litter' }, low);
    expect(text(card.shadowRoot.querySelector('.ap-head__sub'))).toBe('Add litter');
    expect(tiles(card, '.ap-tile.is-due')).toEqual(['Litter Refill', 'Waste bin Empty']);
    expect(rows(card)).toEqual(['Last used 21:05 · Luna', 'Used today 3', 'Deodorant 18 d']);
  });

  it('keeps its anatomy out of reach: the same sections, its tiles a dash', async () => {
    const live = await mount({ device: 'pl-feeder' });
    const off = house(
      Object.fromEntries(
        byDevice('pl-feeder').states.map(([id]) => [id, { state: 'unavailable' }]),
      ),
    );
    const gone = await mount({ device: 'pl-feeder' }, off);
    expect(sections(gone)).toEqual(sections(live));
    expect(tiles(gone)).toEqual(['Food —', 'Next meal —']);
    for (const variant of ['compact', 'ring', 'row'])
      expect(sections(await mount({ device: 'pl-feeder', variant }, off)), variant).toEqual(
        sections(await mount({ device: 'pl-feeder', variant })),
      );
  });

  it('takes the tiles and rows the card names, and its buttons where asked', async () => {
    const card = await mount({
      device: 'pk-litter',
      tiles: ['uses_today', { key: 'litter', name: 'Sand' }],
      rows: ['last_use', 'deodorant'],
      show_controls: true,
    });
    expect(tiles(card)).toEqual(['Used today 3', 'Sand 72 %']);
    expect(rows(card)).toEqual(['Last used 21:05 · Luna', 'Deodorant 18 d']);
    expect(
      [...card.shadowRoot.querySelectorAll('[data-action]')].map((el) =>
        el.getAttribute('data-action'),
      ),
    ).toEqual(['clean', 'deodorize', 'level', 'start']);
  });

  it('offers its pause while a clean is under way, never while only its light is on or it calibrates itself', async () => {
    const primary = async (word: string): Promise<string | null | undefined> => {
      const hass = house({
        'sensor.katzenklo_state': { state: word },
        'button.katzenklo_action_pause': { state: 'unknown' },
      });
      const card = await mount({ device: 'pk-litter', show_controls: true }, hass);
      return card.shadowRoot
        .querySelector('[data-action="start"], [data-action="pause"]')
        ?.getAttribute('data-action');
    };
    expect(await primary('cleaning')).toBe('pause');
    expect(await primary('light')).toBe('start');
    expect(await primary('calibrating')).toBe('start');
    expect(await primary('resetting_device')).toBe('start');
  });

  it('declares its height from its config: the standard slot, its tiles two a row', () => {
    for (const kind of ['feeder', 'fountain', 'litter_box'] as const) {
      expect(applianceHeight({ type: 'x', kind }), kind).toBe(376);
      expect(FluvyApplianceCard.layoutHeight({ type: 'x', kind })).toBe(376);
    }
    expect(
      applianceHeight({ type: 'x', kind: 'feeder', tiles: ['food', 'next_meal', 'fed_today'] }),
    ).toBe(376 + 72);
    expect(applianceHeight({ type: 'x', kind: 'feeder', show_hero: false })).toBe(376 - 16 - 108);
    expect(applianceHeight({ type: 'x', kind: 'feeder', show_controls: true })).toBe(376 + 60);
    expect(applianceHeight({ type: 'x', kind: 'feeder', variant: 'compact' })).toBe(84 + 60 + 32);
  });

  it('is listed with what it has left and when it eats next', async () => {
    const list = await mount(
      { appliances: ['pk-feeder', 'pk-litter', 'pl-feeder'], sort: 'none' },
      HOUSE,
      'fluvy-appliances-card',
    );
    const rows = all(list, '.ap-list__row, .fv-row');
    expect(rows.join(' | ')).toContain('64 %');
    expect(rows.join(' | ')).toContain('Next meal in 43 min');
    expect(rows.join(' | ')).toContain('Last used 21:05');
  });
});
