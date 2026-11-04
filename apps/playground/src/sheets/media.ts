import { FluvyMediaCard } from '../../../../packages/cards/src/media/media-card.js';
import { FluvyNowPlayingCard } from '../../../../packages/cards/src/now-playing/now-playing-card.js';
import type { SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-media-card'))
  customElements.define('fluvy-media-card', FluvyMediaCard);
if (!customElements.get('fluvy-now-playing-card'))
  customElements.define('fluvy-now-playing-card', FluvyNowPlayingCard);

/* supported_features bits of media_player */
const PAUSE = 1,
  SEEK = 2,
  VOLUME_SET = 4,
  VOLUME_MUTE = 8,
  PREVIOUS = 16,
  NEXT = 32;
const TURN_ON = 128,
  TURN_OFF = 256,
  VOLUME_STEP = 1024,
  SELECT_SOURCE = 2048;
const STOP = 4096,
  PLAY = 16384,
  SHUFFLE = 32768,
  REPEAT = 262144;

const SPEAKER =
  PAUSE |
  SEEK |
  VOLUME_SET |
  VOLUME_MUTE |
  PREVIOUS |
  NEXT |
  TURN_ON |
  TURN_OFF |
  VOLUME_STEP |
  STOP |
  PLAY |
  SHUFFLE |
  REPEAT;
const CAST = PAUSE | VOLUME_SET | VOLUME_MUTE | PREVIOUS | NEXT | TURN_ON | TURN_OFF | PLAY | STOP;
const TV =
  PAUSE |
  VOLUME_SET |
  VOLUME_MUTE |
  PREVIOUS |
  NEXT |
  TURN_ON |
  TURN_OFF |
  SELECT_SOURCE |
  PLAY |
  STOP;
/** A radio that cannot be switched off from here, and has no mute: the volume round opens its dialog. */
const RADIO = PAUSE | PLAY | VOLUME_SET | VOLUME_STEP | PREVIOUS | NEXT;

/** The mini row and the strip asked for every round there is. */
const EVERY_CONTROL = ['power', 'previous', 'play', 'next', 'volume'];

/** Album art as a data URI: the playground never reaches out to the network. */
const art = (from: string, to: string): string =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><circle cx="72" cy="66" r="42" fill="#ffffff" opacity="0.22"/><circle cx="168" cy="186" r="66" fill="#000000" opacity="0.12"/></svg>`,
  );

/** A television's product picture (#99), as an image entity or a person's own address gives one. */
const TELEVISION =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34475a"/><stop offset="0.55" stop-color="#141a21"/><stop offset="1" stop-color="#0b0e12"/></linearGradient></defs><ellipse cx="32" cy="53" rx="15" ry="1.8" fill="#000" opacity="0.18"/><rect x="4" y="11" width="56" height="34" rx="2.5" fill="#15181c"/><rect x="5.5" y="12.5" width="53" height="31" rx="1.5" fill="url(#s)"/><path d="M5.5 12.5h22l-14 31h-8z" fill="#fff" opacity="0.06"/><rect x="29" y="45" width="6" height="5" fill="#2c3036"/><rect x="21" y="50" width="22" height="2.5" rx="1.25" fill="#2c3036"/></svg>`,
  );

/** The position is anchored to the real clock: the card advances it once a second while playing. */
const anchor = new Date().toISOString();

