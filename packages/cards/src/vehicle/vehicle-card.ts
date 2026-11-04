import {
  formatNumber,
  relativeTime,
  stateText,
  strings,
  type ActionConfig,
  type EntityView,
  type FluvyCardConfig,
  type HaFormSchemaItem,
  type HomeAssistant,
  type MessageKey,
  type LovelaceConfigForm,
  type LovelaceGridOptions,
} from '@fluvy/core';
import {
  addGlyphs,
  clickPress,
  glyph,
  head,
  holdKey,
  icon,
  listRow,
  pressCover,
  preventMenu,
  startPress,
  type PressTarget,
  type Tone,
} from '@fluvy/ui';
import { energyStyles } from '@fluvy/ui/styles/energy';
import { css, html, nothing, svg, type CSSResultGroup, type TemplateResult } from 'lit';

import { HeadFit, ROW_NAME_MIN } from '../energy/head.js';
import { MARK_LABEL, markedRuler } from '../energy/marked-ruler.js';
import { Card, type BaseKey, type HeadConfig } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { configKeys } from '../shared/config.js';
import { spanText } from '../shared/duration.js';
import { fitLine, type Segment } from '../shared/fit.js';
import {
  accentField,
  actionField,
  actionFields,
  boolField,
  choiceField,
  colourFields,
  editorLabels,
  editorWord,
  entityField,
  fieldRow,
  nameIconFields,
  numberField,
  onlyWhen,
  selectField,
  showIconField,
  textField,
  unitChoices,
} from '../shared/form.js';
import { durationSeconds, when } from '../shared/job-time.js';
import { BrokenPictures, imageEntity, imageOf } from '../shared/picture.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import { Ticker, MINUTE } from '../shared/ticker.js';
import { valueRow } from '../shared/value-row.js';
import {
  VEHICLE_VARIANTS,
  pictureAt,
  vehicleHeight,
  vehicleVariant,
  type VehicleVariant,
} from '../vehicle-family.js';
import { VEHICLE_GLYPHS } from './glyphs.js';
import {
  VEHICLE_PLATFORMS,
  VEHICLE_ROLES,
  vehicleDevice,
  vehicleDevices,
  vehicleEntities,
  type NamedRole,
  type VehicleEntities,
  type VehicleRole,
  type Wheel,
} from './roles.js';
import {
  activityOf,
  cabinOf,
  chargeOf,
  convertDistance,
  lineOf,
  lowRange,
  plugged,
  pluggedWord,
  type Activity,
  type Cabin,
  type Charge,
  type Opening,
} from './state.js';

addGlyphs(VEHICLE_GLYPHS);

const s = strings('vehicle');

/* ---------- the config ---------- */

/** The round controls, each where the car has what it takes. */
export type VehicleControl =
  | 'lock'
  | 'climate'
  | 'charging'
  | 'charge_port'
  | 'trunk'
  | 'frunk'
  | 'windows'
  | 'doors'
  | 'sentry';
export const VEHICLE_CONTROLS: readonly VehicleControl[] = [
  'lock',
  'climate',
  'charging',
  'charge_port',
  'trunk',
  'frunk',
  'windows',
  'doors',
  'sentry',
];
/** The controls a card shows where it names none: the ones the car has, in this order (its doors and port on request). */
const DEFAULT_CONTROLS: readonly VehicleControl[] = [
  'lock',
  'climate',
  'charging',
  'trunk',
  'windows',
  'frunk',
  'sentry',
];

/** The rows under the controls, each a reading of the car's. */
export type VehicleRow =
  | 'location'
  | 'odometer'
  | 'inside'
  | 'outside'
  | 'charge_power'
  | 'charge_rate'
  | 'charge_limit'
  | 'time_to_full'
  | 'software'
  | 'speed'
  | 'fuel';
export const VEHICLE_ROWS: readonly VehicleRow[] = [
  'location',
  'odometer',
  'inside',
  'outside',
  'charge_power',
  'charge_rate',
  'charge_limit',
  'time_to_full',
  'software',
  'speed',
  'fuel',
];
const DEFAULT_ROWS: readonly VehicleRow[] = ['location', 'odometer'];

/** A control as a list names it: which, and what the card may change of it. */
export interface ControlEntry {
  readonly control: VehicleControl;
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  /** Whether a tap that acts on the car asks first (by default: unlocking, opening, venting, stopping a charge). */
  readonly confirm?: boolean;
  readonly tap_action?: ActionConfig;
  readonly hold_action?: ActionConfig;
}

/** A row as a list names it: a reading of the car's, or any entity. */
export interface RowEntry {
  readonly row?: VehicleRow;
  readonly entity?: string;
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly tap_action?: ActionConfig;
  readonly hold_action?: ActionConfig;
}

export interface VehicleCardConfig extends FluvyCardConfig, HeadConfig {
  /** The car's device: everything it has is found on it. */
  device?: string;
  variant?: VehicleVariant;
  /** Whether its entities are found on its device (the default); off, only `roles` play. */
  scan?: boolean;
  /** Entities named by hand for a part the card does not find, or plays otherwise: `{ role, entity }`. */
  roles?: readonly NamedRole[];
  /** The battery on its ruler (the default) or as a ring. */
  hero?: 'ruler' | 'ring';
  /** A picture of the car: an address, an entity whose picture it is, or `auto` (the integration's own). */
  image?: string;
  image_position?: 'hero' | 'head';
  show_range?: boolean;
  show_limit?: boolean;
  /** The line under the battery: when it is full, why it is not charging, a low range, a cold cabin. */
  show_status?: boolean;
  show_controls?: boolean;
  controls?: ReadonlyArray<VehicleControl | ControlEntry>;
  show_rows?: boolean;
  rows?: ReadonlyArray<VehicleRow | RowEntry>;
  show_tyres?: boolean;
  /** Under this range (in the range's unit) it is low; without it, a charge of 20 % or less is. */
  low_range?: number;
  /** Minutes after which a car that has said nothing says when it last did ("Updated 2 h ago"). */
  stale_after?: number;
  range_unit?: 'auto' | 'km' | 'mi';
  /** The range's decimals (0–3), or `auto`; the editor writes them as words ("1"). */
  range_decimals?: number | string;
  power_unit?: 'auto' | 'W' | 'kW';
  power_decimals?: number | string;
  /** What a tap and a still press on the battery do (its details by default). */
  hero_tap_action?: ActionConfig;
  hero_hold_action?: ActionConfig;
  /** Test hook: an ISO instant the card takes for "now". */
  _now?: string;
}

/* ---------- what the card draws with ---------- */

/** A control's cell: its round, its word under it, what a tap does. */
interface ControlView {
  readonly key: VehicleControl;
  readonly name: string;
  readonly glyph: string;
  readonly word: string;
  /** Every word it may say (its widest decides the row): the row never moves when a state changes. */
  readonly words: readonly string[];
  readonly tone: Tone;
  /** The word in a tone's ink: an open boot's warning, a cold cabin's cool. */
  readonly ink: '' | 'warning' | 'cool' | 'heat';
  readonly entity: string | undefined;
  /** What a tap does on the car, where it acts; undefined opens its details. */
  readonly act: ActionConfig | undefined;
  readonly disabled: boolean;
  /** Why it cannot act now, for a reader (`title`). */
  readonly why: string;
  readonly accent: string | undefined;
  readonly entry: ControlEntry;
}

/** What `renderCard` reads once and every part draws. */
interface Reading {
  readonly name: string;
  readonly level: number | null;
  readonly range: { readonly value: string; readonly unit: string; readonly number: number | null };
  readonly limit: number | null;
  readonly charge: Charge | null;
  /** The cable is said to be in (its sensor, or a charge that needs one): "Plugged in" only then. */
  readonly plugged: boolean;
  readonly activity: Activity;
  readonly low: boolean;
  /** What stands open (a window first, then a door, the boot, the front boot), null where all is shut. */
  readonly open: Opening | null;
  readonly cabin: Cabin;
  /** "Updated 2 h ago" while the car says nothing, '' otherwise. */
  readonly stale: string;
  /** Where it is ("Home", a zone, "Away"), '' where it has no tracker. */
  readonly place: string;
  /** Where it is in words, away from home (Kia's and Hyundai's address), '' otherwise. */
  readonly address: string;
  /** The car out of reach: every part at rest in the off skin, at its size (1.9). */
  readonly unavailable: boolean;
  readonly tone: Tone;
  readonly badge: { readonly text: string; readonly tone: Tone };
}

/** The line under the battery: its parts, and the ink it is said in. */
interface Line {
  readonly segments: readonly Segment[];
  readonly ink: '' | 'warning' | 'ok' | 'cool' | 'heat';
}

/** A ring's radius, its ticks' length and its box, as the appliances' ring draws them. */
const RING_MAX = 88;
const RING_MIN = 56;
const RING_TICK = 12;
/** The strip's ring round its circle (the printer's): 2 px at r 26.5, 3.5 clear of the 44 circle. */
const STRIP_RADIUS = 26.5;
/**
 * The least a control's cell is: its 44 round and 6 a side. The cells touch (four of 80 at a 360 column, five of 70 on
 * a 392 card, where their words hold); a word keeps 2 of its cell clear, so two words side by side never touch.
 */
const CELL_MIN = 56;
const WORD_CLEAR = 2;
/** The tyres' car from above: its box in the panel. */
const CAR_WIDTH = 40;
/** Minutes without a word from the car after which the card says when it last spoke (`stale_after`). */
const STALE_AFTER = 30;

/** A unit a figure reads in: automatic (the sensor's own), or one of `units`. */
const unitField = (name: string, units: readonly string[]): HaFormSchemaItem => ({
  name,
  selector: { select: { mode: 'dropdown', options: unitChoices(units) } },
});

/** The words of a control's state, for the reader: "Lock · Locked". */
const said = (view: Pick<ControlView, 'name' | 'word'>): string =>
  view.word && view.word !== view.name ? `${view.name} · ${view.word}` : view.name;

/** A list's entry as an object: a bare key is `{ control }` / `{ row }`. */
const controlEntry = (raw: VehicleControl | ControlEntry): ControlEntry =>
  typeof raw === 'string' ? { control: raw } : raw;
const rowEntry = (raw: VehicleRow | RowEntry): RowEntry =>
  typeof raw === 'string' ? { row: raw } : raw;

