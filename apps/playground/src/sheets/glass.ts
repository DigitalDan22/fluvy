import type { LovelaceCardConfig } from '@fluvy/core';
import type { FrameSpec, SheetSpec } from '../scenes.js';
import { sheet as ambient } from './ambient.js';
import { sheet as appliances } from './appliances.js';
import { sheet as calendar } from './calendar.js';
import { sheet as climate } from './climate.js';
import { sheet as flow } from './flow.js';
import { cardsOf } from './hero.js';
import { sheet as home } from './home.js';
import { sheet as inputs } from './inputs.js';
import { sheet as lights } from './lights.js';
import { sheet as media } from './media.js';
import { sheet as rooms } from './rooms.js';
import { sheet as security } from './devices-security.js';
import { sheet as slider } from './slider.js';

/**
 * See-through cards (1.15, #121): a dozen cards as a dashboard holds them, on what a view's background may be — the
 * reporter's blue, and a busy picture — at 100, 80, 50 and 0 % (`card_opacity`); what shows through blurred by default,
 * unblurred with `&blur=0` (the house's), in either mode. A menu and a sheet open from a see-through card over it,
 * solid. The house's opacity for every card is `&opacity=` (main.ts).
 */

/** The reporter's favourite: a deep blue to a sky one. */
const BLUE = 'linear-gradient(160deg, #0b2a6f 0%, #1d4ed8 48%, #60a5fa 100%)';

/** A busy picture: bright blots of colour over a striped ground, so what shows through, and its blur, can be judged. */
const PICTURE = [
  'radial-gradient(28% 18% at 18% 12%, #ff7a59 0%, transparent 70%)',
  'radial-gradient(26% 16% at 82% 26%, #ffd166 0%, transparent 70%)',
  'radial-gradient(30% 18% at 28% 52%, #06d6a0 0%, transparent 70%)',
  'radial-gradient(28% 18% at 78% 70%, #ef476f 0%, transparent 70%)',
  'radial-gradient(30% 16% at 30% 90%, #118ab2 0%, transparent 70%)',
  'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.14) 0 10px, transparent 10px 22px)',
  'linear-gradient(180deg, #2b2d42 0%, #6d597a 50%, #355070 100%)',
].join(', ');

/** The appliances' frames speak the page's language: the washer's state words. */
const washer = appliances.frames.find((frame) => frame.title === 'LG · washer spinning');

/** The dozen, each the card it is on the sheets it comes from. */
const DOZEN: readonly LovelaceCardConfig[] = [
  { type: 'custom:fluvy-light-card', entity: 'light.ceiling' },
  ...cardsOf(climate, 'Heat'),
  ...cardsOf(ambient, 'Sensors').slice(2),
  ...cardsOf(flow, 'The #19 house'),
  ...cardsOf(rooms, 'Room · photo'),
  {
    type: 'custom:fluvy-tiles-card',
    tiles: ['light.ceiling', 'light.reading', 'switch.desk_plug', 'cover.blinds'],
  },
  ...cardsOf(media, 'Playing'),
  ...cardsOf(calendar, 'Agenda'),
  ...(washer?.cards ?? []),
  // a card of its own colour: a wash of indigo, its edge in it
  { ...cardsOf(lights, 'Living room')[0]!, card_color: 'indigo' },
  // a lit light card: a wash of its light's colour as strong as the lamp is bright
  {
    type: 'custom:fluvy-light-card',
    entity: 'light.lamp',
    tint: 'on',
    tint_strength: 'brightness',
  },
  // out of reach: the page's fill under its dashed edge
  { type: 'custom:fluvy-light-card', entity: 'light.co_gone' },
];

/** The dozen at an opacity of their own, on a backdrop. */
const dozen = (title: string, backdrop: string, opacity: number): FrameSpec => ({
  title,
  backdrop,
  ...(washer?.hass ? { hass: washer.hass } : {}),
  cards: DOZEN.map((card) => ({ ...card, card_opacity: opacity })),
});

export const sheet: SheetSpec = {
  states: [
    ...slider.states,
    ...climate.states,
    ...ambient.states,
    ...flow.states,
    ...rooms.states,
    ...home.states,
    ...media.states,
    ...calendar.states,
    ...appliances.states,
    ...lights.states,
    ...inputs.states,
    ...security.states,
    ['light.co_gone', 'unavailable', { friendly_name: 'Attic' }],
  ],
  registry: {
    entities: {
      ...ambient.registry?.entities,
      ...rooms.registry?.entities,
      ...appliances.registry?.entities,
      ...lights.registry?.entities,
    },
    devices: {
      ...ambient.registry?.devices,
      ...rooms.registry?.devices,
      ...appliances.registry?.devices,
      ...lights.registry?.devices,
    },
    areas: { ...ambient.registry?.areas, ...rooms.registry?.areas, ...lights.registry?.areas },
    floors: { ...ambient.registry?.floors, ...rooms.registry?.floors, ...lights.registry?.floors },
  },
  history: { ...ambient.history, ...flow.history, ...rooms.history },
  statistics: { ...flow.statistics },
  ws: { ...ambient.ws, ...flow.ws, ...rooms.ws, ...appliances.ws, ...media.ws },
  api: (method, path, body, house) =>
    calendar.api?.(method, path, body, house) ??
    flow.api?.(method, path, body, house) ??
    media.api?.(method, path, body, house),
  frames: [
    dozen('Blue · 100', BLUE, 100),
    dozen('Blue · 80', BLUE, 80),
    dozen('Blue · 50', BLUE, 50),
    dozen('Blue · 0', BLUE, 0),
    dozen('Picture · 80', PICTURE, 80),
    dozen('Picture · 50', PICTURE, 50),
    // what opens from a see-through card is solid over it: a select's menu, the alarm's keypad
    {
      title: 'A menu and a sheet from a see-through card',
      backdrop: BLUE,
      cards: [
        ...cardsOf(inputs, 'Helpers · selects as dropdowns'),
        ...cardsOf(security, 'Alarm'),
      ].map((card) => ({ ...card, card_opacity: 60 })),
    },
    // a light card lit whole (its light's colour, what it says) stays solid; a card that draws none is unchanged
    {
      title: 'Lit whole, and no surface',
      backdrop: BLUE,
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.lamp', tint: 'on', card_opacity: 50 },
        { type: 'custom:fluvy-heading-card', title: 'Living room', card_opacity: 50 },
      ],
    },
  ],
};
