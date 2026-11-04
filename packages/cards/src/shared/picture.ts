import type { HomeAssistant } from '@fluvy/core';

/** An entity's id (`image.tv`, `camera.porch`, `sensor.tv_status`): what a field taking an entity or words tells apart. */
export const isEntityId = (text: string): boolean => /^[a-z_]+\.[a-z0-9_]+$/.test(text);

/** The scheme an address opens with (`https`, `data`), lower case; none for one relative to the page (`/local/tv.png`). */
const schemeOf = (url: string): string | undefined =>
  /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase();

/**
 * An address a picture may be loaded from, else '': the web's (`https:`, `http:`), one relative to Home Assistant
 * (`/local/tv.png`, `/api/image_proxy/…`), or a picture written out (`data:image/…`) — never another scheme's
 * (`javascript:`, `data:text/html`).
 */
export function safePicture(url: string): string {
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