/** The editor's choices of a list's key, each by its word. */
const keyPicker = <K extends string>(
  name: string,
  keys: readonly K[],
  word: (key: K) => MessageKey,
): HaFormSchemaItem => ({
  name,
  selector: {
    select: {
      mode: 'dropdown',
      options: keys.map((value) => ({ value, label: editorWord(word(value)) })),
    },
  },
});
/** A control's word: its name ("Charging" for the charge's). */
const controlWord = (key: VehicleControl): MessageKey =>
  key === 'lock' ? 'lock.lock' : key === 'charging' ? 'vehicle.charge' : `vehicle.${key}`;
const controlPicker = (): HaFormSchemaItem => keyPicker('control', VEHICLE_CONTROLS, controlWord);
const rowPicker = (): HaFormSchemaItem =>
  keyPicker('row', VEHICLE_ROWS, (key): MessageKey => `vehicle.${key}`);
/** A role's word in the editor: its control's or its row's where it has one, else its own. */
const ROLE_WORDS: Readonly<Record<VehicleRole, MessageKey>> = {
  battery: 'vehicle.battery',
  range: 'vehicle.range',
  charging: 'vehicle.role.charging',
  plugged: 'vehicle.role.plugged',
  charge_power: 'vehicle.charge_power',
  charge_rate: 'vehicle.charge_rate',
  time_to_full: 'vehicle.time_to_full',
  charge_limit: 'vehicle.charge_limit',
  charge_switch: 'vehicle.role.charge_switch',
  charge_start: 'vehicle.role.charge_start',
  charge_stop: 'vehicle.role.charge_stop',
  charge_port: 'vehicle.charge_port',
  climate: 'vehicle.climate',
  climate_switch: 'vehicle.role.climate_switch',
  climate_start: 'vehicle.role.climate_start',
  climate_stop: 'vehicle.role.climate_stop',
  climate_running: 'vehicle.role.climate_running',
  inside: 'vehicle.inside',
  outside: 'vehicle.outside',
  lock: 'lock.lock',
  trunk: 'vehicle.trunk',
  frunk: 'vehicle.frunk',
  windows: 'vehicle.windows',
  sentry: 'vehicle.sentry',
  odometer: 'vehicle.odometer',
  location: 'vehicle.location',
  address: 'vehicle.role.address',
  software: 'vehicle.software',
  state: 'vehicle.role.state',
  shift: 'vehicle.role.shift',
  speed: 'vehicle.speed',
  moving: 'vehicle.role.moving',
  updated: 'vehicle.role.updated',
  fuel: 'vehicle.fuel',
  tyre_fl: 'vehicle.tyre_fl',
  tyre_fr: 'vehicle.tyre_fr',
  tyre_rl: 'vehicle.tyre_rl',
  tyre_rr: 'vehicle.tyre_rr',
};
const rolePicker = (): HaFormSchemaItem =>
  keyPicker('role', VEHICLE_ROLES, (role) => ROLE_WORDS[role]);

/** The car from above (the tyres' panel): its body, its glass, its four wheels — a wheel with a warning in its ink. */
function carFromAbove(low: Readonly<Partial<Record<Wheel, boolean>>>): TemplateResult {
  const wheel = (x: number, y: number, key: Wheel) =>
    svg`<rect class=${low[key] ? 'is-low' : ''} x=${x} y=${y} width="5" height="13" rx="2.5" />`;
  return html`<svg class="vh-car" viewBox="0 0 40 72" aria-hidden="true">
    <rect x="7.5" y="3" width="25" height="66" rx="11" />
    <path d="M11 22.5c5.5-3 12.5-3 18 0" />
    <path d="M11.5 52c5.5 2.5 11.5 2.5 17 0" />
    <path d="M11 22.5v29.5" />
    <path d="M29 22.5v29.5" />
    ${wheel(1.5, 12, 'fl')}${wheel(33.5, 12, 'fr')}${wheel(1.5, 47, 'rl')}${wheel(33.5, 47, 'rr')}
  </svg>`;
}

/**
 * An electric car: its battery on the charge cards' ruler (or as a ring) with its range and its charge limit marked,
 * when it will be full while it charges — the clock time and how long — a range that runs low, a cabin too cold or too
 * hot to get into, how long since it last said anything; where it is and how far it has gone; its lock, climate,
 * charging, boot, front boot, windows and sentry as one row of rounds, each acting on the car (and asking first where
 * that matters) or opening what it reads; its tyres from above. Given its device (or any of its entities) it finds the
 * rest: Tesla's three integrations, Renault, Volvo and Škoda, and Kia and Hyundai, MySkoda, Polestar, MG, Volkswagen's
 * two and BMW's CarData from HACS, by their own words; any other by what its entities are, and by `roles`.
 */
export class FluvyVehicleCard extends Card<VehicleCardConfig> {
  /** The card's height at a 360 column, for the automatic dashboard's columns. */
  static override layoutHeight(config: VehicleCardConfig): number {
    return vehicleHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    energyStyles,
    css`
      .vh-card {
        position: relative;
        width: 100%;
      }
      /* the car's picture over its battery: 2:1 across the column, the whole car on the card (a picture with no ground
         of its own floats on it); none found, the plate keeps its place with the car's glyph */
      .vh-picture {
        position: relative;
        display: grid;
        place-items: center;
        margin-top: 16px;
        aspect-ratio: 2 / 1;
        border-radius: var(--fluvy-radius-lg);
        cursor: pointer;
      }
      .vh-picture > img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .vh-picture.is-empty {
        background: var(--fluvy-page);
        color: var(--fluvy-text-secondary);
      }
      .vh-picture.is-empty svg {
        width: 32px;
        height: 32px;
      }
      /* the picture in the head, in the circle's place: 64 × 44, the whole car */
      .vh-face {
        display: grid;
        flex: 0 0 64px;
        place-items: center;
        width: 64px;
        height: 44px;
        border-radius: var(--fluvy-radius-control);
        color: var(--fluvy-text-secondary);
      }
      .vh-face > img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .vh-face.is-empty {
        background: var(--fluvy-page);
      }
      .vh-face svg {
        width: 20px;
        height: 20px;
      }
      .is-unavailable .vh-picture > img,
      .is-unavailable .vh-face > img {
        filter: grayscale(1);
        opacity: 0.5;
      }
      /* the battery: its value row and its ruler, one tap (its details, or the card's own) laid over them */
      .vh-hero {
        position: relative;
      }
      .vh-hero.is-low .ef-top__side .fv-readout__value {
        color: var(--fluvy-warning);
      }
      .vh-dial {
        display: flex;
        justify-content: center;
        margin-top: 16px;
      }
      /* the line under the battery: one line, its parts fitted to it */
      .vh-line {
        height: 20px;
        margin-top: 8px;
        overflow: hidden;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .vh-line.is-warning {
        color: var(--fluvy-warning);
      }
      .vh-line.is-ok {
        color: var(--fluvy-success);
      }
      .vh-line.is-cool {
        color: var(--fluvy-state-climate-cool);
      }
      .vh-line.is-heat {
        color: var(--fluvy-state-climate-heat);
      }
      /* the compact card's battery: a 12 bar, its share in the card's colour, the percentage at its end; the limit a
         2 px mark across it */
      .vh-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 20px;
        margin-top: 16px;
      }
      .vh-bar__track {
        position: relative;
        flex: 1 1 auto;
        height: 12px;
        border-radius: 6px;
        background: var(--fluvy-page);
        overflow: hidden;
      }
      .vh-bar__fill {
        display: block;
        height: 100%;
        border-radius: 6px;
        background: var(--tone-ink, var(--fluvy-accent));
        transition: width var(--fv-slow) var(--fv-ease);
      }
      .vh-bar__mark {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        margin-left: -1px;
        background: var(--fluvy-text);
        opacity: 0.6;
      }
      .vh-bar__value {
        flex: 0 0 auto;
        min-width: var(--vh-pct, 40px);
        font-size: 15px;
        font-weight: 600;
        line-height: 20px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .vh-bar + .vh-line {
        margin-top: 8px;
      }
      /* the controls: equal cells across the column, touching, each a round and its word under it — one button; a
         shorter last row centred under the others */
      .vh-controls {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        row-gap: 12px;
        margin-top: 16px;
      }
      .vh-control {
        all: unset;
        position: relative;
        display: flex;
        flex: 0 0 calc(100% / var(--vh-cols, 5));
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 0;
        box-sizing: border-box;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        -webkit-user-select: none;
      }
      .vh-control .fv-ico {
        transition:
          scale var(--fv-fast) var(--fv-ease),
          background-color var(--fv-slow) var(--fv-ease),
          color var(--fv-slow) var(--fv-ease);
      }
      .vh-control:active .fv-ico {
        scale: 0.94;
      }
      .vh-control:focus-visible {
        outline: none;
      }
      .vh-control:focus-visible .fv-ico {
        outline: 2px solid var(--fluvy-accent);
        outline-offset: 2px;
      }
      .vh-control[disabled] {
        cursor: default;
        pointer-events: none;
      }
      .vh-control[aria-disabled='true'] .fv-ico {
        opacity: 0.4;
      }
      .vh-control__word {
        max-width: 100%;
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .vh-control__word.is-warning {
        color: var(--fluvy-warning);
      }
      .vh-control__word.is-cool {
        color: var(--fluvy-state-climate-cool);
      }
      .vh-control__word.is-heat {
        color: var(--fluvy-state-climate-heat);
      }
      @media (hover: hover) {
        .vh-control:hover .fv-ico--neutral {
          background: var(--fluvy-page-alt);
          color: var(--fluvy-text);
        }
      }
      /* the compact card's rounds: the words are their titles */
      .vh-controls--bare .vh-control {
        gap: 0;
      }
      .vh-rows {
        margin-top: 16px;
      }
      /* a column too narrow for a row's name and its value side by side: the value under the name, in the row's 48 */
      .vh-rows .fv-row--stack {
        flex-wrap: wrap;
        align-content: center;
        row-gap: 4px;
      }
      .vh-rows .fv-row--stack > .fv-row__text {
        flex-basis: 100%;
      }
      .vh-rows .fv-row--stack > .fv-row__value {
        top: 0;
      }
      /* the tyres from above: the car in the middle of a soft panel, each tyre's pressure at its wheel */
      .vh-tyres {
        position: relative;
        display: grid;
        grid-template-columns: 1fr ${CAR_WIDTH}px 1fr;
        grid-template-rows: 36px 36px;
        align-items: center;
        column-gap: 12px;
        row-gap: 0;
        height: 96px;
        margin-top: 16px;
        padding: 12px 16px;
        box-sizing: border-box;
        border-radius: var(--fluvy-radius-lg);
        background: var(--fluvy-inset, var(--fluvy-page));
        cursor: pointer;
      }
      .vh-tyres.is-bare {
        grid-template-columns: 1fr 1fr;
      }
      .vh-car {
        grid-row: 1 / 3;
        grid-column: 2;
        width: ${CAR_WIDTH}px;
        height: 72px;
        fill: none;
        stroke: var(--fluvy-text-secondary);
        stroke-width: 1.75;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .vh-car rect:not(:first-child) {
        fill: var(--fluvy-text-secondary);
        stroke: none;
      }
      .vh-car rect.is-low {
        fill: var(--fluvy-warning);
      }
      .vh-tyre {
        min-width: 0;
        font-size: 16px;
        font-weight: 600;
        line-height: 20px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .vh-tyre .fv-unit {
        margin-left: 4px;
        font-size: 12px;
        font-weight: 500;
        color: var(--fluvy-text-secondary);
      }
      .vh-tyre.is-left {
        text-align: right;
      }
      .vh-tyres.is-bare .vh-tyre.is-left {
        text-align: left;
      }
      .vh-tyre.is-low,
      .vh-tyre.is-low .fv-unit {
        color: var(--fluvy-warning);
      }
      /* the strip: the compact tile's anatomy (76, 16 in), the car's circle ringed by its charge, its round raised */
      .vh-card--mini {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 76px;
        padding: 16px;
        box-sizing: border-box;
      }
      .vh-ring {
        position: relative;
        display: grid;
        place-items: center;
        flex: 0 0 44px;
        width: 44px;
        height: 44px;
      }
      .vh-ring > svg {
        position: absolute;
        top: -7px;
        left: -7px;
        width: 58px;
        height: 58px;
        transform: rotate(-90deg);
      }
      .vh-ring circle {
        fill: none;
        stroke-width: 2;
      }
      .vh-ring .vh-ring__track {
        stroke: var(--fluvy-border);
      }
      .vh-ring .vh-ring__fill {
        stroke: var(--tone-ink, var(--fluvy-accent));
        stroke-linecap: round;
        transition: stroke-dashoffset var(--fv-slow) var(--fv-ease);
      }
      .vh-card--mini .fv-row__text {
        flex: 1 1 auto;
        min-width: 0;
      }
      .vh-card--mini .fv-row__sub {
        font-variant-numeric: tabular-nums;
      }
      .vh-card--mini > .vh-control {
        z-index: 1;
        flex: 0 0 auto;
      }
      .vh-card--mini > .fv-tile__tap {
        border-radius: inherit;
      }
    `,
  ];

