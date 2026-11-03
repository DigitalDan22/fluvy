import type { SheetSpec } from '../scenes.js';

/** The router's last boot, twelve days before the page's moment: its tile says how long ago where the date won't fit. */
const BOOT = new Date(Date.now() - 12 * 86_400_000).toISOString();

export const sheet: SheetSpec = {
  states: [
    [
      'light.ceiling',
      'on',
      {
        friendly_name: 'Ceiling',
        brightness: 178,
        supported_color_modes: ['color_temp'],
        color_mode: 'color_temp',
        // a white's colour as Home Assistant reports it beside its temperature
        color_temp_kelvin: 3200,
        hs_color: [27.5, 51.7],
        rgb_color: [255, 184, 123],
        min_color_temp_kelvin: 2200,
        max_color_temp_kelvin: 6500,
      },
    ],
    ['light.reading', 'off', { friendly_name: 'Reading', supported_color_modes: ['brightness'] }],
    ['switch.desk_plug', 'on', { friendly_name: 'Desk plug', device_class: 'outlet' }],
    [
      'sensor.desk_plug_power',
      '142',
      { friendly_name: 'Desk plug Power', unit_of_measurement: 'W', device_class: 'power' },
    ],
    [
      'sensor.desk_plug_energy',
      '1.2',
      { friendly_name: 'Desk plug Energy', unit_of_measurement: 'kWh', device_class: 'energy' },
    ],
    [
      'sensor.desk_plug_cost',
      '0.31',
      { friendly_name: 'Desk plug Cost', unit_of_measurement: '€', device_class: 'monetary' },
    ],
    [
      'cover.blinds',
      'open',
      {
        friendly_name: 'Blinds',
        current_position: 40,
        current_tilt_position: 15,
        supported_features: 255,
        device_class: 'blind',
      },
    ],
    ['light.porch', 'unavailable', { friendly_name: 'Porch light' }],
    ['switch.kitchen', 'on', { friendly_name: 'Kitchen' }],
    ['switch.hall', 'off', { friendly_name: 'Hall' }],
    ['switch.office', 'off', { friendly_name: 'Office' }],
    ['switch.patio', 'on', { friendly_name: 'Patio' }],
    ['switch.printer', 'off', { friendly_name: '3D printer' }],
    [
      'sensor.living_temperature',
      '23.4',
      {
        friendly_name: 'Living room temperature',
        unit_of_measurement: '°C',
        device_class: 'temperature',
      },
    ],
    [
      'sensor.living_humidity',
      '51',
      { friendly_name: 'Living room humidity', unit_of_measurement: '%', device_class: 'humidity' },
    ],
    ['switch.garden_led', 'unavailable', { friendly_name: 'Garden LED' }],
    // AdGuard Home's counts, a router's last boot and a meter in its two decimals (#93)
    [
      'sensor.adguard_dns_queries',
      '5114200',
      { friendly_name: 'AdGuard Home DNS queries', unit_of_measurement: 'queries' },
    ],
    [
      'sensor.adguard_rules_count',
      '420995',
      { friendly_name: 'AdGuard Home Rules count', unit_of_measurement: 'rules' },
    ],
    ['sensor.router_last_boot', BOOT, { friendly_name: 'Last boot', device_class: 'timestamp' }],
    [
      'sensor.grid_meter',
      '12345.67',
      { friendly_name: 'Grid meter', unit_of_measurement: 'kWh', device_class: 'energy' },
    ],
  ],
  registry: {
    entities: {
      'sensor.grid_meter': { entity_id: 'sensor.grid_meter', display_precision: 2 },
    },
  },
  frames: [
    {
      title: 'Tiles',
      cards: [
        { type: 'custom:fluvy-tile-card', entity: 'light.ceiling', cols: 6 },
        { type: 'custom:fluvy-tile-card', entity: 'light.reading', cols: 6 },
        {
          type: 'custom:fluvy-tile-card',
          entity: 'switch.desk_plug',
          readouts: ['sensor.desk_plug_power', 'sensor.desk_plug_energy'],
          cols: 6,
        },
        { type: 'custom:fluvy-tile-card', entity: 'cover.blinds', cols: 6 },
        { type: 'custom:fluvy-tile-card', entity: 'light.porch' },
      ],
    },
    // a tile on its own row holds three readouts (power, today, cost); half a row holds two of the three
    {
      title: 'Three readouts',
      cards: [
        {
          type: 'custom:fluvy-tile-card',
          entity: 'switch.desk_plug',
          readouts: ['sensor.desk_plug_power', 'sensor.desk_plug_energy', 'sensor.desk_plug_cost'],
        },
      ],
    },
    {
      title: 'Three readouts, half a row',
      width: 480,
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          size: 'large',
          columns: 2,
          tiles: [
            {
              entity: 'switch.desk_plug',
              readouts: [
                'sensor.desk_plug_power',
                'sensor.desk_plug_energy',
                'sensor.desk_plug_cost',
              ],
            },
            { entity: 'light.ceiling' },
          ],
        },
      ],
    },
    {
      title: 'Compact tiles',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          entities: ['switch.kitchen', 'switch.hall', 'light.ceiling', 'switch.office'],
        },
        {
          type: 'custom:fluvy-tiles-card',
          tiles: [
            { entity: 'switch.desk_plug', readouts: ['sensor.desk_plug_power'] },
            { entity: 'switch.garden_led' },
          ],
        },
        {
          type: 'custom:fluvy-tiles-card',
          entities: ['sensor.living_temperature', 'sensor.living_humidity'],
        },
        { type: 'custom:fluvy-tile-card', entity: 'switch.patio', size: 'compact', cols: 6 },
        { type: 'custom:fluvy-tile-card', entity: 'cover.blinds', size: 'compact', cols: 6 },
      ],
    },
    // #93: readings too long for a compact tile beside its circle (half a phone: 156 at 360, 182 at 412) say
    // themselves shorter, never nothing: a count in short words, then without its unit; a moment as long ago as it
    // was; a figure in its two decimals without its unit
    {
      title: 'Compact tiles · long readings',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          columns: 2,
          tiles: [
            { entity: 'sensor.adguard_dns_queries', name: 'Queries' },
            { entity: 'sensor.adguard_rules_count', name: 'Rules count' },
          ],
        },
        {
          type: 'custom:fluvy-tiles-card',
          columns: 2,
          tiles: [
            { entity: 'sensor.router_last_boot', name: 'Last boot' },
            { entity: 'sensor.grid_meter', name: 'Meter' },
          ],
        },
        {
          type: 'custom:fluvy-tile-card',
          entity: 'sensor.adguard_dns_queries',
          name: 'Queries',
          size: 'compact',
          cols: 6,
        },
        {
          type: 'custom:fluvy-tile-card',
          entity: 'sensor.router_last_boot',
          size: 'compact',
          cols: 6,
        },
      ],
    },
    {
      title: 'Mini tiles',
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          size: 'mini',
          entities: ['switch.kitchen', 'switch.hall', 'light.ceiling'],
        },
        {
          type: 'custom:fluvy-tiles-card',
          size: 'mini',
          columns: 4,
          entities: ['switch.office', 'switch.patio', 'switch.printer', 'switch.garden_led'],
        },
        {
          type: 'custom:fluvy-tiles-card',
          size: 'mini',
          columns: 3,
          entities: ['sensor.living_temperature', 'sensor.living_humidity', 'cover.blinds'],
        },
      ],
    },
    // a phone's 412 holds four 84 px minis (at 360 the same group lays out three); one of them unavailable
    {
      title: 'Four mini tiles',
      width: 412,
      cards: [
        {
          type: 'custom:fluvy-tiles-card',
          size: 'mini',
          columns: 4,
          entities: ['switch.office', 'switch.patio', 'switch.printer', 'switch.garden_led'],
        },
      ],
    },
  ],
};
