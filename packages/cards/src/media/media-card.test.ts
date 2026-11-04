// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import { familiesDefined } from '../index.js';

// the media family is lazy: its cards are defined before one is drawn
await familiesDefined;

/*
 * #101: a player that is on and plays nothing Home Assistant can name — a television on a tuner's channel, or in an app
 * its integration does not report as playing — says what it shows, its input or its app; "last played" is for a player
 * at rest, where it means something. A television watched is titled by what it shows, never "Nothing playing"; and a
 * line of the person's own (`secondary`) takes the player's place in every variant.
 */

const STAMP = new Date(Date.now() - 3600_000).toISOString();
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}) =>
  ({
    entity_id,
    state: value,
    attributes: { friendly_name: entity_id.split('.')[1]!.replace(/_/g, ' '), ...attributes },
    last_changed: STAMP,
    last_updated: STAMP,
  }) as HassEntity;

const STATES = [
  state('media_player.den_tv', 'on', {
    device_class: 'tv',
    source: 'HDMI 1',
    source_list: ['TV', 'HDMI 1'],
    app_name: 'Live TV',
  }),
  state('media_player.kids_tv', 'on', { device_class: 'tv', app_name: 'YouTube' }),
  state('media_player.guest_tv', 'on', { device_class: 'tv' }),
  state('media_player.speaker', 'idle'),
  state('media_player.bedroom_tv', 'standby', { device_class: 'tv', source: 'HDMI 1' }),
  state('media_player.kitchen', 'playing', {
    media_title: 'Midnight Coda',
    entity_picture: '/api/media_player_proxy/media_player.kitchen?token=1',
  }),
  state('media_player.garden', 'unavailable'),
  state('image.lounge_tv', '2026-11-04T08:00:00+00:00', {
    entity_picture: '/api/image_proxy/image.lounge_tv?token=abc',
  }),
  state('sensor.tv_status', 'On · TV · Volume 7 · Soundbar'),
  state('sensor.soundbar_volume', '7', { unit_of_measurement: '%' }),
];

const hass = {
  language: 'en',
  locale: { language: 'en', number_format: 'language', time_format: '24' },
  config: { time_zone: 'UTC' },
  states: Object.fromEntries(STATES.map((s) => [s.entity_id, s])),
  entities: {},
  devices: {},
  areas: {},
  localize: (key: string) => key,
  hassUrl: (path: string) => `http://ha.local${path}`,
  formatEntityState: (s: { state: string; attributes: Record<string, unknown> }) => {
    const unit = s.attributes['unit_of_measurement'];
    return unit ? `${s.state} ${String(unit)}` : s.state.charAt(0).toUpperCase() + s.state.slice(1);
  },
  // Home Assistant renders a template as it is asked: here, what the line asks for, at once
  connection: {
    subscribeMessage: (callback: (event: unknown) => void, message: Record<string, unknown>) => {
      const template = String(message['template']);
      callback(
        template.includes('fails')
          ? { error: 'TemplateError', level: 'ERROR' }
          : { result: `${String((message['variables'] as { entity: string }).entity)} · HDMI 2` },
      );
      return Promise.resolve(() => undefined);
    },
  },
} as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: Record<string, unknown>): void;
  hass: HomeAssistant;
  width: number;
  updateComplete: Promise<boolean>;
};