  private readonly head = new HeadFit(this);
  /** The clock for what the card says of time ("1 h 12 min left", "Updated 2 h ago"): a minute's tick while either shows. */
  protected readonly ticker = new Ticker(this, () => this.timed);
  /** Whether the card says anything of time now: the ticker draws it again each minute while it does. */
  private timed = false;
  /** The car: its device and its roles, found once per registry and config (the search walks every entity). */
  private found:
    | { readonly key: string; readonly registry: unknown; readonly entities: VehicleEntities }
    | undefined;
  /** A picture that would not load: the plate keeps its place with the car's glyph (until the address changes). */
  private readonly pictures = new BrokenPictures(this);

  /** A car has no entity of its own to show: its device does; `entity` names one of its entities instead. */
  static override base: readonly BaseKey[] = [
    'entity',
    'name',
    'icon',
    'tone',
    'color',
    'card_color',
    'tap_action',
    'hold_action',
    'show_icon',
  ];
  static override keys = configKeys<VehicleCardConfig>()([
    'device',
    'variant',
    'scan',
    'roles',
    'hero',
    'image',
    'image_position',
    'show_range',
    'show_limit',
    'show_status',
    'show_controls',
    'controls',
    'show_rows',
    'rows',
    'show_tyres',
    'low_range',
    'stale_after',
    'range_unit',
    'range_decimals',
    'power_unit',
    'power_decimals',
    'hero_tap_action',
    'hero_hold_action',
  ]);
  static override lists: readonly RowsListSpec[] = [
    {
      key: 'controls',
      idKey: 'control',
      title: 'editor.controls',
      keys: ['control', 'name', 'icon', 'color', 'confirm', 'tap_action', 'hold_action'],
      computeLabel: (schema) =>
        schema.name === 'control'
          ? editorWord('vehicle.editor.control')
          : schema.name === 'confirm'
            ? editorWord('vehicle.editor.confirm')
            : undefined,
      picker: controlPicker(),
      when: (data) => data['show_controls'] !== false && data['variant'] !== 'mini',
      schema: [
        controlPicker(),
        nameIconFields(),
        fieldRow(accentField('color', { item: true }), boolField('confirm')),
        actionField('tap_action'),
        actionField('hold_action'),
      ],
    },
    {
      key: 'rows',
      idKey: 'row',
      also: ['entity'],
      title: 'editor.rows',
      keys: ['row', 'entity', 'name', 'icon', 'color', 'tap_action', 'hold_action'],
      computeLabel: (schema) => (schema.name === 'row' ? editorWord('editor.row') : undefined),
      picker: rowPicker(),
      when: (data) => data['show_rows'] !== false && (data['variant'] ?? 'full') === 'full',
      schema: [
        rowPicker(),
        entityField(undefined, 'entity', false),
        nameIconFields(),
        accentField('color', { item: true }),
        actionField('tap_action'),
        actionField('hold_action'),
      ],
    },
    {
      key: 'roles',
      idKey: 'role',
      title: 'vehicle.editor.roles',
      keys: ['role', 'entity'],
      computeLabel: (schema) =>
        schema.name === 'role' ? editorWord('vehicle.editor.role') : undefined,
      picker: rolePicker(),
      schema: [rolePicker(), entityField(undefined, 'entity')],
    },
  ];
  /** What the editor shows where the config says nothing: what the card does then. */
  static override defaults: EditorDefaults = () => ({
    variant: 'full',
    scan: true,
    hero: 'ruler',
    image_position: 'hero',
    show_range: true,
    show_limit: true,
    show_status: true,
    show_controls: true,
    show_rows: true,
    show_tyres: false,
    stale_after: STALE_AFTER,
    range_unit: 'auto',
    range_decimals: 'auto',
    power_unit: 'auto',
    power_decimals: 'auto',
  });
  static override getConfigForm(): LovelaceConfigForm {
    const full = (data: Readonly<Record<string, unknown>>): boolean =>
      (data['variant'] ?? 'full') === 'full';
    const notMini = (data: Readonly<Record<string, unknown>>): boolean =>
      data['variant'] !== 'mini';
    const hasImage = (data: Readonly<Record<string, unknown>>): boolean =>
      typeof data['image'] === 'string' && data['image'].trim() !== '';
    const decimals = ['auto', '0', '1', '2'] as const;
    return {
      schema: [
        {
          name: 'device',
          selector: {
            device: { filter: VEHICLE_PLATFORMS.map((integration) => ({ integration })) },
          },
        },
        entityField(undefined, 'entity', false),
        boolField('scan'),
        nameIconFields(),
        showIconField(),
        selectField('variant', VEHICLE_VARIANTS),
        onlyWhen(full, selectField('hero', ['ruler', 'ring'])),
        onlyWhen(notMini, textField('image')),
        onlyWhen(
          (data) => full(data) && hasImage(data),
          choiceField('image_position', [
            ['hero', 'vehicle.editor.image_hero'],
            ['head', 'vehicle.editor.image_head'],
          ]),
        ),
        onlyWhen(notMini, fieldRow(boolField('show_range'), boolField('show_limit'))),
        onlyWhen(notMini, fieldRow(boolField('show_status'), boolField('show_controls'))),
        onlyWhen(full, fieldRow(boolField('show_rows'), boolField('show_tyres'))),
        fieldRow(numberField('low_range', 0, 1000), numberField('stale_after', 0, 1440)),
        fieldRow(unitField('range_unit', ['km', 'mi']), selectField('range_decimals', decimals)),
        fieldRow(unitField('power_unit', ['W', 'kW']), selectField('power_decimals', decimals)),
        ...colourFields(),
        actionFields(),
        onlyWhen(
          notMini,
          fieldRow(actionField('hero_tap_action'), actionField('hero_hold_action')),
        ),
      ],
      ...editorLabels(
        s,
        {
          device: 'editor.device',
          scan: 'editor.scan',
          hero: 'editor.hero',
          image_position: 'editor.image_position',
          show_range: 'editor.show_range',
          show_limit: 'editor.show_limit',
          show_status: 'editor.show_status',
          show_tyres: 'editor.show_tyres',
          low_range: 'editor.low_range',
          stale_after: 'editor.stale_after',
          range_unit: 'editor.range_unit',
          range_decimals: 'editor.range_decimals',
          power_unit: 'editor.power_unit',
          power_decimals: 'editor.power_decimals',
          hero_tap_action: 'editor.hero_tap_action',
          hero_hold_action: 'editor.hero_hold_action',
        },
        {
          image: 'editor.picture',
          show_controls: 'editor.show_actions',
          show_rows: 'editor.show_rows',
        },
      ),
      computeHelper: (schema) =>
        schema.name === 'scan'
          ? s(undefined, 'editor.scan_helper')
          : schema.name === 'image'
            ? s(undefined, 'editor.image_helper')
            : undefined,
    };
  }

  /** A new card takes the house's first car. */
  static getStubConfig(hass: HomeAssistant | undefined): VehicleCardConfig {
    const [device] = vehicleDevices(hass);
    return { type: 'custom:fluvy-vehicle-card', ...(device ? { device } : {}) };
  }

  override getCardSize(): number {
    return this.config ? Math.round(vehicleHeight(this.config) / 50) : 9;
  }
  override getGridOptions(): LovelaceGridOptions {
    return this.variant === 'mini'
      ? { columns: 6, rows: 'auto', min_columns: 3 }
      : { columns: 12, rows: 'auto', min_columns: 3 };
  }

  private get variant(): VehicleVariant {
    return vehicleVariant(this.config);
  }

