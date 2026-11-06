import type { SheetSpec } from '../scenes.js';

/** A colour bulb's lit colour, Home Assistant's own orange: what `rgb_color` says beside its `hs_color`. */
const ORANGE = { hs_color: [36, 100], rgb_color: [255, 152, 0] };
/** A white at 3200 K as Home Assistant reports it: its colour as well (`rgb_color`, `hs_color`), as it does for every white. */
const WARM_WHITE = { color_temp_kelvin: 3200, hs_color: [27.5, 51.7], rgb_color: [255, 184, 123] };
/** A bulb of colours and whites, as the tint frames' lamps are. */
const BULB = {
  supported_color_modes: ['hs', 'color_temp'],
  min_color_temp_kelvin: 2200,
  max_color_temp_kelvin: 6500,
};

export const sheet: SheetSpec = {
  states: [
    // the ceiling: a colour bulb in its white (the default config draws the temperature ruler and the quick colours)
    [
      'light.ceiling',
      'on',
      {
        friendly_name: 'Ceiling',
        brightness: 178,
        supported_color_modes: ['hs', 'color_temp'],
        color_mode: 'color_temp',
        ...WARM_WHITE,
        min_color_temp_kelvin: 2200,
        max_color_temp_kelvin: 6500,
      },
    ],
    // the lamp: the same bulb glowing a colour (the hue ruler takes the slot, the card wears the orange)
    [
      'light.lamp',
      'on',
      {
        friendly_name: 'Lamp',
        brightness: 200,
        supported_color_modes: ['hs', 'color_temp'],
        color_mode: 'hs',
        ...ORANGE,
        min_color_temp_kelvin: 2200,
        max_color_temp_kelvin: 6500,
      },
    ],
    // a bulb of colours alone, no white to set: the quick colours are colours alone
    [
      'light.strip',
      'on',
      {
        friendly_name: 'Strip',
        brightness: 120,
        supported_color_modes: ['rgb'],
        color_mode: 'rgb',
        rgb_color: [33, 150, 243],
      },
    ],
    ['light.reading', 'off', { friendly_name: 'Reading', supported_color_modes: ['brightness'] }],
    [
      'light.porch',
      'unavailable',
      { friendly_name: 'Porch light', supported_color_modes: ['brightness'] },
    ],
    // the tint frames (#41): an orange lamp at 12 %, a red one, a white one, and a group of a colour among whites
    [
      'light.tn_dim',
      'on',
      { friendly_name: 'Night lamp', brightness: 31, color_mode: 'hs', ...ORANGE, ...BULB },
    ],
    [
      'light.tn_red',
      'on',
      {
        friendly_name: 'Sofa lamp',
        brightness: 230,
        color_mode: 'hs',
        hs_color: [4, 78],
        rgb_color: [244, 67, 54],
        ...BULB,
      },
    ],
    [
      'light.tn_white',
      'on',
      {
        friendly_name: 'Desk lamp',
        brightness: 204,
        color_mode: 'color_temp',
        ...WARM_WHITE,
        ...BULB,
      },
    ],
    [
      'light.tn_group',
      'on',
      {
        friendly_name: 'Living room',
        brightness: 190,
        // Home Assistant's own: the most common mode among the lit members, the plain mean of their colours
        color_mode: 'color_temp',
        color_temp_kelvin: 3200,
        hs_color: [31, 49],
        rgb_color: [255, 189, 130],
        entity_id: ['light.lamp', 'light.ceiling', 'light.reading'],
        ...BULB,
      },
    ],
    // a colour bulb that cannot be read: Home Assistant keeps what it can do
    ['light.tn_gone', 'unavailable', { friendly_name: 'Hall lamp', ...BULB }],
    // bulbs that only switch (#65): the card is their head alone, in every style
    ['light.pantry', 'on', { friendly_name: 'Pantry', supported_color_modes: ['onoff'] }],
    ['light.stairs', 'off', { friendly_name: 'Stairs', supported_color_modes: ['onoff'] }],
    // #125: Govee's lights, each the entity of a device of its own; Home Assistant's friendly name says both
    [
      'light.nm_baum',
      'on',
      { friendly_name: 'EG_GA_L_Baum Baum', brightness: 150, color_mode: 'hs', ...ORANGE, ...BULB },
    ],
    ['light.nm_beet', 'off', { friendly_name: 'EG_GA_L_BeetTerrasse Beet', ...BULB }],
    // #124: colour bulbs whose cards show the brightness never, or while they are on
    [
      'light.sb_desk',
      'on',
      { friendly_name: 'Desk', brightness: 180, color_mode: 'color_temp', ...WARM_WHITE, ...BULB },
    ],
    ['light.sb_hall', 'off', { friendly_name: 'Hall', ...BULB }],
    ['light.sb_landing', 'off', { friendly_name: 'Landing', ...BULB }],
  ],
  registry: {
    areas: { nm_garden: { area_id: 'nm_garden', name: 'Garten' } },
    devices: {
      nm_baum: { id: 'nm_baum', name: 'EG_GA_L_Baum', name_by_user: null, area_id: 'nm_garden' },
      nm_beet: {
        id: 'nm_beet',
        name: 'EG_GA_L_BeetTerrasse',
        name_by_user: null,
        area_id: 'nm_garden',
      },
    },
    entities: {
      'light.nm_baum': { entity_id: 'light.nm_baum', name: 'Baum', device_id: 'nm_baum' },
      'light.nm_beet': { entity_id: 'light.nm_beet', name: 'Beet', device_id: 'nm_beet' },
    },
  },
  frames: [
    { title: 'On', cards: [{ type: 'custom:fluvy-light-card', entity: 'light.ceiling' }] },
    // a dimmer alone draws no ruler slot and no quick colours: the declared height reserves them (config only)
    {
      title: 'Off',
      measure: false,
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.reading' }],
    },
    {
      title: 'Unavailable',
      measure: false,
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.porch' }],
    },
    {
      title: 'Live update',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.ceiling',
          live_update: true,
          show_temperature: false,
        },
      ],
    },
    // issue #32: a bulb in a colour — the hue ruler in the slot, its colour on the card and checked in the row
    {
      title: 'Colour · hs mode',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.lamp' }],
    },
    // the house's own quick colours: eight, so the row wraps six and two
    {
      title: 'Colour · custom swatches',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          colors: ['warm', 'cool', '#ff2d55', 'amber', 'teal', 'purple', 'pink', 'blue'],
        },
      ],
    },
    // the house's own list with the picker: three colours and any other — the lamp's orange is none of the three, so
    // the picker's round holds it, inside its ring of the hues
    {
      title: 'Colour · with the picker',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          colors: ['red', 'blue', 'purple', 'picker'],
        },
      ],
    },
    // issue #37: the house's own colours with names of their own — a hex, a triplet and a Home Assistant colour
    // named, a colour name as words, a white, and the picker last; the lamp's orange is none of them, so the picker
    // holds it
    {
      title: 'Colour · named custom',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          colors: [
            { color: '#ff2d55', name: 'Lila' },
            { color: [0, 128, 128], name: 'Teal' },
            { color: 'amber', name: 'Honey' },
            'deep-purple',
            'warm',
            'picker',
          ],
        },
      ],
    },
    // any number, any mix, any order: twelve — whites, names, hexes, triplets, a named one, the picker in the
    // middle — wrap into two rows of six; the picker holds the lamp's orange
    {
      title: 'Colour · twelve',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          colors: [
            'warm',
            'cool',
            'red',
            '#ff2d55',
            [0, 128, 128],
            'picker',
            { color: 'amber', name: 'Honey' },
            'teal',
            'blue',
            '#6e41ab',
            [255, 0, 255],
            'pink',
          ],
        },
      ],
    },
    // and three: one short row from the left, the orange checked
    {
      title: 'Colour · three',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          colors: ['warm', 'orange', 'picker'],
        },
      ],
    },
    // colours alone: no white among the quick colours, the hue ruler whatever the mode
    {
      title: 'Colour · colours alone',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.strip' }],
    },
    {
      title: 'Colour hidden',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.lamp', show_color: false }],
    },
    // half a section each: the compact layout by width (the head says the level, the ruler stands alone)
    {
      title: 'Two on a line',
      width: 480,
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.ceiling', cols: 6 },
        { type: 'custom:fluvy-light-card', entity: 'light.reading', cols: 6 },
      ],
    },
    {
      title: 'Two on a phone',
      measure: false,
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.lamp', cols: 6 },
        { type: 'custom:fluvy-light-card', entity: 'light.porch', cols: 6 },
      ],
    },
    // the compact layout on the colour bulb: nothing of the colour controls, the worn colour alone
    {
      title: 'Compact by choice',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.lamp', variant: 'compact' }],
    },
    // the compact layout at its own size: half a section
    {
      title: 'Compact · half a section',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.ceiling', variant: 'compact', cols: 6 },
        { type: 'custom:fluvy-light-card', entity: 'light.reading', variant: 'compact', cols: 6 },
      ],
    },
    // the full layout asked for in half a section: the stepper under the level; without it, the level is the tap
    {
      title: 'Full · half a section',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.ceiling', variant: 'full', cols: 6 },
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.reading',
          variant: 'full',
          show_stepper: false,
          cols: 6,
        },
      ],
    },
    // #41: a lit light card shows its colour (tint), as a lit tile does — its bulb's, a white's, its own, a group's
    {
      title: 'Tint · colour',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.lamp', tint: 'on' }],
    },
    {
      title: 'Tint · white',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.tn_white', tint: 'on' }],
    },
    {
      title: 'Tint · white by its temperature',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.tn_white',
          tint: 'on',
          light_whites: 'temperature',
        },
      ],
    },
    // as strong as the lamp is bright: a lamp at 12 % reads lit, one at 78 % nearly the whole fill
    {
      title: 'Tint · dim and bright',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.tn_dim',
          tint: 'on',
          tint_strength: 'brightness',
        },
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          tint: 'on',
          tint_strength: 'brightness',
        },
      ],
    },
    {
      title: 'Tint · soft',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          tint: 'on',
          tint_strength: 'soft',
        },
      ],
    },
    // its own colour beats its bulb's; a tone of its own too
    {
      title: 'Tint · own colour',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.lamp', tint: 'on', color: 'teal' },
        { type: 'custom:fluvy-light-card', entity: 'light.tn_red', tint: 'on', tone: 'cool' },
      ],
    },
    // at rest too: a quiet wash of its colour (its own; else the palette's lit light), lit never the same
    {
      title: 'Tint · always at rest',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.reading',
          tint: 'always',
          color: 'purple',
        },
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.reading',
          tint: 'always',
          tint_strength: 'soft',
        },
      ],
    },
    // a card colour of its own is its rest; lit, the light's colour is over it
    {
      title: 'Tint · with card colour',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.tn_red', tint: 'on', card_color: 'blue' },
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.reading',
          tint: 'always',
          card_color: 'blue',
        },
      ],
    },
    {
      title: 'Tint · unavailable',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.porch', tint: 'always' }],
    },
    // a group glows its lit members' colours by brightness: the orange lamp among whites, never Home Assistant's mean
    {
      title: 'Tint · group',
      cards: [{ type: 'custom:fluvy-light-card', entity: 'light.tn_group', tint: 'on' }],
    },
    {
      title: 'Tint · two compact',
      width: 480,
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.lamp', tint: 'on', cols: 6 },
        { type: 'custom:fluvy-light-card', entity: 'light.reading', tint: 'on', cols: 6 },
      ],
    },
    {
      title: 'Tint · narrow',
      width: 211,
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.lamp', tint: 'on', variant: 'full' },
      ],
    },
    // the whites' rounds read warm and cool beside each other (relative to a neutral white, not a black body's cream)
    {
      title: 'Colour · whites',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.ceiling',
          colors: ['warm', 'cool', 'red'],
        },
      ],
    },
    // a colour bulb compact by its width (a zoomed phone) keeps one row of its quick colours, the picker last
    {
      title: 'Compact colour bulb 240',
      width: 240,
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.lamp',
          colors: ['warm', 'cool', 'red', 'green', 'blue', 'purple', 'picker'],
        },
      ],
    },
    // a light that cannot be read keeps the card's size and anatomy: its switch, its level, its colours, still
    {
      title: 'Unavailable · whole',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.tn_gone',
        },
        { type: 'custom:fluvy-light-card', entity: 'light.tn_missing' },
      ],
    },
    // #65: a bulb that only switches is its head alone — the circle, the name, the state line, the switch — in
    // every style, 84 where it took a dimmer's 256; on and off, the full style asked for and the compact one at
    // half a section
    {
      title: 'On/off bulb',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.pantry' },
        { type: 'custom:fluvy-light-card', entity: 'light.stairs', variant: 'full' },
      ],
    },
    {
      title: 'On/off bulb · compact',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.pantry', variant: 'compact', cols: 6 },
        { type: 'custom:fluvy-light-card', entity: 'light.stairs', variant: 'compact', cols: 6 },
      ],
    },
    // a lit light's tile and row in its bulb's colour (`light_colors`): the orange lamp, the blue strip, a white in its
    // warmth (#58); an off lamp keeps the palette's light
    {
      title: 'Tiles · bulb colours',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          light_colors: true,
          entities: ['light.lamp', 'light.strip', 'light.ceiling', 'light.reading'],
        },
        { type: 'custom:fluvy-tile-card', entity: 'light.tn_red', light_colors: true },
      ],
    },
    // the order (#58): the tile's own colour, its tone, the bulb's, then the card's colour
    {
      title: 'Tiles · their own colour first',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          light_colors: true,
          tiles: [
            { entity: 'light.lamp', color: 'teal' },
            { entity: 'light.strip', tone: 'heat' },
          ],
        },
        {
          type: 'custom:fluvy-tiles-card',
          light_colors: true,
          color: 'purple',
          entities: ['light.lamp', 'light.strip'],
        },
      ],
    },
    {
      title: 'Rows · bulb colours',
      cards: [
        {
          type: 'custom:fluvy-entities-card',
          title: 'Lights',
          light_colors: true,
          entities: ['light.lamp', 'light.strip', 'light.tn_white', 'light.reading'],
        },
      ],
    },
    // a white in a wash: the temperature ruler's ends on it
    {
      title: 'Tint · white, soft',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.tn_white',
          tint: 'on',
          tint_strength: 'soft',
        },
      ],
    },
    // #125: a name as Home Assistant's editor writes it, read with the entity: "Baum", where its friendly name says
    // "EG_GA_L_Baum Baum" (the default, beside it), in a head, a compact head, a tile and a row
    {
      title: 'Name · the entity’s own',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.nm_baum', name: { type: 'entity' } },
      ],
    },
    {
      title: 'Name · compact, beside the friendly name',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.nm_baum',
          variant: 'compact',
          name: { type: 'entity' },
          cols: 6,
        },
        { type: 'custom:fluvy-light-card', entity: 'light.nm_beet', variant: 'compact', cols: 6 },
      ],
    },
    {
      title: 'Name · tiles and rows',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          tiles: [
            { entity: 'light.nm_baum', name: [{ type: 'entity' }, { type: 'area' }] },
            { entity: 'light.nm_beet', name: [{ type: 'text', text: 'Bed' }, { type: 'entity' }] },
          ],
        },
        {
          type: 'custom:fluvy-entities-card',
          title: 'Garten',
          entities: [
            { entity: 'light.nm_baum', name: { type: 'entity' } },
            { entity: 'light.nm_beet', name: { type: 'device' } },
          ],
        },
      ],
    },
    // #124: the brightness never shown, the card its head alone as a bulb that only switches is, on and off
    {
      title: 'Brightness · never',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.sb_desk', show_brightness: false },
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.sb_desk',
          show_brightness: false,
          variant: 'compact',
          cols: 6,
        },
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.sb_hall',
          show_brightness: false,
          variant: 'compact',
          cols: 6,
        },
      ],
    },
    // shown while the light is on: the whole card while on, its head alone while off
    {
      title: 'Brightness · when on',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.sb_desk', show_brightness: 'when_on' },
        { type: 'custom:fluvy-light-card', entity: 'light.sb_hall', show_brightness: 'when_on' },
      ],
    },
    {
      title: 'Brightness · when on, compact',
      cards: [
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.sb_desk',
          show_brightness: 'when_on',
          variant: 'compact',
          cols: 6,
        },
        {
          type: 'custom:fluvy-light-card',
          entity: 'light.sb_hall',
          show_brightness: 'when_on',
          variant: 'compact',
          cols: 6,
        },
      ],
    },
    // the ease: its switch opens the card to its brightness, and the card under it moves down with it as it does
    // (`interactions-lights.mjs`)
    {
      title: 'Brightness · when on, the ease',
      cards: [
        { type: 'custom:fluvy-light-card', entity: 'light.sb_landing', show_brightness: 'when_on' },
        { type: 'custom:fluvy-tile-card', entity: 'light.sb_desk' },
      ],
    },
  ],
};
