import type {
  AreaRegistryEntry,
  EntityRegistryDisplayEntry,
  FloorRegistryEntry,
  HomeAssistant,
} from './ha/types.js';

/*
 * The house by its rooms: which area an entity is in, what an area holds, and the order floors and areas read
 * in. One rule for every reader (a card, the automatic dashboard): an entity is in its own area, else its
 * device's; a dashboard shows the entities that have a state, are not hidden and are not a config or diagnostic
 * entity unless asked for; a room counts its devices among them (`isRoomDevice`).
 */

/** The registries this module reads; `floors` is absent on a Home Assistant without them. */
export type Registries = Pick<HomeAssistant, 'states' | 'entities' | 'devices' | 'areas'> &
  Partial<Pick<HomeAssistant, 'floors'>>;

/** The domain of an entity id (`light` of `light.sofa`). */
const domainOf = (id: string): string => id.slice(0, id.indexOf('.'));

/** The area an entity is in: its own, else its device's. */
export function areaOf(hass: Registries | undefined, entityId: string): string | undefined {
  const entry = hass?.entities?.[entityId];
  const device = entry?.device_id ? hass?.devices?.[entry.device_id] : undefined;
  return entry?.area_id ?? device?.area_id ?? undefined;
}

export interface UsableOptions {
  /** Keep hidden entities. */
  readonly hidden?: boolean;
  /** Keep diagnostic entities (a config entity never shows). */
  readonly diagnostic?: boolean;
}

/** An entity a dashboard should show: with a state, not hidden, not a config or diagnostic entity unless asked for. */
export function usableEntity(
  hass: Registries | undefined,
  entityId: string,
  { hidden = false, diagnostic = false }: UsableOptions = {},
): boolean {
  if (!hass?.states[entityId]) return false;
  const entry: EntityRegistryDisplayEntry | undefined = hass.entities?.[entityId];
  if (entry?.hidden && !hidden) return false;
  if (entry?.entity_category === 'config') return false;
  if (entry?.entity_category === 'diagnostic' && !diagnostic) return false;
  return true;
}

interface Index {
  readonly devices: unknown;
  readonly byArea: ReadonlyMap<string, readonly string[]>;
  readonly byDevice: ReadonlyMap<string, readonly string[]>;
}
/** One index per entity registry (the object Home Assistant hands over), rebuilt when the devices are a new object. */
const indexes = new WeakMap<object, Index>();
/** A house without an entity registry: always this object, so its (empty) index is kept too. */
const NO_ENTITIES: Readonly<Record<string, EntityRegistryDisplayEntry>> = Object.freeze({});

const push = (map: Map<string, string[]>, key: string, id: string): void => {
  const list = map.get(key);
  if (list) list.push(id);
  else map.set(key, [id]);
};

/**
 * Every entity of each area and of each device, in id order, from the registries alone: whether it has a state is
 * asked when it is read, so an entity whose state comes after the index was built (a restart's slow integration) is in
 * it already. Built in one pass (`areaOf` reads the entity and device registries, nothing else) and kept while they are
 * the same objects.
 */
function indexOf(hass: Registries): Index {
  const entities = hass.entities ?? NO_ENTITIES;
  const kept = indexes.get(entities);
  if (kept && kept.devices === hass.devices) return kept;
  const byArea = new Map<string, string[]>();
  const byDevice = new Map<string, string[]>();
  for (const id of Object.keys(entities).sort()) {
    const area = areaOf(hass, id);
    if (area) push(byArea, area, id);
    const device = entities[id]?.device_id;
    if (device) push(byDevice, device, id);
  }
  const index = { devices: hass.devices, byArea, byDevice };
  indexes.set(entities, index);
  return index;
}

/** Every entity of each area, in id order, from the registries alone (`indexOf`). */
export const areaIndex = (hass: Registries): ReadonlyMap<string, readonly string[]> =>
  indexOf(hass).byArea;

export interface AreaEntitiesOptions extends UsableOptions {
  /** Only these domains, in this order of preference (the ids stay in id order). */
  readonly domains?: readonly string[];
}

