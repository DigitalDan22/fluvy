// @vitest-environment happy-dom
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { HomeAssistant, LovelaceCard } from '@fluvy/core';
import type { LitElement } from 'lit';
import { familiesDefined } from '../index.js';
import { PreviewHouse } from './preview.js';

// the index fetches the lazy families: they land before this file's page goes
afterAll(() => familiesDefined);

const NAMES = {
  living: 'Living room',
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  blinds: 'Blinds',
  temperature: 'Temperature',
  solar: 'Solar',
  grid: 'Grid',
  battery: 'Battery',
  alarm: 'Alarm',
  door: 'Door',
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const realHouse = (): HomeAssistant =>
  ({
    states: {},
    entities: {},
    areas: {},
    devices: {},
    themes: { darkMode: false, default_theme: 'default', themes: {} },
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    language: 'en',
    config: { unit_system: { temperature: '°C' } },
    localize: (key: string) => key,
    callService: async () => {
      throw new Error('the real house must never hear a preview tap');
    },
  }) as unknown as HomeAssistant;

describe('the preview house', () => {
  it('answers a tap itself and keeps the answer through the real house’s updates', async () => {
    const house = new PreviewHouse(NAMES);
    house.update(realHouse());
    const tile = house.tile('living');
    const id = 'light.fluvy_preview_living';
    expect(tile.hass?.states[id]?.state).toBe('on');

    await tile.hass!.callService('light', 'turn_off', {}, { entity_id: id });
    expect(tile.hass?.states[id]?.state).toBe('on'); // not instant: a house answers a moment later
    await wait(200);
    expect(tile.hass?.states[id]?.state).toBe('off');

    house.update(realHouse()); // the real house changed something else: the preview keeps its own answer
    expect(tile.hass?.states[id]?.state).toBe('off');
    expect(house.tile('living')).toBe(tile); // the same card, its hass renewed
  });

  it('keeps a thermostat’s new target, and a state object it did not touch', async () => {
    const house = new PreviewHouse(NAMES);
    const real = realHouse();
    house.update(real);
    const thermostat = house.thermostat('dial');
    const before = thermostat.hass!.states['switch.fluvy_preview_kitchen'];
    await thermostat.hass!.callService(
      'climate',
      'set_temperature',
      { temperature: 23 },
      { entity_id: 'climate.fluvy_preview_bedroom' },
    );
    await wait(200);
    expect(
      thermostat.hass?.states['climate.fluvy_preview_bedroom']?.attributes['temperature'],
    ).toBe(23);
    expect(thermostat.hass?.states['switch.fluvy_preview_kitchen']).toBe(before);
  });

  // #135: a house of 914 states ticks some twenty times a second, and every preview card was drawn again on each tick
  it('draws a card again on a tick of the real house only when it watches what changed', async () => {
    const house = new PreviewHouse(NAMES);
    const real = realHouse();
    house.update(real);
    house.setDark(true); // the wall at night: the cards told the mode
    const tile = house.tile('living') as LovelaceCard & LitElement;
    document.body.append(tile);
    await tile.updateComplete;
    const { entities, areas, themes } = tile.hass!;
    const drawn = vi.spyOn(tile as unknown as { update: () => void }, 'update');
    for (let i = 0; i < 3; i++) {
      // the house's own sensor changes: a new `states`, its registries and themes the same objects
      const tick = {
        ...real,
        states: { ...real.states, 'sensor.outside': { state: String(i) } },
      } as unknown as HomeAssistant;
      house.update(tick);
      await tile.updateComplete;
    }
    expect(tile.hass?.states['sensor.outside']?.state).toBe('2');
    expect(tile.hass?.entities).toBe(entities);
    expect(tile.hass?.areas).toBe(areas);
    expect(tile.hass?.themes).toBe(themes);
    expect(drawn).not.toHaveBeenCalled();

    // its own light switched off in the preview: drawn again, once
    await tile.hass!.callService(
      'light',
      'turn_off',
      {},
      { entity_id: 'light.fluvy_preview_living' },
    );
    await wait(200);
    await tile.updateComplete;
    expect(drawn).toHaveBeenCalledTimes(1);
    tile.remove();
  });
});
