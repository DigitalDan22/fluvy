// @vitest-environment happy-dom
import { html, type TemplateResult } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';
import { FluvyCard } from '../card.js';
import type { HomeAssistant } from '../ha/types.js';

/**
 * Issue #104: a card is drawn to its own width from its first frame. It was drawn 360 wide (the width it starts at)
 * until its ResizeObserver first reported, so a card in a narrower column reached past a phone's edge meanwhile.
 * happy-dom lays nothing out and its observer never reports: the card's box is the width its style gives it.
 */
class WidthCard extends FluvyCard {
  /** The width of every frame drawn. */
  readonly drawn: number[] = [];
  protected renderCard(): TemplateResult {
    this.drawn.push(this.width);
    return html`<article></article>`;
  }
}
customElements.define('fluvy-card-width-test-card', WidthCard);

/** A card as Home Assistant makes one, in a box `width` wide (none: not laid out yet). */
async function mounted(width?: string): Promise<WidthCard> {
  const card = document.createElement('fluvy-card-width-test-card') as WidthCard;
  card.setConfig({ type: 'custom:fluvy-card-width-test-card' });
  card.hass = { states: {}, themes: { darkMode: false } } as unknown as HomeAssistant;
  if (width) card.style.width = width;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('a card’s width (#104)', () => {
  it('is its own box’s from its first frame: a half column’s card is never drawn 360 wide', async () => {
    const card = await mounted('156px');
    expect(card.drawn).toEqual([156]);
  });

  it('keeps the 360 it starts at while it has no box, until its observer reports', async () => {
    const card = await mounted();
    expect(card.drawn).toEqual([360]);
  });
});