async function draw(config: Record<string, unknown>): Promise<CardElement> {
  const card = document.createElement('fluvy-media-card') as CardElement;
  card.setConfig({ type: 'custom:fluvy-media-card', ...config });
  card.hass = hass;
  card.width = 360;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

/** The title: the full player's, the hero's or the mini row's. */
const title = (card: CardElement): string =>
  card
    .shadowRoot!.querySelector('.md-title, .md-hero__title, .fv-row__title')
    ?.textContent?.trim() ?? '';

/** The lines under the title, in order: the player's line, then its speaker line. */
const lines = (card: CardElement): string[] =>
  [...card.shadowRoot!.querySelectorAll('.fv-card__sub, .fv-row__sub')].map(
    (line) => line.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  );

afterEach(() => {
  document.body.replaceChildren();
});

describe('a player that is on and plays nothing (#101)', () => {
  it('says its input, else its app, else its state alone: never "last played"', async () => {
    expect(lines(await draw({ entity: 'media_player.den_tv' }))).toEqual([
      'On · HDMI 1',
      // its input is said once
      'den tv',
    ]);
    expect(lines(await draw({ entity: 'media_player.guest_tv' }))[0]).toBe('On');
    expect(lines(await draw({ entity: 'media_player.den_tv', variant: 'mini' }))).toEqual([
      'On · HDMI 1',
    ]);
    expect(lines(await draw({ entity: 'media_player.kids_tv', variant: 'mini' }))).toEqual([
      'On · YouTube',
    ]);
  });

  it('is titled, a television, by its app, else its input, else its name: never "Nothing playing"', async () => {
    let card = await draw({ entity: 'media_player.den_tv' });
    expect([title(card), ...lines(card)]).toEqual(['Live TV', 'On · HDMI 1', 'den tv']);
    // what the title says, the line does not say again
    card = await draw({ entity: 'media_player.kids_tv' });
    expect([title(card), ...lines(card)]).toEqual(['YouTube', 'On', 'kids tv']);
    card = await draw({ entity: 'media_player.guest_tv', variant: 'hero' });
    expect([title(card), ...lines(card)]).toEqual(['guest tv', 'On']);
    // a speaker at rest has nothing playing; a television in standby is at rest too
    expect(title(await draw({ entity: 'media_player.speaker' }))).toBe('Nothing playing');
    expect(title(await draw({ entity: 'media_player.bedroom_tv' }))).toBe('Nothing playing');
  });

  it('keeps "last played" for a player at rest: idle, in standby', async () => {
    expect(lines(await draw({ entity: 'media_player.speaker' }))[0]).toMatch(
      /^Idle · last played /,
    );
    expect(lines(await draw({ entity: 'media_player.bedroom_tv' }))[0]).toMatch(
      /^Standby · last played /,
    );
  });
});

/** The picture the plate shows (its front layer), whether it is the person's own, and whether the plate is at rest. */
const plate = (card: CardElement) => {
  const art = card.shadowRoot!.querySelector('.fv-art')!;
  const front = art.querySelector<HTMLElement>('.fv-art__img.is-on');
  return {
    url: /url\("(.*)"\)/.exec(front?.style.backgroundImage ?? '')?.[1] ?? '',
    own: front?.classList.contains('fv-art__img--own') ?? false,
    idle: art.classList.contains('fv-art--idle'),
  };
};

describe('a picture of the person’s own on the plate (#99)', () => {
  const TV = 'http://ha.local/api/image_proxy/image.lounge_tv?token=abc';

  it('stands where the player has no artwork, drawn whole on the plate at rest', async () => {
    for (const variant of ['full', 'hero', 'mini'])
      expect(
        plate(await draw({ entity: 'media_player.den_tv', image: 'image.lounge_tv', variant })),
        variant,
      ).toEqual({ url: TV, own: true, idle: true });
    expect(plate(await draw({ entity: 'media_player.den_tv', image: '/local/tv.png' }))).toEqual({
      url: 'http://ha.local/local/tv.png',
      own: true,
      idle: true,
    });
  });

  it('gives way to the artwork, unless it is asked for always', async () => {
    const artwork = 'http://ha.local/api/media_player_proxy/media_player.kitchen?token=1';
    expect(plate(await draw({ entity: 'media_player.kitchen', image: 'image.lounge_tv' }))).toEqual(
      {
        url: artwork,
        own: false,
        idle: false,
      },
    );
    expect(
      plate(
        await draw({
          entity: 'media_player.kitchen',
          image: 'image.lounge_tv',
          image_mode: 'always',
        }),
      ),
    ).toEqual({ url: TV, own: true, idle: true });
  });

  it('stays out of reach, where the player has no artwork, in place of the ban glyph', async () => {
    const card = await draw({
      entity: 'media_player.garden',
      image: '/local/speaker.png',
      variant: 'mini',
    });
    expect(plate(card).own).toBe(true);
    expect(card.shadowRoot!.querySelector('.fv-ico--off')).toBeNull();
  });

  it('is never loaded from a scheme a picture is not: the plate keeps its glyph', async () => {
    const card = await draw({ entity: 'media_player.den_tv', image: 'javascript:alert(1)' });
    expect(plate(card).url).toBe('');
    expect(card.shadowRoot!.querySelector('.fv-art svg')).not.toBeNull();
  });

  it('never lets a line break end the picture’s CSS string: what follows it is no declaration', async () => {
    const card = await draw({
      entity: 'media_player.den_tv',
      image: 'https://example.com/tv.png\n);position:fixed;inset:0;x:(',
      image_mode: 'always',
    });
    const style = card.shadowRoot!.querySelector('.fv-art__img')?.getAttribute('style') ?? '';
    expect(style).not.toContain('position');
    expect(plate(card).url).toBe('');
  });
});

describe('a line of the person’s own (#101)', () => {
  it('takes the player’s place in every variant: words, an entity’s state with its unit', async () => {
    for (const variant of ['full', 'hero', 'mini']) {
      const card = await draw({
        entity: 'media_player.kitchen',
        variant,
        secondary: 'Kitchen · Sonos',
      });
      expect(lines(card)[0], variant).toBe('Kitchen · Sonos');
    }
    expect(
      lines(await draw({ entity: 'media_player.den_tv', secondary: 'sensor.tv_status' }))[0],
    ).toBe('On · TV · Volume 7 · Soundbar');
    expect(
      lines(
        await draw({
          entity: 'media_player.den_tv',
          variant: 'mini',
          secondary: 'sensor.soundbar_volume',
        }),
      ),
    ).toEqual(['7 %']);
  });

  it('is a template Home Assistant renders, the player its entity; one that fails says nothing of itself', async () => {
    const card = await draw({
      entity: 'media_player.den_tv',
      secondary: "{{ state_attr(entity, 'source') }}",
    });
    // the first answer lands after the first render
    await card.updateComplete;
    expect(lines(card)[0]).toBe('media_player.den_tv · HDMI 2');
    const failed = await draw({
      entity: 'media_player.den_tv',
      variant: 'mini',
      secondary: '{{ fails }}',
    });
    await failed.updateComplete;
    expect(lines(failed)).toEqual(['']);
  });

  it('gives way to why a player is out of reach', async () => {
    expect(
      lines(await draw({ entity: 'media_player.garden', secondary: 'Garden · Sonos' }))[0],
    ).toMatch(/^Unavailable/);
  });
});