export const sheet: SheetSpec = {
  states: [
    [
      'media_player.kitchen',
      'playing',
      {
        friendly_name: 'Kitchen speaker',
        media_title: 'Midnight Coda',
        media_artist: 'Ola Gjeilo',
        media_album_name: 'Winter Songs',
        media_duration: 222,
        media_position: 84,
        media_position_updated_at: anchor,
        volume_level: 0.42,
        is_volume_muted: false,
        shuffle: false,
        repeat: 'off',
        app_name: 'Spotify',
        entity_picture: art('#8a6a3a', '#e0cba4'),
        supported_features: SPEAKER,
      },
    ],
    [
      'media_player.study',
      'paused',
      {
        friendly_name: 'Study speaker',
        media_title: 'Northern Lights',
        media_artist: 'Ola Gjeilo',
        media_album_name: 'Winter Songs',
        media_duration: 252,
        media_position: 84,
        media_position_updated_at: anchor,
        volume_level: 0.18,
        is_volume_muted: true,
        shuffle: true,
        repeat: 'one',
        app_name: 'Spotify',
        entity_picture: art('#4a5a6a', '#b9c6cf'),
        supported_features: SPEAKER,
      },
    ],
    [
      'media_player.office',
      'playing',
      {
        friendly_name: 'Office speaker',
        media_title: 'Tundra',
        media_artist: 'Ola Gjeilo',
        media_duration: 303,
        media_position: 120,
        media_position_updated_at: anchor,
        volume_level: 0.66,
        app_name: 'Radio Paradise',
        supported_features: CAST,
      },
    ],
    [
      'media_player.living',
      'idle',
      {
        friendly_name: 'Living room speaker',
        volume_level: 0.3,
        supported_features: CAST,
      },
    ],
    ['media_player.patio', 'off', { friendly_name: 'Patio speaker', supported_features: CAST }],
    [
      'media_player.garden',
      'unavailable',
      { friendly_name: 'Garden speaker', supported_features: CAST },
    ],
    [
      'media_player.tv',
      'playing',
      {
        friendly_name: 'Lounge TV',
        media_title: 'Braciole',
        media_series_title: 'The Bear',
        app_name: 'Netflix',
        media_duration: 1980,
        media_position: 600,
        media_position_updated_at: anchor,
        volume_level: 0.24,
        source: 'HDMI 1',
        source_list: ['TV', 'Netflix', 'Spotify', 'HDMI 1', 'HDMI 2', 'AirPlay', 'Radio'],
        entity_picture: art('#5a3a4a', '#d6b3c2'),
        supported_features: TV,
      },
    ],
    [
      'media_player.tv_off',
      'off',
      {
        friendly_name: 'Bedroom TV',
        volume_level: 0.2,
        source_list: ['TV', 'Netflix', 'HDMI 1'],
        supported_features: TV,
      },
    ],
    // #101: televisions that are on and play nothing Home Assistant can name — a tuner's channel, an app it does not
    // report as playing; one says its input, one its app, one nothing but its state
    [
      'media_player.tv_on',
      'on',
      {
        friendly_name: 'Den TV',
        device_class: 'tv',
        volume_level: 0.2,
        source: 'HDMI 1',
        source_list: ['TV', 'Netflix', 'HDMI 1'],
        supported_features: TV,
      },
    ],
    [
      'media_player.tv_app',
      'on',
      {
        friendly_name: 'Kids TV',
        device_class: 'tv',
        volume_level: 0.2,
        app_name: 'YouTube',
        supported_features: TV,
      },
    ],
    [
      'media_player.tv_bare',
      'on',
      { friendly_name: 'Guest TV', device_class: 'tv', supported_features: TV },
    ],
    ['image.den_tv', '2026-11-04T08:00:00+00:00', { entity_picture: TELEVISION }],
    // #101: a television's status as an integration's sensor says it, for a line of the person's own
    ['sensor.den_tv_status', 'On · TV · Volume 7 · Soundbar', { friendly_name: 'Den TV status' }],
    [
      'media_player.radio',
      'playing',
      {
        friendly_name: 'Garage radio',
        media_title: 'Radio Paradise',
        media_artist: 'Mellow mix',
        volume_level: 0.5,
        supported_features: RADIO,
      },
    ],
    [
      'media_player.nulls',
      'playing',
      {
        friendly_name: 'Bathroom radio',
        media_title: null,
        media_artist: null,
        media_duration: null,
        media_position: null,
        volume_level: null,
        is_volume_muted: null,
        source: null,
        source_list: null,
        supported_features: CAST,
      },
    ],
  ],
  frames: [
    {
      title: 'Playing',
      cards: [{ type: 'custom:fluvy-media-card', entity: 'media_player.kitchen' }],
    },
    {
      title: 'Paused · muted',
      cards: [{ type: 'custom:fluvy-media-card', entity: 'media_player.study' }],
    },
    { title: 'Idle', cards: [{ type: 'custom:fluvy-media-card', entity: 'media_player.living' }] },
    { title: 'Off', cards: [{ type: 'custom:fluvy-media-card', entity: 'media_player.patio' }] },
    {
      title: 'No artwork',
      cards: [{ type: 'custom:fluvy-media-card', entity: 'media_player.office' }],
    },
    {
      title: 'TV · sources',
      cards: [{ type: 'custom:fluvy-media-card', entity: 'media_player.tv' }],
    },
    {
      title: 'Nulls · missing',
      cards: [
        { type: 'custom:fluvy-media-card', entity: 'media_player.nulls' },
        { type: 'custom:fluvy-media-card', entity: 'media_player.gone' },
      ],
    },
    {
      title: 'Unavailable',
      cards: [
        { type: 'custom:fluvy-media-card', entity: 'media_player.garden' },
        { type: 'custom:fluvy-media-card', entity: 'media_player.garden', variant: 'mini' },
      ],
    },
    {
      title: 'Mini',
      cards: [
        { type: 'custom:fluvy-media-card', entity: 'media_player.kitchen', variant: 'mini' },
        { type: 'custom:fluvy-media-card', entity: 'media_player.living', variant: 'mini' },
        { type: 'custom:fluvy-media-card', entity: 'media_player.office', variant: 'mini' },
        { type: 'custom:fluvy-media-card', entity: 'media_player.tv', variant: 'mini' },
      ],
    },
    // a player told to show neither its sources nor its volume
    {
      title: 'TV · bare',
      cards: [
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv',
          show_source: false,
          show_volume: false,
        },
      ],
    },
    {
      title: 'Hero',
      cards: [{ type: 'custom:fluvy-media-card', entity: 'media_player.kitchen', variant: 'hero' }],
    },
    // the power round: beside "…" on a television that is on, "Turn on" in the primary fill on one that is off
    // (no dead transport under it), and none at all on a radio that cannot be switched from here
    {
      title: 'Power · TV',
      cards: [{ type: 'custom:fluvy-media-card', entity: 'media_player.tv', show_source: false }],
    },
    {
      title: 'Power · off',
      cards: [{ type: 'custom:fluvy-media-card', entity: 'media_player.tv_off' }],
    },
    {
      title: 'No power',
      cards: [
        { type: 'custom:fluvy-media-card', entity: 'media_player.radio' },
        { type: 'custom:fluvy-media-card', entity: 'media_player.tv', show_power: false },
      ],
    },
    // every control asked for: the row holds three beside the title at a phone column, in the order named;
    // the volume round mutes where it can (the TV) and opens the dialog where it cannot (the radio)
    {
      title: 'Mini · controls',
      cards: [
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv',
          variant: 'mini',
          controls: EVERY_CONTROL,
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv_off',
          variant: 'mini',
          controls: EVERY_CONTROL,
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.radio',
          variant: 'mini',
          controls: EVERY_CONTROL,
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv',
          variant: 'mini',
          controls: ['play', 'volume'],
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.radio',
          variant: 'mini',
          controls: ['play', 'volume'],
        },
      ],
    },
    // half a column cannot hold a round beside the title's 96: the row is the art and the words
    {
      title: 'Mini · half',
      cards: [
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv',
          variant: 'mini',
          controls: EVERY_CONTROL,
          cols: 6,
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.kitchen',
          variant: 'mini',
          cols: 6,
        },
      ],
    },
    // the strip with power on its left edge; off, the power round is the one live round
    {
      title: 'Now playing · power',
      cards: [
        {
          type: 'custom:fluvy-now-playing-card',
          entity: 'media_player.tv',
          controls: EVERY_CONTROL,
        },
        {
          type: 'custom:fluvy-now-playing-card',
          entity: 'media_player.tv_off',
          controls: EVERY_CONTROL,
        },
        {
          type: 'custom:fluvy-now-playing-card',
          entity: 'media_player.radio',
          controls: EVERY_CONTROL,
        },
        {
          type: 'custom:fluvy-now-playing-card',
          entity: 'media_player.tv',
          controls: EVERY_CONTROL,
          cols: 6,
        },
      ],
    },
    // #101: a television that is on says what it shows, its input or its app, where one at rest says when it last played
    {
      title: 'TV · on, not playing (#101)',
      cards: [
        { type: 'custom:fluvy-media-card', entity: 'media_player.tv_on' },
        { type: 'custom:fluvy-media-card', entity: 'media_player.tv_on', variant: 'mini' },
        { type: 'custom:fluvy-media-card', entity: 'media_player.tv_app', variant: 'mini' },
        { type: 'custom:fluvy-media-card', entity: 'media_player.tv_bare', variant: 'mini' },
      ],
    },
    // #99: the person's own picture on the plate at rest where the player has no artwork — an image entity's, an
    // address — whole, never cropped; over the artwork too where it is asked for always; out of reach, greyed
    {
      title: 'Own picture (#99)',
      cards: [
        { type: 'custom:fluvy-media-card', entity: 'media_player.tv_on', image: 'image.den_tv' },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv_off',
          image: TELEVISION,
          variant: 'mini',
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv',
          image: 'image.den_tv',
          image_mode: 'always',
          variant: 'mini',
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.garden',
          image: 'image.den_tv',
          variant: 'mini',
        },
      ],
    },
    {
      title: 'Own picture · hero',
      cards: [
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv_bare',
          image: 'image.den_tv',
          variant: 'hero',
        },
      ],
    },
    // #101: a line of the person's own in the player's place — a status sensor's state, a template, words — in every
    // variant; a player out of reach still says why
    {
      title: 'Own line (#101)',
      cards: [
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv_on',
          variant: 'mini',
          secondary: 'sensor.den_tv_status',
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.kitchen',
          variant: 'mini',
          secondary:
            "{{ state_attr(entity, 'app_name') }} · Volume {{ (state_attr(entity, 'volume_level') * 100) | round }} %",
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.garden',
          variant: 'mini',
          secondary: 'Garden · Sonos',
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv_app',
          image: 'image.den_tv',
          secondary: 'sensor.den_tv_status',
        },
      ],
    },
    {
      title: 'Own line · half',
      cards: [
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.tv_on',
          variant: 'mini',
          secondary: 'sensor.den_tv_status',
          cols: 6,
        },
        {
          type: 'custom:fluvy-media-card',
          entity: 'media_player.kitchen',
          variant: 'mini',
          secondary: 'Kitchen · Sonos One',
          cols: 6,
        },
      ],
    },
  ],
};
