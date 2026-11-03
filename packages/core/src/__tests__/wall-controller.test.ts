// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUSE_DEFAULTS, PERSONAL_DEFAULTS, resolveSettings } from '../settings/schema.js';
import { DEVICE_KEY } from '../settings/device.js';
import {
  WALL_ATTRIBUTE,
  WALL_BACK_ATTRIBUTE,
  WALL_BACKGROUND_VAR,
  WALL_HEADER_ATTRIBUTE,
  WALL_TOP_VAR,
} from '../look/attributes.js';
import { VIEW_EVENT } from '../look/view.js';
import {
  createWall,
  PAUSED_KEY,
  type BackOptions,
  type CornerOptions,
  type NoticeOptions,
  type WallPhase,
  type WallState,
  type WallUi,
} from '../wall/controller.js';

const panels = {
  lovelace: { component_name: 'lovelace', url_path: 'lovelace', title: null, icon: null },
  'fluvy-wall': { component_name: 'lovelace', url_path: 'fluvy-wall', title: null, icon: null },
  fluvy: { component_name: 'custom', url_path: 'fluvy', title: 'Fluvy', icon: null },
};

function setup(wallPatch: Partial<ReturnType<typeof resolveSettings>['wall']> = {}, dark = false) {
  localStorage.setItem(DEVICE_KEY, JSON.stringify({ version: 1, wall: true }));
  sessionStorage.removeItem(PAUSED_KEY);
  history.replaceState(null, '', '/fluvy-wall/wall');
  let settings = resolveSettings(
    { ...HOUSE_DEFAULTS, wall: { ...HOUSE_DEFAULTS.wall, ...wallPatch } },
    PERSONAL_DEFAULTS,
  );
  const states: WallState[] = [];
  const phases: WallPhase[] = [];
  const shown = { sleep: 0, closed: 0, corner: 0, toast: 0, back: 0 };
  let back: BackOptions | undefined;
  let backTitle = '';
  let wakeUp: (() => void) | undefined;
  let corner: CornerOptions | undefined;
  let notice: NoticeOptions | undefined;
  const ui: WallUi = {
    sleep: (options) => {
      shown.sleep++;
      wakeUp = options.onWake;
      return () => shown.closed++;
    },
    corner: (options) => {
      shown.corner++;
      corner = options;
      return () => shown.corner--;
    },
    notice: (options) => {
      shown.toast++;
      notice = options;
      return () => shown.toast--;
    },
    back: (options) => {
      shown.back++;
      back = options;
      backTitle = options.title;
      return {
        update: (title) => {
          backTitle = title;
        },
        remove: () => {
          shown.back--;
        },
      };
    },
  };
  const listeners = new Set<() => void>();
  const hass = {
    panels,
    states: { 'sun.sun': { state: 'above_horizon', attributes: {} } },
    themes: { darkMode: dark },
  } as never;
  const wall = createWall({
    doc: document,
    win: window,
    hass: () => hass,
    settings: () => settings,
    onSettings: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setWall: (state) => states.push(state),
    ui: () => Promise.resolve(ui),
    onPhase: (phase) => phases.push(phase),
  });
  const change = (patch: Partial<typeof settings.wall>): void => {
    settings = { ...settings, wall: { ...settings.wall, ...patch } };
    for (const listener of listeners) listener();
  };
  return {
    wall,
    states,
    phases,
    shown,
    change,
    wake: () => wakeUp?.(),
    corner: () => corner,
    notice: () => notice,
    back: () => back,
    backTitle: () => backTitle,
  };
}

/** A dashboard root that tells the page it now shows a view (as `look/view.ts` does after it rendered). */
function showView(
  facts: { subview: boolean; title?: string; backPath?: string },
  goBack?: () => void,
) {
  const root = document.createElement('hui-root') as HTMLElement & { _goBack?: () => void };
  if (goBack) root._goBack = goBack;
  document.body.append(root);
  root.dispatchEvent(
    new CustomEvent(VIEW_EVENT, {
      bubbles: true,
      composed: true,
      detail: { subview: facts.subview, title: facts.title ?? '', backPath: facts.backPath },
    }),
  );
  return root;
}

