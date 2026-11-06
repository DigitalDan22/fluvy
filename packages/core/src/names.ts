import type { EntityView } from './entity.js';
import type { DeviceRegistryEntry, HassEntity, HomeAssistant } from './ha/types.js';

/*
 * A card's or an item's `name` as Home Assistant reads it (#125). Its editor writes a name as parts since 2025.11 (its
 * `entity_name` selector): the entity's own name, its device's, its area's, its floor's, or words, one or a list of
 * them, which its cards show joined by a space (`hass.formatEntityName`). A name written as words is those words.
 */

/** One part of a name: the entity's, its device's, its area's or its floor's name, or words of the person's own. */
export type EntityNameItem =
  | { readonly type: 'entity' | 'device' | 'area' | 'floor' }
  | { readonly type: 'text'; readonly text: string };

/** A configured name: the person's own words, or the parts Home Assistant's editor composes one of. */
export type EntityName = string | EntityNameItem | readonly EntityNameItem[];

/** The registries a name's parts are read from; any may be absent (a page without Home Assistant, a test). */
type NameRegistries = Partial<Pick<HomeAssistant, 'entities' | 'devices' | 'areas' | 'floors'>>;

/* Home Assistant's frontend, for one that has no `formatEntityName` (src/common/entity/compute_entity_name*.ts). */

/** What Home Assistant calls an entity without its registry: its `friendly_name`, else its object id in words. */
const stateName = (stateObj: HassEntity): string => {
  const friendly = stateObj.attributes.friendly_name;
  return friendly === undefined
    ? stateObj.entity_id.slice(stateObj.entity_id.indexOf('.') + 1).replace(/_/g, ' ')
    : String(friendly ?? '');
};

const deviceName = (device: DeviceRegistryEntry): string | undefined =>
  (device.name_by_user || device.name)?.trim();

/**
 * An entity's name without its device's in front of it ("Kitchen Light" of a "Kitchen": "Light"), its first word
 * capitalised unless it carries a capital of its own (a brand's); none when nothing is left after it.
 */
function stripPrefix(name: string, prefix: string): string | undefined {
  for (const suffix of [' ', ': ', ' - ']) {
    const lead = `${prefix}${suffix}`.toLowerCase();
    const rest = name.slice(lead.length);
    if (!name.toLowerCase().startsWith(lead) || !rest) continue;
    const first = rest.slice(0, Math.max(0, rest.indexOf(' ')));
    return first.toLowerCase() !== first ? rest : rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return undefined;
}

/**
 * The entity's own part of its name: its registry's, without its device's in front of it; none where it is named by
 * its device alone (the same name as the device's). An entity without a registry entry is its state's name.
 */
function ownPart(stateObj: HassEntity, registries: NameRegistries): string | undefined {
  const entry = registries.entities?.[stateObj.entity_id];
  if (!entry) return stateName(stateObj);
  const name = entry.name || undefined;
  const device = entry.device_id ? registries.devices?.[entry.device_id] : undefined;
  if (!device) return name;
  const of = deviceName(device);
  if (of === name) return undefined;
  return of && name ? stripPrefix(name, of) || name : name;
}

/** Each part's name, none where the entity has no such part (no device, no area, no floor). */
function partNames(
  stateObj: HassEntity,
  items: readonly EntityNameItem[],
  registries: NameRegistries,
): (string | undefined)[] {
  const entry = registries.entities?.[stateObj.entity_id];
  const device = entry?.device_id ? registries.devices?.[entry.device_id] : undefined;
  const areaId =
    entry?.area_id ||
    device?.area_id ||
    (device?.parent_device_id ? registries.devices?.[device.parent_device_id]?.area_id : undefined);
  const area = areaId ? registries.areas?.[areaId] : undefined;
  const floor = area?.floor_id ? registries.floors?.[area.floor_id] : undefined;
  return items.map((item) =>
    item.type === 'entity'
      ? ownPart(stateObj, registries)
      : item.type === 'device'
        ? device && deviceName(device)
        : item.type === 'area'
          ? area?.name?.trim()
          : item.type === 'floor'
            ? floor?.name?.trim()
            : item.type === 'text'
              ? item.text
              : '',
  );
}

/**
 * A name's parts as Home Assistant's frontend shows them (`computeEntityNameDisplay`): words alone, joined; an entity
 * named by its device alone reads its device's name for its own, unless the device's is asked for too; the parts it
 * has, joined by a space.
 */
export function formatName(
  stateObj: HassEntity,
  name: EntityName | undefined,
  registries: NameRegistries,
): string {
  if (typeof name === 'string') return name;
  if (!name) return stateName(stateObj);
  let items: readonly EntityNameItem[] = Array.isArray(name) ? name : [name as EntityNameItem];
  if (items.every((item) => item.type === 'text'))
    return items.map((item) => (item as { text: string }).text).join(' ');
  if (!ownPart(stateObj, registries) && !items.some((item) => item.type === 'device'))
    items = items.map((item) => (item.type === 'entity' ? { type: 'device' } : item));
  const names = partNames(stateObj, items, registries);
  return names.length === 1 ? names[0] || '' : names.filter(Boolean).join(' ');
}

/**
 * The name a card shows for an entity: its configured `name` — words as they are, parts as Home Assistant's frontend
 * reads them (its own `formatEntityName`, else `formatName`) — or, none given, the entity's own (`view.name`). An
 * entity that is not there is read as its name and registries last said.
 */
export function entityName(
  hass: HomeAssistant | undefined,
  view: EntityView,
  name: EntityName | null | undefined,
): string {
  if (name == null) return view.name;
  if (typeof name !== 'object') return String(name);
  const stateObj = view.stateObj ?? {
    entity_id: view.id,
    state: view.state,
    attributes: { friendly_name: view.name },
    last_changed: '',
    last_updated: '',
  };
  return hass?.formatEntityName?.(stateObj, name) ?? formatName(stateObj, name, hass ?? {});
}

/**
 * A `name` where no entity is named (a room's, a greeting's): words as they are, Home Assistant's parts by their words
 * alone; none where it has none, for the card's own to stand.
 */
export function textName(name: EntityName | null | undefined): string | undefined {
  if (name == null) return undefined;
  if (typeof name !== 'object') return String(name);
  const words = (Array.isArray(name) ? name : [name]).flatMap((item: EntityNameItem) =>
    item.type === 'text' ? [item.text] : [],
  );
  return words.length ? words.join(' ') : undefined;
}
