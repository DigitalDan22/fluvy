import { resyncCardThemes, setDarkOverride } from '../card.js';
import type { HomeAssistant } from '../ha/types.js';
import { firstWeather } from '../entity.js';
import { goBack, navigate } from '../actions.js';
import {
  WALL_ATTRIBUTE,
  WALL_BACK_ATTRIBUTE,
  WALL_BACKGROUND_VAR,
  WALL_HEADER_ATTRIBUTE,
  WALL_TOP_VAR,
} from '../look/attributes.js';
import type { RootElement } from '../look/tabs.js';
import { currentView, NO_VIEW, VIEW_EVENT, type ViewFacts } from '../look/view.js';
import { urlPathOf } from '../pages.js';
import { walkShadow } from '../shell/dom.js';
import { readDevice, writeDevice } from '../settings/device.js';
import { safeSession } from '../storage.js';
import type { EffectiveSettings, WallExit } from '../settings/schema.js';
import { createIdle, type Idle } from './idle.js';
import { wallOn } from './on.js';
import { nextChange, wallDark, type SunLike } from './schedule.js';
import { keepAwake } from './wake-lock.js';

/*
 * The wall's controller: whether this page is a wall right now (the device, the house's walls, the location, a
 * pause), and while it is one — the chrome gone (the shell's wall sheets on `<html fluvy-wall>`), the screen kept
 * awake, the screensaver after the idle minutes (a touch or the motion sensor wakes it), the day and night (a
 * forced mode for the look and every card, a darkening layer at night), the exit corner, and the pause a person
 * asks for by holding it. Loaded only on a device that is a wall.
 */

export type WallPhase = 'off' | 'awake' | 'asleep' | 'paused';

/** What the wall tells the look: this page is a wall (no frame), and the mode it forces (undefined: Home Assistant's). */
export interface WallState {
  readonly on: boolean;
  readonly dark: boolean | undefined;
}

export interface ScreensaverOptions {
  /** The clock (and the weather) on the screensaver; without it, the page under a veil. */
  readonly clock: boolean;
  /** Black instead of the wall's background. */
  readonly dim: boolean;
  /** The weather entity the clock shows, when the house has one. */
  readonly weather: string | undefined;
  readonly hass: () => HomeAssistant | undefined;
  /** The touch that wakes the wall (it does nothing else). */
  readonly onWake: () => void;
  /** Where the piece mounts (default: where the look's tokens reach it, the dashboard panel's shadow root or the body). */
  readonly host?: ParentNode;
  /** A look at it from the settings panel: the pointer stays. */
  readonly preview?: boolean;
}

export interface CornerOptions {
  /** A small × that a tap answers, or the corner that answers a hold of a second and a half. */
  readonly mode: WallExit;
  readonly onLeave: () => void;
  readonly hass: () => HomeAssistant | undefined;
}

export interface BackOptions {
  /** The subview's title ("Back" when it has none). */
  readonly title: string;
  readonly onBack: () => void;
  readonly hass: () => HomeAssistant | undefined;
}

/** The floating way back while it is on the page: its title follows the view, and it goes. */
export interface BackHandle {
  update(title: string): void;
  remove(): void;
}

export interface NoticeOptions {
  /** "Wall paused · Resume" (it stays while the pause does) or "Wall mode off · Back to the wall". */
  readonly kind: 'paused' | 'left';
  readonly onAction: () => void;
  readonly hass: () => HomeAssistant | undefined;
}

/** The wall's pieces, made by the cards package and fetched with the controller. */
export interface WallUi {
  /** Shows the screensaver; returns how to close it. */
  sleep(options: ScreensaverOptions): () => void;
  /** Shows the way out in the corner; returns how to remove it. */
  corner(options: CornerOptions): () => void;
  /** Shows the notice at the foot of the page, with its way back; returns how to remove it. */
  notice(options: NoticeOptions): () => void;
  /** Shows the way back from a subview at the top left. */
  back(options: BackOptions): BackHandle;
}

export interface WallDeps {
  readonly doc: Document;
  readonly win: Window;
  hass(): HomeAssistant | undefined;
  settings(): EffectiveSettings;
  /** Calls back whenever the settings change. */
  onSettings(listener: () => void): () => void;
  /** The look's ear. */
  setWall(state: WallState): void;
  ui(): Promise<WallUi>;
  /** Told of every phase change (the facade fans it out). */
  onPhase?(phase: WallPhase): void;
}