/** The entities of an area a dashboard shows, in id order. */
export function areaEntities(
  hass: Registries,
  areaId: string,
  options: AreaEntitiesOptions = {},
): string[] {
  const domains = options.domains;
  return (areaIndex(hass).get(areaId) ?? []).filter(
    (id) => usableEntity(hass, id, options) && (!domains || domains.includes(domainOf(id))),
  );
}

/**
 * What a person calls a room's devices (#95): its lights, its switches that are loads, its fans and covers, its media
 * players, its thermostats, heaters and humidifiers, its vacuums and mowers. Never a reading or a sensor, a helper, a
 * scene or an automation, nor a lock or a camera (the security views'), nor a valve (a main water valve is open all
 * day).
 */
const DEVICE_DOMAINS: ReadonlySet<string> = new Set([
  'light',
  'switch',
  'fan',
  'cover',
  'media_player',
  'climate',
  'water_heater',
  'humidifier',
  'vacuum',
  'lawn_mower',
]);

/**
 * An appliance's own controls, where its integration does not file them as settings: its programme, its zone and its
 * delay, its start and its pause, a time to start at. A plug or a relay shows none of these.
 */
const APPLIANCE_CONTROLS: ReadonlySet<string> = new Set([
  'select',
  'number',
  'button',
  'text',
  'time',
  'date',
  'datetime',
]);

/**
 * Whether a switch is a load, something it powers: Home Assistant says so (an outlet, a switch), it is on no device
 * (a template's, a group's), or its device is a plug or a relay — one with none of an appliance's controls
 * (`APPLIANCE_CONTROLS`, hidden or not; a setting is not one). A dishwasher's option switches, beside its programme
 * select and its start button, are its settings.
 */
export function isLoad(hass: Registries, entityId: string): boolean {
  const deviceClass = hass.states[entityId]?.attributes['device_class'];
  if (deviceClass === 'outlet' || deviceClass === 'switch') return true;
  const device = hass.entities?.[entityId]?.device_id;
  if (!device) return true;
  return !(indexOf(hass).byDevice.get(device) ?? []).some(
    (id) => APPLIANCE_CONTROLS.has(domainOf(id)) && usableEntity(hass, id, { hidden: true }),
  );
}

/** Whether an entity a room shows is one of its devices (`DEVICE_DOMAINS`, a switch only where it is a load). */
export function isRoomDevice(hass: Registries, entityId: string): boolean {
  const domain = domainOf(entityId);
  return DEVICE_DOMAINS.has(domain) && (domain !== 'switch' || isLoad(hass, entityId));
}

/** The controls a room offers first: its lights, then its switches, covers and fans. */
export const CONTROL_DOMAINS: readonly string[] = ['light', 'switch', 'cover', 'fan'];
const ON_STATES: Readonly<Record<string, string>> = {
  light: 'on',
  switch: 'on',
  fan: 'on',
  cover: 'open',
};

/** A room's readings, each an entity: a sensor's state, or a thermostat's or humidifier's own (`climateAttribute`). */
export interface AreaClimate {
  readonly temperature?: string | undefined;
  readonly humidity?: string | undefined;
}
export type ClimateKind = keyof AreaClimate;

/** The domains that carry a room's reading as an attribute of their own. */
const CARRIERS: Readonly<Record<ClimateKind, readonly string[]>> = {
  temperature: ['climate'],
  humidity: ['climate', 'humidifier'],
};

/** Where a reading is on its entity: a thermostat's (or a humidifier's) `current_temperature` / `current_humidity`; a sensor's is its state. */
export const climateAttribute = (entityId: string, kind: ClimateKind): string | undefined =>
  CARRIERS[kind].includes(domainOf(entityId)) ? `current_${kind}` : undefined;

/** A state ("21.4") or an attribute (21.4) that is a number — not "unavailable", null or "". */
const numeric = (value: unknown): boolean => Number.isFinite(parseFloat(String(value)));

/**
 * A room's temperature and humidity among what it shows (`shown`), as Home Assistant's own area card finds them:
 * 1. the sensor the area names, while it has a state — even hidden or diagnostic, as the area's settings offer them;
 * 2. a sensor of that class, the first that reads a number (a dead one never hides a working one), else the first
 *    (its readout then a dash);
 * 3. a thermostat's own: its temperature (every thermostat says one), a thermostat's or a humidifier's humidity where
 *    it measures one — or where it cannot say, being unavailable: the room keeps that reading's place, a dash (1.9).
 * Never by a unit alone: a "%" is a battery as often as a humidity.
 */
