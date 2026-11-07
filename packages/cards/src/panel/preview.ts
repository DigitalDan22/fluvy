import { remember, type HassEntity, type HomeAssistant, type LovelaceCard } from '@fluvy/core';
import { simulate } from '@fluvy/demo-home/simulate';

/**
 * The preview's own little house: a few real cards on made-up entities, so the look is judged on the
 * product itself. Its `hass` is the real one with these states on top, and a tap changes nothing at home: the
 * preview's house answers it itself, a moment later, the way Home Assistant would (`simulate`), and keeps the
 * answer while the panel is open — a light switched off stays off through every update from the real house.
 */
const STATES = (names: PreviewNames) => ({
  'light.fluvy_preview_living': {
    entity_id: 'light.fluvy_preview_living',
    state: 'on',
    attributes: {
      friendly_name: names.living,
      brightness: 178,
      supported_color_modes: ['brightness'],
      color_mode: 'brightness',
    },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'fluvy-preview', user_id: null, parent_id: null },
  },
  'switch.fluvy_preview_kitchen': {
    entity_id: 'switch.fluvy_preview_kitchen',
    state: 'off',
    attributes: { friendly_name: names.kitchen },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'fluvy-preview', user_id: null, parent_id: null },
  },
  'cover.fluvy_preview_blinds': {
    entity_id: 'cover.fluvy_preview_blinds',
    state: 'open',
    attributes: {
      friendly_name: names.blinds,
      current_position: 40,
      device_class: 'blind',
      supported_features: 15,
    },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'fluvy-preview', user_id: null, parent_id: null },
  },
  'sensor.fluvy_preview_temperature': {
    entity_id: 'sensor.fluvy_preview_temperature',
    state: '21.4',
    attributes: {
      friendly_name: names.temperature,
      device_class: 'temperature',
      unit_of_measurement: '°C',
      state_class: 'measurement',
    },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'fluvy-preview', user_id: null, parent_id: null },
  },
  // a house without meters of its own sees the energy flow on these: the sun covering most, the grid the rest, the
  // battery charging
  ...power('sensor.fluvy_preview_solar', names.solar, 2140),
  ...power('sensor.fluvy_preview_grid', names.grid, 380),
  ...power('sensor.fluvy_preview_battery', names.battery, -620),
  'sensor.fluvy_preview_battery_level': {
    entity_id: 'sensor.fluvy_preview_battery_level',
    state: '64',
    attributes: {
      friendly_name: names.battery,
      device_class: 'battery',
      unit_of_measurement: '%',
      state_class: 'measurement',
    },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'fluvy-preview', user_id: null, parent_id: null },
  },
  'alarm_control_panel.fluvy_preview_alarm': {
    entity_id: 'alarm_control_panel.fluvy_preview_alarm',
    state: 'disarmed',
    attributes: { friendly_name: names.alarm, supported_features: 3, code_arm_required: false },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'fluvy-preview', user_id: null, parent_id: null },
  },
  'lock.fluvy_preview_door': {
    entity_id: 'lock.fluvy_preview_door',
    state: 'locked',
    attributes: { friendly_name: names.door },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'fluvy-preview', user_id: null, parent_id: null },
  },
  'climate.fluvy_preview_bedroom': {
    entity_id: 'climate.fluvy_preview_bedroom',
    state: 'heat',
    attributes: {
      friendly_name: names.bedroom,
      hvac_modes: ['off', 'heat', 'cool', 'auto'],
      hvac_action: 'heating',
      temperature: 21.5,
      current_temperature: 20.8,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      supported_features: 1,
    },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'fluvy-preview', user_id: null, parent_id: null },
  },
});

/** A power meter of the preview, in watts. */
function power(id: string, name: string, watts: number) {
  return {
    [id]: {
      entity_id: id,
      state: String(watts),
      attributes: {
        friendly_name: name,
        device_class: 'power',
        unit_of_measurement: 'W',
        state_class: 'measurement',
      },
      last_changed: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      context: { id: 'fluvy-preview', user_id: null, parent_id: null },
    },
  };
}

export interface PreviewNames {
  readonly living: string;
  readonly kitchen: string;
  readonly bedroom: string;
  readonly blinds: string;
  readonly temperature: string;
  readonly solar: string;
  readonly grid: string;
  readonly battery: string;
  readonly alarm: string;
  readonly door: string;
}

