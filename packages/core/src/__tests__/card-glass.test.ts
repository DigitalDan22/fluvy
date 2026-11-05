// @vitest-environment happy-dom
import { baseStyles } from '@fluvy/ui';
import { html, type CSSResultGroup, type TemplateResult } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';
import { cardOpacity, FluvyCard, setCardDefaults, type FluvyCardConfig } from '../card.js';
import type { HomeAssistant } from '../ha/types.js';
import { seeThrough } from '../look/glass.js';

/**
 * See-through cards (1.15, #121): a card's opacity is its own `card_opacity` › the house's › 100; at 100 nothing of it
 * is on the card, under it the host is marked `glass` (`blur` while what shows through is blurred) with its opacity,
 * and its sheet writes every fill in the card's and the page's colours at it, the solid one beside it.
 */
class GlassCard extends FluvyCard {
  static override styles: CSSResultGroup = [...baseStyles];
  protected renderCard(): TemplateResult {
    return html`<article class="fv-card"></article>`;
  }
}
customElements.define('fluvy-card-glass-test-card', GlassCard);

async function mounted(config: Omit<FluvyCardConfig, 'type'> = {}): Promise<GlassCard> {
  const card = document.createElement('fluvy-card-glass-test-card') as GlassCard;
  card.setConfig({ ...config, type: 'custom:fluvy-card-glass-test-card' });
  card.hass = { states: {}, themes: { darkMode: false } } as unknown as HomeAssistant;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

/** The card's own sheet (its colours, and see-through its fills), as one text. */
const ownSheet = (card: GlassCard): string =>
  [...card.shadowRoot!.adoptedStyleSheets.at(-1)!.cssRules].map((rule) => rule.cssText).join('');

/** The see-through module lands a moment after the first card asks for it. */
const landed = async (card: GlassCard): Promise<void> => {
  for (let i = 0; i < 50 && !ownSheet(card).includes('--fv-solid-card'); i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
};

afterEach(() => {
  setCardDefaults({ opacity: 100, blur: true });
  document.body.replaceChildren();
});

describe('a card’s opacity', () => {
  it('is its own, else the house’s, else solid', () => {
    expect(cardOpacity(undefined)).toBe(100);
    expect(cardOpacity({ type: 'x' })).toBe(100);
    setCardDefaults({ opacity: 80, blur: true });
    expect(cardOpacity({ type: 'x' })).toBe(80);
    expect(cardOpacity({ type: 'x', card_opacity: 30 })).toBe(30);
    // its own 100 is solid on a see-through house
    expect(cardOpacity({ type: 'x', card_opacity: 100 })).toBe(100);
  });

  it('holds a number to 0 to 100, whole, and reads anything else as unsaid', () => {
    setCardDefaults({ opacity: 80, blur: true });
    expect(cardOpacity({ type: 'x', card_opacity: 140 })).toBe(100);
    expect(cardOpacity({ type: 'x', card_opacity: -20 })).toBe(0);
    expect(cardOpacity({ type: 'x', card_opacity: 72.4 })).toBe(72);
    for (const card_opacity of ['50', null, Number.NaN, true])
      expect(cardOpacity({ type: 'x', card_opacity } as unknown as FluvyCardConfig)).toBe(80);
  });
});

describe('a see-through card', () => {
  it('carries nothing of it at 100: no mark, no variable, its sheet as before', async () => {
    const card = await mounted();
    expect(card.hasAttribute('glass')).toBe(false);
    expect(card.style.getPropertyValue('--fv-glass')).toBe('');
    expect(ownSheet(card)).not.toContain('--fv-solid');
    expect(ownSheet(card)).not.toContain('color-mix');
  });

  it('is marked with its opacity, blurred or not as the house says, and its fills are written at it', async () => {
    const card = await mounted({ card_opacity: 80 });
    expect(card.getAttribute('glass')).toBe('blur');
    expect(card.style.getPropertyValue('--fv-glass')).toBe('80%');
    await landed(card);
    const sheet = ownSheet(card);
    expect(sheet).toContain('--fv-solid-card');
    expect(sheet).toMatch(
      /--fluvy-card: ?color-mix\(in srgb, ?#[0-9a-f]{6} var\(--fv-glass\), ?transparent\)/,
    );
    expect(sheet).toContain('--fv-solid-page');
    // the house's blur off: the mark stays, unblurred
    setCardDefaults({ opacity: 100, blur: false });
    expect(card.getAttribute('glass')).toBe('');
  });

  it('follows the house at once, and is solid again when the house is', async () => {
    const card = await mounted();
    setCardDefaults({ opacity: 50, blur: true });
    expect(card.getAttribute('glass')).toBe('blur');
    expect(card.style.getPropertyValue('--fv-glass')).toBe('50%');
    await landed(card);
    setCardDefaults({ opacity: 100, blur: true });
    expect(card.hasAttribute('glass')).toBe(false);
    expect(card.style.getPropertyValue('--fv-glass')).toBe('');
    expect(ownSheet(card)).not.toContain('--fv-solid');
  });

  it('takes its own colour’s wash at its opacity, not the palette’s card', async () => {
    const card = await mounted({ card_opacity: 60, card_color: 'red' });
    await landed(card);
    const sheet = ownSheet(card);
    // the palette's card first, the wash after it: the wash is what the card wears, solid beside it
    const washes = [...sheet.matchAll(/--fv-solid-card: ?(#[0-9a-f]{6})/g)].map(
      (match) => match[1],
    );
    expect(washes).toHaveLength(2);
    expect(washes[1]).not.toBe(washes[0]);
    expect(sheet.replace(/\s+/g, '')).toContain(
      `--fluvy-card:color-mix(insrgb,${washes[1]}var(--fv-glass),transparent)`,
    );
  });
});

describe('the see-through writer', () => {
  it('puts the palette’s surfaces first, every fill at the opacity with its solid colour, then the card’s rules', () => {
    const css = seeThrough(
      'linen',
      'light',
      ':host > *{--fluvy-card:#ff0000;--fluvy-border:#00ff00;}',
    );
    expect(css.startsWith(':host > *{--fv-solid-card:#')).toBe(true);
    expect(css).toContain(
      '--fv-solid-card:#ff0000;--fluvy-card:color-mix(in srgb,#ff0000 var(--fv-glass),transparent);',
    );
    // a hairline is no fill: it stays as it is
    expect(css).toContain('--fluvy-border:#00ff00;');
    expect(css).toContain(':host([glass=');
  });
});
