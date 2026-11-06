// @vitest-environment happy-dom
import { baseStyles } from '@fluvy/ui';
import { html, type CSSResultGroup, type TemplateResult } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cardDefaults,
  cardOpacity,
  FluvyCard,
  setCardDefaults,
  unavailableLook,
  type FluvyCardConfig,
} from '../card.js';
import type { HomeAssistant } from '../ha/types.js';
import { HOUSE_DEFAULTS } from '../settings/schema.js';

/**
 * How a card out of reach looks (1.16, #126): its own `unavailable` › the house's › `dashed`, as before. Dashed, a card
 * carries nothing of it; quiet, what it draws at its root is marked `data-unavailable="quiet"` and it adopts the quiet
 * sheet (`look/quiet.ts`), which its first frame waits for, as a see-through card's first frame waits for what it wears.
 */
class QuietCard extends FluvyCard<FluvyCardConfig & { items?: { unavailable?: unknown }[] }> {
  static override styles: CSSResultGroup = [...baseStyles];
  protected renderCard(): TemplateResult {
    const items = this.config?.items ?? [];
    return html`<article class="fv-card">
      ${items.map((item) => html`<div class="item" data-look=${this.unavailableOf(item)}></div>`)}
    </article>`;
  }
}
customElements.define('fluvy-card-unavailable-test-card', QuietCard);

/** A group whose items each say their own (a tiles card's tiles): its root carries no mark. */
class GroupCard extends QuietCard {
  static override markedItems = true;
}
customElements.define('fluvy-card-unavailable-test-group', GroupCard);

const DASHED = { opacity: 100, blur: true, unavailable: 'dashed' } as const;

async function mounted(
  config: Omit<FluvyCardConfig, 'type'> & { items?: { unavailable?: unknown }[] } = {},
  tag = 'fluvy-card-unavailable-test-card',
): Promise<QuietCard> {
  const card = document.createElement(tag) as QuietCard;
  card.setConfig({ ...config, type: `custom:${tag}` });
  card.hass = { states: {}, themes: { darkMode: false } } as unknown as HomeAssistant;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const root = (card: QuietCard): Element => card.shadowRoot!.querySelector('article')!;
/** How many sheets the card adopts: its styles, its accent sheet, and the quiet one where it wears it. */
const adopted = (card: QuietCard): number => card.shadowRoot!.adoptedStyleSheets.length;
/** Whether it wears the quiet sheet (whose rules read the mark). */
const quiet = (card: QuietCard): boolean =>
  card
    .shadowRoot!.adoptedStyleSheets.flatMap((sheet) => [...sheet.cssRules])
    .some((rule) => rule.cssText.includes('data-unavailable'));

afterEach(() => {
  setCardDefaults(DASHED);
  document.body.replaceChildren();
});

describe('the first frame', () => {
  // first in the file: what the card wears has not landed yet, and its first frame waits for it (a cold load)
  it('is drawn quiet, never dashed a moment before', async () => {
    const card = await mounted({ unavailable: 'quiet' });
    expect(root(card).getAttribute('data-unavailable')).toBe('quiet');
    expect(quiet(card)).toBe(true);
  });
});

describe('a card’s look out of reach', () => {
  it('is its own, else the house’s, else dashed; an item’s own before its card’s', () => {
    expect(HOUSE_DEFAULTS.cards.unavailable).toBe('dashed');
    expect(unavailableLook()).toBe('dashed');
    expect(unavailableLook('quiet')).toBe('quiet');
    setCardDefaults({ ...DASHED, unavailable: 'quiet' });
    expect(cardDefaults().unavailable).toBe('quiet');
    expect(unavailableLook(undefined)).toBe('quiet');
    expect(unavailableLook('dashed')).toBe('dashed');
    // an item's own, then its card's; a word it does not know is unsaid
    expect(unavailableLook('dashed', 'quiet')).toBe('dashed');
    expect(unavailableLook(undefined, 'dashed')).toBe('dashed');
    for (const word of ['normal', 'Quiet', true, null, 3])
      expect(unavailableLook(word)).toBe('quiet');
  });

  it('leaves the card’s opacity to it: a change of look keeps the surface', () => {
    setCardDefaults({ opacity: 80, blur: true, unavailable: 'quiet' });
    expect(cardOpacity({ type: 'x' })).toBe(80);
  });
});

describe('a dashed card', () => {
  it('carries nothing of it: no mark, no sheet of its own beyond its colours', async () => {
    const dashed = await mounted();
    const quietOne = await mounted({ unavailable: 'quiet' });
    expect(root(dashed).hasAttribute('data-unavailable')).toBe(false);
    expect(quiet(dashed)).toBe(false);
    expect(adopted(quietOne)).toBe(adopted(dashed) + 1);
  });
});

describe('a quiet card', () => {
  it('follows the house at once, and is dashed again when the house is', async () => {
    const card = await mounted();
    setCardDefaults({ ...DASHED, unavailable: 'quiet' });
    expect(root(card).getAttribute('data-unavailable')).toBe('quiet');
    expect(quiet(card)).toBe(true);
    setCardDefaults(DASHED);
    expect(root(card).hasAttribute('data-unavailable')).toBe(false);
  });

  it('keeps its own word on a quiet house', async () => {
    setCardDefaults({ ...DASHED, unavailable: 'quiet' });
    const card = await mounted({ unavailable: 'dashed' });
    expect(root(card).hasAttribute('data-unavailable')).toBe(false);
  });

  it('marks its root again when it draws a new one', async () => {
    const card = await mounted({ unavailable: 'quiet' });
    card.setConfig({
      type: 'custom:fluvy-card-unavailable-test-card',
      unavailable: 'quiet',
      name: 'x',
    });
    await card.updateComplete;
    expect(root(card).getAttribute('data-unavailable')).toBe('quiet');
  });
});

describe('a group whose items say their own', () => {
  it('marks no root; each item reads its own look, else the group’s, else the house’s', async () => {
    const group = await mounted(
      { unavailable: 'quiet', items: [{}, { unavailable: 'dashed' }, { unavailable: 'quiet' }] },
      'fluvy-card-unavailable-test-group',
    );
    expect(root(group).hasAttribute('data-unavailable')).toBe(false);
    expect(
      [...group.shadowRoot!.querySelectorAll('.item')].map((item) =>
        item.getAttribute('data-look'),
      ),
    ).toEqual(['quiet', 'dashed', 'quiet']);
    expect(quiet(group)).toBe(true);
  });

  it('wears the quiet sheet where only an item is quiet', async () => {
    const group = await mounted(
      { items: [{}, { unavailable: 'quiet' }] },
      'fluvy-card-unavailable-test-group',
    );
    expect(quiet(group)).toBe(true);
    const dashed = await mounted({ items: [{}, {}] }, 'fluvy-card-unavailable-test-group');
    expect(quiet(dashed)).toBe(false);
  });
});