  /* ---------- the car ---------- */

  /** The car's entities: found on its device, then named by hand (only those with `scan: false`). */
  private car(): VehicleEntities {
    const c = this.config;
    const registry = this.hass?.entities;
    const key = JSON.stringify([c?.device, c?.entity, c?.roles, c?.scan]);
    if (this.found && this.found.registry === registry && this.found.key === key)
      return this.found.entities;
    const device = vehicleDevice(this.hass, c?.device, c?.entity);
    const entities = vehicleEntities(
      this.hass,
      device,
      c?.roles ?? [],
      c?.entity,
      c?.scan !== false,
    );
    this.found = { key, registry, entities };
    return entities;
  }

  protected override watched(): readonly string[] {
    const { roles, doors, windows, warnings } = this.car();
    return [
      ...Object.values(roles),
      ...doors,
      ...windows,
      ...Object.values(warnings),
      ...this.rowEntries().flatMap((entry) => (entry.entity ? [entry.entity] : [])),
      imageEntity(this.config?.image),
    ].filter((id): id is string => Boolean(id));
  }

  private now(): number {
    const frozen = this.config?._now ? Date.parse(this.config._now) : NaN;
    return Number.isFinite(frozen) ? frozen : Date.now();
  }

  private view(role: VehicleRole): EntityView | undefined {
    const id = this.car().roles[role];
    return id ? this.entity(id) : undefined;
  }

  /** A role's number, or null where it cannot be read. */
  private number(role: VehicleRole): number | null {
    const v = this.view(role);
    return v && v.status === 'ok' ? v.number : null;
  }

  /** Whether a binary role is on, off, or cannot be read (null). */
  private flag(role: VehicleRole): boolean | null {
    const v = this.view(role);
    if (!v || v.status !== 'ok') return null;
    return v.domain === 'binary_sensor' || v.domain === 'switch' ? v.state === 'on' : null;
  }

  private figure(n: number, digits: number): string {
    return formatNumber(this.hass, n, { digits });
  }

  /** A config's decimals, or the automatic ones. */
  private digits(raw: number | string | undefined, auto: number): number {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 3 ? n : auto;
  }

  /** The range's unit: the card's (km or mi), else its sensor's, else the house's. */
  private rangeUnit(): string {
    const asked = this.config?.range_unit;
    if (asked === 'km' || asked === 'mi') return asked;
    return this.view('range')?.unit || this.hass?.config.unit_system.length || 'km';
  }

  /** The range in the unit the card asks for (km ↔ mi), its decimals the card's. */
  private rangeOf(): Reading['range'] {
    const v = this.view('range');
    if (!v || v.status !== 'ok' || v.number === null) return { value: '—', unit: '', number: null };
    const unit = this.rangeUnit();
    const n = convertDistance(v.number, v.unit, unit);
    return { value: this.figure(n, this.digits(this.config?.range_decimals, 0)), unit, number: n };
  }

  /** What the car draws (W): its charging power in its unit brought to watts. */
  private watts(): number | null {
    const v = this.view('charge_power');
    if (!v || v.status !== 'ok' || v.number === null) return null;
    const factor = /^kW$/i.test(v.unit) ? 1000 : /^MW$/i.test(v.unit) ? 1e6 : 1;
    return v.number * factor;
  }

  /** A power as the card writes it: in kW from a kilowatt (W under), or as the card asks. */
  private powerText(watts: number): string {
    const asked = this.config?.power_unit;
    const kw = asked === 'kW' || (asked !== 'W' && Math.abs(watts) >= 1000);
    const value = kw ? watts / 1000 : watts;
    return `${this.figure(value, this.digits(this.config?.power_decimals, kw ? 1 : 0))} ${kw ? 'kW' : 'W'}`;
  }

  /** The charge limit (%): its number's or its sensor's. */
  private limit(): number | null {
    const n = this.number('charge_limit');
    return n === null ? null : Math.min(100, Math.max(0, n));
  }

  /** Where its charge is, from its charging state, its cable and what it draws. */
  private charge(level: number | null, limit: number | null): Charge | null {
    const state = this.view('charging');
    return chargeOf({
      state:
        state && state.status === 'ok'
          ? { word: state.state, binary: state.domain === 'binary_sensor' }
          : null,
      plugged: this.cable(),
      watts: this.watts(),
      level,
      limit,
    });
  }

  /** Whether its cable is in: its plug sensor's word, null where it cannot be read, undefined where it has none. */
  private cable(): boolean | null | undefined {
    const plug = this.view('plugged');
    if (!plug) return undefined;
    if (plug.status !== 'ok') return null;
    return plug.domain === 'binary_sensor' ? plug.state === 'on' : pluggedWord(plug.state);
  }

  /** When it will be full, from a moment (a timestamp) or a duration: the time it ends and the seconds left. */
  private eta(now: number): { readonly at: number; readonly left: number } | null {
    const v = this.view('time_to_full');
    if (!v || v.status !== 'ok') return null;
    const moment =
      v.deviceClass === 'timestamp' || /^\d{4}-\d{2}-\d{2}T/.test(v.state)
        ? Date.parse(v.state)
        : NaN;
    if (Number.isFinite(moment))
      return moment > now ? { at: moment, left: (moment - now) / 1000 } : null;
    const seconds = durationSeconds(v.number, v.unit || 'min');
    return seconds !== null && seconds > 0 ? { at: now + seconds * 1000, left: seconds } : null;
  }

  /** "Updated 2 h ago" where the car has not said anything for longer than `stale_after`; '' otherwise. */
  private stale(now: number): string {
    const v = this.view('updated');
    if (!v || v.status !== 'ok') return '';
    const at = Date.parse(v.state);
    const after = (this.config?.stale_after ?? STALE_AFTER) * 60_000;
    if (!Number.isFinite(at) || now - at < Math.max(after, MINUTE)) return '';
    return s(this.hass, 'updated', { when: relativeTime(this.hass, new Date(at), new Date(now)) });
  }

  /** The car out of reach: none of what it says of itself can be read (its battery, its lock, its place). */
  private reachless(): boolean {
    const { roles } = this.car();
    const main = (['battery', 'range', 'lock', 'location', 'charging'] as const)
      .map((role) => roles[role])
      .filter((id): id is string => Boolean(id));
    return main.length > 0 && main.every((id) => this.entity(id).status !== 'ok');
  }

  /** What it does: drives, sleeps, is parked; out of reach. */
  private activity(): Activity {
    const state = this.view('state');
    const word =
      state && state.status === 'ok'
        ? state.domain === 'binary_sensor'
          ? state.state === 'on'
            ? 'online'
            : 'asleep'
          : state.state
        : null;
    const moving = this.flag('moving');
    return activityOf({
      state: word,
      shift: this.view('shift')?.state ?? null,
      speed: this.number('speed'),
      moving,
      reachless: this.reachless(),
    });
  }

  /** The inside temperature: its sensor's, else its climate's own reading. */
  private inside(): { readonly n: number; readonly text: string; readonly unit: string } | null {
    const sensor = this.view('inside');
    const climate = this.view('climate');
    const unit =
      sensor?.unit ||
      climate?.attr<string>('temperature_unit') ||
      this.hass?.config.unit_system.temperature ||
      '°C';
    const n =
      sensor && sensor.status === 'ok' && sensor.number !== null
        ? sensor.number
        : climate && climate.status === 'ok'
          ? (climate.attr<number>('current_temperature') ?? null)
          : null;
    if (n === null || !Number.isFinite(n)) return null;
    return { n, unit, text: `${this.figure(n, 0)} ${unit}` };
  }

  /** The car's name: the card's, else its device's, else its battery's. */
  private carName(): string {
    if (this.config?.name) return this.config.name;
    const device = vehicleDevice(this.hass, this.config?.device, this.config?.entity);
    const entry = device ? this.hass?.devices?.[device] : undefined;
    return (
      entry?.name_by_user || entry?.name || this.view('battery')?.name || s(this.hass, 'title')
    );
  }

  private reading(now: number): Reading {
    const battery = this.view('battery');
    const level =
      battery && battery.status === 'ok' && battery.number !== null
        ? Math.min(100, Math.max(0, battery.number))
        : null;
    const limit = this.limit();
    const range = this.rangeOf();
    const unavailable = this.reachless();
    const charge = unavailable ? null : this.charge(level, limit);
    const activity = unavailable ? 'offline' : this.activity();
    const climateOn = this.climateOn();
    const inside = this.inside();
    const accent = toneOf(this.config, 'accent');
    const location = this.view('location');
    const place = location ? (location.status === 'ok' ? stateText(this.hass, location) : '—') : '';
    const words = this.view('address');
    const address =
      location?.state !== 'home' && words && words.status === 'ok' ? words.state.trim() : '';
    const badge = ((): Reading['badge'] => {
      if (unavailable) return { text: this.t('state.unavailable'), tone: 'off' };
      if (charge === 'charging') {
        const watts = this.watts();
        return {
          text:
            watts !== null && watts > 0
              ? s(this.hass, 'charging_at', { power: this.powerText(watts) })
              : s(this.hass, 'charging'),
          tone: accent,
        };
      }
      if (activity === 'driving') {
        const speed = this.view('speed');
        return {
          text:
            speed && speed.status === 'ok' && speed.number !== null && speed.number > 0
              ? s(this.hass, 'driving_at', {
                  speed: `${this.figure(speed.number, 0)} ${speed.unit}`,
                })
              : s(this.hass, 'driving'),
          tone: accent,
        };
      }
      if (charge === 'complete') return { text: s(this.hass, 'charged'), tone: 'ok' };
      if (charge === 'stopped' || charge === 'waiting' || charge === 'error')
        return { text: s(this.hass, 'plugged'), tone: charge === 'error' ? 'warning' : 'neutral' };
      return { text: s(this.hass, activity === 'asleep' ? 'asleep' : 'parked'), tone: 'neutral' };
    })();
    return {
      name: this.carName(),
      level,
      range,
      limit,
      charge,
      plugged: plugged(charge),
      activity,
      low:
        !unavailable &&
        charge !== 'charging' &&
        lowRange(range.number, level, this.config?.low_range),
      open: unavailable ? null : this.opening(),
      cabin: climateOn || unavailable ? null : cabinOf(inside?.n ?? null, inside?.unit ?? '°C'),
      stale: this.stale(now),
      place,
      address,
      unavailable,
      tone: badge.tone,
      badge,
    };
  }

