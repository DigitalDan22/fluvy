// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';
import { PRINTER_HOUSE } from './fixtures.js';
import { printerTrays } from './roles.js';

// the printer lands with its own chunk, defined as the index starts
await familiesDefined;

afterEach(() => document.body.replaceChildren());

/** The H2D's trays: its first AMS's ids out of their slots' order ("black_petg" is its second). */
const TRAYS = printerTrays(PRINTER_HOUSE, 'd-h2d');

/** The house with the trays as Home Assistant has them: out of reach (no slot said yet), or in reach. */
function house(reach: boolean): HomeAssistant {
  const state = (entity_id: string): HassEntity => ({
    entity_id,
    state: reach ? 'PLA' : 'unavailable',
    attributes: reach ? { ...PRINTER_HOUSE.states[entity_id]?.attributes } : {},
    last_changed: '',
    last_updated: '',
  });
  return {
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: Object.fromEntries(TRAYS.map((id) => [id, state(id)])),
    entities: PRINTER_HOUSE.entities,
    devices: PRINTER_HOUSE.devices,
    areas: {},
    config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'UTC' },
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => path,
    callWS: () => new Promise(() => undefined),
  } as unknown as HomeAssistant;
}

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
};

/** The trays the card draws, in their order: the entity each opens. */
function drawn(card: CardElement): string[] {
  const opened: string[] = [];
  const open = (event: Event): void => {
    opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId);
  };
  card.addEventListener('hass-more-info', open);
  for (const tray of card.shadowRoot!.querySelectorAll<HTMLElement>('.pr-tray')) tray.click();
  card.removeEventListener('hass-more-info', open);
  return opened;
}

describe('a printer’s trays', () => {
  it('take their slots’ order once an AMS read out of reach says them, the registry the same', async () => {
    const card = document.createElement('fluvy-printer-card') as CardElement;
    card.setConfig({ type: 'custom:fluvy-printer-card', device: 'd-h2d' });
    card.hass = house(false);
    card.width = 360;
    document.body.append(card);
    await card.updateComplete;
    // out of reach, the first AMS's trays sort by their ids
    expect(drawn(card).slice(0, 3)).toEqual([
      'sensor.black_petg',
      'sensor.shelf_tray_1',
      'sensor.shelf_tray_3',
    ]);
    card.hass = house(true);
    await card.updateComplete;
    expect(drawn(card)).toEqual(TRAYS);
    expect(TRAYS.slice(0, 3)).toEqual([
      'sensor.shelf_tray_1',
      'sensor.black_petg',
      'sensor.shelf_tray_3',
    ]);
  });
});
