import { FluvyTemplateCard } from '../../../../packages/cards/src/template/template-card.js';
import type { SheetSpec } from '../scenes.js';

// its chunk lands after the page has drawn: the sheet defines the card from its module, as the alerts sheet does
if (!customElements.get('fluvy-template-card'))
  customElements.define('fluvy-template-card', FluvyTemplateCard);

const TEMPLATE = 'custom:fluvy-template-card';

/**
 * The template card (#59): a tile whose name, line, icon, colour and fill are templates, rendered by the playground's
 * corner of Jinja as Home Assistant renders them. `?template_delay=3000` holds every answer for three seconds: the
 * tiles show their entity's own glyph, palette and state, and a blank line where the words will land.
 */
export const sheet: SheetSpec = {
  states: [
    // what the templates read (`tp_`: other sheets own the plain names)
    [
      'light.tp_desk',
      'on',
      { friendly_name: 'Desk lamp', brightness: 179, supported_color_modes: ['brightness'] },
    ],
    ['light.tp_hall', 'off', { friendly_name: 'Hall light', supported_color_modes: ['onoff'] }],
    ['switch.tp_washer', 'on', { friendly_name: 'Washing machine' }],
    [
      'sensor.tp_power',
      '1240',
      { friendly_name: 'Washer power', unit_of_measurement: 'W', device_class: 'power' },
    ],
    [
      'sensor.tp_energy',
      '0.8',
      { friendly_name: 'Washer energy', unit_of_measurement: 'kWh', device_class: 'energy' },
    ],
    [
      'sensor.tp_dryer_power',
      '0',
      { friendly_name: 'Dryer power', unit_of_measurement: 'W', device_class: 'power' },
    ],
    [
      'sensor.tp_temperature',
      '21.4',
      { friendly_name: 'Study', unit_of_measurement: '°C', device_class: 'temperature' },
    ],
    ['binary_sensor.tp_door', 'on', { friendly_name: 'Front door', device_class: 'door' }],
    ['switch.tp_pump', 'unavailable', { friendly_name: 'Garden pump' }],
    ['button.tp_dishwasher_start', 'unknown', { friendly_name: 'Dishwasher start' }],
  ],
  frames: [
    // its icon by the lamp's state, its line a reading; the washer's colour the warning's while it draws a lot
    {
      title: 'Compact',
      cards: [
        {
          type: TEMPLATE,
          entity: 'light.tp_desk',
          icon: "{{ 'mdi:lamp' if is_state(entity, 'on') else 'mdi:lamp-outline' }}",
          secondary: "{{ states('sensor.tp_temperature') }} °C here",
          cols: 6,
        },
        {
          type: TEMPLATE,
          entity: 'switch.tp_washer',
          secondary: "{{ states('sensor.tp_power') | round }} W",
          color: "{{ 'warning' if states('sensor.tp_power') | float > 1000 else 'accent' }}",
          cols: 6,
        },
      ],
    },
    // Mushroom's template cards as they are pasted: `primary`, `icon_color`, `layout: vertical` and its later
    // `vertical: true`, `fill_container`, and its common brightness in per cent
    {
      title: 'Mini · Mushroom’s',
      cards: [
        {
          type: TEMPLATE,
          entity: 'light.tp_desk',
          primary: 'Desk',
          secondary: "{{ (state_attr(entity, 'brightness') / 2.55) | round(0) }} %",
          icon: 'mdi:desk-lamp',
          icon_color: "{{ 'amber' if is_state(entity, 'on') else 'grey' }}",
          vertical: true,
          fill_container: true,
          cols: 4,
        },
        {
          type: TEMPLATE,
          entity: 'binary_sensor.tp_door',
          primary: "{{ 'Open' if is_state(entity, 'on') else 'Shut' }}",
          secondary: 'Front door',
          layout: 'vertical',
          cols: 4,
        },
        {
          type: TEMPLATE,
          primary: 'Hi {{ user }}',
          icon: 'mdi:human-greeting',
          layout: 'vertical',
          tap_action: { action: 'navigate', navigation_path: '#template' },
          cols: 4,
        },
      ],
    },
    // a large tile keeps its switch and its readouts; a sensor's reading stays in the head, the line its own words
    {
      title: 'Large',
      cards: [
        {
          type: TEMPLATE,
          entity: 'switch.tp_washer',
          variant: 'large',
          name: "{{ 'Washing' if states('sensor.tp_power') | float > 10 else 'Washer' }}",
          readouts: ['sensor.tp_power', 'sensor.tp_energy'],
          cols: 6,
        },
        {
          type: TEMPLATE,
          entity: 'sensor.tp_temperature',
          variant: 'large',
          secondary: "{{ 'Warm' if states(entity) | float > 21 else 'Cool' }}",
          cols: 6,
        },
      ],
    },
    // no template at all: words of its own, a keyword; each tile a row of its own (what the card widths of 211 and up
    // draw)
    {
      title: 'Words',
      cards: [
        {
          type: TEMPLATE,
          entity: 'switch.tp_washer',
          name: 'Laundry',
          secondary: 'By the back door, beside the dryer · 1240 W',
        },
        { type: TEMPLATE, entity: 'light.tp_hall', secondary: 'last-changed' },
        {
          type: TEMPLATE,
          entity: 'switch.tp_washer',
          variant: 'large',
          name: "{{ 'Washing' if states('sensor.tp_power') | float > 10 else 'Washer' }}",
          secondary: "{{ states('sensor.tp_energy') }} kWh so far",
          readouts: ['sensor.tp_power', 'sensor.tp_energy', 'sensor.tp_temperature'],
        },
      ],
    },
    {
      title: 'If · elif · else',
      cards: [
        {
          type: TEMPLATE,
          entity: 'sensor.tp_power',
          name: 'Washer',
          secondary:
            '{% if states(entity) | float > 2000 %}Heavy load{% elif states(entity) | float > 500 %}Washing{% else %}Resting{% endif %}',
          icon: '{% if states(entity) | float > 500 %}mdi:flash{% else %}mdi:flash-outline{% endif %}',
          cols: 6,
        },
        {
          type: TEMPLATE,
          entity: 'binary_sensor.tp_door',
          name: "Door {{ 'open' if is_state(entity, 'on') else 'shut' }}",
          secondary: 'none',
          color: "{% if is_state(entity, 'on') %}warning{% endif %}",
          cols: 6,
        },
      ],
    },
    // on while the number is not 0: the washer draws, the dryer rests
    {
      title: 'Active by a number',
      cards: [
        {
          type: TEMPLATE,
          entity: 'sensor.tp_power',
          name: 'Washer',
          icon: 'mdi:washing-machine',
          active: '{{ states(entity) | float }}',
          cols: 6,
        },
        {
          type: TEMPLATE,
          entity: 'sensor.tp_dryer_power',
          name: 'Dryer',
          icon: 'mdi:tumble-dryer',
          active: '{{ states(entity) | float }}',
          cols: 6,
        },
      ],
    },
    // a tile of nothing: the live skin, a button only for what runs without an entity, on only when asked; with no
    // icon, the template's code braces
    {
      title: 'No entity',
      cards: [
        {
          type: TEMPLATE,
          name: 'Hello, {{ user }}',
          secondary: 'Three lights on',
          icon: 'mdi:home',
          tap_action: { action: 'navigate', navigation_path: '#template' },
          cols: 6,
        },
        {
          type: TEMPLATE,
          name: 'Night mode',
          icon: 'mdi:weather-night',
          active: 'always',
          color: 'indigo',
          cols: 6,
        },
        { type: TEMPLATE, name: 'Away until Sunday', secondary: 'Heating at {{ 20 - 3 }} °C' },
      ],
    },
    // a template Home Assistant refuses shows nothing of itself (a name keeps its blank line: a large tile's anatomy
    // holds); an icon or a colour it does not know is the entity's
    {
      title: 'A template that fails',
      cards: [
        {
          type: TEMPLATE,
          entity: 'light.tp_desk',
          variant: 'large',
          name: '{{ states(entity) | nonsense }}',
          secondary: '{{ is_state( }}',
          cols: 6,
        },
        {
          type: TEMPLATE,
          entity: 'switch.tp_washer',
          icon: "{{ 'not an icon' }}",
          color: "{{ 'banana' }}",
          cols: 6,
        },
      ],
    },
    // an entity out of reach, or gone: the off skin on the same tile, its state said whatever the line asked
    {
      title: 'Out of reach',
      cards: [
        {
          type: TEMPLATE,
          entity: 'switch.tp_pump',
          name: "{{ 'Pump' }}",
          secondary: 'Garden',
          cols: 6,
        },
        { type: TEMPLATE, entity: 'switch.tp_gone', name: 'Pond pump', cols: 6 },
      ],
    },
    // a button never pressed is `unknown`, its normal state: the line is the person's (#92), the state where it is asked
    {
      title: 'A button never pressed',
      cards: [
        {
          type: TEMPLATE,
          entity: 'button.tp_dishwasher_start',
          name: 'Start',
          secondary:
            "{{ 'Unavailable' if is_state(entity, 'unavailable') else 'Starts the selected cycle' }}",
          cols: 6,
        },
        { type: TEMPLATE, entity: 'button.tp_dishwasher_start', name: 'Start', cols: 6 },
      ],
    },
    // a colour at rest (`tint: always`): written, or a template's
    {
      title: 'Tint',
      cards: [
        { type: TEMPLATE, entity: 'light.tp_hall', color: 'teal', tint: 'always', cols: 6 },
        {
          type: TEMPLATE,
          entity: 'light.tp_hall',
          name: 'Hall',
          color: "{{ 'deep-orange' }}",
          tint: 'always',
          cols: 6,
        },
      ],
    },
    // two halves of a phone's 320 (152 each): words of the person's own end in an ellipsis, a state line loses parts
    {
      title: 'Narrow pairs',
      width: 320,
      cards: [
        {
          type: TEMPLATE,
          entity: 'switch.tp_washer',
          name: "{{ 'Washing machine in the utility room' }}",
          secondary:
            "{{ states('sensor.tp_power') | round }} W · {{ states('sensor.tp_energy') }} kWh today",
          cols: 6,
        },
        { type: TEMPLATE, entity: 'light.tp_desk', cols: 6 },
      ],
    },
    // #100: a template's name in two lines where one would cut it, compact and mini, each a line taller
    {
      title: 'Names in two lines (#100)',
      cards: [
        {
          type: TEMPLATE,
          entity: 'switch.tp_washer',
          name: "{{ 'Washing machine in the utility room' }}",
          secondary: "{{ states('sensor.tp_power') | round }} W",
          name_lines: 2,
          cols: 6,
        },
        { type: TEMPLATE, entity: 'light.tp_desk', name_lines: 2, cols: 6 },
      ],
    },
    {
      title: 'Mini · names in two lines (#100)',
      cards: [
        {
          type: TEMPLATE,
          entity: 'light.tp_hall',
          name: 'Hall light by the stairs',
          variant: 'mini',
          name_lines: 2,
          cols: 4,
        },
        {
          type: TEMPLATE,
          entity: 'binary_sensor.tp_door',
          name: "{{ 'Front door open' if is_state(entity, 'on') else 'Front door shut' }}",
          variant: 'mini',
          name_lines: 2,
          cols: 4,
        },
        {
          type: TEMPLATE,
          entity: 'switch.tp_pump',
          variant: 'mini',
          name_lines: 2,
          cols: 4,
        },
      ],
    },
  ],
};