  /** What stands open, a window first: its windows' cover or sensors, its doors, its boot, its front boot. */
  private opening(): Opening | null {
    const { windows, doors } = this.car();
    const open = (id: string | undefined): boolean => {
      const v = id ? this.entity(id) : undefined;
      if (!v || v.status !== 'ok') return false;
      return v.domain === 'cover'
        ? v.state === 'open' || v.state === 'opening'
        : v.domain === 'binary_sensor'
          ? v.state === 'on'
          : /open|ajar/i.test(v.state);
    };
    const roles = this.car().roles;
    if (open(roles.windows) || windows.some(open)) return 'windows';
    if (doors.some(open)) return 'doors';
    if (open(roles.trunk)) return 'trunk';
    if (open(roles.frunk)) return 'frunk';
    return null;
  }

  /** Whether the climate runs: its entity's mode, its switch, its sensor that says so. */
  private climateOn(): boolean {
    const climate = this.view('climate');
    if (climate) return climate.status === 'ok' && climate.state !== 'off';
    return this.flag('climate_switch') ?? this.flag('climate_running') ?? false;
  }

  /* ---------- the line under the battery ---------- */

  private line(r: Reading, now: number): Line {
    const percent = (n: number): string => this.figure(n, 0);
    const limitText =
      r.limit !== null ? s(this.hass, 'limit_of', { percent: percent(r.limit) }) : '';
    const kind = lineOf({ charge: r.charge, low: r.low, open: r.open, cabin: r.cabin });
    const words = (text: string, ink: Line['ink'] = '', short?: string): Line => ({
      segments: text ? [{ text, ...(short ? { short } : {}) }] : [],
      ink,
    });
    switch (kind) {
      case 'error':
        return words(s(this.hass, 'charge_error'), 'warning');
      case 'charging': {
        const eta = this.eta(now);
        const rate = this.view('charge_rate');
        const per =
          rate && rate.status === 'ok' && rate.number !== null && rate.number > 0
            ? s(this.hass, 'per_hour', { rate: `${this.figure(rate.number, 0)} ${rate.unit}` })
            : '';
        if (!eta)
          return {
            segments: [
              ...(r.limit !== null
                ? [{ text: s(this.hass, 'charging_to', { percent: percent(r.limit) }) }]
                : []),
              ...(per ? [{ text: per, optional: true }] : []),
            ],
            ink: '',
          };
        const at = when(this.hass, eta.at, now);
        const today = at.days === 0;
        const ready =
          r.limit !== null && r.limit < 100
            ? s(this.hass, today ? 'limit_at' : 'limit_on', {
                percent: percent(r.limit),
                time: at.time,
                day: at.day,
              })
            : s(this.hass, today ? 'full_at' : 'full_on', { time: at.time, day: at.day });
        return {
          segments: [
            { text: ready },
            { text: s(this.hass, 'left', { time: spanText(this.hass, eta.left) }), optional: true },
            ...(per ? [{ text: per, optional: true }] : []),
          ],
          ink: '',
        };
      }
      case 'low':
        return words(s(this.hass, 'low_range'), 'warning');
      case 'open':
        return words(s(this.hass, `${r.open ?? 'doors'}_open`), 'warning');
      case 'complete':
        return words(s(this.hass, 'limit_reached'), 'ok', s(this.hass, 'limit_reached_short'));
      case 'waiting':
        return words(s(this.hass, 'waiting'), '');
      case 'stopped':
        return words(s(this.hass, 'not_charging'), '', s(this.hass, 'not_charging_short'));
      case 'cabin': {
        const inside = this.inside();
        return {
          segments: [
            { text: s(this.hass, r.cabin === 'cold' ? 'cold_inside' : 'hot_inside') },
            ...(inside ? [{ text: inside.text, optional: true }] : []),
          ],
          ink: r.cabin === 'cold' ? 'cool' : 'heat',
        };
      }
      case 'unplugged':
        return {
          segments: [
            { text: s(this.hass, 'unplugged') },
            ...(limitText ? [{ text: limitText, optional: true }] : []),
          ],
          ink: '',
        };
      default:
        return words(limitText);
    }
  }

  private renderLine(r: Reading, now: number): TemplateResult | typeof nothing {
    if (this.config?.show_status === false) return nothing;
    if (r.unavailable) return html`<p class="vh-line">—</p>`;
    const line = this.line(r, now);
    const text = fitLine(line.segments, this.contentWidth, (t) =>
      this.head.ruler.width('vh-line', t),
    );
    return html`<p class="vh-line ${line.ink ? `is-${line.ink}` : ''}">${text}</p>`;
  }

  /* ---------- the controls ---------- */

  /** The controls the card shows, as entries, in order: the card's own, else those the car has. */
  private controlEntries(): ControlEntry[] {
    const listed = this.config?.controls;
    if (Array.isArray(listed))
      return listed.map(controlEntry).filter((e) => VEHICLE_CONTROLS.includes(e.control));
    return carControls(this.car()).map((control) => ({ control }));
  }

