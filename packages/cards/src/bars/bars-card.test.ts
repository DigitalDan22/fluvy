// @vitest-environment happy-dom
import { CHART_DEFAULTS, setChartDefaults, type HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { FluvyBarsCard, type BarsCardConfig } from './bars-card.js';

if (!customElements.get('fluvy-bars-card')) customElements.define('fluvy-bars-card', FluvyBarsCard);

const reading = (id: string, state: string, attributes: Record<string, unknown>) => ({
  [id]: { entity_id: id, state, attributes, last_changed: '', last_updated: '' },
});
const percent = (name: string, deviceClass?: string) => ({
  friendly_name: name,
  unit_of_measurement: '%',
  ...(deviceClass ? { device_class: deviceClass } : {}),
});

const house = (): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: {
      ...reading('sensor.east', '1400', {
        unit_of_measurement: 'W',
        device_class: 'power',
        friendly_name: 'East',
      }),
      // shares at 6 %: a processor's use, a battery, a plant's soil, a room's air
      ...reading('sensor.cpu', '6', percent('CPU usage')),
      ...reading('sensor.remote_battery', '6', percent('Remote', 'battery')),
      ...reading('sensor.fern_moisture', '6', percent('Fern', 'moisture')),
      ...reading('sensor.attic_humidity', '6', percent('Attic', 'humidity')),
    },
    entities: {},
    devices: {},
    areas: {},
    localize: (key: string) => key,
    callWS: async () => ({}),
  }) as unknown as HomeAssistant;

async function mount(config: Partial<BarsCardConfig>): Promise<FluvyBarsCard> {
  const card = document.createElement('fluvy-bars-card') as FluvyBarsCard;
  card.setConfig({ type: 'custom:fluvy-bars-card', rows: ['sensor.east'], ...config });
  card.hass = house();
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const soft = (card: FluvyBarsCard): boolean =>
  card.shadowRoot!.querySelector('.so-rows')?.classList.contains('is-soft') ?? false;

afterEach(() => {
  document.body.replaceChildren();
  setChartDefaults({ settings: CHART_DEFAULTS, sets: [] });
});

describe('the bars, in their chart styles', () => {
  it('draws classic as 1.10 did, and soft where the card or the house says so', async () => {
    const classic = await mount({});
    expect(soft(classic)).toBe(false);
    expect(classic.shadowRoot!.querySelector('.fv-bar__fill')).not.toBeNull();
    expect(soft(await mount({ chart: 'soft' }))).toBe(true);
    setChartDefaults({ settings: { ...CHART_DEFAULTS, style: 'soft' }, sets: [] });
    expect(soft(await mount({}))).toBe(true);
    expect(soft(await mount({ chart: 'classic' }))).toBe(false);
  });
});

describe('a low share (#94)', () => {
  const warned = (card: FluvyBarsCard): string[] =>
    [...card.shadowRoot!.querySelectorAll('.fv-row')]
      .filter((row) => row.querySelector('.fv-row__value--warning'))
      .map((row) => row.querySelector('.fv-row__title')!.textContent!.trim());
  const badge = (card: FluvyBarsCard): string =>
    card.shadowRoot!.querySelector('.fv-badge')?.textContent?.trim() ?? '';

  it('warns under 20 % for what runs low, a battery and a plant’s soil; any other share only under its own `low`', async () => {
    const card = await mount({
      rows: [
        'sensor.cpu',
        'sensor.remote_battery',
        'sensor.fern_moisture',
        'sensor.attic_humidity',
      ],
    });
    expect(warned(card)).toEqual(['Remote', 'Fern']);
    expect(badge(card)).toBe('2 low');
    const own = await mount({ rows: [{ entity: 'sensor.cpu', low: 10 }] });
    expect(warned(own)).toEqual(['CPU usage']);
  });

  it('a share’s bar still runs from 0 to 100', async () => {
    const card = await mount({ rows: ['sensor.cpu', 'sensor.attic_humidity'] });
    const fills = [...card.shadowRoot!.querySelectorAll<HTMLElement>('.fv-bar__fill')];
    expect(fills.map((fill) => fill.getAttribute('style'))).toEqual(
      fills.map(() => expect.stringContaining('6%')),
    );
  });
});
