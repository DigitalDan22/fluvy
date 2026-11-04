// @vitest-environment happy-dom
import { html, type TemplateResult } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FluvyCard } from '../card.js';
import type { HomeAssistant } from '../ha/types.js';
import { declareHeight } from '../layout-heights.js';

/**
 * #117: Home Assistant's card picker ("Add card", "By card") builds a live preview of every card it lists at once,
 * Fluvy's at the foot of the list. A preview not yet drawn keeps its declared height and draws only as it comes near
 * the list's view; anywhere else a card draws at once.
 */
let drawn = 0;
class PreviewCard extends FluvyCard {
  protected renderCard(): TemplateResult {
    drawn += 1;
    return html`<article></article>`;
  }
}
customElements.define('fluvy-picker-test-card', PreviewCard);
declareHeight('fluvy-picker-test-card', () => 268);
// the picker, as Home Assistant's is: its previews in its shadow root
customElements.define('hui-card-picker', class extends HTMLElement {});

/** The observers made, and a way to bring their cards into view. */
const observers: { callback: IntersectionObserverCallback; target?: Element; off: boolean }[] = [];
class FakeObserver {
  private readonly entry: (typeof observers)[number];
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, off: false };
    observers.push(this.entry);
  }
  observe(target: Element): void {
    this.entry.target = target;
  }
  disconnect(): void {
    this.entry.off = true;
  }
}
const seen = (card: Element, isIntersecting: boolean): void => {
  for (const observer of observers)
    if (observer.target === card && !observer.off)
      observer.callback(
        [{ target: card, isIntersecting } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
};

const HASS = {
  language: 'en',
  states: {},
  themes: { darkMode: false },
} as unknown as HomeAssistant;

function card(): PreviewCard {
  const made = document.createElement('fluvy-picker-test-card') as PreviewCard;
  made.setConfig({ type: 'custom:fluvy-picker-test-card' });
  made.hass = HASS;
  return made;
}

function picker(): ShadowRoot {
  const host = document.createElement('hui-card-picker');
  document.body.append(host);
  return host.attachShadow({ mode: 'open' });
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  drawn = 0;
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('a card in Home Assistant’s card picker (#117)', () => {
  it('keeps its declared height and draws nothing until it comes near the list’s view, then draws once', async () => {
    const preview = card();
    picker().append(preview);
    await tick();
    expect(drawn).toBe(0);
    expect(preview.style.minHeight).toBe('268px');
    // a new house while it waits joins the one update it will make
    preview.hass = { ...HASS };
    await tick();
    seen(preview, false);
    await tick();
    expect(drawn).toBe(0);
    seen(preview, true);
    await preview.updateComplete;
    expect(drawn).toBe(1);
    expect(preview.style.minHeight).toBe('');
    expect(observers.every((observer) => observer.off)).toBe(true);
  });

  it('waits on when the picker takes it away and puts it back (its search), and draws once seen', async () => {
    const root = picker();
    const preview = card();
    root.append(preview);
    await tick();
    preview.remove();
    root.append(preview);
    await tick();
    expect(drawn).toBe(0);
    seen(preview, true);
    await preview.updateComplete;
    expect(drawn).toBe(1);
  });

  it('draws at once anywhere else: a dashboard, the editor’s preview', async () => {
    const shown = card();
    document.body.append(shown);
    await shown.updateComplete;
    expect(drawn).toBe(1);
    expect(observers).toHaveLength(0);
  });
});