  /** A control as it stands: its round, its word, what a tap does. */
  private control(entry: ControlEntry, r: Reading): ControlView {
    const { roles, doors, windows } = this.car();
    const name = entry.name ?? this.t(controlWord(entry.control));
    const accent = this.accents.item(entry.color);
    const base = {
      key: entry.control,
      name,
      accent,
      entry,
      ink: '' as ControlView['ink'],
      why: '',
      disabled: false,
    };
    /**
     * Whether a tap asks first (the control's `confirm`, else what it does by default), in its own words where it has
     * them, else in Home Assistant's ("Are you sure?").
     */
    const asks = (byDefault: boolean, text?: string): ActionConfig['confirmation'] =>
      (entry.confirm ?? byDefault) ? (text ? { text } : true) : false;
    const service = (id: string, action: string, confirm = asks(false)): ActionConfig => ({
      action: 'perform-action',
      perform_action: action,
      target: { entity_id: id },
      ...(confirm ? { confirmation: confirm } : {}),
    });
    const toned = (tone: Tone): Tone => (accent && tone === 'accent' ? 'accent' : tone);
    /** A control whose entity cannot be read: its place kept, still, its word a dash. */
    const out = (glyphName: string, id: string | undefined): ControlView => ({
      ...base,
      glyph: entry.icon ?? glyphName,
      word: '—',
      words: ['—'],
      tone: 'off',
      entity: id,
      act: undefined,
      disabled: true,
    });
    const open = (v: EntityView): boolean =>
      v.domain === 'cover'
        ? v.state === 'open' || v.state === 'opening'
        : v.domain === 'binary_sensor' || v.domain === 'switch'
          ? v.state === 'on'
          : /open|ajar/.test(v.state.toLowerCase());
    /** What an opening says: its name while shut (the port's short one), "Open" while open (in the warning's ink). */
    const shut = entry.name ?? (entry.control === 'charge_port' ? s(this.hass, 'port') : name);
    const opening = (isOpen: boolean): string => (isOpen ? this.t('common.open') : shut);
    switch (entry.control) {
      case 'lock': {
        const v = this.view('lock');
        if (!v || v.status !== 'ok' || r.unavailable) return out('lock', v?.id);
        const state = this.stateOf(v);
        const locked =
          v.domain === 'lock'
            ? state === 'locked' || state === 'locking'
            : v.domain === 'binary_sensor'
              ? state === 'off'
              : /lock|secur/i.test(state) && !/unlock/i.test(state);
        const word =
          v.domain === 'lock'
            ? stateText(this.hass, {
                ...v,
                state,
                ...(v.stateObj ? { stateObj: { ...v.stateObj, state } } : {}),
              })
            : this.t(locked ? 'lock.locked' : 'lock.unlocked');
        return {
          ...base,
          glyph: entry.icon ?? (locked ? 'lock' : 'unlock'),
          word,
          words: [word, this.t('lock.locked'), this.t('lock.unlocked')],
          tone: locked ? toned('accent') : 'warning',
          ink: locked ? '' : 'warning',
          entity: v.id,
          act:
            v.domain === 'lock'
              ? locked
                ? service(v.id, 'lock.unlock', asks(true, s(this.hass, 'unlock_confirm')))
                : service(v.id, 'lock.lock', asks(false))
              : undefined,
        };
      }
      case 'climate': {
        const v = this.view('climate') ?? this.view('climate_switch');
        const start = roles.climate_start;
        const running = this.view('climate_running');
        const reading = v ?? running;
        if (!reading && !start) return out('fan', undefined);
        if ((reading && reading.status !== 'ok') || r.unavailable)
          return out('fan', reading?.id ?? start);
        const on = this.climateOn();
        const action =
          reading?.domain === 'climate' ? reading.attr<string>('hvac_action') : undefined;
        const target =
          reading?.domain === 'climate' ? reading.attr<number>('temperature') : undefined;
        const inside = this.inside();
        const warm =
          action === 'heating' || (target !== undefined && inside !== null && target > inside.n);
        const tone: Tone = on ? (action === 'cooling' || !warm ? 'cool' : 'heat') : 'neutral';
        const unit = inside?.unit ?? this.hass?.config.unit_system.temperature ?? '°C';
        const cabin = r.cabin;
        const word = on
          ? typeof target === 'number'
            ? `${this.figure(target, Number.isInteger(target) ? 0 : 1)} ${unit}`
            : this.t('common.on')
          : cabin && inside
            ? inside.text
            : reading
              ? this.t('common.off')
              : s(this.hass, 'climate');
        const id = reading?.id ?? start;
        const act: ActionConfig | undefined =
          v?.domain === 'climate'
            ? service(v.id, on ? 'climate.turn_off' : 'climate.turn_on')
            : v?.domain === 'switch'
              ? service(v.id, on ? 'switch.turn_off' : 'switch.turn_on')
              : on && roles.climate_stop
                ? service(roles.climate_stop, 'button.press')
                : !on && start
                  ? service(start, 'button.press')
                  : undefined;
        return {
          ...base,
          glyph:
            entry.icon ??
            (on ? (tone === 'heat' ? 'flame' : tone === 'cool' ? 'snow' : 'fan') : 'fan'),
          word,
          words: [word, this.t('common.off'), `${this.figure(88, 0)} ${unit}`],
          tone: toned(tone),
          ink: !on && cabin ? (cabin === 'cold' ? 'cool' : 'heat') : '',
          entity: id,
          act,
        };
      }
      case 'charging': {
        const sw = this.view('charge_switch');
        const reading = sw ?? this.view('charging') ?? this.view('plugged');
        if (!reading && !roles.charge_start) return out('plug', undefined);
        if ((reading && reading.status !== 'ok') || r.unavailable) return out('plug', reading?.id);
        const charging = r.charge === 'charging';
        const unplugged = r.charge === 'unplugged';
        const word =
          r.charge === 'charging'
            ? s(this.hass, 'charging')
            : r.charge === 'complete'
              ? s(this.hass, 'charged')
              : r.charge === 'waiting'
                ? s(this.hass, 'plugged')
                : r.charge === 'stopped' || r.charge === 'error'
                  ? s(this.hass, 'stopped')
                  : r.charge === 'unplugged'
                    ? s(this.hass, 'unplugged')
                    : r.charge === 'idle'
                      ? s(this.hass, 'idle')
                      : '—';
        const stop = asks(true, s(this.hass, 'stop_charge_confirm'));
        // a switch turns by its own state (on while the charge is complete, it turns off), buttons by the charge; the
        // round looks as the charge is
        const on = sw ? this.stateOf(sw) === 'on' : charging;
        const act: ActionConfig | undefined = sw
          ? service(sw.id, on ? 'switch.turn_off' : 'switch.turn_on', on ? stop : asks(false))
          : on && roles.charge_stop
            ? service(roles.charge_stop, 'button.press', stop)
            : !on && roles.charge_start
              ? service(roles.charge_start, 'button.press')
              : undefined;
        // a charge cannot start without its cable
        const cableless = unplugged && Boolean(act) && !on;
        return {
          ...base,
          glyph: entry.icon ?? (charging ? 'bolt' : 'plug'),
          word,
          words: [
            word,
            s(this.hass, 'charging'),
            s(this.hass, 'charged'),
            s(this.hass, 'stopped'),
            s(this.hass, 'unplugged'),
            s(this.hass, 'plugged'),
            s(this.hass, 'idle'),
          ],
          tone: charging
            ? toned('accent')
            : r.charge === 'complete'
              ? 'ok'
              : r.charge === 'error'
                ? 'warning'
                : 'neutral',
          entity: reading?.id ?? roles.charge_start,
          act: cableless ? undefined : act,
          disabled: cableless,
          why: cableless ? s(this.hass, 'not_plugged') : '',
        };
      }
      case 'charge_port':
      case 'trunk':
      case 'frunk': {
        const role = entry.control;
        const v = this.view(role);
        const closedGlyph = role === 'charge_port' ? 'chargePort' : role;
        if (!v || v.status !== 'ok' || r.unavailable) return out(closedGlyph, v?.id);
        const isOpen = open(v);
        const confirm =
          role === 'trunk'
            ? asks(true, s(this.hass, isOpen ? 'close_trunk_confirm' : 'open_trunk_confirm'))
            : role === 'frunk'
              ? asks(!isOpen, isOpen ? undefined : s(this.hass, 'open_frunk_confirm'))
              : asks(false);
        // a cover opens and, where it can, closes (a front boot only opens); a port's switch toggles
        const closes = v.domain === 'cover' ? v.supports(2) : true;
        const act: ActionConfig | undefined =
          v.domain === 'cover'
            ? isOpen
              ? closes
                ? service(v.id, 'cover.close_cover', confirm)
                : undefined
              : service(v.id, 'cover.open_cover', confirm)
            : v.domain === 'switch'
              ? service(v.id, isOpen ? 'switch.turn_off' : 'switch.turn_on', confirm)
              : undefined;
        const word = opening(isOpen);
        return {
          ...base,
          glyph:
            entry.icon ??
            (isOpen ? (role === 'charge_port' ? 'chargePort' : `${role}Open`) : closedGlyph),
          word,
          words: [opening(true), opening(false)],
          tone: isOpen ? (role === 'charge_port' ? toned('accent') : 'warning') : 'neutral',
          ink: isOpen && role !== 'charge_port' ? 'warning' : '',
          entity: v.id,
          act,
        };
      }
      case 'windows': {
        const cover = this.view('windows');
        const sensors = windows.map((id) => this.entity(id));
        if (!cover && !sensors.length) return out('carWindow', undefined);
        const readable = cover ? [cover] : sensors.filter((v) => v.status === 'ok');
        if (!readable.length || (cover && cover.status !== 'ok') || r.unavailable)
          return out('carWindow', cover?.id ?? sensors[0]?.id);
        const opened = readable.filter(open);
        const isOpen = opened.length > 0;
        const word = isOpen && cover ? s(this.hass, 'vented') : opening(isOpen);
        return {
          ...base,
          glyph: entry.icon ?? (isOpen ? 'carWindowOpen' : 'carWindow'),
          word,
          words: [opening(true), opening(false), s(this.hass, 'vented')],
          tone: isOpen ? 'warning' : 'neutral',
          ink: isOpen ? 'warning' : '',
          entity: (opened[0] ?? readable[0])?.id,
          act: cover
            ? isOpen
              ? service(
                  cover.id,
                  'cover.close_cover',
                  asks(true, s(this.hass, 'close_windows_confirm')),
                )
              : service(cover.id, 'cover.open_cover', asks(true, s(this.hass, 'vent_confirm')))
            : undefined,
        };
      }
      case 'doors': {
        const sensors = doors.map((id) => this.entity(id));
        const readable = sensors.filter((v) => v.status === 'ok');
        if (!readable.length || r.unavailable) return out('carDoor', sensors[0]?.id);
        const opened = readable.filter(open);
        return {
          ...base,
          glyph: entry.icon ?? (opened.length ? 'carDoorOpen' : 'carDoor'),
          word: opening(opened.length > 0),
          words: [opening(true), opening(false)],
          tone: opened.length ? 'warning' : 'neutral',
          ink: opened.length ? 'warning' : '',
          entity: (opened[0] ?? readable[0])?.id,
          act: undefined,
        };
      }
      case 'sentry': {
        const v = this.view('sentry');
        if (!v || v.status !== 'ok' || r.unavailable) return out('shield', v?.id);
        const on = this.stateOf(v) === 'on';
        const word = name;
        return {
          ...base,
          glyph: entry.icon ?? 'shield',
          word,
          words: [name],
          tone: on ? toned(accent ? 'accent' : 'armed') : 'neutral',
          entity: v.id,
          act: on
            ? service(v.id, 'switch.turn_off', asks(true, s(this.hass, 'sentry_off_confirm')))
            : service(v.id, 'switch.turn_on'),
        };
      }
    }
  }

  /**
   * How many controls a row holds: as many cells of 56 at least as the column takes, fewer while a word (each at its
   * widest, so a state that changes never moves the row) would not keep 2 of its cell clear — never a word cut: the
   * words of all of them where they wrap into rows (`wrap`), of the first `n` where the rest give way. The rounds alone
   * (compact) need their 44 and 8 between.
   */
  private controlColumns(views: readonly ControlView[], words: boolean, wrap: boolean): number {
    const w = this.contentWidth;
    const fit = (n: number): boolean => {
      if (!words) return w / n >= 44 + 8;
      const cell = w / n;
      return (
        cell >= CELL_MIN &&
        (wrap ? views : views.slice(0, n)).every((view) =>
          view.words.every(
            (word) => this.head.ruler.width('vh-control__word', word) <= cell - WORD_CLEAR,
          ),
        )
      );
    };
    for (let n = views.length; n > 1; n--) if (fit(n)) return n;
    return 1;
  }

  /** Runs a control's tap: its own action, else what it does on the car, else its details. */
  private press(view: ControlView): void {
    const own = view.entry.tap_action;
    if (own) this.tap(view.entity, own);
    else if (view.act) {
      // a lock or a switch moves under the finger: its new state is drawn until Home Assistant says it
      const service = view.act.perform_action ?? '';
      if (!view.act.confirmation && view.entity) {
        const next = /\.(lock)$/.test(service)
          ? 'locking'
          : /\.(unlock)$/.test(service)
            ? 'unlocking'
            : /turn_on$/.test(service)
              ? 'on'
              : /turn_off$/.test(service)
                ? 'off'
                : '';
        if (next && /^(lock|switch)\./.test(view.entity)) this.expect(view.entity, next);
      }
      this.tap(view.entity, view.act);
    } else this.tap(view.entity, { action: 'more-info' });
  }

  private renderControls(r: Reading, bare: boolean): TemplateResult | typeof nothing {
    if (this.config?.show_controls === false) return nothing;
    let views = this.controlEntries().map((entry) => this.control(entry, r));
    // a car with none of them keeps the row: its lock and its climate, still (1.9: a card keeps its size)
    if (!views.length)
      views = DEFAULT_CONTROLS.slice(0, 2).map((control) => this.control({ control }, r));
    // the card's own list wraps into rows as even as they come (nine are five and four, the shorter row centred);
    // the car's own keeps one row, those that do not hold it giving way in their order
    const listed = Array.isArray(this.config?.controls);
    const most = this.controlColumns(views, !bare, listed);
    const shown = listed ? views : views.slice(0, most);
    const columns = Math.ceil(shown.length / Math.ceil(shown.length / most));
    return html`<div
      class="vh-controls ${bare ? 'vh-controls--bare' : ''}"
      style="--vh-cols:${columns}"
    >
      ${shown.map((view) => this.renderControl(view, bare))}
    </div>`;
  }

  private renderControl(view: ControlView, bare: boolean): TemplateResult {
    const hold = view.entry.hold_action;
    const onHold = (): void => this.hold(view.entity, hold ?? { action: 'more-info' });
    const label = view.why ? `${said(view)} · ${view.why}` : said(view);
    return html`<button
      class="vh-control"
      data-target
      data-accent=${view.accent ?? nothing}
      aria-label=${label}
      title=${label}
      aria-disabled=${view.disabled ? 'true' : nothing}
      ?disabled=${view.tone === 'off'}
      .fvTap=${(() => this.press(view)) as PressTarget['fvTap']}
      .fvHold=${onHold as PressTarget['fvHold']}
      @pointerdown=${startPress}
      @contextmenu=${preventMenu}
      @click=${view.disabled ? (event: Event) => event.preventDefault() : clickPress}
      @keydown=${holdKey(onHold)}
    >
      <span class="fv-ico fv-ico--${view.tone}">${icon(view.glyph, 'car')}</span>
      ${
        bare
          ? nothing
          : html`<span class="vh-control__word ${view.ink ? `is-${view.ink}` : ''}"
              >${view.word}</span
            >`
      }
    </button>`;
  }

