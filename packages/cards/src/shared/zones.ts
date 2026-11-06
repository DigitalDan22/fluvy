import type { EntityName, EntityView, HomeAssistant } from '@fluvy/core';

/*
 * Where people are, read from their `person.*` (or `device_tracker.*`) and the house's `zone.*`: home, away, a
 * zone by its name, or unknown — and how far from home, when a card is asked to say so. Pure functions: the map
 * card and the automatic dashboard read them alike.
 */

export type Where = 'home' | 'away' | 'unknown' | 'zone';

export interface Placed {
  readonly view: EntityView;
  readonly where: Where;
  /** The zone's entity id when `where` is `zone`. */
  readonly zone?: string;
}

export interface ZoneSpec {
  readonly entity: string;
  readonly name?: EntityName;
  readonly icon?: string;
}

/** A zone by the name a person's state carries (a person in a zone reports the zone's own name). */
const zoneNamed = (zones: readonly EntityView[], name: string): EntityView | undefined =>
  zones.find((zone) => zone.name === name || zone.id === `zone.${name.toLowerCase()}`);

/** Where a person is. */
export function whereIs(person: EntityView, zones: readonly EntityView[]): Placed {
  if (person.status !== 'ok') return { view: person, where: 'unknown' };
  if (person.state === 'home') return { view: person, where: 'home' };
  if (person.state === 'not_home') return { view: person, where: 'away' };
  const zone = zoneNamed(zones, person.state);
  return zone ? { view: person, where: 'zone', zone: zone.id } : { view: person, where: 'away' };
}

export interface ZoneGroup {
  /** `home`, `away`, `unknown`, or the zone's entity id. */
  readonly key: string;
  readonly where: Where;
  readonly zone?: EntityView;
  readonly people: readonly Placed[];
}

/**
 * People grouped by where they are, in the order a card shows them: the zones it was given in that order, else
 * home, the house's zones by name, then away and unknown. An empty group is left out unless `keepEmpty`.
 */
export function groupByZone(
  people: readonly Placed[],
  zones: readonly EntityView[],
  asked: readonly ZoneSpec[] = [],
  keepEmpty = false,
): ZoneGroup[] {
  const ordered =
    asked.length > 0
      ? asked.flatMap((spec) => {
          const zone = zones.find((entry) => entry.id === spec.entity);
          return zone ? [zone] : [];
        })
      : [...zones]
          .filter((zone) => zone.id !== 'zone.home')
          .sort((a, b) => a.name.localeCompare(b.name));
  const groups: ZoneGroup[] = [
    { key: 'home', where: 'home', people: people.filter((p) => p.where === 'home') },
    ...ordered.map((zone): ZoneGroup => ({
      key: zone.id,
      where: 'zone',
      zone,
      people: people.filter((p) => p.where === 'zone' && p.zone === zone.id),
    })),
    { key: 'away', where: 'away', people: people.filter((p) => p.where === 'away') },
    { key: 'unknown', where: 'unknown', people: people.filter((p) => p.where === 'unknown') },
  ];
  // away and unknown only when someone is; a zone (and home) also when asked to keep empty ones
  return groups.filter(
    (group) =>
      group.people.length > 0 || (keepEmpty && (group.where === 'home' || group.where === 'zone')),
  );
}

const EARTH_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

const coordinates = (view: EntityView): { lat: number; lon: number } | null => {
  const lat = view.attr<number | null>('latitude');
  const lon = view.attr<number | null>('longitude');
  return typeof lat === 'number' && typeof lon === 'number' ? { lat, lon } : null;
};

/** A GPS fix worse than this says nothing about a distance. */
const FUZZY_METRES = 1000;
const KM_PER_MILE = 1.609344;

/**
 * How far someone is from home, rounded as a person would say it (half a kilometre under five, a whole one
 * above; miles where the house measures in them), or nothing: at home, in a zone, without a fix, or with a fix
 * too fuzzy to say.
 */
export function distanceFromHome(
  hass: Pick<HomeAssistant, 'config'> | undefined,
  person: Placed,
  home: EntityView | undefined,
): { readonly value: number; readonly unit: 'km' | 'mi' } | null {
  if (person.where !== 'away' || !home) return null;
  const from = coordinates(home);
  const to = coordinates(person.view);
  if (!from || !to) return null;
  const accuracy = person.view.attr<number | null>('gps_accuracy');
  if (typeof accuracy === 'number' && accuracy > FUZZY_METRES) return null;
  const miles = hass?.config.unit_system.length === 'mi';
  const km = haversine(from, to);
  const raw = miles ? km / KM_PER_MILE : km;
  const rounded = raw < 5 ? Math.round(raw * 2) / 2 : Math.round(raw);
  return { value: rounded, unit: miles ? 'mi' : 'km' };
}
