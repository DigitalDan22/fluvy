import {
  isActive,
  isUsable,
  localize,
  stateText,
  type EntityView,
  type HomeAssistant,
} from '@fluvy/core';
import { stateIcon, type GlyphName, type IconRef, type Tone } from '@fluvy/ui';

/**
 * What opens and shuts, shut and open, by its device class: a cover's (`door`, `gate`, `garage`, `window`) or an
 * opening sensor's (`door`, `opening`, `garage_door`, `window`).
 */
const OPENINGS: Readonly<Record<string, readonly [shut: GlyphName, open: GlyphName]>> = {
  door: ['door', 'doorOpen'],
  opening: ['door', 'doorOpen'],
  gate: ['gate', 'gateOpen'],
  garage: ['garage', 'garageOpen'],
  garage_door: ['garage', 'garageOpen'],
  window: ['window', 'windowOpen'],
};

/** An opening as it stands (open while a cover is open or opening, or its sensor on); undefined for another class. */
const opening = (view: EntityView): GlyphName | undefined =>
  OPENINGS[view.deviceClass]?.[['open', 'opening', 'on'].includes(view.state) ? 1 : 0];

/**
 * Default glyph for an entity: device class first, then domain. A config `icon` always wins. What opens and shuts
 * (a door, a gate, a garage, a window) is drawn open or shut as it stands; what a sensor says by its fill (motion,
 * moisture, smoke) keeps one glyph. An entity that is not there has no kind to borrow a glyph from: the `ban` glyph
 * every card draws for what cannot be read.
 */
export function glyphFor(view: EntityView): GlyphName {
  if (view.status === 'missing') return 'ban';
  const dc = view.deviceClass;
  switch (view.domain) {
    case 'light':
      return 'bulb';
    case 'switch':
    case 'input_boolean':
      return dc === 'outlet' ? 'plug' : 'power';
    case 'cover':
      // a shutter, a blind, a curtain, an awning, a shade: the blinds
      return opening(view) ?? (dc === 'damper' ? 'fan' : 'blinds');
    case 'valve':
      return 'drop';
    case 'climate':
      return 'thermo';
    case 'water_heater':
      return 'heater';
    case 'humidifier':
      return 'humid';
    case 'fan':
      return 'fan';
    case 'media_player':
      return 'speaker';
    case 'vacuum':
      return 'vacuum';
    case 'lawn_mower':
      return 'leaf';
    case 'lock':
      return view.state === 'locked' ? 'lock' : 'unlock';
    case 'alarm_control_panel':
      return 'shield';
    case 'camera':
      return 'camera';
    case 'person':
    case 'device_tracker':
      return 'person';
    case 'weather':
      return 'cloud';
    case 'scene':
      return 'moon';
    case 'script':
      return 'script';
    case 'automation':
      return 'auto';
    case 'button':
    case 'input_button':
      return 'bolt';
    case 'timer':
      return 'timer';
    case 'counter':
      return 'counter';
    case 'todo':
      return 'list';
    case 'calendar':
      return 'calendar';
    case 'update':
      return 'update';
    case 'sun':
      return 'sun';
    case 'input_number':
    case 'number':
      return 'sliders';
    case 'input_select':
    case 'select':
      return 'list';
    case 'input_text':
    case 'text':
      return 'text';
    case 'input_datetime':
    case 'date':
    case 'time':
    case 'datetime':
      return 'clock';
    case 'binary_sensor':
      if (dc === 'motion' || dc === 'occupancy' || dc === 'presence') return 'motion';
      if (dc === 'moisture') return 'drop';
      if (dc === 'battery') return 'battery';
      if (dc === 'connectivity') return 'wifi';
      if (dc === 'problem' || dc === 'safety' || dc === 'smoke' || dc === 'gas') return 'warn';
      if (dc === 'lock') return 'lock';
      return opening(view) ?? 'check';
    case 'sensor':
      if (dc === 'temperature') return 'thermo';
      if (dc === 'humidity') return 'humid';
      if (dc === 'moisture') return 'leaf';
      if (dc === 'battery') return 'battery';
      if (dc === 'power' || dc === 'energy' || dc === 'current' || dc === 'voltage') return 'bolt';
      if (dc === 'monetary') return 'counter';
      if (dc === 'illuminance') return 'sun';
      if (dc === 'water' || dc === 'volume' || dc === 'volume_flow_rate') return 'drop';
      if (dc === 'signal_strength') return 'signal';
      if (dc === 'timestamp' || dc === 'duration') return 'clock';
      return 'trendUp';
    default:
      return 'dots';
  }
}