describe('the wall controller', () => {
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    }),
  );
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute(WALL_ATTRIBUTE);
    document.documentElement.style.removeProperty(WALL_BACKGROUND_VAR);
    localStorage.clear();
    sessionStorage.clear();
  });

  it('is on for a wall dashboard: the attribute, the look told, the corner; off on Fluvy’s own panel', async () => {
    const { wall, states, shown, phases } = setup({ background: 'wall' });
    expect(wall.phase()).toBe('awake');
    expect(document.documentElement.hasAttribute(WALL_ATTRIBUTE)).toBe(true);
    expect(document.documentElement.style.getPropertyValue(WALL_BACKGROUND_VAR)).toContain(
      'mesh-wall',
    );
    expect(states.at(-1)).toEqual({ on: true, dark: undefined });
    await vi.advanceTimersByTimeAsync(1);
    expect(shown.corner).toBe(1);
    history.replaceState(null, '', '/fluvy/wall');
    window.dispatchEvent(new Event('location-changed'));
    expect(wall.phase()).toBe('off');
    expect(document.documentElement.hasAttribute(WALL_ATTRIBUTE)).toBe(false);
    expect(states.at(-1)).toEqual({ on: false, dark: undefined });
    expect(shown.corner).toBe(0);
    expect(phases).toEqual(['awake', 'off']);
    wall.stop();
  });

  it('keeps the wall as it is on a move inside it: one corner, not a new one for every view', async () => {
    const { wall, shown, corner } = setup();
    await vi.advanceTimersByTimeAsync(1);
    const first = corner();
    history.replaceState(null, '', '/fluvy-wall/kitchen');
    window.dispatchEvent(new Event('location-changed'));
    await vi.advanceTimersByTimeAsync(1);
    expect(shown.corner).toBe(1);
    expect(corner()).toBe(first);
    wall.stop();
  });

  it('a subview has the floating way back with its title; it goes as Home Assistant goes back', async () => {
    const { wall, shown, back, backTitle } = setup();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.documentElement.hasAttribute(WALL_BACK_ATTRIBUTE)).toBe(true);
    expect(shown.back).toBe(0);
    const goBack = vi.fn();
    const root = showView({ subview: true, title: 'Kitchen' }, goBack);
    await vi.advanceTimersByTimeAsync(1);
    expect(shown.back).toBe(1);
    expect(backTitle()).toBe('Kitchen');
    back()?.onBack();
    expect(goBack).toHaveBeenCalledTimes(1);
    // another subview: the same button, its title follows
    showView({ subview: true, title: 'Bedroom' });
    expect(shown.back).toBe(1);
    expect(backTitle()).toBe('Bedroom');
    showView({ subview: false, title: 'Home' });
    expect(shown.back).toBe(0);
    root.remove();
    wall.stop();
    expect(document.documentElement.hasAttribute(WALL_BACK_ATTRIBUTE)).toBe(false);
  });

  it('where the root has no way back of its own, the button goes as Home Assistant would: back, else the dashboard', async () => {
    const { wall, back } = setup();
    await vi.advanceTimersByTimeAsync(1);
    const step = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    history.replaceState({ from: '/fluvy-wall/wall' }, '', '/fluvy-wall/kitchen');
    const root = showView({ subview: true, title: 'Kitchen' });
    await vi.advanceTimersByTimeAsync(1);
    back()?.onBack();
    expect(step).toHaveBeenCalledOnce();
    // opened from a link: nothing of the app behind it
    history.replaceState(null, '', '/fluvy-wall/kitchen');
    back()?.onBack();
    expect(step).toHaveBeenCalledOnce();
    expect(location.pathname).toBe('/fluvy-wall');
    step.mockRestore();
    root.remove();
    wall.stop();
  });

  it('a house that keeps Home Assistant’s header: the header in a subview, the corner under it, no button', async () => {
    const { wall, shown } = setup({ subview: 'header' });
    await vi.advanceTimersByTimeAsync(1);
    const html = document.documentElement;
    expect(html.hasAttribute(WALL_HEADER_ATTRIBUTE)).toBe(true);
    expect(html.style.getPropertyValue(WALL_TOP_VAR)).toBe('');
    const root = showView({ subview: true, title: 'Kitchen' });
    await vi.advanceTimersByTimeAsync(1);
    expect(shown.back).toBe(0);
    expect(html.style.getPropertyValue(WALL_TOP_VAR)).toBe('56px');
    showView({ subview: false });
    expect(html.style.getPropertyValue(WALL_TOP_VAR)).toBe('');
    root.remove();
    wall.stop();
    expect(html.hasAttribute(WALL_HEADER_ATTRIBUTE)).toBe(false);
  });

  it('sleeps after the minutes, wakes on the screensaver’s touch, and forces the night’s mode', async () => {
    const { wall, states, shown, wake } = setup({ after: 2, theme: 'dark' });
    expect(states.at(-1)).toEqual({ on: true, dark: true });
    await vi.advanceTimersByTimeAsync(2 * 60_000 + 1);
    expect(wall.phase()).toBe('asleep');
    expect(shown.sleep).toBe(1);
    wake();
    expect(wall.phase()).toBe('awake');
    expect(shown.closed).toBe(1);
    wall.stop();
  });

  it('pauses on the corner’s hold (the chrome back, the toast), resumes by hand or when the screensaver would come', async () => {
    const { wall, shown } = setup({ after: 5 });
    wall.pause();
    await vi.advanceTimersByTimeAsync(1);
    expect(wall.phase()).toBe('paused');
    expect(sessionStorage.getItem(PAUSED_KEY)).toBe('1');
    expect(document.documentElement.hasAttribute(WALL_ATTRIBUTE)).toBe(false);
    expect(shown.toast).toBe(1);
    wall.resume();
    await vi.advanceTimersByTimeAsync(1);
    expect(wall.phase()).toBe('awake');
    expect(shown.toast).toBe(0);
    wall.pause();
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);
    expect(wall.phase()).toBe('awake');
    wall.stop();
  });

  it('leaves for good on the corner’s button: the device forgets it is a wall, a notice offers the way back', async () => {
    const { wall, shown, corner, notice } = setup();
    await vi.advanceTimersByTimeAsync(1);
    expect(corner()?.mode).toBe('button'); // the default way out
    const device = (): { wall: boolean } =>
      JSON.parse(localStorage.getItem(DEVICE_KEY) ?? '{}') as { wall: boolean };

    corner()!.onLeave();
    await vi.advanceTimersByTimeAsync(1);
    expect(wall.phase()).toBe('off');
    expect(document.documentElement.hasAttribute(WALL_ATTRIBUTE)).toBe(false);
    expect(device().wall).toBe(false);
    expect(sessionStorage.getItem(PAUSED_KEY)).toBeNull(); // left, not paused: it does not come back by itself
    expect(notice()?.kind).toBe('left');
    expect(shown.toast).toBe(1);

    notice()!.onAction(); // "Back to the wall"
    await vi.advanceTimersByTimeAsync(1);
    expect(wall.phase()).toBe('awake');
    expect(device().wall).toBe(true);
    expect(shown.toast).toBe(0);

    corner()!.onLeave(); // and left alone, the notice goes after a moment; the device stays out
    await vi.advanceTimersByTimeAsync(8001);
    expect(shown.toast).toBe(0);
    expect(wall.phase()).toBe('off');
    expect(device().wall).toBe(false);
    wall.stop();
  });

  it('pauses on the corner when the house chose the hold', async () => {
    const { wall, corner, notice } = setup({ exit: 'hold' });
    await vi.advanceTimersByTimeAsync(1);
    expect(corner()?.mode).toBe('hold');
    corner()!.onLeave();
    await vi.advanceTimersByTimeAsync(1);
    expect(wall.phase()).toBe('paused');
    expect(notice()?.kind).toBe('paused');
    expect(JSON.parse(localStorage.getItem(DEVICE_KEY) ?? '{}')).toMatchObject({ wall: true });
    wall.stop();
  });

  it('follows a change of the house’s wall settings', async () => {
    const { wall, change, states } = setup({ dashboards: ['fluvy-wall'] });
    expect(wall.on()).toBe(true);
    change({ dashboards: ['lovelace'] });
    expect(wall.on()).toBe(false);
    change({ dashboards: [], theme: 'dark' });
    expect(wall.on()).toBe(true);
    expect(states.at(-1)).toEqual({ on: true, dark: true });
    wall.stop();
  });
});