  /* ---------- the rows ---------- */

  private rowEntries(): RowEntry[] {
    if (this.config?.show_rows === false || this.variant !== 'full') return [];
    const listed = this.config?.rows;
    return (Array.isArray(listed) ? listed : DEFAULT_ROWS).map(rowEntry);
  }

  /** A row's words: its name, its glyph, its value, the entity it opens. */
  private rowOf(
    entry: RowEntry,
    r: Reading,
  ): { title: string; glyph: string; value: string; entity: string | undefined; tone: Tone } {
    const read = (v: EntityView | undefined, digits?: number): string => {
      if (!v) return '—';
      if (v.status !== 'ok') return '—';
      if (v.number === null) return stateText(this.hass, v);
      return `${this.figure(v.number, digits ?? (Number.isInteger(v.number) ? 0 : 1))}${v.unit ? ` ${v.unit}` : ''}`;
    };
    if (!entry.row) {
      const v = entry.entity ? this.entity(entry.entity) : undefined;
      return {
        title: entry.name ?? v?.name ?? '—',
        glyph: entry.icon ?? 'dots',
        value: read(v),
        entity: v?.id,
        tone: 'neutral',
      };
    }
    const key = entry.row;
    const title = entry.name ?? s(this.hass, key);
    const GLYPHS: Readonly<Record<VehicleRow, string>> = {
      location: 'pin',
      odometer: 'odometer',
      inside: 'thermo',
      outside: 'thermo',
      charge_power: 'bolt',
      charge_rate: 'bolt',
      charge_limit: 'battery',
      time_to_full: 'clock',
      software: 'update',
      speed: 'odometer',
      fuel: 'drop',
    };
    const glyphName = entry.icon ?? GLYPHS[key];
    const at = (value: string, entity: string | undefined, tone: Tone = 'neutral') => ({
      title,
      glyph: glyphName,
      value: r.unavailable ? '—' : value,
      entity,
      tone,
    });
    switch (key) {
      case 'location':
        return at(r.place || '—', this.car().roles.location);
      case 'odometer': {
        const v = this.view('odometer');
        if (!v || v.status !== 'ok' || v.number === null) return at('—', v?.id);
        const asked = this.config?.range_unit;
        const unit = asked === 'km' || asked === 'mi' ? asked : v.unit;
        return at(`${this.figure(convertDistance(v.number, v.unit, unit), 0)} ${unit}`, v.id);
      }
      case 'inside': {
        const v = this.view('inside');
        const inside = this.inside();
        return at(inside?.text ?? '—', v?.id ?? this.car().roles.climate);
      }
      case 'charge_power': {
        const watts = this.watts();
        return at(watts === null ? '—' : this.powerText(watts), this.car().roles.charge_power);
      }
      case 'charge_limit':
        return at(
          r.limit === null ? '—' : `${this.figure(r.limit, 0)} %`,
          this.car().roles.charge_limit,
        );
      case 'time_to_full': {
        const eta = r.charge === 'charging' ? this.eta(this.now()) : null;
        return at(eta ? spanText(this.hass, eta.left) : '—', this.car().roles.time_to_full);
      }
      case 'software': {
        const v = this.view('software');
        return at(
          v ? stateText(this.hass, v) : '—',
          v?.id,
          v?.state === 'on' ? 'accent' : 'neutral',
        );
      }
      default: {
        const v = this.view(key);
        return at(read(v, 0), v?.id);
      }
    }
  }

  private renderRows(r: Reading): TemplateResult | typeof nothing {
    const entries = this.rowEntries();
    if (!entries.length) return nothing;
    const rows = entries.map((entry) => ({ entry, ...this.rowOf(entry, r) }));
    // a row's name is a label and its value a figure: neither is cut. The circles give way together where a row's
    // words would not hold beside one, then every value goes under its name, in the row's 48 (20, 4, 20)
    const w = this.contentWidth;
    const holds = (room: number): boolean =>
      rows.every(
        ({ title, value }) =>
          this.head.ruler.width('fv-row__title', title) +
            12 +
            this.head.ruler.width('fv-row__value', value) <=
          room,
      );
    const keep = holds(w - 40 - 12);
    const stack = !keep && !holds(w);
    return html`<div class="vh-rows">
      ${rows.map(({ entry, title, glyph: g, value, entity, tone }) => {
        const accent = this.accents.item(entry.color);
        return listRow({
          icon: keep ? g : null,
          tone: accent ? 'accent' : r.unavailable ? 'off' : tone,
          title,
          value,
          trailing: 'value',
          compact: true,
          stack,
          unavailable: r.unavailable,
          accent,
          onTap: () => this.tap(entity, entry.tap_action ?? { action: 'more-info' }),
          ...(entry.hold_action ? { onHold: () => this.hold(entity, entry.hold_action) } : {}),
        });
      })}
    </div>`;
  }

  /* ---------- the tyres ---------- */

  private renderTyres(r: Reading): TemplateResult | typeof nothing {
    if (this.config?.show_tyres !== true || this.variant !== 'full') return nothing;
    const { warnings } = this.car();
    const all = warnings.all ? this.entity(warnings.all).state === 'on' : false;
    const wheels: readonly Wheel[] = ['fl', 'fr', 'rl', 'rr'];
    const low: Partial<Record<Wheel, boolean>> = {};
    const tyre = (wheel: Wheel) => {
      const v = this.view(`tyre_${wheel}`);
      const flag = warnings[wheel] ? this.entity(warnings[wheel]).state === 'on' : false;
      low[wheel] = !r.unavailable && (flag || all);
      const ok = v && v.status === 'ok' && v.number !== null && !r.unavailable;
      // a tyre with no pressure of its own says what its warning says
      const value = ok
        ? this.figure(v.number as number, /bar$/i.test(v.unit) ? 1 : 0)
        : !v && warnings[wheel]
          ? low[wheel]
            ? s(this.hass, 'tyre_low')
            : s(this.hass, 'tyre_ok')
          : '—';
      return { wheel, value, unit: ok ? v.unit : '', id: v?.id ?? warnings[wheel] };
    };
    const tyres = wheels.map(tyre);
    // the car from above gives way where a column would not hold the widest pressure beside it
    const widest = Math.max(
      ...tyres.map((t) => this.head.ruler.width('vh-tyre', t.value, 'fv-unit', t.unit)),
      this.head.ruler.width('vh-tyre', '8.8', 'fv-unit', 'bar'),
    );
    const bare = (this.contentWidth - 32 - CAR_WIDTH - 24) / 2 < widest;
    const label = (t: (typeof tyres)[number]): string =>
      `${s(this.hass, `tyre_${t.wheel}`)} · ${t.value}${t.unit ? ` ${t.unit}` : ''}`;
    return html`<div
      class="vh-tyres ${bare ? 'is-bare' : ''}"
      role="group"
      aria-label=${s(this.hass, 'tyres')}
      @click=${() => this.tap(tyres.find((t) => low[t.wheel])?.id ?? tyres[0]?.id, { action: 'more-info' })}
    >
      ${bare ? nothing : carFromAbove(low)}
      ${tyres.map(
        (t, index) =>
          html`<span
            class="vh-tyre ${index % 2 ? '' : 'is-left'} ${low[t.wheel] ? 'is-low' : ''}"
            style="grid-row:${index < 2 ? 1 : 2};grid-column:${bare ? (index % 2) + 1 : index % 2 ? 3 : 1}"
            aria-label=${label(t)}
            >${t.value}${t.unit ? html`<span class="fv-unit">${t.unit}</span>` : nothing}</span
          >`,
      )}
    </div>`;
  }

  /* ---------- the picture ---------- */

  /** The car's picture: the address the card gives, an entity's own, or (`auto`) the integration's. */
  private pictureSrc(): string {
    const image = this.config?.image?.trim() ?? '';
    if (image !== 'auto') return imageOf(this.hass, image);
    const device = vehicleDevice(this.hass, this.config?.device, this.config?.entity);
    const pictured = Object.values(this.hass?.entities ?? {}).find(
      (entry) => entry.device_id === device && entry.entity_id.startsWith('image.'),
    )?.entity_id;
    return imageOf(this.hass, pictured) || imageOf(this.hass, this.car().roles.location);
  }

  private picture(lead: boolean): TemplateResult {
    const src = this.pictures.shown(this.pictureSrc());
    return html`<span
      class="${lead ? 'vh-face' : 'vh-picture'} ${src ? '' : 'is-empty'}"
      aria-hidden="true"
      >${src ? html`<img src=${src} alt="" @error=${this.pictures.failed} />` : glyph('car')}</span
    >`;
  }

  /* ---------- render ---------- */

  protected renderCard(): TemplateResult {
    const c = this.config;
    const { roles, doors, windows } = this.car();
    if (!Object.keys(roles).length && !doors.length && !windows.length)
      return this.renderEmpty(s(this.hass, 'no_vehicle'));
    const now = this.now();
    const r = this.reading(now);
    this.timed = r.charge === 'charging' || Boolean(r.stale) || Boolean(this.view('updated'));
    if (this.variant === 'mini') return this.renderMini(r);
    const at = c ? pictureAt(c) : null;
    return html`<article class="fv-card vh-card ${r.unavailable ? 'is-unavailable' : ''}" data-card>
      ${this.renderHead(r, at === 'head')}
      ${at === 'hero' && this.variant === 'full' ? this.picture(false) : nothing}
      ${this.variant === 'compact' ? this.renderBar(r) : c?.hero === 'ring' ? this.renderRing(r) : this.renderRuler(r)}
      ${this.renderLine(r, now)} ${this.renderControls(r, this.variant === 'compact')}
      ${this.variant === 'full' ? html`${this.renderRows(r)}${this.renderTyres(r)}` : nothing}
    </article>`;
  }

