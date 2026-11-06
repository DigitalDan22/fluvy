// @vitest-environment happy-dom
import { baseStyles } from '@fluvy/ui';
import { html, type CSSResultGroup, type TemplateResult } from 'lit';
import { describe, expect, it, vi } from 'vitest';
import { FluvyCard } from '../card.js';
import type { HomeAssistant } from '../ha/types.js';

/**
 * A card's first frame waits for what it wears (see-through, quiet out of reach), and only while that can still land:
 * a chunk that cannot be fetched (a HACS update under an open wall tablet, a bad network) leaves the card solid or
 * dashed, drawn at once, where it waited on the failed fetch for ever and froze the page.
 */
vi.mock('../look/glass.js', () => {
  throw new Error('chunk 404');
});
vi.mock('../look/quiet.js', () => {
  throw new Error('chunk 404');
});

class CountedCard extends FluvyCard {
  static override styles: CSSResultGroup = [...baseStyles];
  calls = 0;
  protected override scheduleUpdate(): void | Promise<unknown> {
    // a page that loops here never draws: stop it in the test
    if (++this.calls > 200) throw new Error(`${this.calls} updates asked`);
    return super.scheduleUpdate();
  }
  protected renderCard(): TemplateResult {
    return html`<article class="fv-card"></article>`;
  }
}
customElements.define('fluvy-look-fail-card', CountedCard);

const HASS = { states: {}, themes: { darkMode: false } } as unknown as HomeAssistant;
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 10));
};

describe('a card whose look cannot be fetched', () => {
  it.each([
    ['see-through', { card_opacity: 80 }],
    ['quiet out of reach', { unavailable: 'quiet' }],
  ])('draws %s at once as it would without it, never waiting for ever', async (_, extra) => {
    const card = document.createElement('fluvy-look-fail-card') as CountedCard;
    card.setConfig({ type: 'custom:fluvy-look-fail-card', ...extra });
    card.hass = HASS;
    document.body.append(card);
    await settle();
    expect(card.hasUpdated).toBe(true);
    expect(card.calls).toBeLessThan(10);
    card.remove();
  });
});
