import type { HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
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
  hassUrl: (path: string) => `http://ha.local:8123${path}`,
} as unknown as HomeAssistant;

describe('a picture of the person’s own (#99)', () => {
  it('loads from the web, from Home Assistant and written out as a picture, never from another scheme', () => {
    for (const url of [
      'https://example.com/tv.png',
      'http://192.168.1.5/ac.jpg',
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
    ])
      expect(safePicture(url), url).toBe('');
  });

  it('is an address, or the picture of the entity it names, made whole by Home Assistant', () => {
    expect(imageOf(hass, '/local/tv.png')).toBe('http://ha.local:8123/local/tv.png');
    expect(imageOf(hass, ' https://example.com/tv.png ')).toBe('https://example.com/tv.png');
    expect(imageOf(hass, 'image.lounge_tv')).toBe(
      'http://ha.local:8123/api/image_proxy/image.lounge_tv?token=abc',
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

describe('a picture that would not load', () => {
  it('gives way until its address changes, and the card draws again once', () => {
    let drawn = 0;
    const host = { addController: () => {}, requestUpdate: () => void drawn++ };
    const pictures = new BrokenPictures(host as unknown as ReactiveControllerHost);
    // an <img> that fires `error` twice: the address it was given, as the event hands it
    const error = { currentTarget: { getAttribute: () => '/local/tv.png' } } as unknown as Event;
    expect(pictures.shown('/local/tv.png')).toBe('/local/tv.png');
    pictures.failed(error);
    pictures.failed(error);
    expect(pictures.shown('/local/tv.png')).toBe('');
    expect(pictures.shown('/local/tv-2.png')).toBe('/local/tv-2.png');
    expect(pictures.shown('')).toBe('');
    expect(drawn).toBe(1);
  });
});
