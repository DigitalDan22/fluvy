// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { familiesDefined } from '../index.js';
import * as calendarEditor from './calendar-editor.js';

// the index defines the cards' tags before a page needs them
await familiesDefined;

/*
 * #111: `first_weekday: today` makes the week view a rolling week — today and the six days after it — named "Next 7
 * days"; the window it reads, a picked day and the keys turn on today, and midnight rolls the strip over on a wall
 * that never reloads. A month keeps the house's first day.
 */

const calendar = {
  entity_id: 'calendar.family',
  state: 'off',
  attributes: { friendly_name: 'Family' },
  last_changed: '',
  last_updated: '',
} as unknown as HassEntity;

/** The house, its calendar answering every read with no events and keeping the windows it was asked for. */
function house(): { hass: HomeAssistant; asked: string[] } {
  const asked: string[] = [];
  const hass = {
    language: 'en',
    locale: {
      language: 'en',
      number_format: 'language',
      time_format: '24',
      first_weekday: 'monday',
    },
    config: { time_zone: 'UTC' },
    states: { 'calendar.family': calendar },
    entities: {},
    devices: {},
    areas: {},
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    callApi: (_method: string, path: string) => {
      asked.push(new URL(path, 'http://x/').searchParams.get('start') ?? '');
      return Promise.resolve([]);
    },
  } as unknown as HomeAssistant;
  return { hass, asked };
}

type Card = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
};

async function draw(config: Record<string, unknown>, hass: HomeAssistant): Promise<Card> {
  const card = document.createElement('fluvy-calendar-card') as Card;
  card.setConfig({
    type: 'custom:fluvy-calendar-card',
    calendars: ['calendar.family'],
    variant: 'week',
    ...config,
  });
  card.hass = hass;
  card.width = 360;
  document.body.append(card);
  await settle(card);
  return card;
}

/** The card after its reads have answered. */
async function settle(card: Card): Promise<void> {
  await card.updateComplete;
  await vi.advanceTimersByTimeAsync(0);
  await card.updateComplete;
}

/** The strip's days, as "day of the month" figures, and the head's title. */
const strip = (card: Card): string[] =>
  [...card.shadowRoot!.querySelectorAll('.cd-wday__d')].map((day) => day.textContent ?? '');
const title = (card: Card): string =>
  card.shadowRoot!.querySelector('.fv-card__title')?.textContent?.trim() ?? '';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('a rolling week (#111)', () => {
  it('starts the strip on today, a Sunday, and names it the next seven days', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 10, 8, 15, 0)); // Sunday 8 November
    const { hass } = house();
    const fixed = await draw({}, hass);
    expect(strip(fixed)).toEqual(['2', '3', '4', '5', '6', '7', '8']); // Monday to this Sunday
    expect(title(fixed)).toBe('This week');
    const rolling = await draw({ first_weekday: 'today' }, hass);
    expect(strip(rolling)).toEqual(['8', '9', '10', '11', '12', '13', '14']);
    expect(title(rolling)).toBe('Next 7 days');
    // today is the strip's first, selected
    const first = rolling.shadowRoot!.querySelector('.cd-wday');
    expect(first?.getAttribute('aria-current')).toBe('date');
    expect(first?.getAttribute('aria-pressed')).toBe('true');
  });

  it('reads the seven days from today, and rolls them over at midnight without a reload', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 10, 8, 23, 59, 30));
    const { hass, asked } = house();
    const card = await draw({ first_weekday: 'today' }, hass);
    expect(strip(card)[0]).toBe('8');
    expect(new Date(asked.at(-1)!).getDate()).toBe(8);
    await vi.advanceTimersByTimeAsync(60_000);
    await settle(card);
    expect(strip(card)).toEqual(['9', '10', '11', '12', '13', '14', '15']);
    expect(new Date(asked.at(-1)!).getDate()).toBe(9);
    expect(card.shadowRoot!.querySelector('.cd-wday')?.getAttribute('aria-current')).toBe('date');
  });

  it('keeps a day picked in the strip until it has gone by, then today', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 10, 8, 23, 58, 30));
    const { hass } = house();
    const card = await draw({ first_weekday: 'today' }, hass);
    const days = [...card.shadowRoot!.querySelectorAll<HTMLButtonElement>('.cd-wday')];
    days[6]!.click(); // the 14th, six days on
    await settle(card);
    expect(days[6]!.getAttribute('aria-pressed')).toBe('true');
    await vi.advanceTimersByTimeAsync(2 * 60_000); // past midnight: the 14th is still in the strip
    await settle(card);
    const pressed = card.shadowRoot!.querySelector('.cd-wday[aria-pressed="true"] .cd-wday__d');
    expect(pressed?.textContent).toBe('14');
  });

  it('leaves a month on the house’s first day', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 10, 8, 15, 0));
    const { hass } = house();
    const today = await draw({ variant: 'month', first_weekday: 'today' }, hass);
    const house_ = await draw({ variant: 'month' }, hass);
    const heads = (card: Card): string[] =>
      [...card.shadowRoot!.querySelectorAll('.fv-dow span')].map((d) => d.textContent ?? '');
    expect(heads(today)).toEqual(heads(house_));
    expect(heads(today)[0]).toBe('M'); // the house's Monday, not this Sunday
  });

  describe('its editor', () => {
    const form = calendarEditor.getConfigForm();
    const shown = (variant: string): string[] => {
      const names: string[] = [];
      const walk = (items: typeof form.schema): void => {
        for (const item of items) {
          if (item.when && !item.when({ variant })) continue;
          if (item.schema) walk(item.schema);
          else names.push(item.name);
        }
      };
      walk(form.schema);
      return names;
    };
    const firstDays = (variant: string): string[] => {
      const field = form.schema.find(
        (item) => item.name === 'first_weekday' && item.when?.({ variant }),
      );
      const select = field?.selector?.['select'] as { options: { value: string }[] } | undefined;
      return select?.options.map((option) => option.value) ?? [];
    };

    it('offers today as the first day of the week view, not of a month', () => {
      expect(firstDays('week')).toContain('today');
      expect(firstDays('month')).not.toContain('today');
      expect(firstDays('month-day')).not.toContain('today');
    });

    it('shows what each view reads, with it', () => {
      expect(shown('week')).toContain('first_weekday');
      expect(shown('agenda')).not.toContain('first_weekday');
      expect(shown('tile')).toContain('tile');
      expect(shown('week')).not.toContain('tile');
      expect(shown('upcoming')).toContain('days');
      expect(shown('timeline')).toEqual(expect.arrayContaining(['start_hour', 'end_hour']));
      expect(shown('month')).not.toContain('start_hour');
    });
  });
});
