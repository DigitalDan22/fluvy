import type { HassPanel } from './ha/types.js';

/*
 * Which of Home Assistant's pages this is, and what says a person is using it: the wall asks before it takes a
 * dashboard over or sleeps, and a page still running the Fluvy it loaded before an update before it reloads by itself.
 */

/** The dashboard a location is on: its first path segment (`/fluvy-wall/home` → `fluvy-wall`). */
export const urlPathOf = (pathname: string): string | undefined =>
  pathname.split('/')[1] || undefined;

/** A url path that is a dashboard (Home Assistant lists it as a lovelace panel). */
export const isLovelace = (
  panels: Readonly<Record<string, Pick<HassPanel, 'component_name'>>> | undefined,
  urlPath: string | undefined,
): boolean => Boolean(urlPath && panels?.[urlPath]?.component_name === 'lovelace');

/** What says a person is using the page: a touch, a key, a wheel (read in the capture phase, whatever a card does with them). */
export const USE_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
