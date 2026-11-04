import { FluvySliderCard } from '../../../../packages/cards/src/slider/slider-card.js';
import type { SheetSpec } from '../scenes.js';

// its chunk lands after the page has drawn: the sheet defines the card from its module, as the web sheet does
if (!customElements.get('fluvy-slider-card'))
  customElements.define('fluvy-slider-card', FluvySliderCard);

const SLIDER = 'custom:fluvy-slider-card';
/** A player's volume: set, muted, switched on and off, its source chosen. */
const PLAYER = 4 | 8 | 128 | 256 | 2048;
/** A fan of three speeds: set to a speed, switched. */
const FAN = { supported_features: 1 | 16 | 32, percentage_step: 100 / 3 };

const area = (entity: string, id: string) => [entity, { entity_id: entity, area_id: id }] as const;

/**
 * The Slider card (#77) as its approved design page draws it: a soundbar's volume at 30 % and muted, the thermostat's
 * offset −2…+2 in steps of 0.5 lit from zero, the pool pump 0–100 % in steps of 5 with its power as `toggle_entity`,
 * the bedroom fan in its three speeds, each full, compact and as the house's large tile; out of reach at its size;
 * half columns of 152 and 211; tiles in a group, the tile card's own volume and number among them; the discussion's
 * soundbar, a `number` with its power switch.
 */
