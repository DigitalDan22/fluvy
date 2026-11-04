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

/** How long a picture that would not load waits before it is tried again, doubling each time it still will not. */
const RETRY_FIRST = 10_000;
/** The longest wait between two tries. */
const RETRY_LAST = 300_000;

/** A picture that would not load: how long it waits before the next try, and that try (its timer, then its load). */
interface Retry {
  wait: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  probe: HTMLImageElement | undefined;
}

/**
 * The pictures a card could not load: each gives way to what the card draws without one (its circle, its drawing, its
 * glyph), never a broken image, and is tried again out of sight while the card is on the page and draws it, after
 * 10 s, then twice as long each time, at most 5 min apart: a picture Home Assistant serves again (after a restart)
 * comes back once it has loaded, never through an empty box. One per card: `shown` reads it, an `<img>`'s `@error`
 * (`failed`) tells it.
 */
export class BrokenPictures implements ReactiveController {
  private readonly broken = new Map<string, Retry>();
  /** The addresses the card asked for since it last drew. */
  private readonly asked = new Set<string>();
  private connected = false;

  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }

  /** Back on the page: each picture that would not load is tried again, from the first wait. */
  hostConnected(): void {
    this.connected = true;
    for (const [url, retry] of this.broken) {
      retry.wait = RETRY_FIRST;
      this.schedule(url, retry);
    }
  }

  /** Off the page: no picture is tried until the card is back. */
  hostDisconnected(): void {
    this.connected = false;
    for (const retry of this.broken.values()) stop(retry);
  }

  /** An address the card no longer draws (a picture's new token, another picture) is forgotten, its try called off. */
  hostUpdated(): void {
    for (const [url, retry] of this.broken)
      if (!this.asked.has(url)) {
        stop(retry);
        this.broken.delete(url);
      }
    this.asked.clear();
  }

  /** The address to draw, or '' for one that would not load. */
  shown(url: string): string {
    if (!url) return '';
    this.asked.add(url);
    return this.broken.has(url) ? '' : url;
  }

  /** For an `<img>`'s `@error`: the address it was given would not load, and the card draws again without it. */
  readonly failed = (event: Event): void => {
    const url = (event.currentTarget as Element | null)?.getAttribute('src') ?? '';
    if (!url || this.broken.has(url)) return;
    const retry: Retry = { wait: RETRY_FIRST, timer: undefined, probe: undefined };
    this.broken.set(url, retry);
    this.schedule(url, retry);
    this.host.requestUpdate();
  };

  private schedule(url: string, retry: Retry): void {
    if (this.connected) retry.timer = setTimeout(() => this.probe(url, retry), retry.wait);
  }

  /**
   * The picture loaded and decoded where it is not drawn: the card draws it then, from the browser's memory; while it
   * still will not load, the next try waits twice as long. A try the card has given up on (off the page, the address
   * no longer drawn) says nothing.
   */
  private probe(url: string, retry: Retry): void {
    const probe = new Image();
    retry.timer = undefined;
    retry.probe = probe;
    const current = (): boolean => retry.probe === probe && this.broken.get(url) === retry;
    probe.src = url;
    void probe.decode().then(
      () => {
        if (!current()) return;
        this.broken.delete(url);
        this.host.requestUpdate();
      },
      () => {
        if (!current()) return;
        retry.probe = undefined;
        retry.wait = Math.min(retry.wait * 2, RETRY_LAST);
        this.schedule(url, retry);
      },
    );
  }
}

/** A picture's next try called off: its timer, and a load under way, which then says nothing. */
function stop(retry: Retry): void {
  clearTimeout(retry.timer);
  retry.timer = undefined;
  retry.probe = undefined;
}
