// @vitest-environment happy-dom
import { setCardDefaults, type HomeAssistant, type LovelaceCardConfig } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { FluvyHeadingCard } from '../heading/heading-card.js';
import { FluvyHelloCard } from '../hello/hello-card.js';
import { FluvyTileCard } from '../tile/tile-card.js';
import { FluvyWebCard } from '../web/web-card.js';

/**
 * See-through cards (1.15, #121): a card with a surface wears the house's opacity, a card without one (a heading, the
 * greeting, the web page card bare) never does — nothing of it is on such a card, as on a solid one.
 */
for (const [tag, element] of [
  ['fluvy-heading-card', FluvyHeadingCard],
  ['fluvy-hello-card', FluvyHelloCard],
  ['fluvy-tile-card', FluvyTileCard],
  ['fluvy-web-card', FluvyWebCard],
] as const)
  if (!customElements.get(tag)) customElements.define(tag, element);

const hass = {
  states: {
    'light.desk': {
      entity_id: 'light.desk',
      state: 'off',
      attributes: { friendly_name: 'Desk' },
      last_changed: '2026-09-17T21:47:12Z',
      last_updated: '2026-09-17T21:47:12Z',
    },
  },
  entities: {},
  devices: {},
  areas: {},
  language: 'en',
  locale: { language: 'en' },
  themes: { darkMode: false },
  user: { id: 'u', name: 'U', is_admin: true },
  config: { time_zone: 'Europe/Madrid', unit_system: { temperature: '°C' } },
} as unknown as HomeAssistant;

async function mount(config: LovelaceCardConfig): Promise<HTMLElement> {
  const card = document.createElement(String(config.type).replace('custom:', '')) as HTMLElement & {
    setConfig(config: LovelaceCardConfig): void;
    hass: HomeAssistant;
    updateComplete: Promise<boolean>;
  };
  card.setConfig(config);
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

afterEach(() => {
  setCardDefaults({ opacity: 100, blur: true });
  document.body.replaceChildren();
});

describe('a see-through house', () => {
  it('reaches a card with a surface, and leaves one without', async () => {
    setCardDefaults({ opacity: 50, blur: true });
    const tile = await mount({ type: 'custom:fluvy-tile-card', entity: 'light.desk' });
    expect(tile.getAttribute('glass')).toBe('blur');
    expect(tile.style.getPropertyValue('--fv-glass')).toBe('50%');
    for (const config of [
      { type: 'custom:fluvy-heading-card', title: 'Living room' },
      { type: 'custom:fluvy-hello-card', name: 'Marta' },
      { type: 'custom:fluvy-web-card', url: 'https://example.com/', variant: 'bare' },
    ]) {
      const card = await mount(config);
      expect(card.hasAttribute('glass'), config.type).toBe(false);
      expect(card.style.getPropertyValue('--fv-glass'), config.type).toBe('');
    }
    // the web page card with its surface is see-through as any card
    const plate = await mount({ type: 'custom:fluvy-web-card', url: 'https://example.com/' });
    expect(plate.getAttribute('glass')).toBe('blur');
  });

  it('keeps a card’s own opacity over the house’s, its own 100 solid', async () => {
    setCardDefaults({ opacity: 50, blur: false });
    const own = await mount({
      type: 'custom:fluvy-tile-card',
      entity: 'light.desk',
      card_opacity: 80,
    });
    expect(own.getAttribute('glass')).toBe('');
    expect(own.style.getPropertyValue('--fv-glass')).toBe('80%');
    const solid = await mount({
      type: 'custom:fluvy-tile-card',
      entity: 'light.desk',
      card_opacity: 100,
    });
    expect(solid.hasAttribute('glass')).toBe(false);
  });
});
