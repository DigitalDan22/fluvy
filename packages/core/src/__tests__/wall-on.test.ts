import { describe, expect, it } from 'vitest';
import { isLovelace, urlPathOf } from '../pages.js';
import { wallOn } from '../wall/on.js';

const panels = {
  lovelace: { component_name: 'lovelace' },
  'fluvy-wall': { component_name: 'lovelace' },
  'fluvy-auto': { component_name: 'lovelace' },
  fluvy: { component_name: 'custom' },
  config: { component_name: 'config' },
};
const base = {
  device: { wall: true },
  paused: false,
  urlPath: 'fluvy-wall',
  panels,
  wall: { dashboards: [] as readonly string[] },
  settings: { dashboards: [] as readonly string[] },
};

describe('wallOn', () => {
  it('reads the dashboard off the location', () => {
    expect(urlPathOf('/fluvy-wall/home')).toBe('fluvy-wall');
    expect(urlPathOf('/lovelace/0')).toBe('lovelace');
    expect(urlPathOf('/')).toBeUndefined();
    expect(isLovelace(panels, 'fluvy-wall')).toBe(true);
    expect(isLovelace(panels, 'config')).toBe(false);
    expect(isLovelace(undefined, 'fluvy-wall')).toBe(false);
  });

  it('is on for a wall device on one of the house’s walls, and off for every other reason', () => {
    expect(wallOn(base)).toBe(true);
    expect(wallOn({ ...base, device: { wall: false } })).toBe(false);
    expect(wallOn({ ...base, paused: true })).toBe(false);
    expect(wallOn({ ...base, urlPath: 'fluvy' })).toBe(false);
    expect(wallOn({ ...base, urlPath: 'config' })).toBe(false);
    expect(wallOn({ ...base, urlPath: undefined })).toBe(false);
    expect(wallOn({ ...base, panels: undefined })).toBe(false);
  });

  it('with walls named, only those; with none, whatever wears the look', () => {
    expect(wallOn({ ...base, wall: { dashboards: ['fluvy-auto'] } })).toBe(false);
    expect(wallOn({ ...base, urlPath: 'fluvy-auto', wall: { dashboards: ['fluvy-auto'] } })).toBe(
      true,
    );
    // a named wall wins even where the look does not reach
    expect(
      wallOn({
        ...base,
        urlPath: 'lovelace',
        wall: { dashboards: ['lovelace'] },
        settings: { dashboards: ['fluvy-auto'] },
      }),
    ).toBe(true);
    // no walls named: the look's own rule (fluvy-* by default, else the chosen list)
    expect(wallOn({ ...base, urlPath: 'lovelace' })).toBe(false);
    expect(wallOn({ ...base, urlPath: 'lovelace', settings: { dashboards: ['lovelace'] } })).toBe(
      true,
    );
  });
});
