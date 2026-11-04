import type { SheetSpec } from '../scenes.js';
import { OVEN_MODE } from './inputs.js';

/** A select's row on the entities card (#96): the oven's thirty modes, a part of them in its own words, its tap. */
const OVEN_ROWS = [
  { entity: 'select.oven_mode', name: 'Oven' },
  {
    entity: 'select.oven_mode',
    name: 'Upper zone',
    options: ['grill_large_area', 'hot_air', 'pizza_setting', 'top_bottom_heating'],
    labels: { grill_large_area: 'Large grill' },
  },
  { entity: 'select.ls_oven_ghost', name: 'Lower zone' },
];

export const sheet: SheetSpec = {
  states: [
    ['switch.kitchen_light', 'on', { friendly_name: 'Kitchen light' }],
    ['switch.washer', 'off', { friendly_name: 'Washing machine', device_class: 'outlet' }],
    [
      'binary_sensor.kitchen_window',
      'on',
      { friendly_name: 'Kitchen window', device_class: 'window' },
    ],
    ['binary_sensor.motion_hall', 'off', { friendly_name: 'Hall motion', device_class: 'motion' }],
    [
      'sensor.hall_temperature',
      '21.6',
      { friendly_name: 'Hall temperature', unit_of_measurement: '°C', device_class: 'temperature' },
    ],
    ['lock.front_door', 'locked', { friendly_name: 'Front door' }],
    // #96: an oven's thirty modes, a zone of it gone from the house, the door's auto-lock in steps
    OVEN_MODE,
    [
      'select.ls_oven_ghost',
      'unavailable',
      { friendly_name: 'Oven lower zone', options: ['grill', 'hot_air', 'steam'] },
    ],
    [
      'input_select.ls_auto_lock',
      '2 minutes',
      {
        friendly_name: 'Auto-lock',
        options: [
          'Off',
          '10 seconds',
          '30 seconds',
          '1 minute',
          '2 minutes',
          '3 minutes',
          '5 minutes',
          '10 minutes',
          '15 minutes',
          '20 minutes',
          '30 minutes',
          '1 hour',
        ],
      },
    ],
    ['switch.ghost', 'unavailable', { friendly_name: 'Garden pump' }],
    // #67: the helper that keeps the washer's real last change across restarts
    [
      'sensor.ls_washer_changed',
      '2026-09-10T06:30:00+00:00',
      { friendly_name: 'Washer · last change', device_class: 'timestamp' },
    ],
    // what the templates read (`ls_`: other sheets own the plain names, with other units)
    [
      'climate.ls_living',
      'heat',
      { friendly_name: 'Living room', current_temperature: 22.46, temperature: 21 },
    ],
    [
      'sensor.ls_temperature',
      '22.46',
      {
        friendly_name: 'Living temperature',
        unit_of_measurement: '°C',
        device_class: 'temperature',
      },
    ],
    [
      'sensor.ls_humidity',
      '61',
      { friendly_name: 'Living humidity', unit_of_measurement: '%', device_class: 'humidity' },
    ],
    [
      'binary_sensor.ls_presence',
      'on',
      { friendly_name: 'Living room', device_class: 'occupancy' },
    ],
    [
      'sensor.ls_moisture',
      '42',
      {
        friendly_name: 'Monstera',
        unit_of_measurement: '%',
        device_class: 'moisture',
        days_since_watered: 3.2,
      },
    ],
  ],
  frames: [
    {
      title: 'Entities',
      cards: [
        {
          type: 'custom:fluvy-entities-card',
          title: 'Kitchen',
          subtitle: '7 devices',
          icon: 'grid',
          show_count: true,
          entities: [
            'switch.kitchen_light',
            'switch.washer',
            'binary_sensor.kitchen_window',
            'binary_sensor.motion_hall',
            'sensor.hall_temperature',
            'lock.front_door',
            'switch.ghost',
          ],
        },
      ],
    },
    // 48 px rows, the name alone; a row can wear its own colour, say what its second line would be, and answer its own tap
    {
      title: 'Entities · compact',
      cards: [
        {
          type: 'custom:fluvy-entities-card',
          title: 'Kitchen',
          variant: 'compact',
          rows: [
            { entity: 'switch.kitchen_light', color: 'teal' },
            { entity: 'switch.washer', secondary: 'state' },
            { entity: 'binary_sensor.kitchen_window', tone: 'warning' },
            {
              entity: 'lock.front_door',
              tap_action: { action: 'navigate', navigation_path: '/fluvy-auto/security' },
            },
            'switch.ghost',
          ],
        },
      ],
    },
    // #67: a row's last change read from a helper that keeps it (`since`), beside a row on Home Assistant's own
    {
      title: 'Entities · since',
      cards: [
        {
          type: 'custom:fluvy-entities-card',
          title: 'Laundry',
          rows: [
            {
              entity: 'switch.washer',
              secondary: 'last-changed',
              since: 'sensor.ls_washer_changed',
            },
            { entity: 'switch.kitchen_light', secondary: 'last-changed' },
          ],
        },
      ],
    },
    // a row's second line as a template, rendered by Home Assistant and kept live: a figure rounded, two entities on
    // one line, the person looking; a template Home Assistant refuses says nothing (never its own text); two rows
    // that ask the same template for the same entity share one subscription (the suite counts them)
    {
      title: 'Entities · templates',
      cards: [
        {
          type: 'custom:fluvy-entities-card',
          title: 'Living room',
          icon: 'home',
          rows: [
            {
              entity: 'climate.ls_living',
              name: 'Thermostat',
              secondary:
                "{{ state_attr('climate.ls_living', 'current_temperature') | round(1) }} °C",
            },
            {
              entity: 'binary_sensor.ls_presence',
              secondary:
                "{{ states('sensor.ls_temperature') | round(1) }} °C · {{ states('sensor.ls_humidity') }} %",
            },
            { entity: 'lock.front_door', secondary: 'Checked by {{ user }}' },
            {
              entity: 'switch.kitchen_light',
              secondary: "{{ states('sensor.ls_humidity') | nonsense }}",
            },
            {
              entity: 'climate.ls_living',
              name: 'Heating',
              secondary:
                "{{ state_attr('climate.ls_living', 'current_temperature') | round(1) }} °C",
            },
          ],
        },
      ],
    },
    // #96: a select's row ends in its value, which opens Fluvy's dropdown; a row with a tap of its own keeps it, one
    // gone from the house says "—"
    {
      title: 'Entities · a select’s dropdown',
      cards: [
        {
          type: 'custom:fluvy-entities-card',
          title: 'Kitchen',
          rows: [
            ...OVEN_ROWS,
            {
              entity: 'select.oven_mode',
              name: 'Oven mode',
              tap_action: { action: 'more-info' },
            },
            'switch.kitchen_light',
          ],
        },
      ],
    },
    // half a section: the circles give way to the names, a long value goes under its name; compact rows hold theirs
    {
      title: 'Entities · dropdowns, half a section',
      cards: [
        { type: 'custom:fluvy-entities-card', title: 'Oven', cols: 6, rows: OVEN_ROWS },
        {
          type: 'custom:fluvy-entities-card',
          title: 'Oven',
          cols: 6,
          variant: 'compact',
          rows: [...OVEN_ROWS, 'input_select.ls_auto_lock'],
        },
      ],
    },
    {
      title: 'Lock · a select’s dropdown',
      cards: [
        {
          type: 'custom:fluvy-lock-card',
          entity: 'lock.front_door',
          rows: ['binary_sensor.kitchen_window', 'input_select.ls_auto_lock'],
        },
      ],
    },
    {
      title: 'Lock · template',
      cards: [
        {
          type: 'custom:fluvy-lock-card',
          entity: 'lock.front_door',
          rows: [
            {
              entity: 'binary_sensor.kitchen_window',
              secondary: "{{ states('sensor.ls_temperature') | round(1) }} °C inside",
            },
          ],
        },
      ],
    },
    {
      title: 'Bars · template',
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Plants',
          icon: 'leaf',
          rows: [
            {
              entity: 'sensor.ls_moisture',
              secondary:
                "Watered {{ state_attr('sensor.ls_moisture', 'days_since_watered') | int }} days ago",
            },
          ],
        },
      ],
    },
    // #48: a card of a list with nothing in it (a filter that matches nothing yet, the last entry taken out in the
    // editor) draws its head and the empty panel where its list would be, never a configuration error
    {
      title: 'Empty · rows',
      cards: [
        { type: 'custom:fluvy-bars-card', title: 'Batteries', rows: [] },
        { type: 'custom:fluvy-entities-card', title: 'Kitchen', show_count: true, entities: [] },
        { type: 'custom:fluvy-helpers-card', entities: [] },
        { type: 'custom:fluvy-openings-card', entities: [] },
      ],
    },
    {
      title: 'Empty · people',
      cards: [
        { type: 'custom:fluvy-people-card', entities: [] },
        { type: 'custom:fluvy-map-card', entities: [] },
      ],
    },
    {
      title: 'Empty · figures',
      cards: [
        { type: 'custom:fluvy-distribution-card', entities: [] },
        { type: 'custom:fluvy-stat-tiles-card', tiles: [] },
        { type: 'custom:fluvy-readouts-card', entities: [] },
      ],
    },
    {
      title: 'Empty · actions',
      cards: [
        { type: 'custom:fluvy-actions-card', entities: [], columns: 2 },
        { type: 'custom:fluvy-updates-card', entities: [] },
        { type: 'custom:fluvy-lights-card', lights: [] },
      ],
    },
    // no card around them: the panel stands on the page, in its other fill
    {
      title: 'Empty · on the page',
      cards: [
        { type: 'custom:fluvy-tiles-card', entities: [] },
        { type: 'custom:fluvy-scenes-card', title: 'Scenes', entities: [] },
        { type: 'custom:fluvy-chips-card', chips: [] },
        { type: 'custom:fluvy-entities-card', entities: [] },
      ],
    },
    {
      title: 'Empty · half a section',
      cards: [
        { type: 'custom:fluvy-people-card', entities: [], cols: 6 },
        { type: 'custom:fluvy-openings-card', entities: [], cols: 6 },
        { type: 'custom:fluvy-tiles-card', entities: [], cols: 6 },
        { type: 'custom:fluvy-scenes-card', entities: [], cols: 6 },
      ],
    },
    // the card's own words for what nothing means here (a filter of open windows that matches none)
    {
      title: 'Empty · own words',
      cards: [
        {
          type: 'custom:fluvy-openings-card',
          title: 'Open windows',
          entities: [],
          empty_text: 'All closed',
        },
        { type: 'custom:fluvy-people-card', entities: [], empty_text: 'Nobody home' },
      ],
    },
    // what auto-entities hands over: its matches as objects under `entities`, a section's title and a divider among them
    {
      title: 'Auto-entities',
      cards: [
        {
          type: 'custom:fluvy-bars-card',
          title: 'Plants',
          entities: [
            { type: 'section', label: 'Living room' },
            { entity: 'sensor.ls_moisture', secondary_info: 'last-changed' },
            { type: 'divider' },
          ],
        },
        {
          type: 'custom:fluvy-stat-tiles-card',
          entities: [{ entity: 'sensor.ls_temperature' }, { entity: 'sensor.ls_humidity' }],
        },
        {
          type: 'custom:fluvy-entities-card',
          title: 'Found',
          entities: [
            { type: 'section', label: 'Kitchen' },
            { entity: 'switch.kitchen_light' },
            { type: 'divider' },
            { entity: 'binary_sensor.kitchen_window' },
          ],
        },
        {
          type: 'custom:fluvy-tiles-card',
          entities: [
            { entity: 'switch.kitchen_light' },
            { type: 'section', label: 'Laundry' },
            { entity: 'switch.washer' },
          ],
        },
      ],
    },
  ],
};