export interface WallHandle {
  on(): boolean;
  phase(): WallPhase;
  /** The mode the wall forces now (undefined: Home Assistant's own). */
  dark(): boolean | undefined;
  /** Leaves the wall until `resume` (or the screensaver's time): the chrome returns, the device stays a wall. */
  pause(): void;
  resume(): void;
  /** Takes the device out of the wall (it forgets it is one); a notice offers the way back for a moment. */
  exit(): void;
  /** The screensaver now (an automation's night, a test), and back. */
  sleep(): void;
  wake(): void;
  stop(): void;
}

export const PAUSED_KEY = 'fluvy:wall-paused';
const MINUTE = 60_000;
/** How long "Wall mode off · Back to the wall" stays. */
const LEFT_NOTICE_MS = 8000;

/** The wall mesh (as `.fv-bg--wall` draws it), set on the page for the dashboard's view. */
const WALL_MESH =
  'radial-gradient(120% 80% at 10% 0%, var(--fluvy-mesh-wall-1) 0%, transparent 60%), radial-gradient(100% 80% at 40% 110%, var(--fluvy-mesh-wall-2) 0%, transparent 60%), var(--fluvy-mesh-wall-3)';

export function createWall(deps: WallDeps): WallHandle {
  const { doc, win } = deps;
  const html = doc.documentElement;
  let phase: WallPhase = 'off';
  let dark: boolean | undefined;
  let idle: Idle | undefined;
  let stopAwake: (() => void) | undefined;
  let stopCorner: (() => void) | undefined;
  let stopToast: (() => void) | undefined;
  let closeSaver: (() => void) | undefined;
  let dimLayer: HTMLElement | undefined;
  /** The view the dashboard shows (a subview has a way back on a wall), and the root that shows it. */
  let view: ViewFacts = NO_VIEW;
  let root: RootElement | undefined;
  let backHandle: BackHandle | undefined;
  let darkTimer = 0;
  let resumeTimer = 0;
  let leftTimer = 0;
  let uiPromise: Promise<WallUi> | undefined;
  const ui = (): Promise<WallUi> => (uiPromise ??= deps.ui());

  const setPhase = (next: WallPhase): void => {
    if (phase === next) return;
    phase = next;
    deps.onPhase?.(next);
  };
  const paused = (): boolean => safeSession(win)?.getItem(PAUSED_KEY) === '1';
  const wall = () => deps.settings().wall;

  /** The darkening layer at night: a click-through veil at the house's share of black, only while awake and dark. */
  const veil = (): void => {
    const share = wall().nightDim / 100;
    const nightNow = dark ?? deps.hass()?.themes?.darkMode ?? false;
    const wanted = phase === 'awake' && nightNow && share > 0;
    if (!wanted) {
      dimLayer?.remove();
      dimLayer = undefined;
      return;
    }
    if (!dimLayer) {
      dimLayer = doc.createElement('div');
      dimLayer.setAttribute('data-fluvy-wall-dim', '');
      dimLayer.style.cssText =
        'position:fixed;inset:0;z-index:5;background:#000;pointer-events:none;transition:opacity 320ms ease';
      doc.body.append(dimLayer);
    }
    dimLayer.style.opacity = String(share);
  };

  /** The mode the wall forces now, and a timer for the next time it changes. */
  const updateDark = (): void => {
    win.clearTimeout(darkTimer);
    darkTimer = 0;
    const settings = wall();
    const sun = deps.hass()?.states['sun.sun'] as SunLike | undefined;
    const now = new Date();
    dark = wallDark(settings, now, sun);
    setDarkOverride(dark);
    resyncCardThemes();
    deps.setWall({ on: true, dark });
    veil();
    const wait = nextChange(settings, now, sun);
    if (wait !== undefined) darkTimer = win.setTimeout(updateDark, Math.max(wait, 1000) + 1000);
  };

  /** A motion sensor turning on counts as a touch: Home Assistant streams that entity alone. */
  const wake = (id: string) => (onMotion: () => void) => {
    let off: (() => void) | undefined;
    let gone = false;
    const connection = deps.hass()?.connection;
    if (connection)
      void connection
        .subscribeMessage<{
          a?: Record<string, { s?: string }>;
          c?: Record<string, { '+'?: { s?: string } }>;
        }>(
          (message) => {
            const state = message.c?.[id]?.['+']?.s ?? message.a?.[id]?.s;
            if (state === 'on') onMotion();
          },
          { type: 'subscribe_entities', entity_ids: [id] },
        )
        .then((unsubscribe) => {
          if (gone) unsubscribe();
          else off = unsubscribe;
        })
        .catch(() => undefined);
    return () => {
      gone = true;
      off?.();
    };
  };

  const sleep = (): void => {
    if (phase !== 'awake') return;
    setPhase('asleep');
    veil();
    const settings = wall();
    const weather = firstWeather(deps.hass());
    void ui().then((pieces) => {
      if (phase !== 'asleep') return;
      closeSaver?.();
      closeSaver = pieces.sleep({
        clock: settings.clock,
        dim: settings.dim,
        weather,
        hass: deps.hass,
        onWake: () => idle?.poke(),
      });
    });
  };

  const awake = (): void => {
    closeSaver?.();
    closeSaver = undefined;
    if (phase === 'asleep') setPhase('awake');
    veil();
  };

  /** Home Assistant's own way back (the view's `back_path`, its history, the dashboard), or ours where it is missing. */
  const onBack = (): void => {
    if (typeof root?._goBack === 'function') {
      root._goBack();
      return;
    }
    if (view.backPath) navigate(view.backPath, true);
    else goBack(`/${urlPathOf(win.location.pathname) ?? ''}`);
  };

  /**
   * The way back from a subview, as the house chose it: the floating button with the view's title, or Home Assistant's
   * header (the shell's wall sheets fill on the attributes) with the corner moved under it.
   */
  const syncWay = (): void => {
    const on = phase === 'awake' || phase === 'asleep';
    const mode = wall().subview;
    html.toggleAttribute(WALL_HEADER_ATTRIBUTE, on && mode === 'header');
    html.toggleAttribute(WALL_BACK_ATTRIBUTE, on && mode === 'button');
    if (on && mode === 'header' && view.subview) html.style.setProperty(WALL_TOP_VAR, '56px');
    else html.style.removeProperty(WALL_TOP_VAR);
    if (!on || mode !== 'button' || !view.subview) {
      backHandle?.remove();
      backHandle = undefined;
      return;
    }
    if (backHandle) {
      backHandle.update(view.title);
      return;
    }
    void ui().then((pieces) => {
      if (backHandle || !(phase === 'awake' || phase === 'asleep') || !view.subview) return;
      if (wall().subview !== 'button') return;
      backHandle = pieces.back({ title: view.title, onBack, hass: deps.hass });
    });
  };

  /** What the dashboard on the page shows now (when the wall comes, before any root has told it). */
  const readView = (): void => {
    walkShadow(doc, (element) => {
      if (element.localName !== 'hui-root') return;
      root = element as RootElement;
      view = currentView(root);
    });
  };

  const leaveWall = (): void => {
    html.removeAttribute(WALL_ATTRIBUTE);
    html.style.removeProperty(WALL_BACKGROUND_VAR);
    idle?.stop();
    idle = undefined;
    stopAwake?.();
    stopAwake = undefined;
    stopCorner?.();
    stopCorner = undefined;
    closeSaver?.();
    closeSaver = undefined;
    win.clearTimeout(darkTimer);
    darkTimer = 0;
    dark = undefined;
    setDarkOverride(undefined);
    resyncCardThemes();
    deps.setWall({ on: false, dark: undefined });
    dimLayer?.remove();
    dimLayer = undefined;
    backHandle?.remove();
    backHandle = undefined;
    html.removeAttribute(WALL_HEADER_ATTRIBUTE);
    html.removeAttribute(WALL_BACK_ATTRIBUTE);
    html.style.removeProperty(WALL_TOP_VAR);
  };

  const enterWall = (): void => {
    leaveWall();
    stopToast?.();
    stopToast = undefined;
    const settings = wall();
    html.setAttribute(WALL_ATTRIBUTE, '');
    if (settings.background === 'wall') html.style.setProperty(WALL_BACKGROUND_VAR, WALL_MESH);
    setPhase('awake');
    updateDark();
    stopAwake = keepAwake(win);
    idle = createIdle(doc, {
      after: settings.after,
      onIdle: sleep,
      onActive: awake,
      ...(settings.wakeEntity ? { wake: wake(settings.wakeEntity) } : {}),
    });
    void ui().then((pieces) => {
      if (phase === 'off' || phase === 'paused') return;
      stopCorner?.();
      // the house chooses the way out: a button that leaves, or a hidden hold that pauses
      stopCorner = pieces.corner({
        mode: settings.exit,
        onLeave: settings.exit === 'hold' ? pause : exit,
        hass: deps.hass,
      });
    });
    readView();
    syncWay();
  };

  /**
   * Whether the page is a wall now. A move inside a wall (a subview, another view) keeps the wall as it is — its
   * corner, its idle time, its screen kept awake — and only its way back follows; the settings changing (`force`)
   * set it up again.
   */
  const evaluate = (force = true): void => {
    const hass = deps.hass();
    const settings = deps.settings();
    const on = wallOn({
      device: readDevice(),
      paused: paused(),
      urlPath: urlPathOf(win.location.pathname),
      panels: hass?.panels,
      wall: settings.wall,
      settings,
    });
    if (on) {
      if (!force && (phase === 'awake' || phase === 'asleep')) {
        syncWay();
        return;
      }
      enterWall();
      return;
    }
    leaveWall();
    if (paused()) {
      setPhase('paused');
      void ui().then((pieces) => {
        if (phase !== 'paused') return;
        stopToast?.();
        stopToast = pieces.notice({ kind: 'paused', onAction: resume, hass: deps.hass });
      });
    } else {
      stopToast?.();
      stopToast = undefined;
      setPhase('off');
    }
  };

  /** A pause ends by itself when the screensaver would have come (never, with the screensaver off). */
  const armResume = (): void => {
    win.clearTimeout(resumeTimer);
    const after = wall().after;
    if (after > 0) resumeTimer = win.setTimeout(resume, after * MINUTE);
  };

  function pause(): void {
    safeSession(win)?.setItem(PAUSED_KEY, '1');
    evaluate();
    armResume();
  }
  function resume(): void {
    win.clearTimeout(resumeTimer);
    safeSession(win)?.removeItem(PAUSED_KEY);
    evaluate();
  }
  /** The device stops being a wall: its chrome returns for good, and a notice offers the way back for a moment. */
  function exit(): void {
    writeDevice({ wall: false });
    safeSession(win)?.removeItem(PAUSED_KEY);
    evaluate();
    void ui().then((pieces) => {
      if (readDevice().wall) return;
      stopToast?.();
      stopToast = pieces.notice({ kind: 'left', onAction: comeBack, hass: deps.hass });
      win.clearTimeout(leftTimer);
      leftTimer = win.setTimeout(() => {
        stopToast?.();
        stopToast = undefined;
      }, LEFT_NOTICE_MS);
    });
  }
  function comeBack(): void {
    win.clearTimeout(leftTimer);
    writeDevice({ wall: true });
    evaluate();
  }

  // the page moves between dashboards without reloading; the settings may change on another device
  const onLocation = (): void => evaluate(false);
  win.addEventListener('location-changed', onLocation);
  win.addEventListener('popstate', onLocation);
  // the dashboard's root tells when the view it shows has changed (after it rendered it)
  const onView = (event: Event): void => {
    const target = event.composedPath()[0];
    if (target instanceof HTMLElement) root = target as RootElement;
    view = (event as CustomEvent<ViewFacts>).detail ?? NO_VIEW;
    syncWay();
  };
  win.addEventListener(VIEW_EVENT, onView);
  const offSettings = deps.onSettings(evaluate);
  // Home Assistant's panels arrive with its connection: look again until they are there
  let tries = 0;
  const waitForHass = (): void => {
    if (deps.hass()?.panels || tries++ > 40) {
      evaluate();
      if (paused()) armResume();
      return;
    }
    win.setTimeout(waitForHass, 250);
  };
  waitForHass();

  return {
    on: () => phase === 'awake' || phase === 'asleep',
    phase: () => phase,
    dark: () => dark,
    pause,
    resume,
    exit,
    sleep,
    wake: () => idle?.poke(),
    stop: () => {
      win.removeEventListener('location-changed', onLocation);
      win.removeEventListener('popstate', onLocation);
      win.removeEventListener(VIEW_EVENT, onView);
      offSettings();
      win.clearTimeout(resumeTimer);
      win.clearTimeout(leftTimer);
      leaveWall();
      stopToast?.();
      stopToast = undefined;
      setPhase('off');
    },
  };
}
