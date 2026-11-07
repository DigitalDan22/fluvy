import { isLovelace } from '../pages.js';
import { wearsLook, type EffectiveSettings, type WallSettings } from '../settings/schema.js';

/*
 * Whether this page is a wall right now: the device says it is one, nobody paused it, the page is a dashboard (not
 * Fluvy's own panel, not Settings), and the dashboard is one of the house's walls — those it names, or, with none
 * named, any dashboard that wears the look.
 */

export interface WallOnInput {
  readonly device: { readonly wall: boolean };
  readonly paused: boolean;
  /** The page's first path segment (`fluvy-wall` for `/fluvy-wall/home`). */
  readonly urlPath: string | undefined;
  readonly panels: Readonly<Record<string, { readonly component_name: string }>> | undefined;
  readonly wall: Pick<WallSettings, 'dashboards'>;
  readonly settings: Pick<EffectiveSettings, 'dashboards'>;
}

export function wallOn(input: WallOnInput): boolean {
  const { urlPath } = input;
  if (!input.device.wall || input.paused || !urlPath || urlPath === 'fluvy') return false;
  if (!isLovelace(input.panels, urlPath)) return false;
  return input.wall.dashboards.length
    ? input.wall.dashboards.includes(urlPath)
    : wearsLook(input.settings, urlPath);
}
