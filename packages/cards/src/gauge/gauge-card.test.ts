// @vitest-environment happy-dom
import { ensureLanguage, type HaFormSchemaItem, type HomeAssistant } from '@fluvy/core';
import { describe, expect, it, vi } from 'vitest';
import { familiesDefined } from '../index.js';
import { TextRuler } from '../shared/fit.js';
import { visibleFields } from '../shared/form.js';
import {
  FluvyGaugeCard,
  GAUGE_VARIANTS,
  statsOf,
  widestFigure,
  type GaugeCardConfig,
  type GaugeVariant,
} from './gauge-card.js';
import * as gaugeEditor from './gauge-editor.js';

await familiesDefined;

/** A house with one power sensor reading 2 308 W (or `state`), its registry precision when given. */
const house = (precision?: number, state = '2308'): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: {
      'sensor.grid': {
        entity_id: 'sensor.grid',
        state,
        attributes: { unit_of_measurement: 'W', device_class: 'power', friendly_name: 'Grid' },
        last_changed: '',
        last_updated: '',
      },
    },
    entities: precision === undefined ? {} : { 'sensor.grid': { display_precision: precision } },
    devices: {},
    areas: {},
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    callWS: async () => ({}),
  }) as unknown as HomeAssistant;

type CardElement = FluvyGaugeCard & { updateComplete: Promise<boolean> };