  /**
   * The head: the car (its circle, or its picture in the circle's place), its name, where it is and how long since it
   * last said anything, and what it does in the badge — which gives way first, as badges do.
   */
  private renderHead(r: Reading, picture: boolean): TemplateResult {
    const w = this.contentWidth;
    // where it is, where no row says it (its address away from home, which no row holds), and how long it has said nothing
    const placeInRows = this.rowEntries().some((entry) => entry.row === 'location');
    const place = placeInRows ? '' : r.place;
    const line = (...parts: string[]): string => parts.filter(Boolean).join(' · ');
    // the compact card has no value row: its range leads the line
    const range =
      this.variant === 'compact' && this.config?.show_range !== false && r.range.number !== null
        ? `${r.range.value} ${r.range.unit}`
        : '';
    const sub = line(range, r.address || place, r.stale);
    // an address too long for the line gives way to the place's word, then to the time alone: never cut
    const shorter = r.address
      ? [line(range, place, r.stale), line(range, r.stale), range]
      : [line(range, r.stale), range];
    // a picture in the head is 64 wide, the circle 44: the head is fitted as if its column were 20 narrower
    const fit = (line: string, forms: readonly string[]) =>
      this.head.fit({
        width: picture ? w - 20 : w,
        title: r.name,
        sub: line,
        shorter: forms,
        badge: r.badge,
        badgeFirst: true,
        ...(picture ? { icon: 'always' as const } : {}),
      });
    let fitted = fit(sub, shorter);
    // what it does outranks where it is: an address that would take the badge's room gives way to the place's word
    if (r.address && fitted.badge === nothing) fitted = fit(shorter[0] ?? '', shorter.slice(1));
    const tone: Tone = r.unavailable ? 'off' : r.tone;
    return head({
      icon: fitted.icon ? (this.config?.icon ?? 'car') : null,
      small: fitted.small,
      ...(picture && fitted.icon ? { lead: this.picture(true) } : {}),
      tone,
      title: r.name,
      sub: fitted.sub,
      trailing: fitted.badge,
      name: true,
      cut: fitted.cut,
      ...this.headActions(this.car().roles.battery ?? this.config?.entity),
    });
  }

  /** The battery's own tap and hold (its details by default), over its value row and ruler. */
  private heroCover(r: Reading): TemplateResult | typeof nothing {
    const id = this.car().roles.battery;
    const tap = this.config?.hero_tap_action ?? { action: 'more-info' as const };
    const hold = this.config?.hero_hold_action;
    const label = `${s(this.hass, 'battery')} · ${r.level === null ? '—' : `${this.figure(r.level, 0)} %`}`;
    return pressCover(label, () => this.tap(id, tap), hold ? () => this.hold(id, hold) : undefined);
  }

  /** The battery on the charge cards' ruler: its charge and its range over it, its limit marked. */
  private renderRuler(r: Reading): TemplateResult {
    const w = this.contentWidth;
    const tone: Tone = r.unavailable ? 'off' : r.low ? 'warning' : toneOf(this.config, 'accent');
    const showRange = this.config?.show_range !== false;
    const main = {
      label: s(this.hass, 'battery'),
      value: r.level === null ? '—' : this.figure(r.level, 0),
      unit: r.level === null ? '' : '%',
    };
    const range = s(this.hass, 'range');
    const side = showRange
      ? { figure: { label: range, value: r.range.value, unit: r.range.unit } }
      : null;
    // laid out for its widest figures — a full charge, a range of three figures — so a car charging, driving or out of
    // reach never moves the row
    const forms = {
      main: [main, { ...main, value: this.figure(100, 0), unit: '%' }],
      side: side
        ? [side.figure, { label: range, value: this.figure(888, 0), unit: this.rangeUnit() }]
        : [],
    };
    const limit = this.config?.show_limit !== false && r.limit !== null ? r.limit : null;
    return html`<div class="vh-hero ${r.low && !r.unavailable ? 'is-low' : ''}">
      ${valueRow(this.head.ruler, w, main, side, forms)}
      ${markedRuler({
        hass: this.hass,
        width: w,
        value: r.unavailable ? null : r.level,
        tone,
        mark: limit !== null ? { percent: limit, text: s(this.hass, 'limit') } : null,
        label: `${r.name} · ${s(this.hass, 'battery')}`,
        measure: (text) => this.head.ruler.width(MARK_LABEL, text),
      })}
      ${this.heroCover(r)}
    </div>`;
  }

  /** The battery as a ring: its charge in the disc, its range under it, its limit a dot outside the ring. */
  private renderRing(r: Reading): TemplateResult {
    const w = this.contentWidth;
    const radius = Math.min(
      RING_MAX,
      Math.max(RING_MIN, Math.floor((w / 2 - RING_TICK - 12) / 4) * 4),
    );
    const tone: Tone = r.unavailable
      ? 'neutral'
      : r.low
        ? 'warning'
        : toneOf(this.config, 'accent');
    const dash = r.level === null || r.unavailable;
    const sub =
      this.config?.show_range !== false
        ? `${r.range.value}${r.range.unit ? ` ${r.range.unit}` : ''}`
        : '';
    const limit = this.config?.show_limit !== false && r.limit !== null ? r.limit : undefined;
    return html`<div class="vh-hero vh-dial">
      <fluvy-dial
        gauge
        .radius=${radius}
        .tick=${RING_TICK}
        .large=${true}
        .stepper=${false}
        .tone=${tone}
        .min=${0}
        .max=${100}
        .fill=${dash ? 0 : (r.level as number) / 100}
        .value=${dash ? undefined : r.level}
        .format=${dash ? undefined : (n: number) => this.figure(n, 0)}
        .text=${dash ? '—' : undefined}
        .unit=${dash ? '' : '%'}
        .label=${s(this.hass, 'battery')}
        .sub=${sub}
        .current=${limit}
        ?disabled=${r.unavailable}
      ></fluvy-dial>
      ${this.heroCover(r)}
    </div>`;
  }

  /** The compact card's battery: its bar with the limit marked, its percentage at the end. */
  private renderBar(r: Reading): TemplateResult {
    const tone: Tone = r.unavailable ? 'off' : r.low ? 'warning' : toneOf(this.config, 'accent');
    const level = r.unavailable ? null : r.level;
    const limit = this.config?.show_limit !== false && r.limit !== null ? r.limit : null;
    const room = this.head.ruler.width('vh-bar__value', `${this.figure(100, 0)} %`);
    return html`<div class="vh-hero">
      <div class="vh-bar fv-tone--${tone}" style="--vh-pct:${room}px">
        <span class="vh-bar__track" data-measure="value"
          ><span class="vh-bar__fill" style="width:${level ?? 0}%"></span>${
            limit !== null
              ? html`<span class="vh-bar__mark" style="left:${limit}%"></span>`
              : nothing
          }</span
        >
        <span class="vh-bar__value">${level === null ? '—' : `${this.figure(level, 0)} %`}</span>
      </div>
      ${this.heroCover(r)}
    </div>`;
  }

  /**
   * The strip: the car's circle ringed by its charge, its name over its charge, its range and what it does, and its
   * first control as a round — the strip is the card's button (a cover over it), the round raised beside it.
   */
  private renderMini(r: Reading): TemplateResult {
    const circumference = 2 * Math.PI * STRIP_RADIUS;
    const level = r.unavailable ? null : r.level;
    const tone: Tone = r.unavailable
      ? 'off'
      : r.low
        ? 'warning'
        : r.charge === 'charging'
          ? r.tone
          : toneOf(this.config, 'accent');
    const [first] = this.controlEntries();
    // the strip's padding is 16: its words have the column less the ring's 44 and 12, and the round's where it holds
    const words = this.contentWidth + 8 - 44 - 12;
    const control =
      this.config?.show_controls === false || !first || words - 44 - 12 < ROW_NAME_MIN
        ? undefined
        : this.control(first, r);
    const room = words - (control ? 44 + 12 : 0);
    // out of reach, the line says so alone, as a small tile does (the dash where the word would not hold)
    const segments: Segment[] = r.unavailable
      ? [{ text: r.badge.text, short: '—' }]
      : [
          { text: level === null ? '—' : `${this.figure(level, 0)} %` },
          ...(this.config?.show_range !== false && r.range.number !== null
            ? [{ text: `${r.range.value} ${r.range.unit}`, optional: true }]
            : []),
          { text: r.badge.text, optional: true },
          ...(r.place ? [{ text: r.place, optional: true }] : []),
        ];
    const line = fitLine(segments, room, (text) => this.head.ruler.width('fv-row__sub', text));
    const { onTap, onHold } = this.headActions(this.car().roles.battery ?? this.config?.entity);
    return html`<article
      class="fv-card vh-card vh-card--mini ${r.unavailable ? 'is-unavailable' : ''}"
      data-card
    >
      <span class="vh-ring fv-tone--${tone}">
        <svg viewBox="0 0 58 58" aria-hidden="true" data-measure="drawn">
          <circle class="vh-ring__track" cx="29" cy="29" r=${STRIP_RADIUS} />
          ${
            level === null
              ? nothing
              : svg`<circle class="vh-ring__fill" cx="29" cy="29" r=${STRIP_RADIUS} stroke-dasharray=${circumference.toFixed(2)} stroke-dashoffset=${(circumference * (1 - level / 100)).toFixed(2)} />`
          }
        </svg>
        <span
          class="fv-ico fv-ico--${r.unavailable ? 'off' : r.charge === 'charging' || r.activity === 'driving' ? r.tone : 'neutral'}"
          >${icon(this.config?.icon ?? 'car')}</span
        >
      </span>
      <span class="fv-row__text"
        ><span class="fv-row__title" data-name>${r.name}</span
        ><span class="fv-row__sub">${line}</span></span
      >
      ${onTap || onHold ? pressCover(`${r.name} · ${line}`, onTap, onHold) : nothing}
      ${control ? this.renderControl(control, true) : nothing}
    </article>`;
  }
}

/** The controls a car has, in the order a card shows them where it names none. */
export function carControls(found: VehicleEntities): VehicleControl[] {
  const { roles, doors, windows } = found;
  return DEFAULT_CONTROLS.filter((control) => {
    switch (control) {
      case 'lock':
        return Boolean(roles.lock);
      case 'climate':
        return Boolean(roles.climate ?? roles.climate_switch ?? roles.climate_start);
      case 'charging':
        return Boolean(
          roles.charge_switch ?? roles.charge_start ?? roles.charging ?? roles.plugged,
        );
      case 'windows':
        return Boolean(roles.windows) || windows.length > 0;
      case 'doors':
        return doors.length > 0;
      default:
        return Boolean(roles[control]);
    }
  });
}
