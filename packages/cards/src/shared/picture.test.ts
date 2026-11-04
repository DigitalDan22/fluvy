import type { HomeAssistant } from '@fluvy/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactiveControllerHost } from 'lit';
import { BrokenPictures, imageOf, isEntityId, safePicture } from './picture.js';

/** A house with the pictures a person may point at: an image entity's, a camera's still, a face. */
const hass = {
  states: {
    'image.lounge_tv': {
      entity_id: 'image.lounge_tv',
      state: '2026-11-04T08:00:00+00:00',
      attributes: { entity_picture: '/api/image_proxy/image.lounge_tv?token=abc' },
    },
    'camera.porch': {
      entity_id: 'camera.porch',
      state: 'idle',
      attributes: { entity_picture: 'https://cam.example/still.jpg' },
    },
    'person.marta': {
      entity_id: 'person.marta',
      state: 'home',
      attributes: { entity_picture: 'javascript:alert(1)' },
    },
    'sensor.power': { entity_id: 'sensor.power', state: '12', attributes: {} },
  },
  hassUrl: (path: string) => `http://ha.example:8123${path}`,
} as unknown as HomeAssistant;

describe('a picture of the person’s own (#99)', () => {
  it('loads from the web, from Home Assistant and written out as a picture, never from another scheme', () => {
    for (const url of [
      'https://example.com/tv.png',
      'http://10.0.0.5/ac.jpg',
      'HTTPS://EXAMPLE.COM/TV.PNG',
      '/local/tv.png',
      'local/tv.png',
      '//cdn.example/tv.png',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/svg+xml;utf8,<svg/>',
    ])
      expect(safePicture(url), url).toBe(url);
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      'file:///etc/passwd',
      'blob:https://example.com/1',
      'https://example.com/a.png\n);position:fixed;inset:0;x:(',
      '/local/tv.png\r',
      'https://example.com/\u0000.png',
    ])
      expect(safePicture(url), url).toBe('');
  });

  it('is an address, or the picture of the entity it names, made whole by Home Assistant', () => {
    expect(imageOf(hass, '/local/tv.png')).toBe('http://ha.example:8123/local/tv.png');
    expect(imageOf(hass, ' https://example.com/tv.png ')).toBe('https://example.com/tv.png');
    expect(imageOf(hass, 'image.lounge_tv')).toBe(
      'http://ha.example:8123/api/image_proxy/image.lounge_tv?token=abc',
    );
    expect(imageOf(hass, 'camera.porch')).toBe('https://cam.example/still.jpg');
    // a protocol-relative address is the web's, never Home Assistant's own path
    expect(imageOf(hass, '//cdn.example/tv.png')).toBe('//cdn.example/tv.png');
  });

  it('is none where nothing can be shown: no picture, an entity with none or not there, a scheme refused', () => {
    expect(imageOf(hass, undefined)).toBe('');
    expect(imageOf(hass, '')).toBe('');
    expect(imageOf(hass, '   ')).toBe('');
    expect(imageOf(hass, 42)).toBe('');
    expect(imageOf(hass, 'sensor.power')).toBe('');
    expect(imageOf(hass, 'image.gone')).toBe('');
    expect(imageOf(hass, 'person.marta')).toBe('');
    expect(imageOf(hass, 'javascript:alert(1)')).toBe('');
    expect(imageOf(undefined, '/local/tv.png')).toBe('/local/tv.png');
  });

  it('tells an entity’s id from words and addresses', () => {
    for (const id of ['sensor.tv_status', 'image.lounge_tv', 'input_text.now_on'])
      expect(isEntityId(id), id).toBe(true);
    for (const text of ['On · HDMI 1', '/local/tv.png', 'Sensor.TV', 'sensor.', 'sensor.tv status'])
      expect(isEntityId(text), text).toBe(false);
  });
});

/** The pictures tried out of sight, each as the house answers it: loaded and decoded, or not there. */
class Probe {
  static tried: string[] = [];
  static loads = false;
  src = '';
  decode(): Promise<void> {
    Probe.tried.push(this.src);
    return Probe.loads ? Promise.resolve() : Promise.reject(new Error('404'));
  }
}

describe('a picture that would not load', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', Probe);
    Probe.tried = [];
    Probe.loads = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** A card on the page with its pictures, how often it drew again, and one draw of it asking for these addresses. */
  function card() {
    const host = { drawn: 0, addController: () => {}, requestUpdate: () => void host.drawn++ };
    const pictures = new BrokenPictures(host as unknown as ReactiveControllerHost);
    pictures.hostConnected();
    const draw = (...urls: string[]): string[] => {
      const shown = urls.map((url) => pictures.shown(url));
      pictures.hostUpdated();
      return shown;
    };
    return { host, pictures, draw };
  }
  // an <img>'s `error`: the address it was given, as the event hands it
  const error = (url: string): Event =>
    ({ currentTarget: { getAttribute: () => url } }) as unknown as Event;

  it('gives way at once, and the card draws again once', () => {
    const { host, pictures, draw } = card();
    expect(draw('/local/tv.png')).toEqual(['/local/tv.png']);
    pictures.failed(error('/local/tv.png'));
    pictures.failed(error('/local/tv.png'));
    expect(draw('/local/tv.png', '/local/tv-2.png', '')).toEqual(['', '/local/tv-2.png', '']);
    expect(host.drawn).toBe(1);
  });

  it('is tried again out of sight, ever further apart, and drawn once it has loaded (an HA restart)', async () => {
    const { host, pictures, draw } = card();
    draw('/local/tv.png');
    pictures.failed(error('/local/tv.png'));
    draw('/local/tv.png');
    // 10 s, then twice as long each time, at most 5 min apart; the circle stays all the while
    for (const wait of [10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]) {
      const tries = Probe.tried.length;
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(Probe.tried, `before ${wait} ms`).toHaveLength(tries);
      await vi.advanceTimersByTimeAsync(1);
      expect(Probe.tried, `at ${wait} ms`).toHaveLength(tries + 1);
      expect(draw('/local/tv.png')).toEqual(['']);
    }
    expect(Probe.tried.every((url) => url === '/local/tv.png')).toBe(true);
    expect(host.drawn).toBe(1);
    // Home Assistant is back: the picture is drawn once it has loaded, never before, and tried no more
    Probe.loads = true;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(host.drawn).toBe(2);
    expect(draw('/local/tv.png')).toEqual(['/local/tv.png']);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(Probe.tried).toHaveLength(8);
  });

  it('forgets an address the card no longer draws (a new token), and tries it no more', async () => {
    const { pictures, draw } = card();
    draw('/api/image_proxy/image.tv?token=a');
    pictures.failed(error('/api/image_proxy/image.tv?token=a'));
    expect(draw('/api/image_proxy/image.tv?token=b')).toEqual([
      '/api/image_proxy/image.tv?token=b',
    ]);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(Probe.tried).toEqual([]);
  });

  it('tries nothing while the card is off the page, and from the first wait once it is back', async () => {
    const { pictures, draw } = card();
    draw('/local/tv.png');
    pictures.failed(error('/local/tv.png'));
    draw('/local/tv.png');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(Probe.tried).toHaveLength(1);
    pictures.hostDisconnected();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(Probe.tried).toHaveLength(1);
    pictures.hostConnected();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(Probe.tried).toHaveLength(2);
    expect(draw('/local/tv.png')).toEqual(['']);
  });
});