/** The preview's two rooms: the living room holds the light and the temperature, the kitchen its switch. */
const AREAS = (names: PreviewNames) => ({
  fluvy_preview_living: { area_id: 'fluvy_preview_living', name: names.living, icon: 'mdi:sofa' },
  fluvy_preview_kitchen: {
    area_id: 'fluvy_preview_kitchen',
    name: names.kitchen,
    icon: 'mdi:stove',
  },
});
const IN_AREAS: Readonly<Record<string, string>> = {
  'light.fluvy_preview_living': 'fluvy_preview_living',
  'sensor.fluvy_preview_temperature': 'fluvy_preview_living',
  'switch.fluvy_preview_kitchen': 'fluvy_preview_kitchen',
};

/** The meters an energy flow is drawn on (the card's own keys). */
export type EnergyMeters = Readonly<Record<string, unknown>>;

/** The preview's own meters, for a house without any. */
const SIMULATED: EnergyMeters = {
  sources: [
    { type: 'solar', power: 'sensor.fluvy_preview_solar' },
    { type: 'grid', power: 'sensor.fluvy_preview_grid' },
    {
      type: 'battery',
      power: 'sensor.fluvy_preview_battery',
      level: 'sensor.fluvy_preview_battery_level',
    },
  ],
};

/** The preview's entities. */
const ENTITY = {
  living: 'light.fluvy_preview_living',
  kitchen: 'switch.fluvy_preview_kitchen',
  blinds: 'cover.fluvy_preview_blinds',
  temperature: 'sensor.fluvy_preview_temperature',
  bedroom: 'climate.fluvy_preview_bedroom',
  alarm: 'alarm_control_panel.fluvy_preview_alarm',
  door: 'lock.fluvy_preview_door',
} as const;

export type TileEntity = Exclude<keyof typeof ENTITY, 'bedroom' | 'alarm' | 'door'>;
export type RoomArea = 'living' | 'kitchen';

/** The preview's cards, each made once for its config; `update` hands every one the latest `hass`. */
/** How long the preview's house takes to answer a tap: a real one is not instant, and a switch that flips before its state lands reads as alive. */
const ANSWER_MS = 120;

export class PreviewHouse {
  private readonly made = new Map<string, LovelaceCard>();
  private preview: HomeAssistant | undefined;
  private real: HomeAssistant | undefined;
  /** A mode of the preview's own (the wall's night), or the app's. */
  private dark: boolean | undefined;
  // made once, replaced only by a tap in the preview (the states it did not touch kept): the same state objects every
  // update, so the cards redraw only for the look
  private states: Record<string, HassEntity>;
  private readonly areas: ReturnType<typeof AREAS>;
  // each part of the preview's `hass` is made again only when what it is made of changed: a tick of the real house
  // (some twenty a second in a large one, #135) gives the cards new states alone, and a card redraws only when one it
  // watches changed (`FluvyCard.shouldUpdate` sees any other part that is a new object as a change)
  private readonly statesOf = remember(
    (real: HomeAssistant['states'], own: Record<string, HassEntity>) => ({ ...real, ...own }),
  );
  // the preview's entities sit in the preview's rooms, so a room card finds them (the house's registry stays)
  private readonly entitiesOf = remember((real: HomeAssistant['entities']) => {
    const entities = { ...real };
    for (const [id, area] of Object.entries(IN_AREAS))
      entities[id] = { ...(entities[id] ?? { entity_id: id }), area_id: area } as never;
    return entities;
  });
  private readonly areasOf = remember(
    (real: HomeAssistant['areas'], own: ReturnType<typeof AREAS>) => ({ ...real, ...own }),
  );
  private readonly themesOf = remember(
    (real: HomeAssistant['themes'], dark: boolean | undefined) =>
      dark === undefined ? real : { ...real, darkMode: dark },
  );
  private readonly previewOf = remember(
    (
      real: HomeAssistant,
      states: HomeAssistant['states'],
      entities: HomeAssistant['entities'],
      areas: HomeAssistant['areas'],
      themes: HomeAssistant['themes'],
    ) => ({ ...real, states, entities, areas, themes, callService: this.answer }) as HomeAssistant,
  );

