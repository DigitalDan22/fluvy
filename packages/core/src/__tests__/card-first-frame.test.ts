// @vitest-environment happy-dom
import { html, type TemplateResult } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluvyCard } from '../card.js';
import type { HomeAssistant } from '../ha/types.js';

/**
 * A wall opening a view of forty cards (the 1.12 judge): each card read its look as it was attached and its width as its
 * first frame was scheduled, so the page was styled and laid out again for every card, a read after every card's
 * writes. Cards attached together are read together now, every read before any write, before the first of them draws.
 */
const log: string[] = [];
class FrameCard extends FluvyCard {
  protected renderCard(): TemplateResult {
    log.push(`draw ${this.width}`);
    return html`<article></article>`;
  }
}
customElements.define('fluvy-card-first-frame-test-card', FrameCard);

const hass = { states: {}, themes: { darkMode: true } } as unknown as HomeAssistant;

/** A card as Home Assistant makes one, in a box `width` wide. */
function made(width: string): FrameCard {
  const card = document.createElement('fluvy-card-first-frame-test-card') as FrameCard;
  card.setConfig({ type: 'custom:fluvy-card-first-frame-test-card' });
  card.hass = hass;
  card.style.width = width;
  return card;
}

afterEach(() => {
  vi.restoreAllMocks();
  log.length = 0;
  document.body.replaceChildren();
});

describe('the first frame of cards attached together', () => {
  it('reads every card’s look and width before any of them is written to or drawn', async () => {
    const read = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      log.push('read');
      return read(el, pseudo);
    });
    const toggle = Element.prototype.toggleAttribute;
    vi.spyOn(Element.prototype, 'toggleAttribute').mockImplementation(function (
      this: Element,
      name: string,
      force?: boolean,
    ) {
      if (name === 'dark' || name === 'no-theme') log.push('write');
      return toggle.call(this, name, force);
    });
    const cards = ['156px', '172px', '211px'].map(made);
    const view = document.createElement('div');
    view.append(...cards);
    document.body.append(view);
    await Promise.all(cards.map((card) => card.updateComplete));
    expect(log).toEqual([
      ...['read', 'read', 'read'],
      ...Array<string>(6).fill('write'),
      // each in its look and at its own width from its first frame (#40, #104)
      'draw 156',
      'draw 172',
      'draw 211',
    ]);
    expect(cards.every((card) => card.dark && card.hasAttribute('dark'))).toBe(true);
  });

  it('reads the look of a card attached again at once, as it is attached', async () => {
    const card = made('200px');
    document.body.append(card);
    await card.updateComplete;
    card.remove();
    const look = vi.spyOn(card, 'syncTheme');
    document.body.append(card);
    expect(look).toHaveBeenCalledTimes(1);
  });
});
