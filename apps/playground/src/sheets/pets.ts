import type { HassEntity, HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { FluvyApplianceCard } from '../../../../packages/cards/src/appliance/appliance-card.js';
import { FluvyAppliancesCard } from '../../../../packages/cards/src/appliance/appliances-card.js';
import { petFixtures } from '../../../../packages/cards/src/appliance/fixtures/index.js';
import { NOW } from '../now.js';
import type { FrameSpec, SheetSpec } from '../scenes.js';

if (!customElements.get('fluvy-appliance-card'))
  customElements.define('fluvy-appliance-card', FluvyApplianceCard);
if (!customElements.get('fluvy-appliances-card'))
  customElements.define('fluvy-appliances-card', FluvyAppliancesCard);

/*
 * Pet devices (#112): a PetKit feeder (YumShare Solo), fountain (Eversweet 3 Pro) and litter box (PuraMax 2), and
 * PETLIBRO's Granary feeder, Dockstream fountain and Luma litter box, as their integrations register them (the cards'
 * own fixtures). Each frame's house holds them alone (the other sheets' lists never see them), its states moved to the
 * moment the frame shows: at rest, low (food out, water low, a filter and a desiccant due, the litter short and its
 * drawer full), failed or paused, at work, out of reach; then every layout, at a phone's width, half a section and a
 * desktop's band, the cards made one's own, the list of the house's pet devices, and a litter box at work it cannot
 * pause. The plan's times are the browser's own here (the house's zone left out), so the next meal is at 23:00 on the
 * sheet's evening anywhere.
 */

const now = NOW.getTime();
const at = (minutes: number): string => new Date(now + minutes * 60_000).toISOString();
const PETS = petFixtures(now);

/** Home Assistant's words for the pet devices' states, as PetKit's translations and the classes say them. */
const WORDS: Readonly<Record<string, string>> = {
  idle: 'Idle',
  cleaning: 'Cleaning',
  cleaning_paused_pet_entered: 'Cleaning paused - Pet entered',
  calibrating: 'Calibrating',
  resetting_device: 'Resetting Device',
  IDLE: 'Idle',
  RUNNING: 'Running',
};

/** A pet device's binary sensors in Home Assistant's words for their class. */
const CLASS_WORDS: Readonly<Record<string, readonly [string, string]>> = {
  running: ['Running', 'Not running'],
  problem: ['Problem', 'OK'],
  connectivity: ['Connected', 'Disconnected'],
};

/**
 * The house with the pet devices in it, their states changed as `changes` says (a state, attributes over its own),
 * speaking Home Assistant's words for them.
 */
const pets =
  (changes: Readonly<Record<string, Partial<HassEntity>>> = {}) =>
  (hass: HomeAssistant): HomeAssistant => {
    const states: Record<string, HassEntity> = {};
    for (const fixture of PETS)
      for (const [id, state, attributes = {}, ago = 7200] of fixture.states) {
        const changed = changes[id];
        const since = new Date(now - ago * 1000).toISOString();
        states[id] = {
          entity_id: id,
          state: changed?.state ?? state,
          attributes: { friendly_name: id, ...attributes, ...changed?.attributes },
          last_changed: changed?.last_changed ?? since,
          last_updated: changed?.last_changed ?? since,
        };
      }
    const format = hass.formatEntityState;
    return {
      ...hass,
      // the plan's times are the browser's: the sheet's 21:47 is the house's wherever it is drawn
      config: { ...hass.config, time_zone: '' },
      devices: {
        ...hass.devices,
        ...Object.fromEntries(PETS.map((fixture) => [fixture.device.id, fixture.device])),
      },
      entities: {
        ...hass.entities,
        ...Object.fromEntries(
          PETS.flatMap((fixture) => fixture.entities.map((entry) => [entry.entity_id, entry])),
        ),
      },
      states: { ...hass.states, ...states },
      formatEntityState: (stateObj: HassEntity, state?: string) => {
        const raw = state ?? stateObj.state;
        const pair = stateObj.entity_id.startsWith('binary_sensor.')
          ? CLASS_WORDS[String(stateObj.attributes['device_class'])]
          : undefined;
        if (pair && (raw === 'on' || raw === 'off')) return raw === 'on' ? pair[0] : pair[1];
        return WORDS[raw] ?? format?.({ ...stateObj, state: raw }) ?? raw;
      },
    } as HomeAssistant;
  };

/** Every entity of a device out of reach. */
const unavailable = (device: string): Readonly<Record<string, Partial<HassEntity>>> =>
  Object.fromEntries(
    PETS.filter((fixture) => fixture.device.id === device).flatMap((fixture) =>
      fixture.states.map(([id]) => [id, { state: 'unavailable' }]),
    ),
  );

/** The four of the sheet: PetKit's feeder, fountain and litter box, PETLIBRO's feeder. */
const FOUR = ['pk-feeder', 'pk-fountain', 'pk-litter', 'pl-feeder'];

/** At rest: the PETLIBRO feeder's food back in, its desiccant changed. */
const REST: Readonly<Record<string, Partial<HassEntity>>> = {
  'binary_sensor.granary_food_status': { state: 'off' },
  'sensor.granary_desiccant_remaining_days': { state: '27' },
};

/**
 * Low: a feeder's food out and its desiccant soon, a fountain's water low and its filter due, a box short of litter and
 * its waste bin full.
 */
const LOW: Readonly<Record<string, Partial<HassEntity>>> = {
  'binary_sensor.futterautomat_food_level': { state: 'on' },
  'sensor.futterautomat_food_left': { state: '0' },
  'sensor.futterautomat_desiccant_left_days': { state: '2' },
  'binary_sensor.trinkbrunnen_water_lack_warning': { state: 'on', last_changed: at(-35) },
  'sensor.trinkbrunnen_filter_remaining': { state: '6' },
  'sensor.katzenklo_litter_level': { state: '14' },
  'binary_sensor.katzenklo_sand_lack': { state: 'on' },
  'binary_sensor.katzenklo_wastebin_filled': { state: 'on', last_changed: at(-90) },
};

/**
 * Failed or paused: the feeder's outlet blocked, the fountain's pump at fault, a cat walked into a clean, the Granary
 * jammed.
 */
const FAILED: Readonly<Record<string, Partial<HassEntity>>> = {
  'sensor.futterautomat_error': { state: 'Food outlet blocked' },
  'sensor.trinkbrunnen_error': { state: 'Pump overload' },
  'binary_sensor.trinkbrunnen_pump': { state: 'off' },
  'sensor.katzenklo_state': { state: 'cleaning_paused_pet_entered', last_changed: at(-3) },
  'button.katzenklo_action_continue': { state: 'unknown' },
  'button.katzenklo_scoop': { state: 'unavailable' },
  'binary_sensor.granary_food_dispenser': { state: 'on', last_changed: at(-12) },
  ...REST,
};

/** At work: the feeder giving a meal now, the box cleaning, the Granary's next meal in a few minutes. */
const WORKING: Readonly<Record<string, Partial<HassEntity>>> = {
  'binary_sensor.futterautomat_feeding': { state: 'on', last_changed: at(-1) },
  'sensor.katzenklo_state': { state: 'cleaning', last_changed: at(-1) },
  'button.katzenklo_action_pause': { state: 'unknown' },
  'button.katzenklo_scoop': { state: 'unavailable' },
  'sensor.granary_next_feed_time': { state: at(6) },
  ...REST,
};

const card = (device: string, more: Record<string, unknown> = {}): LovelaceCardConfig => ({
  type: 'custom:fluvy-appliance-card',
  device,
  _now: NOW.toISOString(),
  ...more,
});

/** A frame of the four at a moment. */
const four = (
  title: string,
  changes: Readonly<Record<string, Partial<HassEntity>>>,
  more: Record<string, unknown> = {},
  spec: Partial<FrameSpec> = {},
): FrameSpec => ({
  title,
  hass: pets(changes),
  cards: FOUR.map((device) => card(device, more)),
  ...spec,
});

const OUT = Object.assign({}, ...FOUR.map(unavailable)) as Record<string, Partial<HassEntity>>;

/**
 * PetKit's litter box at a work state with no pause in it: its light on (a word its translations lack: the card's
 * own), calibrating, resetting itself after a clean. Whole with its buttons, compact and as a row.
 */
const litter = (title: string, state: string): FrameSpec => ({
  title,
  hass: pets({
    ...REST,
    'sensor.katzenklo_state': { state, last_changed: at(-1) },
    'button.katzenklo_action_pause': { state: 'unknown' },
    'button.katzenklo_scoop': { state: 'unavailable' },
  }),
  cards: [
    card('pk-litter', { show_controls: true }),
    card('pk-litter', { variant: 'compact' }),
    card('pk-litter', { variant: 'row' }),
  ],
});

export const sheet: SheetSpec = {
  states: [],
  frames: [
    four('Pets · at rest', REST),
    four('Pets · low', LOW),
    four('Pets · failed, paused', FAILED),
    four('Pets · at work', WORKING),
    // out of reach beside their live twins: the same size, every part in its place, its values a dash
    four('Pets · out of reach', OUT),
    // PETLIBRO's fountain and litter box: the Luma's litter under its fountains' key
    {
      title: 'PETLIBRO · fountain and litter box',
      hass: pets(REST),
      cards: [card('pl-fountain'), card('pl-litter')],
    },
    // a phone's widths
    ...[360, 412].map((width) => four(`Pets · a phone, ${width}`, LOW, {}, { width })),
    // half a section: compact, rows and rings
    four('Pets · compact, half a section', LOW, { variant: 'compact', cols: 6 }, { width: 360 }),
    four('Pets · rows, half a section', REST, { variant: 'row', cols: 6 }, { width: 360 }),
    four('Pets · rows', LOW, { variant: 'row' }),
    four('Pets · rings', REST, { variant: 'ring' }),
    four('Pets · rings out of reach', OUT, { variant: 'ring' }),
    // a desktop's band: four whole cards side by side, as the automatic dashboards lay them
    {
      ...four('Pets · a desktop’s band', LOW, { cols: 15 }),
      width: 1504,
      columns: 60,
    },
    // the cards made one's own: their tiles, rows, buttons, amounts, colours and pictures
    {
      title: 'Pets · their own',
      hass: pets(REST),
      cards: [
        card('pk-feeder', {
          name: 'Kibble',
          tiles: ['fed_today', { key: 'food', color: 'teal' }],
          rows: ['next_meal', 'last_meal', 'desiccant'],
          show_controls: true,
          feed_amount: 20,
        }),
        card('pk-litter', {
          tiles: [{ key: 'last_use', name: 'Visit' }, 'uses_today', 'litter', 'waste'],
          show_controls: true,
          picture: 'icon',
        }),
        card('pk-fountain', { tiles: ['water_filter'], rows: ['pump', 'purified', 'alarm'] }),
        card('pl-feeder', { show_hero: false, row_values: 'inline' }),
      ],
    },
    // the house's pet devices, as the list draws them
    {
      title: 'Pets · the list',
      hass: pets(LOW),
      cards: [
        {
          type: 'custom:fluvy-appliances-card',
          _now: NOW.toISOString(),
          title: 'Pets',
          appliances: [
            'pk-feeder',
            'pk-fountain',
            'pk-litter',
            'pl-feeder',
            'pl-fountain',
            'pl-litter',
          ],
        },
        {
          type: 'custom:fluvy-appliances-card',
          _now: NOW.toISOString(),
          variant: 'tiles',
          appliances: ['pk-feeder', 'pk-fountain', 'pk-litter', 'pl-feeder'],
        },
      ],
    },
    litter('Pets · a litter box lit', 'light'),
    litter('Pets · a litter box calibrating', 'calibrating'),
    litter('Pets · a litter box resetting itself', 'resetting_device'),
  ],
};