/** The glyph a measure wears, from what it measures: a chart's head has no entity of its own (an opening shut). */
export const glyphForClass = (domain: string, deviceClass: string): GlyphName =>
  glyphFor({ domain, deviceClass, state: '' } as EntityView);

/**
 * Whether Fluvy's glyph is the one to draw for the entity's kind. It has none for a domain it does not know (`dots`),
 * nor for a sensor or a binary sensor of a class it does not draw, whose icon Home Assistant knows by the class (a
 * pm2.5, a pressure, a vibration). For one of no class it has its stand-in (`trendUp`, `check`), which gives way only
 * where Home Assistant knows better: an icon its integration gives it, or one it may declare by its translation key.
 */
export function glyphKnown(view: EntityView): boolean {
  const glyph = glyphFor(view);
  if (glyph === 'dots') return false;
  if (glyph !== 'trendUp' && glyph !== 'check') return true;
  return !view.deviceClass && !view.ownIcon && !view.translationKey;
}

/**
 * The icon an entity's circle draws (1.10): the card's own `icon`; the one the person set in Home Assistant; Fluvy's
 * glyph for its kind, open or shut as it stands (`glyphKnown`); its integration's; Home Assistant's own for its state
 * (its device class, its state, its integration's icon translations); `dots`. An entity that is not there has no icon
 * of its own and no kind: the `ban` glyph, unless the card names one.
 */
export function iconOf(view: EntityView, own?: string): IconRef | string {
  if (own) return own;
  if (view.registryIcon) return view.registryIcon;
  if (glyphKnown(view)) return glyphFor(view);
  if (view.ownIcon) return view.ownIcon;
  return view.stateObj ? stateIcon(view.id, view.state) : 'dots';
}

/**
 * The state of an entity that cannot be read, as one word for a value slot: "Unavailable", "Unknown", or "Not found"
 * for an entity that is not there (the empty panel says "Entity not found"; a row's value has room for less).
 */
export function stateWord(hass: HomeAssistant | undefined, view: EntityView): string {
  return view.status === 'missing' ? localize(hass, 'state.not_found') : stateText(hass, view);
}

/** Covers that are a way in, not a window's shade: a garage door, a gate, a door (their classes). */
export const GATEWAYS: ReadonlySet<string> = new Set(['garage', 'gate', 'door']);

/** The tone an entity fills with when it is active. Off, unavailable and events stay neutral. */
export function toneFor(view: EntityView): Tone {
  switch (view.domain) {
    case 'light':
      return 'light';
    case 'climate': {
      const action = view.attr<string>('hvac_action');
      if (action === 'cooling' || view.state === 'cool') return 'cool';
      if (view.state === 'dry') return 'dry';
      if (view.state === 'fan_only') return 'fan';
      return 'heat';
    }
    case 'water_heater':
      return 'heat';
    case 'humidifier':
      return 'water';
    case 'fan':
      return 'fan';
    case 'media_player':
      return 'media';
    case 'valve':
      return 'water';
    case 'binary_sensor': {
      const dc = view.deviceClass;
      return dc === 'moisture' ||
        dc === 'problem' ||
        dc === 'safety' ||
        dc === 'smoke' ||
        dc === 'gas' ||
        dc === 'door' ||
        dc === 'window' ||
        dc === 'opening' ||
        dc === 'garage_door'
        ? 'warning'
        : 'accent';
    }
    default:
      return 'accent';
  }
}

/** Tone to draw right now: the active tone, neutral when off, the dashed "off" skin when unusable. */
export function currentTone(view: EntityView, tone: Tone = toneFor(view)): Tone {
  if (view.status === 'unavailable' || view.status === 'missing') return 'off';
  return isActive(view) ? tone : 'neutral';
}

/** How a surface draws an entity's state, the same on every card. */
export interface StateSkin {
  /** The card may draw its state and offer its controls. */
  readonly usable: boolean;
  /** The tone to draw with now (`currentTone`). */
  readonly tone: Tone;
  /** What stands in for a state that cannot be shown ("—"); undefined when the card formats its own. */
  readonly value: string | undefined;
  /** Classes of the surface: the dashed off skin when the entity cannot be reached, nothing otherwise. */
  readonly className: string;
}

/**
 * One rule for the states no card may assume away: `unknown` is a live surface (the entity is there, its value is
 * not) in the neutral tone showing "—"; `unavailable` and `missing` wear the dashed off skin and show "—".
 */
export function stateSkin(view: EntityView, tone: Tone = toneFor(view)): StateSkin {
  const usable = isUsable(view);
  return {
    usable,
    tone: currentTone(view, tone),
    value: view.status === 'ok' ? undefined : '—',
    className: usable ? '' : 'is-unavailable is-off',
  };
}