async function mount(config: Partial<GaugeCardConfig>, hass: HomeAssistant): Promise<CardElement> {
  const card = document.createElement('fluvy-gauge-card') as CardElement;
  // the bar: its figure is a readout (the ring's is the dial's own)
  card.setConfig({
    type: 'custom:fluvy-gauge-card',
    entity: 'sensor.grid',
    variant: 'bar',
    max: 5000,
    ...config,
  });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

/** The figure over the bar: its number and its unit, as one run. */
const figure = (card: CardElement): string =>
  card.shadowRoot?.querySelector('.so-top .fv-readout__value')?.textContent?.replace(/\s+/g, '') ??
  '';

describe('the gauge’s unit and decimals (issue #69)', () => {
  it('reads in the unit the set asks for by default, the sensor’s precision in the sensor’s own unit', async () => {
    // 2 308 W under a 5 000 W ceiling: kilowatts, one decimal
    expect(figure(await mount({}, house()))).toBe('2.3kW');
    // a set under a kilowatt keeps watts, where the registry's precision is the sensor's own
    expect(figure(await mount({ max: 500 }, house(1, '450')))).toBe('450.0W');
  });

  it('reads in the unit asked, where it is of the sensor’s class, at the decimals asked', async () => {
    expect(figure(await mount({ unit: 'W' }, house()))).toBe('2,308W');
    expect(figure(await mount({ unit: 'kW', decimals: 2 }, house()))).toBe('2.31kW');
    expect(figure(await mount({ decimals: 0 }, house()))).toBe('2kW');
    // a unit of another class, or the editor's automatic one, is not asked
    expect(figure(await mount({ unit: 'kWh' }, house()))).toBe('2.3kW');
    expect(figure(await mount({ unit: 'auto', decimals: 'auto' as never }, house()))).toBe('2.3kW');
  });

  it('keeps its height whatever the figures ask', () => {
    for (const variant of ['ring', 'bar', 'signed'] as const)
      expect(FluvyGaugeCard.layoutHeight({ type: '', variant, unit: 'W', decimals: 0 })).toBe(
        FluvyGaugeCard.layoutHeight({ type: '', variant }),
      );
  });
});

describe('the ring’s gauge styles', () => {
  const ring = (gauge?: GaugeCardConfig['gauge']) =>
    mount({ variant: 'ring', ...(gauge ? { gauge } : {}) }, house());

  it('draws its ticks as 1.10 did while the house keeps its factory gauge: the dial in gauge mode, its own', async () => {
    const card = await ring();
    const dial = card.shadowRoot!.querySelector('.so-gauge > fluvy-dial');
    expect(dial?.hasAttribute('gauge')).toBe(true);
    expect((dial as unknown as { radius: number }).radius).toBe(96);
    expect(card.shadowRoot!.querySelector('.fc-gauge')).toBeNull();
  });

  it('draws the thermostat’s dial read, and a ring with its knob, in the dial’s room', async () => {
    const dial = await ring('dial');
    const read = dial.shadowRoot!.querySelector('.so-gauge fluvy-dial');
    expect(read?.hasAttribute('readonly')).toBe(true);
    expect(read?.hasAttribute('gauge')).toBe(false);
    const root = (await ring('ring')).shadowRoot!;
    expect(root.querySelector('.fc-ring__lit')).not.toBeNull();
    expect(root.querySelector('.fc-gauge .fv-knob')).not.toBeNull();
    // the dial's room: its box wide, as tall as it is down to its range's labels, the ring as tall as it
    const room = root.querySelector('.so-gauge > div') as HTMLElement;
    expect([room.style.width, room.style.height]).toEqual(['240px', '224px']);
    expect((root.querySelector('.fc-gauge') as HTMLElement).style.height).toBe('224px');
  });

  it('offers the ring its three styles and the moving ones, and the bar and the signed ring none', () => {
    const field = gaugeEditor.getConfigForm().schema.find((item) => item.name === 'gauge') as
      HaFormSchemaItem | undefined;
    const options = (field?.selector as { select: { options: { value: string }[] } }).select
      .options;
    expect(options.map((o) => o.value)).toEqual([
      'ticks',
      'dial',
      'ring',
      'liquid',
      'thermo',
      'tank',
      'battery',
      'pulse',
      'air',
      'sun',
    ]);
    expect(field?.when?.({})).toBe(true);
    expect(field?.when?.({ variant: 'bar' })).toBe(false);
    expect(field?.when?.({ variant: 'signed' })).toBe(false);
  });
});

describe('the ring’s moving gauges', () => {
  it('draws one that reads the sensor in the dial’s room, in its own tone where the card names none', async () => {
    const root = (await mount({ variant: 'ring', gauge: 'pulse' }, house())).shadowRoot!;
    const scene = root.querySelector('.so-gauge .fc-pulse') as HTMLElement;
    // the column's width (the card's 360 less its padding), the dial's height down to its range
    expect([scene.style.width, scene.style.height]).toEqual(['320px', '224px']);
    expect(scene.classList.contains('fv-tone--accent')).toBe(true);
    expect(root.querySelector('.fc-reading b')?.textContent).toBe('2.3');
  });

  it('draws one that does not read it as its ticks: the sky is for a temperature', async () => {
    const root = (await mount({ variant: 'ring', gauge: 'thermo' }, house())).shadowRoot!;
    expect(root.querySelector('.fc-scene')).toBeNull();
    expect(root.querySelector('.so-gauge > fluvy-dial')?.hasAttribute('gauge')).toBe(true);
  });

  it('lays its window’s row one a row in a half card, live or out of reach: the figures never set its height', async () => {
    const columns = async (state: string, width: number): Promise<string | undefined> => {
      const card = await mount({ variant: 'ring', gauge: 'pulse' }, house(undefined, state));
      (card as unknown as { width: number }).width = width;
      await card.updateComplete;
      return card.shadowRoot!.querySelector<HTMLElement>('.so-cols')?.style.gridTemplateColumns;
    };
    for (const state of ['2308', 'unavailable'])
      expect([await columns(state, 152), await columns(state, 172)]).toEqual([
        'repeat(1, minmax(0, 1fr))',
        'repeat(1, minmax(0, 1fr))',
      ]);
  });

  it('rests on its first frame where the card says so', async () => {
    const root = (await mount({ variant: 'ring', gauge: 'sun', animate: false }, house()))
      .shadowRoot!;
    expect(root.querySelector('.fc-sun')?.classList.contains('is-still')).toBe(true);
  });

  it('offers the ring the gauges that read the sensor, and motion only beside one of them', () => {
    const hass = house();
    const config = { type: 'custom:fluvy-gauge-card', entity: 'sensor.grid' };
    const gauges = gaugeEditor.choices(config, hass)['gauge']?.map((o) => o.value);
    expect(gauges).toEqual(['ticks', 'dial', 'ring', 'pulse', 'sun']);
    const animate = gaugeEditor.getConfigForm().schema.find((item) => item.name === 'animate');
    expect(animate?.when?.({ ...config, gauge: 'pulse' }, hass)).toBe(true);
    expect(animate?.when?.({ ...config, gauge: 'thermo' }, hass)).toBe(false);
    expect(animate?.when?.({ ...config, gauge: 'ring' }, hass)).toBe(false);
    expect(gaugeEditor.defaults({ ...config, gauge: 'thermo' }, hass)['gauge']).toBe('ticks');
  });
});

describe('the window’s row and the signed ring, laid out by what the card can write', () => {
  /** A stand-in for the card's ruler: a label's letters at 7, a figure's with its unit at 11 at s and 9 at xs, any other 8. */
  const pace = (cls: string): number =>
    cls.includes('fv-readout__label')
      ? 7
      : cls.includes('fv-readout--xs')
        ? 9
        : cls.includes('fv-readout--s')
          ? 11
          : 8;
  const now = Date.now() / 1000;
  /** A day of readings swaying a tenth about `value`, as the recorder gives it. */
  const day = (value: number) =>
    Array.from({ length: 49 }, (_unused, i) => ({
      s: String(Math.round(value * (1 + 0.1 * Math.sin(i / 5)) * 100) / 100),
      lu: now - (48 - i) * 1800,
    }));
  /** A house in `language` with a sensor at each of `values` (its day recorded), and one out of reach, unrecorded. */
  const readings = (
    language: string,
    prefix: string,
    attributes: Readonly<Record<string, string>>,
    values: readonly number[],
  ): HomeAssistant => {
    const seeds: [string, string][] = [
      ...values.map((v): [string, string] => [`sensor.${prefix}_${v}`, String(v)]),
      [`sensor.${prefix}_away`, 'unavailable'],
    ];
    return {
      language,
      locale: { language, number_format: 'language', time_format: '24' },
      states: Object.fromEntries(
        seeds.map(([id, state]) => [
          id,
          { entity_id: id, state, attributes, last_changed: '', last_updated: '' },
        ]),
      ),
      entities: {},
      devices: {},
      areas: {},
      localize: (key: string) => key,
      formatEntityState: (s: { state: string }) => s.state,
      callWS: async ({ entity_ids: [id = ''] }: { entity_ids: string[] }) => {
        const value = values.find((v) => `sensor.${prefix}_${v}` === id);
        return value === undefined ? {} : { [id]: day(value) };
      },
    } as unknown as HomeAssistant;
  };
  /**
   * What sets the card's height, its range left to the window: its row's columns and readouts' size, and a signed
   * ring's height.
   */
  const layout = async (
    hass: HomeAssistant,
    entity: string,
    variant: GaugeVariant,
    width: number,
  ): Promise<string> => {
    const card = document.createElement('fluvy-gauge-card') as CardElement;
    card.setConfig({ type: 'custom:fluvy-gauge-card', entity, variant });
    card.hass = hass;
    document.body.append(card);
    await card.updateComplete;
    (card as unknown as { width: number }).width = width;
    await new Promise((done) => setTimeout(done, 0)); // the window answers
    await card.updateComplete;
    const root = card.shadowRoot!;
    const row = root.querySelector<HTMLElement>('.so-cols')!;
    const sizes = new Set([...row.querySelectorAll('.fv-readout')].map((r) => r.className));
    const ring = root.querySelector<HTMLElement>('.en-gauge')?.style.height ?? '';
    card.remove();
    return [row.style.gridTemplateColumns, row.className, ...sizes, ring].join(' · ');
  };

  it('is one at any value and out of reach, from the full card’s floor to a phone, in every language', async () => {
    await Promise.all((['de', 'pt-PT', 'ja'] as const).map((code) => ensureLanguage(code)));
    const ruler = vi
      .spyOn(TextRuler.prototype, 'width')
      .mockImplementation(
        (cls: string, text: string, _unit?: string, unit = '') =>
          (text.length + (unit ? unit.length + 1 : 0)) * pace(cls),
      );
    try {
      const sensors = [
        ['wind', { unit_of_measurement: 'km/h', device_class: 'wind_speed' }, [4, 18, 46]],
        ['charge', { unit_of_measurement: '%', device_class: 'battery' }, [0, 50, 100]],
      ] as const;
      const differ: string[] = [];
      for (const [prefix, attributes, values] of sensors)
        for (const language of ['en', 'de', 'pt', 'ja'])
          for (const variant of GAUGE_VARIANTS)
            for (const width of [211, 266, 328, 360]) {
              const hass = readings(language, prefix, attributes, values);
              const ids = [...values.map((v) => `sensor.${prefix}_${v}`), `sensor.${prefix}_away`];
              const layouts = new Set<string>();
              for (const id of ids) layouts.add(await layout(hass, id, variant, width));
              if (layouts.size > 1)
                differ.push(
                  `${prefix} ${language} ${variant} @${width}: ${[...layouts].join(' | ')}`,
                );
            }
      expect(differ).toEqual([]);
    } finally {
      ruler.mockRestore();
    }
  }, 60_000);

  it('lays a unit past a thousand out for what it reaches, where the card names no top: its row holds 98,000 lx', async () => {
    const ruler = vi
      .spyOn(TextRuler.prototype, 'width')
      .mockImplementation(
        (cls: string, text: string, _unit?: string, unit = '') =>
          (text.length + (unit ? unit.length + 1 : 0)) * pace(cls),
      );
    try {
      const sensors = [
        ['daylight', { unit_of_measurement: 'lx', device_class: 'illuminance' }, [0, 12500, 98000]],
        ['pressure', { unit_of_measurement: 'hPa' }, [987, 1013, 1041]],
      ] as const;
      for (const [prefix, attributes, values] of sensors)
        for (const width of [211, 266, 328, 360]) {
          const hass = readings('en', prefix, attributes, values);
          const card = document.createElement('fluvy-gauge-card') as CardElement;
          card.setConfig({
            type: 'custom:fluvy-gauge-card',
            entity: `sensor.${prefix}_${values[2]}`,
          });
          card.hass = hass;
          document.body.append(card);
          await card.updateComplete;
          (card as unknown as { width: number }).width = width;
          await new Promise((done) => setTimeout(done, 0)); // the window answers
          await card.updateComplete;
          const row = card.shadowRoot!.querySelector<HTMLElement>('.so-cols')!;
          const columns = /repeat\((\d+)/.exec(row.style.gridTemplateColumns)?.[1];
          const room = (width - 8 * (Number(columns) - 1)) / Number(columns);
          for (const readout of row.querySelectorAll('.fv-readout')) {
            const value = readout.querySelector('.fv-readout__value')!;
            const unit = value.querySelector('.fv-unit')?.textContent ?? '';
            const figure = (value.textContent ?? '').replace(unit, '').trim();
            const drawn = (figure.length + unit.length + 1) * pace(readout.className);
            expect(drawn, `${prefix} @${width}: ${figure} ${unit}`).toBeLessThanOrEqual(room);
          }
          card.remove();
        }
    } finally {
      ruler.mockRestore();
    }
  });

  it('writes its widest figure by the figures’ rule: three and a separator, or the decimals fixed and a range’s whole figures', () => {
    const hass = house();
    expect(widestFigure(hass, undefined, 3, false)).toBe('88.8');
    expect(widestFigure(hass, undefined, 4, false)).toBe('8,888');
    expect(widestFigure(hass, 1, 3, true)).toBe('−888.8');
    expect(widestFigure(hass, 0, 2, false)).toBe('88');
  });
});

describe('the window’s row as the card asks it (issue #83)', () => {
  const labels = (card: CardElement): string[] =>
    [...card.shadowRoot!.querySelectorAll('.so-cols .fv-readout__label')].map(
      (label) => label.textContent?.trim() ?? '',
    );

  it('lists the figures asked, in their order, each once; none where the row is off or the list is empty', () => {
    expect(statsOf({ type: '' })).toEqual(['min', 'max', 'average']);
    expect(statsOf({ type: '', stats: ['average', 'max', 'average'] })).toEqual(['average', 'max']);
    expect(statsOf({ type: '', stats: ['median' as never, 'min'] })).toEqual(['min']);
    expect(statsOf({ type: '', stats: [] })).toEqual([]);
    expect(statsOf({ type: '', show_stats: false, stats: ['max'] })).toEqual([]);
  });

  it('draws the figures asked, in their order, and no row at all where none is', async () => {
    for (const variant of GAUGE_VARIANTS) {
      expect(labels(await mount({ variant, stats: ['max', 'average'] }, house()))).toEqual([
        'Max',
        'Average',
      ]);
      const bare = await mount({ variant, show_stats: false }, house());
      expect(bare.shadowRoot!.querySelector('.so-cols')).toBeNull();
    }
  });

  it('declares the row’s 60 less where it draws none, and its height with any figures it draws', () => {
    for (const variant of GAUGE_VARIANTS) {
      const full = FluvyGaugeCard.layoutHeight({ type: '', variant });
      expect(FluvyGaugeCard.layoutHeight({ type: '', variant, show_stats: false })).toBe(full - 60);
      expect(FluvyGaugeCard.layoutHeight({ type: '', variant, stats: [] })).toBe(full - 60);
      expect(FluvyGaugeCard.layoutHeight({ type: '', variant, stats: ['max'] })).toBe(full);
    }
  });

  it('offers the figures while the row is shown', () => {
    const offers = (data: Record<string, unknown>) =>
      JSON.stringify(visibleFields(gaugeEditor.getConfigForm().schema, data)).includes('"stats"');
    expect(offers({ entity: 'sensor.grid' })).toBe(true);
    expect(offers({ entity: 'sensor.grid', show_stats: false })).toBe(false);
    expect(gaugeEditor.keys).toEqual(expect.arrayContaining(['show_stats', 'stats']));
  });
});
