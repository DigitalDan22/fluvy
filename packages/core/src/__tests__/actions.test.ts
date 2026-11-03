// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goBack, navigate, runAction, toggleService, type ActionConfig } from '../actions.js';
import type { HomeAssistant } from '../ha/types.js';

const callService = vi.fn(() => Promise.resolve());

/** A house of states only: `{ 'lock.front': 'locked' }`. */
const house = (states: Record<string, string> = {}): HomeAssistant =>
  ({
    states: Object.fromEntries(
      Object.entries(states).map(([id, state]) => [id, { entity_id: id, state, attributes: {} }]),
    ),
    callService,
  }) as unknown as HomeAssistant;

let card: HTMLElement;
const stops: (() => void)[] = [];

/** What an event says on its way past the body, where Home Assistant and browser_mod listen; taken down after the test. */
function listen(type: string): unknown[] {
  const heard: unknown[] = [];
  const on = (event: Event): void => {
    heard.push((event as CustomEvent).detail);
  };
  document.body.addEventListener(type, on);
  stops.push(() => document.body.removeEventListener(type, on));
  return heard;
}

beforeEach(() => {
  card = document.createElement('div');
  document.body.append(card);
  callService.mockClear();
});

afterEach(() => {
  card.remove();
  for (const stop of stops.splice(0)) stop();
  vi.restoreAllMocks();
});

describe('runAction', () => {
  it('opens the details when nothing else is asked', async () => {
    const details = listen('hass-more-info');

    await runAction(card, house(), undefined, 'light.desk');

    expect(details).toEqual([{ entityId: 'light.desk' }]);
    expect(callService).not.toHaveBeenCalled();
  });

  it('fire-dom-event: the whole action leaves the card as ll-custom, as Home Assistant sends it', async () => {
    const heard = listen('ll-custom');
    const action: ActionConfig = {
      action: 'fire-dom-event',
      browser_mod: { service: 'browser_mod.popup', data: { title: 'Lights' } },
    };

    await runAction(card, house(), action);

    expect(heard).toEqual([action]);
    expect(callService).not.toHaveBeenCalled();
  });

  it('fire-dom-event crosses shadow roots, as the card sits in one', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const inner = document.createElement('div');
    host.attachShadow({ mode: 'open' }).append(inner);
    const heard = listen('ll-custom');

    await runAction(inner, house(), { action: 'fire-dom-event' });

    expect(heard).toHaveLength(1);
    host.remove();
  });

  it('reads call-service, service and service_data: perform-action as it was written before', async () => {
    await runAction(card, house(), {
      action: 'call-service',
      service: 'light.turn_on',
      service_data: { brightness_pct: 40 },
      target: { entity_id: 'light.desk' },
    });

    expect(callService).toHaveBeenCalledExactlyOnceWith(
      'light',
      'turn_on',
      { brightness_pct: 40 },
      { entity_id: 'light.desk' },
    );
  });

  it('a navigation may replace the page it leaves', async () => {
    const replace = vi.spyOn(history, 'replaceState');
    const push = vi.spyOn(history, 'pushState');

    await runAction(card, house(), {
      action: 'navigate',
      navigation_path: '/fluvy-auto/rooms',
      navigation_replace: true,
    });

    expect(replace).toHaveBeenCalledExactlyOnceWith(null, '', '/fluvy-auto/rooms');
    expect(push).not.toHaveBeenCalled();
  });

  describe('an action to be asked about first', () => {
    it('goes to Home Assistant whole, and runs nothing itself', async () => {
      const handed = listen('hass-action');
      const details = listen('hass-more-info');
      const action: ActionConfig = {
        action: 'perform-action',
        perform_action: 'cover.open_cover',
        target: { entity_id: 'cover.garage' },
        confirmation: { text: 'Open the garage?' },
      };

      await runAction(card, house(), action, 'cover.garage');

      expect(handed).toEqual([
        { config: { entity: 'cover.garage', tap_action: action }, action: 'tap' },
      ]);
      expect(callService).not.toHaveBeenCalled();
      expect(details).toEqual([]);
    });

    it('a toggle goes as the service Fluvy would have called', async () => {
      const handed = listen('hass-action');

      await runAction(
        card,
        house({ 'vacuum.robot': 'cleaning' }),
        { action: 'toggle', confirmation: true },
        'vacuum.robot',
      );

      expect(handed).toEqual([
        {
          config: {
            entity: 'vacuum.robot',
            tap_action: {
              action: 'perform-action',
              perform_action: 'vacuum.pause',
              target: { entity_id: 'vacuum.robot' },
              confirmation: true,
            },
          },
          action: 'tap',
        },
      ]);
      expect(callService).not.toHaveBeenCalled();
    });

    it('a toggle of nothing asks nothing', async () => {
      const handed = listen('hass-action');

      await runAction(card, house(), { action: 'toggle', confirmation: true });

      expect(handed).toEqual([]);
      expect(callService).not.toHaveBeenCalled();
    });

    it('nothing to do is nothing to ask', async () => {
      const handed = listen('hass-action');

      await runAction(card, house(), { action: 'none', confirmation: true }, 'light.desk');

      expect(handed).toEqual([]);
    });

    it('an answer of "no confirmation" runs here', async () => {
      const handed = listen('hass-action');

      await runAction(
        card,
        house({ 'light.desk': 'on' }),
        { action: 'toggle', confirmation: false },
        'light.desk',
      );

      expect(handed).toEqual([]);
      expect(callService).toHaveBeenCalledExactlyOnceWith(
        'light',
        'turn_off',
        {},
        { entity_id: 'light.desk' },
      );
    });
  });

  it('assist is Home Assistant’s to open', async () => {
    const handed = listen('hass-action');
    const action: ActionConfig = { action: 'assist', start_listening: true };

    await runAction(card, house(), action);

    expect(handed).toEqual([{ config: { entity: undefined, tap_action: action }, action: 'tap' }]);
    expect(callService).not.toHaveBeenCalled();
  });
});

