// @vitest-environment happy-dom
import { html, type TemplateResult } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';
import { FluvyCard, refreshCards } from '../card.js';
import type { HomeAssistant } from '../ha/types.js';
import { markLanguage, setLanguageOverride } from '../i18n/index.js';

/**
 * @vinjex's 1.10.1 note: a card in the language chosen for Fluvy (Japanese, say) under a page in Home Assistant's
 * (English) was drawn as English text — the browser picked a kanji's form and a word's hyphenation by the page's
 * language. What says Fluvy's words carries their `lang` where it is not the page's.
 */
class WordsCard extends FluvyCard {
  protected renderCard(): TemplateResult {
    return html`<article></article>`;
  }
}
customElements.define('fluvy-card-language-test-card', WordsCard);

/** A card on a page in Home Assistant's `language`. */
async function mounted(language: string): Promise<WordsCard> {
  const card = document.createElement('fluvy-card-language-test-card') as WordsCard;
  card.setConfig({ type: 'custom:fluvy-card-language-test-card' });
  card.hass = { language, states: {}, themes: { darkMode: false } } as unknown as HomeAssistant;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

afterEach(() => {
  setLanguageOverride(undefined);
  document.body.replaceChildren();
});

describe('the language of Fluvy’s words', () => {
  it('is marked on a card where the person chose one that is not the page’s, and only there', async () => {
    setLanguageOverride('ja');
    expect((await mounted('en')).getAttribute('lang')).toBe('ja');
    // the page's own language, however Home Assistant writes it: no mark
    expect((await mounted('ja')).hasAttribute('lang')).toBe(false);
    setLanguageOverride('pt-PT');
    expect((await mounted('pt')).hasAttribute('lang')).toBe(false);
    expect((await mounted('pt-BR')).getAttribute('lang')).toBe('pt-PT');
    // Simplified chosen on a Traditional page: marked, so its Han takes the Simplified forms; on a Simplified page, none
    setLanguageOverride('zh-Hans');
    expect((await mounted('zh-Hant')).getAttribute('lang')).toBe('zh-Hans');
    expect((await mounted('en')).getAttribute('lang')).toBe('zh-Hans');
    expect((await mounted('zh-Hans')).hasAttribute('lang')).toBe(false);
    // English chosen on a page in a language Fluvy does not speak: English is said, so it is marked
    setLanguageOverride('en');
    expect((await mounted('sv')).getAttribute('lang')).toBe('en');
    // the page's language followed (Fluvy speaks it, or falls back to English): nothing to mark
    setLanguageOverride(undefined);
    expect((await mounted('sv')).hasAttribute('lang')).toBe(false);
    expect((await mounted('zh-Hant')).hasAttribute('lang')).toBe(false);
    expect((await mounted('de')).hasAttribute('lang')).toBe(false);
  });

  it('follows a choice made while the card is on the page, and goes with it', async () => {
    const card = await mounted('en');
    setLanguageOverride('de');
    refreshCards();
    expect(card.getAttribute('lang')).toBe('de');
    setLanguageOverride(undefined);
    refreshCards();
    expect(card.hasAttribute('lang')).toBe(false);
  });

  it('is marked on any of Fluvy’s own elements the same way (the panel, a page of ours)', () => {
    const page = document.createElement('div');
    setLanguageOverride('ja');
    markLanguage(page, 'en-GB');
    expect(page.getAttribute('lang')).toBe('ja');
    markLanguage(page, 'ja');
    expect(page.hasAttribute('lang')).toBe(false);
  });
});
