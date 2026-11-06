import type { DeviceRegistryEntry } from './ha/types.js';

/*
 * The registries' words as text. Home Assistant types a device's name, model and maker, an entity's name and keys, an
 * area's and a floor's name as strings, and holds no integration to it: a custom integration's fuel station has the
 * model 76380002, a number (#129). Every reader takes them through `registryText` where it first reads an entry, so
 * what it hands on is text.
 */

/** A registry's word as text: a string as it is, a number as it is written, anything else none. */
export function registryText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
}

/** An area or a floor with its name as text: the entry itself where it is already. */
export function withTextName<T extends { readonly name: string }>(entry: T): T {
  const name: unknown = entry.name;
  return typeof name === 'string' ? entry : { ...entry, name: registryText(name) ?? '' };
}

/** What a device is called: the name its person gave it, else its integration's (Home Assistant's `computeDeviceName`). */
export const deviceNameOf = (
  device: Pick<DeviceRegistryEntry, 'name' | 'name_by_user'> | null | undefined,
): string | undefined =>
  registryText(device?.name_by_user) || registryText(device?.name) || undefined;
