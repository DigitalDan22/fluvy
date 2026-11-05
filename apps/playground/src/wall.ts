import {
  startWall,
  WALL_DEFAULTS,
  writeDevice,
  type HomeAssistant,
  type WallFacade,
  type WallSettings,
} from '@fluvy/core';
import { isPaletteName } from '@fluvy/tokens/runtime';
import { createMemoryLook } from './look-memory.js';

/*
 * The wall outside Home Assistant, `?wall=1` with a sheet's frames as the dashboard: the real controller on a memory
 * look, this page made a wall (`fluvy:device`) on a dashboard the mock's panels list. `moment=` puts it where a
 * screenshot wants it: awake (the corner alone), asleep (the screensaver), dim (the screensaver in black),
 * paused (the toast), corner (the corner mid-hold), left (out of the wall, the notice with the way back), night
 * (dark with the night veil). `exit=hold` chooses the hidden hold; the button is the default.
 */
export type WallMoment = 'awake' | 'asleep' | 'dim' | 'paused' | 'corner' | 'left' | 'night';

export const WALL_PANELS: HomeAssistant['panels'] = {
  lovelace: { component_name: 'lovelace', url_path: 'lovelace', title: null, icon: null },
  'fluvy-wall': {
    component_name: 'lovelace',
    url_path: 'fluvy-wall',
    title: 'Fluvy · Wall',
    icon: 'fluvy:frame',
  },
  fluvy: { component_name: 'custom', url_path: 'fluvy', title: 'Fluvy', icon: 'fluvy:sun' },
};

const until = (test: () => boolean, ms = 4000): Promise<void> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const look = (): void => {
      if (test()) resolve();
      else if (Date.now() - started > ms) reject(new Error('the wall did not come'));
      else setTimeout(look, 20);
    };
    look();
  });

/** The wall's settings a page asks for: `after=` minutes, `bg=wall`, and what the moment needs. */
export function wallSettingsFor(
  params: URLSearchParams,
  moment: WallMoment,
): Partial<WallSettings> {
  const after = Number(params.get('after') ?? 10) as WallSettings['after'];
  return {
    after,
    background: params.get('bg') === 'wall' ? 'wall' : 'plain',
    // a pause and a hold in progress are the hold's moments
    exit:
      params.get('exit') === 'hold' || moment === 'corner' || moment === 'paused'
        ? 'hold'
        : 'button',
    subview: params.get('wallsub') === 'header' ? 'header' : 'button',
    ...(moment === 'dim' ? { dim: true } : {}),
    ...(moment === 'night' ? { theme: 'dark' as const, nightDim: 40 as const } : {}),
  };
}

export async function mountWall(
  doc: Document,
  hass: () => HomeAssistant,
  dark: boolean,
  moment: WallMoment,
  wall: Partial<WallSettings>,
): Promise<WallFacade> {
  writeDevice({ wall: true });
  sessionStorage.removeItem('fluvy:wall-paused');
  // the page is the wall dashboard: the controller reads the dashboard off the address
  if (!location.pathname.startsWith('/fluvy-wall'))
    history.replaceState(null, '', `/fluvy-wall/wall${location.search}`);
  const look = createMemoryLook(doc, dark);
  const params = new URLSearchParams(location.search);
  // the playground's canvas stands for Home Assistant's view: on a wall it wears the wall's background, as the view's
  // background does (a dashboard's mock draws that one itself: `hui-view-background`)
  if (!params.has('dashboard'))
    doc.body.style.background = 'var(--fluvy-wall-bg, var(--fluvy-page))';
  // `?palette=` as the rest of the playground reads it: the wall wears the house's look, so the house wears it
  const palette = params.get('palette');
  await look.handle.store.saveHouse({
    scope: 'everywhere',
    wall: { ...WALL_DEFAULTS, ...wall },
    ...(isPaletteName(palette) ? { palette } : {}),
  });
  const facade = startWall({
    look: look.handle,
    ui: () => import('@fluvy/cards/wall'),
    hass: () => ({ ...hass(), panels: WALL_PANELS }) as HomeAssistant,
  });
  await until(() => facade.loaded());
  await until(() => facade.on());
  await new Promise((resolve) => setTimeout(resolve, 50)); // the pieces arrive with their own file
  switch (moment) {
    case 'asleep':
    case 'dim':
      facade.sleep();
      break;
    case 'paused':
      facade.pause();
      break;
    case 'left':
      facade.exit();
      break;
    case 'corner': {
      await until(() => Boolean(cornerIn(doc)));
      const corner = cornerIn(doc) as (Element & { pressing: boolean }) | undefined;
      if (corner) corner.pressing = true;
      break;
    }
    default:
      break;
  }
  (window as { fluvyWall?: WallFacade }).fluvyWall = facade;
  return facade;
}

const cornerIn = (doc: Document): Element | undefined => {
  const walk = (root: ParentNode): Element | undefined => {
    for (const element of root.querySelectorAll('*')) {
      if (element.localName === 'fluvy-wall-corner') return element;
      if (element.shadowRoot) {
        const found = walk(element.shadowRoot);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(doc);
};
