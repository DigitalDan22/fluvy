import { USE_EVENTS } from '../pages.js';

/*
 * Idleness on a wall: a touch, a key, a scroll or a wheel keep it awake; after `after` minutes without any it is
 * idle (the screensaver); a motion sensor may wake it too. The document's events are read in the capture phase,
 * so nothing a card does with an event changes the count.
 */

export interface IdleOptions {
  /** Minutes without activity before `onIdle`; 0 never. */
  readonly after: number;
  readonly onIdle: () => void;
  readonly onActive: () => void;
  /** Subscribes to what wakes the wall besides a touch (a motion sensor turning on); returns how to stop. */
  readonly wake?: (onMotion: () => void) => () => void;
}

export interface Idle {
  readonly idle: boolean;
  /** Counts as activity: wakes when idle, restarts the count. */
  poke(): void;
  stop(): void;
}

const MINUTE = 60_000;

export function createIdle(doc: Document, options: IdleOptions): Idle {
  const win = doc.defaultView ?? window;
  let timer = 0;
  let idle = false;
  let stopped = false;
  const arm = (): void => {
    win.clearTimeout(timer);
    if (options.after <= 0) return;
    timer = win.setTimeout(() => {
      idle = true;
      options.onIdle();
    }, options.after * MINUTE);
  };
  const poke = (): void => {
    if (stopped) return;
    if (idle) {
      idle = false;
      options.onActive();
    }
    arm();
  };
  for (const type of USE_EVENTS) doc.addEventListener(type, poke, { capture: true, passive: true });
  const unwake = options.wake?.(poke);
  arm();
  return {
    get idle() {
      return idle;
    },
    poke,
    stop() {
      stopped = true;
      win.clearTimeout(timer);
      for (const type of USE_EVENTS) doc.removeEventListener(type, poke, { capture: true });
      unwake?.();
    },
  };
}
