/**
 * fluvy — the single module Home Assistant loads as a Lovelace resource (and, through the loader, at
 * start on every page). Importing the cards defines every custom element synchronously and registers
 * them in the card picker.
 */
import {
  buildOf,
  registerIcons,
  setFontFolder,
  standDown,
  startLook,
  startShell,
  startWall,
  startZoom,
  watchUpdates,
  type LookHandle,
  type ShellHandle,
  type UpdateWatch,
} from '@fluvy/core';
import { panelOnDemand, takeOverActivity, takeOverHistory } from '@fluvy/cards';

declare const __FLUVY_VERSION__: string;

const version = __FLUVY_VERSION__;

/**
 * Two builds can meet in one page (a tab left open through an update loads the new resource, or the settings panel's
 * new module, beside the old build). Custom elements cannot be redefined, so the first build keeps the cards; the
 * shell and the icon set start once too, and `window.__fluvy` tells which build runs (`__fluvy.shell.report()`
 * lists what the shell styles and whether Home Assistant still draws it). The old build's files are gone from the
 * server by then: the new one asks the running one to look (`__fluvy.update`, `core/src/update.ts`), or, where it
 * runs a build from before 1.17, tells the person itself that the page needs a reload.
 */
const host = window as unknown as {
  __fluvy?: {
    version: string;
    shell: ShellHandle | undefined;
    look: LookHandle | undefined;
    /** Whether our Activity page took Home Assistant's (`null` until the page's element is defined). */
    activity: boolean | null;
    /** The watch for another build on the server (1.17 on). */
    update?: UpdateWatch;
  };
};
const badge = (text: string): void =>
  console.info(
    `%c Fluvy %c ${text} `,
    'background:#856529;color:#fff;border-radius:4px 0 0 4px;font-weight:600',
    'background:#f1e7d2;color:#4a3a14;border-radius:0 4px 4px 0',
  );
// the folder this build is served from (`/fluvy-frontend/<version>-<stamp>/`): the fonts sit in it, beside this file
const here: string = import.meta.url;
if (host.__fluvy) {
  badge(`v${host.__fluvy.version} already running; this copy (v${version}) stands down`);
  standDown(host.__fluvy, buildOf(here));
} else {
  registerIcons();
  // the code that loads the fonts lives in `chunks/`, and the look registers them once Fluvy is in use on the page (a
  // page on another theme fetches none)
  setFontFolder(new URL('fonts/', here).href);
  const look = startLook();
  // the size this device reads its dashboards at (`?zoom=` remembered, the loader's early variable taken over)
  startZoom();
  const fluvy = {
    version,
    shell: startShell(),
    look,
    // the wall: its controller and its pieces load only on a device that is one
    wall: startWall({ look, ui: () => import('@fluvy/cards/wall') }),
    activity: null as boolean | null,
    history: null as boolean | null,
    update: watchUpdates(buildOf(here)),
  };
  host.__fluvy = fluvy;
  panelOnDemand();
  void takeOverActivity().then((done) => {
    fluvy.activity = done;
  });
  void takeOverHistory().then((done) => {
    fluvy.history = done;
  });
  badge(`v${version}`);
}

export { version };