  constructor(names: PreviewNames) {
    this.states = STATES(names);
    this.areas = AREAS(names);
  }

  private card(config: Record<string, unknown>): LovelaceCard {
    const key = JSON.stringify(config);
    let card = this.made.get(key);
    if (!card) {
      const tag = String(config['type']).replace(/^custom:/, '');
      const made = document.createElement(tag) as LovelaceCard;
      card = made;
      // the energy family arrives with its own chunk: its cards are configured once their element is defined
      if (customElements.get(tag)) made.setConfig(config as never);
      else
        void customElements.whenDefined(tag).then(() => {
          // made before its element existed: it becomes one now, then takes its config
          customElements.upgrade(made);
          if (typeof made.setConfig === 'function') made.setConfig(config as never);
        });
      card.setAttribute('preview', '');
      // the preview is part of the page: it does not rise in again each time a tab opens
      card.setAttribute('still', '');
      if (this.preview) card.hass = this.preview;
      this.made.set(key, card);
    }
    return card;
  }

  /** A tile of the house: large (a dashboard's six columns) or a compact row. */
  tile(entity: TileEntity, size: 'large' | 'compact' = 'large'): LovelaceCard {
    return this.card({
      type: 'custom:fluvy-tile-card',
      entity: ENTITY[entity],
      ...(size === 'compact' ? { size } : {}),
      grid_options: { columns: 6 },
    });
  }

  thermostat(variant: string): LovelaceCard {
    return this.card({ type: 'custom:fluvy-thermostat-card', entity: ENTITY.bedroom, variant });
  }

  /**
   * The energy flow in one of its styles, on the house's own meters when it has them (a flow is worth seeing on
   * the real one), else on the preview's.
   */
  energy(style: string, meters: EnergyMeters | null): LovelaceCard {
    return this.card({
      type: 'custom:fluvy-energy-flow-card',
      ...(meters ?? SIMULATED),
      ...(style === 'stream' || style === 'ribbons' ? {} : { flow_style: style }),
    });
  }

  /** The greeting: its avatar is "you", in the look's highlight where it has one. */
  hello(): LovelaceCard {
    return this.card({ type: 'custom:fluvy-hello-card' });
  }

  /** One of the preview's rooms, in the rooms dashboard's variant (a dashboard's six columns). */
  room(area: RoomArea, variant: string): LovelaceCard {
    return this.card({
      type: 'custom:fluvy-room-card',
      area: `fluvy_preview_${area}`,
      variant,
      grid_options: { columns: 6 },
    });
  }

  alarm(): LovelaceCard {
    return this.card({ type: 'custom:fluvy-alarm-card', entity: ENTITY.alarm, variant: 'compact' });
  }

  lock(): LovelaceCard {
    return this.card({
      type: 'custom:fluvy-lock-card',
      entity: ENTITY.door,
      variant: 'compact',
      grid_options: { columns: 6 },
    });
  }

  /** The wall's clock, beside its readings. */
  clock(): LovelaceCard {
    return this.card({ type: 'custom:fluvy-clock-card', variant: 'side' });
  }

  /** The preview in a mode of its own — the wall as it would be tonight — or back to the app's (undefined). */
  setDark(dark: boolean | undefined): void {
    if (dark === this.dark) return;
    this.dark = dark;
    if (this.real) this.update(this.real);
  }

  update(hass: HomeAssistant): void {
    this.real = hass;
    this.preview = this.previewOf(
      hass,
      this.statesOf(hass.states, this.states),
      this.entitiesOf(hass.entities),
      this.areasOf(hass.areas, this.areas),
      this.themesOf(hass.themes, this.dark),
    );
    for (const card of this.made.values()) card.hass = this.preview;
  }

  /** A tap on a preview card: the house's own answer, a moment later; the real house hears nothing. */
  private readonly answer: HomeAssistant['callService'] = async (domain, service, data, target) => {
    const call = {
      domain,
      service,
      data: (data ?? {}) as Record<string, unknown>,
      target: target as { entity_id?: string | string[] } | undefined,
    };
    window.setTimeout(() => {
      this.states = { ...this.states, ...simulate(this.states, call) };
      if (this.real) this.update(this.real);
    }, ANSWER_MS);
    return undefined as never;
  };
}
