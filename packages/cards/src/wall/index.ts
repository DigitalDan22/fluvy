import type {
  BackHandle,
  BackOptions,
  CornerOptions,
  HomeAssistant,
  NoticeOptions,
  ScreensaverOptions,
  WallUi,
} from '@fluvy/core';
import { FluvyWallBack } from './back.js';
import { FluvyWallCorner } from './corner.js';
import { wallHost } from './host.js';
import { FluvyWallScreensaver } from './screensaver.js';
import { FluvyWallToast } from './toast.js';

/*
 * The wall's pieces, fetched with the controller on a device that is a wall: the screensaver, the corner, the toast and
 * the way back from a subview, each mounted where the look's tokens reach it and taken down by what showed it.
 */

const define = (tag: string, element: CustomElementConstructor): void => {
  if (!customElements.get(tag)) customElements.define(tag, element);
};
define('fluvy-wall-screensaver', FluvyWallScreensaver);
define('fluvy-wall-corner', FluvyWallCorner);
define('fluvy-wall-toast', FluvyWallToast);
define('fluvy-wall-back', FluvyWallBack);

/** Keeps a piece's `hass` fresh while it is on the page (the clock's weather, the toast's words). */
function follow(
  element: { hass: HomeAssistant | undefined },
  hass: () => HomeAssistant | undefined,
): () => void {
  element.hass = hass();
  const timer = window.setInterval(() => {
    const next = hass();
    if (next && next !== element.hass) element.hass = next;
  }, 30_000);
  return () => window.clearInterval(timer);
}

export function sleep(options: ScreensaverOptions): () => void {
  const saver = document.createElement('fluvy-wall-screensaver') as FluvyWallScreensaver;
  saver.clock = options.clock;
  saver.size = options.clockSize ?? 'standard';
  saver.dim = options.dim;
  saver.weather = options.weather;
  saver.onWake = options.onWake;
  saver.toggleAttribute('preview', options.preview === true);
  const unfollow = follow(saver, options.hass);
  (options.host ?? wallHost(document)).append(saver);
  return () => {
    unfollow();
    void saver.close();
  };
}

export function corner(options: CornerOptions): () => void {
  const element = document.createElement('fluvy-wall-corner') as FluvyWallCorner;
  element.mode = options.mode;
  element.onLeave = options.onLeave;
  const unfollow = follow(element, options.hass);
  wallHost(document).append(element);
  return () => {
    unfollow();
    element.remove();
  };
}

export function notice(options: NoticeOptions): () => void {
  const toast = document.createElement('fluvy-wall-toast') as FluvyWallToast;
  toast.kind = options.kind;
  toast.onAction = options.onAction;
  const unfollow = follow(toast, options.hass);
  wallHost(document).append(toast);
  return () => {
    unfollow();
    toast.remove();
  };
}

export function back(options: BackOptions): BackHandle {
  const element = document.createElement('fluvy-wall-back') as FluvyWallBack;
  element.title = options.title;
  element.onBack = options.onBack;
  const unfollow = follow(element, options.hass);
  wallHost(document).append(element);
  return {
    update: (title) => {
      element.title = title;
    },
    remove: () => {
      unfollow();
      element.remove();
    },
  };
}

export const ui: WallUi = { sleep, corner, notice, back };