describe('navigate, as Home Assistant keeps its history (#88)', () => {
  /** Where the page is, and what its entry says. */
  const at = (url: string, state: unknown = null): void => history.replaceState(state, '', url);
  /** Every `location-changed` the window hears from now on, as its detail. */
  const told = (): unknown[] => {
    const heard: unknown[] = [];
    const on = (event: Event): void => {
      heard.push((event as CustomEvent).detail);
    };
    window.addEventListener('location-changed', on);
    stops.push(() => window.removeEventListener('location-changed', on));
    return heard;
  };

  it('a new page records the one it was opened from (its path, not its query): the back arrow steps back to it', () => {
    at('/dashboard-test/kitchen?edit=1', { from: '/dashboard-test/home' });
    const heard = told();

    navigate('/dashboard-test/fridge');

    expect(location.pathname).toBe('/dashboard-test/fridge');
    expect(history.state).toEqual({ from: '/dashboard-test/kitchen' });
    expect(heard).toEqual([{ replace: false }]);
  });

  it('a replaced page keeps what was behind it, and nothing else of the entry it takes the place of', () => {
    at('/dashboard-test/kitchen', { from: '/dashboard-test/home', dialog: 'more-info' });
    const heard = told();

    navigate('/dashboard-test/fridge', true);

    expect(location.pathname).toBe('/dashboard-test/fridge');
    expect(history.state).toEqual({ from: '/dashboard-test/home' });
    expect(heard).toEqual([{ replace: true }]);
  });

  it('the app’s first entry stays its first when replaced; an entry with nothing behind it keeps nothing', () => {
    at('/dashboard-test/home', { root: true });
    navigate('/dashboard-test/kitchen', true);
    expect(history.state).toEqual({ root: true });

    at('/dashboard-test/home', { root: true, from: '/config' });
    navigate('/dashboard-test/kitchen', true);
    expect(history.state).toEqual({ root: true, from: '/config' });

    at('/dashboard-test/home', { dialog: 'more-info' });
    navigate('/dashboard-test/kitchen', true);
    expect(history.state).toBeNull();
  });

  it('back steps back to the page this one was opened from', () => {
    at('/dashboard-test/fridge', { from: '/dashboard-test/kitchen' });
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    const heard = told();

    goBack('/dashboard-test');

    expect(back).toHaveBeenCalledOnce();
    expect(heard).toEqual([]);
  });

  it('back from a page opened from outside the app goes to the fallback in its place', () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    at('/history?entity_id=light.desk');

    goBack();

    expect(location.pathname).toBe('/');
    at('/dashboard-test/fridge', { root: true });

    goBack('/dashboard-test');

    expect(location.pathname).toBe('/dashboard-test');
    expect(history.state).toEqual({ root: true });
    expect(back).not.toHaveBeenCalled();
  });
});

describe('toggleService', () => {
  it.each([
    ['cover.blinds', 'closed', 'cover', 'open_cover'],
    ['cover.blinds', 'open', 'cover', 'close_cover'],
    ['valve.garden', 'closed', 'valve', 'open_valve'],
    ['lock.front', 'locked', 'lock', 'unlock'],
    ['lock.front', 'unlocked', 'lock', 'lock'],
    ['vacuum.robot', 'docked', 'vacuum', 'start'],
    ['vacuum.robot', 'cleaning', 'vacuum', 'pause'],
    ['media_player.tv', 'playing', 'media_player', 'media_play_pause'],
    ['scene.evening', '2026-09-17T20:00:00+00:00', 'scene', 'turn_on'],
    ['script.goodnight', 'off', 'script', 'turn_on'],
    ['input_button.bell', 'unknown', 'input_button', 'press'],
    ['automation.porch', 'on', 'automation', 'toggle'],
    ['light.desk', 'on', 'light', 'turn_off'],
    ['switch.heater', 'off', 'switch', 'turn_on'],
    ['group.downstairs', 'on', 'homeassistant', 'turn_off'],
  ])('%s that is %s: %s.%s', (entity, state, domain, service) => {
    expect(toggleService(house({ [entity]: state }), entity)).toEqual([domain, service]);
  });
});