export const sheet: SheetSpec = {
  states: [
    [
      'media_player.sl_soundbar',
      'on',
      {
        friendly_name: 'Soundbar',
        supported_features: PLAYER,
        volume_level: 0.3,
        is_volume_muted: false,
        source: 'Bluetooth',
        source_list: ['Bluetooth', 'HDMI ARC', 'Optical'],
      },
    ],
    [
      'media_player.sl_muted',
      'on',
      {
        friendly_name: 'Soundbar',
        supported_features: PLAYER,
        volume_level: 0.3,
        is_volume_muted: true,
        source: 'Bluetooth',
      },
    ],
    [
      'media_player.sl_kitchen',
      'playing',
      {
        friendly_name: 'Kitchen',
        supported_features: PLAYER,
        volume_level: 0.45,
        is_volume_muted: false,
        media_title: 'Get Lucky',
        source: 'Radio 3',
      },
    ],
    [
      'media_player.sl_radio',
      'on',
      {
        friendly_name: 'Kitchen',
        supported_features: PLAYER,
        volume_level: 0.45,
        is_volume_muted: false,
        source: 'Radio 3',
      },
    ],
    [
      'media_player.sl_gone',
      'unavailable',
      { friendly_name: 'Soundbar', supported_features: PLAYER },
    ],
    [
      'number.sl_offset',
      '-1.0',
      {
        friendly_name: 'Calibration',
        min: -2,
        max: 2,
        step: 0.5,
        mode: 'slider',
        unit_of_measurement: '°C',
      },
    ],
    [
      'number.sl_offset_gone',
      'unavailable',
      { friendly_name: 'Calibration', min: -2, max: 2, step: 0.5, unit_of_measurement: '°C' },
    ],
    [
      'input_number.sl_pump',
      '65',
      {
        friendly_name: 'Pool pump',
        min: 0,
        max: 100,
        step: 5,
        mode: 'slider',
        unit_of_measurement: '%',
      },
    ],
    ['switch.sl_pump', 'on', { friendly_name: 'Pool pump power' }],
    [
      'input_number.sl_pump_off',
      '65',
      {
        friendly_name: 'Pool pump',
        min: 0,
        max: 100,
        step: 5,
        mode: 'slider',
        unit_of_measurement: '%',
      },
    ],
    ['switch.sl_pump_off', 'off', { friendly_name: 'Pool pump power' }],
    ['fan.sl_bedroom', 'on', { friendly_name: 'Fan', percentage: 66, ...FAN }],
    ['fan.sl_bedroom_off', 'off', { friendly_name: 'Fan', percentage: 0, ...FAN }],
    ['fan.sl_gone', 'unavailable', { friendly_name: 'Fan', ...FAN }],
    // the discussion's soundbar (#77): its volume a number of its integration, its power a switch
    [
      'number.sl_soundbar_volume',
      '30',
      {
        friendly_name: 'Soundbar Volume',
        min: 0,
        max: 100,
        step: 1,
        mode: 'slider',
        unit_of_measurement: '%',
      },
    ],
    ['switch.sl_soundbar_power', 'on', { friendly_name: 'Soundbar Power' }],
  ],
  registry: {
    areas: {
      sl_living: { area_id: 'sl_living', name: 'Living room' },
      sl_garden: { area_id: 'sl_garden', name: 'Garden' },
      sl_bedroom: { area_id: 'sl_bedroom', name: 'Bedroom' },
    },
    entities: Object.fromEntries([
      area('number.sl_offset', 'sl_living'),
      area('number.sl_offset_gone', 'sl_living'),
      area('input_number.sl_pump', 'sl_garden'),
      area('input_number.sl_pump_off', 'sl_garden'),
      area('fan.sl_bedroom', 'sl_bedroom'),
      area('fan.sl_bedroom_off', 'sl_bedroom'),
      area('fan.sl_gone', 'sl_bedroom'),
    ]),
  },
  frames: [
    // a player's volume: its mute in the head, its source on the line
    { title: 'Volume · full', cards: [{ type: SLIDER, entity: 'media_player.sl_soundbar' }] },
    {
      title: 'Volume · compact',
      cards: [{ type: SLIDER, entity: 'media_player.sl_soundbar', variant: 'compact' }],
    },
    {
      title: 'Volume · tiles',
      cards: [
        { type: SLIDER, entity: 'media_player.sl_soundbar', variant: 'tile', cols: 6 },
        { type: SLIDER, entity: 'media_player.sl_muted', variant: 'tile', cols: 6 },
      ],
    },
    // muted: the level stays, the ruler and the circle go neutral, the round says it has no sound
    { title: 'Muted · full', cards: [{ type: SLIDER, entity: 'media_player.sl_muted' }] },
    {
      title: 'Muted · compact',
      cards: [{ type: SLIDER, entity: 'media_player.sl_muted', variant: 'compact' }],
    },
    // a number: its range, step and unit, a tick a step, lit from zero; a label of its own
    {
      title: 'Offset · full',
      cards: [{ type: SLIDER, entity: 'number.sl_offset', icon: 'thermo', label: 'Offset' }],
    },
    {
      title: 'Offset · compact',
      cards: [{ type: SLIDER, entity: 'number.sl_offset', icon: 'thermo', variant: 'compact' }],
    },
    {
      title: 'Offset · tiles',
      cards: [
        { type: SLIDER, entity: 'number.sl_offset', icon: 'thermo', variant: 'tile', cols: 6 },
        {
          type: SLIDER,
          entity: 'number.sl_offset_gone',
          icon: 'thermo',
          variant: 'tile',
          cols: 6,
        },
      ],
    },
    // a helper with another entity's switch in the head (the discussion's soundbar power)
    {
      title: 'Pool pump · full',
      cards: [
        {
          type: SLIDER,
          entity: 'input_number.sl_pump',
          toggle_entity: 'switch.sl_pump',
          icon: 'drop',
          tone: 'water',
          label: 'Speed',
        },
      ],
    },
    {
      title: 'Pool pump · compact',
      cards: [
        {
          type: SLIDER,
          entity: 'input_number.sl_pump',
          toggle_entity: 'switch.sl_pump',
          icon: 'drop',
          tone: 'water',
          variant: 'compact',
        },
      ],
    },
    {
      title: 'Pool pump · tiles',
      cards: [
        {
          type: SLIDER,
          entity: 'input_number.sl_pump',
          toggle_entity: 'switch.sl_pump',
          icon: 'drop',
          tone: 'water',
          variant: 'tile',
          cols: 6,
        },
        {
          type: SLIDER,
          entity: 'input_number.sl_pump_off',
          toggle_entity: 'switch.sl_pump_off',
          icon: 'drop',
          tone: 'water',
          variant: 'tile',
          cols: 6,
        },
      ],
    },
    // a fan: its switch, its three speeds as the ruler's stops
    { title: 'Fan · full', cards: [{ type: SLIDER, entity: 'fan.sl_bedroom' }] },
    {
      title: 'Fan · compact',
      cards: [{ type: SLIDER, entity: 'fan.sl_bedroom', variant: 'compact' }],
    },
    {
      title: 'Fan · tiles',
      cards: [
        { type: SLIDER, entity: 'fan.sl_bedroom', variant: 'tile', cols: 6 },
        { type: SLIDER, entity: 'fan.sl_bedroom_off', variant: 'tile', cols: 6 },
      ],
    },
    // out of reach: the same size and anatomy, still
    { title: 'Out of reach · full', cards: [{ type: SLIDER, entity: 'media_player.sl_gone' }] },
    {
      title: 'Out of reach · compact',
      cards: [{ type: SLIDER, entity: 'fan.sl_gone', variant: 'compact' }],
    },
    // half a phone's section: the circle gives way, the figure moves to the line
    {
      title: 'Half · 152',
      width: 320,
      cards: [
        { type: SLIDER, entity: 'media_player.sl_radio', variant: 'compact', cols: 6 },
        { type: SLIDER, entity: 'number.sl_offset', icon: 'thermo', variant: 'compact', cols: 6 },
      ],
    },
    // a desktop's tiles 8 apart
    {
      title: 'Tiles · 152',
      width: 312,
      gap: 8,
      cards: [
        { type: SLIDER, entity: 'media_player.sl_radio', variant: 'tile', cols: 6 },
        { type: SLIDER, entity: 'fan.sl_bedroom', variant: 'tile', cols: 6 },
      ],
    },
    // a narrow column: the figure steps down to m beside the stepper, or stacks over it
    {
      title: 'Narrow · 211 · beside',
      width: 211,
      cards: [{ type: SLIDER, entity: 'media_player.sl_radio' }],
    },
    {
      title: 'Narrow · 211 · stacked',
      width: 211,
      cards: [{ type: SLIDER, entity: 'number.sl_offset', icon: 'thermo', label: 'Offset' }],
    },
    // the tile card and the tiles group learn the same ruler: a player's volume, a number's value
    {
      title: 'Tile card · volume and number',
      cards: [
        { type: 'custom:fluvy-tile-card', entity: 'media_player.sl_soundbar', cols: 6 },
        { type: 'custom:fluvy-tile-card', entity: 'number.sl_offset', cols: 6 },
      ],
    },
    {
      title: 'Tiles group · volume and number',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          size: 'large',
          columns: 2,
          tiles: ['media_player.sl_kitchen', 'input_number.sl_pump'],
        },
      ],
    },
    // the volume heard as it moves: sent while the finger drags, no faster than every 200 ms
    {
      title: 'Volume · live update',
      cards: [
        { type: SLIDER, entity: 'media_player.sl_kitchen', variant: 'compact', live_update: true },
      ],
    },
    // the discussion's soundbar (#77): a number set on the ruler, its power switch in the head
    {
      title: 'The soundbar of #77',
      cards: [
        {
          type: SLIDER,
          entity: 'number.sl_soundbar_volume',
          toggle_entity: 'switch.sl_soundbar_power',
          variant: 'compact',
        },
      ],
    },
    // the tile card says what the Slider's tile says: a muted player "Muted · 30 %", a number its ruler's "−1.0 °C" on
    // a compact and a mini tile too
    {
      title: 'Tile card · muted, and a number small',
      cards: [
        { type: 'custom:fluvy-tile-card', entity: 'media_player.sl_muted', cols: 6 },
        { type: SLIDER, entity: 'media_player.sl_muted', variant: 'tile', cols: 6 },
        {
          type: 'custom:fluvy-tile-card',
          entity: 'media_player.sl_muted',
          size: 'compact',
          cols: 6,
        },
        { type: 'custom:fluvy-tile-card', entity: 'number.sl_offset', size: 'compact', cols: 6 },
        { type: 'custom:fluvy-tile-card', entity: 'number.sl_offset', size: 'mini', cols: 6 },
      ],
    },
  ],
};