function climateOf(hass: Registries, areaId: string, shown: readonly string[]): AreaClimate {
  const area = hass.areas?.[areaId];
  const attributes = (id: string) => hass.states[id]?.attributes ?? {};
  const best = (ids: readonly string[], read: (id: string) => unknown): string | undefined =>
    ids.find((id) => numeric(read(id))) ?? ids[0];
  const find = (kind: ClimateKind): string | undefined => {
    const named = area?.[`${kind}_entity_id` as const];
    if (named && hass.states[named]) return named;
    const current = `current_${kind}`;
    return (
      best(
        shown.filter((id) => id.startsWith('sensor.') && attributes(id)['device_class'] === kind),
        (id) => hass.states[id]?.state,
      ) ??
      best(
        shown.filter(
          (id) =>
            climateAttribute(id, kind) &&
            (kind === 'temperature' ||
              current in attributes(id) ||
              hass.states[id]?.state === 'unavailable'),
        ),
        (id) => attributes(id)[current],
      )
    );
  };
  return { temperature: find('temperature'), humidity: find('humidity') };
}

/** The area's temperature and humidity: the sensors it names, else the ones it shows, else its thermostat's own. */
export const areaClimate = (hass: Registries, areaId: string): AreaClimate =>
  climateOf(hass, areaId, areaEntities(hass, areaId));

/** What an area holds, counted once: what its room card draws, and what the automatic dashboard decides a room by. */
export interface AreaContents {
  /** The entities it shows, in id order: what its page reaches. */
  readonly entities: readonly string[];
  /** Its devices among them (`isRoomDevice`), in id order: what its card counts and fills by. */
  readonly devices: readonly string[];
  /** Its controls among its devices: the lights, then the switches, covers and fans. */
  readonly controls: readonly string[];
  /** Controls that are on (a cover: open). */
  readonly on: number;
  readonly climate: AreaClimate;
  /** Entities with a state that dashboards keep out, hidden or diagnostic (a config entity is not counted). */
  readonly keptOut: number;
}

export function areaContents(hass: Registries, areaId: string): AreaContents {
  const entities = areaEntities(hass, areaId);
  const devices = entities.filter((id) => isRoomDevice(hass, id));
  const controls = CONTROL_DOMAINS.flatMap((domain) =>
    devices.filter((id) => id.startsWith(`${domain}.`)),
  );
  const on = controls.filter((id) => hass.states[id]?.state === ON_STATES[domainOf(id)]).length;
  const all = areaEntities(hass, areaId, { hidden: true, diagnostic: true });
  return {
    entities,
    devices,
    controls,
    on,
    climate: climateOf(hass, areaId, entities),
    keptOut: all.length - entities.length,
  };
}

/** Whether a room has anything to show, an entity or a reading: one rule for the room card and the automatic dashboard. */
export const holdsSomething = ({
  entities,
  climate,
}: Pick<AreaContents, 'entities' | 'climate'>): boolean =>
  entities.length > 0 || Boolean(climate.temperature ?? climate.humidity);

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name);

/** The floors by level (the ground first), the unnumbered ones after, each group by name. */
export function floorsInOrder(hass: Registries): FloorRegistryEntry[] {
  return Object.values(hass.floors ?? {}).sort((a, b) => {
    const la = typeof a.level === 'number' ? a.level : Number.POSITIVE_INFINITY;
    const lb = typeof b.level === 'number' ? b.level : Number.POSITIVE_INFINITY;
    return la - lb || byName(a, b);
  });
}

/** The areas floor by floor (in the floors' order), the ones on no floor last, each group by name. */
export function areasInOrder(hass: Registries): AreaRegistryEntry[] {
  const floors = floorsInOrder(hass).map((floor) => floor.floor_id);
  const rank = (area: AreaRegistryEntry): number => {
    const index = area.floor_id ? floors.indexOf(area.floor_id) : -1;
    return index === -1 ? floors.length : index;
  };
  return Object.values(hass.areas ?? {}).sort((a, b) => rank(a) - rank(b) || byName(a, b));
}
