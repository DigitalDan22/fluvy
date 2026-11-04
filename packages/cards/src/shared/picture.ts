import type { HomeAssistant } from '@fluvy/core';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

/** An entity's id (`image.tv`, `camera.porch`, `sensor.tv_status`): what a field taking an entity or words tells apart. */
export const isEntityId = (text: string): boolean => /^[a-z_]+\.[a-z0-9_]+$/.test(text);

/** A control character: a line break, a tab, a NUL, a delete. */
export const isControl = (char: string): boolean => {
  const code = char.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
};

/** The scheme an address opens with (`https`, `data`), lower case; none for one relative to the page (`/local/tv.png`). */
const schemeOf = (url: string): string | undefined =>
  /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase();

/**
 * An address a picture may be loaded from, else '': the web's (`https:`, `http:`), one relative to Home Assistant
 * (`/local/tv.png`, `/api/image_proxy/…`), or a picture written out (`data:image/…`) — never another scheme's
 * (`javascript:`, `data:text/html`), nor one holding a control character (a line break would end a CSS string).
 */
export function safePicture(url: string): string {
  if ([...url].some(isControl)) return '';
  const scheme = schemeOf(url);
  return !scheme || scheme === 'http' || scheme === 'https' || /^data:image\//i.test(url)
    ? url
    : '';
}

/**
 * The person's own picture (`image`): an address, or an entity that has one (`image.washer`, a camera's still, a
 * person's face: its `entity_picture`), else none; an address Home Assistant serves is made whole by it (`hassUrl`),
 * and one of a scheme a picture is never loaded from is none (`safePicture`).
 */
export function imageOf(hass: HomeAssistant | undefined, image: unknown): string {
  const asked = typeof image === 'string' ? image.trim() : '';
  const own = isEntityId(asked) ? hass?.states[asked]?.attributes['entity_picture'] : asked;
  const safe = typeof own === 'string' ? safePicture(own) : '';
  return /^\/(?!\/)/.test(safe) && hass?.hassUrl ? hass.hassUrl(safe) : safe;
}

/**
 * The pictures a card could not load: each gives way to what the card draws without one (its circle, its drawing, its
 * glyph) until its address changes, never a broken image. One per card: `shown` reads it, an `<img>`'s `@error`
 * (`failed`) tells it.
 */
export class BrokenPictures implements ReactiveController {
  private readonly broken = new Set<string>();

  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }

  hostConnected(): void {}

  /** The address to draw, or '' for one that would not load. */
  shown(url: string): string {
    return url && !this.broken.has(url) ? url : '';
  }

  /** For an `<img>`'s `@error`: the address it was given would not load, and the card draws again without it. */
  readonly failed = (event: Event): void => {
    const url = (event.currentTarget as Element | null)?.getAttribute('src') ?? '';
    if (!url || this.broken.has(url)) return;
    this.broken.add(url);
    this.host.requestUpdate();
  };
}
