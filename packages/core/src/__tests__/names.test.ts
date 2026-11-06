import { describe, expect, it } from 'vitest';
import { resolveEntity } from '../entity.js';
import type { HassEntity, HomeAssistant } from '../ha/types.js';
import { entityName, formatName, textName, type EntityName } from '../names.js';

/*
 * The port of Home Assistant's `computeEntityNameDisplay` (#125), on the cases its own tests hold
 * (test/common/entity/compute_entity_name*.test.ts), and the helper every card reads a configured name with.
 */

const state = (entity_id: string, attributes: Record<string, unknown> = {}): HassEntity => ({
  entity_id,
  state: 'on',
  attributes,
  last_changed: '',
  last_updated: '',
});

type Registries = Partial<Pick<HomeAssistant, 'entities' | 'devices' | 'areas' | 'floors'>>;
const house = (registries: Record<string, unknown>): Registries => registries as Registries;
const device = (id: string, name: string, more: Record<string, unknown> = {}) => ({
  id,
  name,
  name_by_user: null,
  area_id: null,
  ...more,
});

describe('formatName, as Home Assistant’s computeEntityNameDisplay', () => {
  const kitchen = state('light.kitchen');

  it('returns a name written as words directly, and the friendly name for none', () => {
    expect(formatName(kitchen, 'Custom Name', {})).toBe('Custom Name');
    expect(formatName(state('light.kitchen', { friendly_name: 'Kitchen' }), undefined, {})).toBe(
      'Kitchen',
    );
    expect(formatName(state('light.kitchen_ceiling'), undefined, {})).toBe('kitchen ceiling');
  });

  it('joins words alone', () => {
    const words: EntityName = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
    ];
    expect(formatName(kitchen, words, {})).toBe('Hello World');
  });

  it('reads the entity’s registry name', () => {
    const registries = house({
      entities: { 'light.kitchen': { entity_id: 'light.kitchen', name: 'Kitchen Light' } },
    });
    expect(formatName(kitchen, { type: 'entity' }, registries)).toBe('Kitchen Light');
  });

  it('reads the device’s name for an entity named by its device alone', () => {
    const registries = house({
      entities: {
        'light.kitchen': { entity_id: 'light.kitchen', name: 'Kitchen Device', device_id: 'dev1' },
      },
      devices: { dev1: device('dev1', 'Kitchen Device') },
    });
    expect(formatName(kitchen, { type: 'entity' }, registries)).toBe('Kitchen Device');
    // the device asked for too: the entity's own part is none, the device's said once
    expect(formatName(kitchen, [{ type: 'entity' }, { type: 'device' }], registries)).toBe(
      'Kitchen Device',
    );
  });

  it('joins the entity’s and its area’s names, the device’s and its area’s, the floor’s', () => {
    expect(
      formatName(
        kitchen,
        [{ type: 'area' }, { type: 'entity' }],
        house({
          entities: {
            'light.kitchen': { entity_id: 'light.kitchen', name: 'Ceiling Light', area_id: 'k' },
          },
          areas: { k: { area_id: 'k', name: 'Kitchen' } },
        }),
      ),
    ).toBe('Kitchen Ceiling Light');
    expect(
      formatName(
        kitchen,
        [{ type: 'area' }, { type: 'device' }],
        house({
          entities: {
            'light.kitchen': { entity_id: 'light.kitchen', name: 'Light', device_id: 'd' },
          },
          devices: { d: device('d', 'Smart Light', { area_id: 'k' }) },
          areas: { k: { area_id: 'k', name: 'Kitchen' } },
        }),
      ),
    ).toBe('Kitchen Smart Light');
    expect(
      formatName(
        kitchen,
        { type: 'floor' },
        house({
          entities: {
            'light.kitchen': { entity_id: 'light.kitchen', name: 'Light', area_id: 'k' },
          },
          areas: { k: { area_id: 'k', name: 'Kitchen', floor_id: 'first' } },
          floors: { first: { floor_id: 'first', name: 'First Floor' } },
        }),
      ),
    ).toBe('First Floor');
  });

  it('leaves out the parts the entity has none of, and mixes words with them', () => {
    const registries = house({
      entities: { 'light.kitchen': { entity_id: 'light.kitchen', name: 'Light', area_id: 'k' } },
      areas: { k: { area_id: 'k', name: 'Kitchen' } },
    });
    expect(
      formatName(kitchen, [{ type: 'device' }, { type: 'entity' }, { type: 'floor' }], registries),
    ).toBe('Light');
    expect(
      formatName(
        kitchen,
        [{ type: 'area' }, { type: 'text', text: '-' }, { type: 'entity' }],
        registries,
      ),
    ).toBe('Kitchen - Light');
    // one part the entity has none of: nothing, as Home Assistant's own card says it
    expect(formatName(kitchen, { type: 'device' }, registries)).toBe('');
  });

  it('strips the device’s name in front of the entity’s, capitalising what is left', () => {
    const named = (name: string, of: string): string =>
      formatName(
        kitchen,
        { type: 'entity' },
        house({
          entities: { 'light.kitchen': { entity_id: 'light.kitchen', name, device_id: 'd' } },
          devices: { d: device('d', of) },
        }),
      );
    expect(named('Kitchen Light', 'Kitchen')).toBe('Light');
    expect(named('kitchen: temperature', 'Kitchen')).toBe('Temperature');
    // its separators are tried in order, the space first: Home Assistant reads "Kitchen - motion" so too
    expect(named('Kitchen - motion', 'Kitchen')).toBe('- motion');
    // a first word with a capital of its own (a brand's) is kept as it is
    expect(named('Kitchen iPhone battery', 'Kitchen')).toBe('iPhone battery');
    // nothing left after it, or no separator: the name as it is
    expect(named('Kitchen ', 'Kitchen')).toBe('Kitchen ');
    expect(named('Kitchenette', 'Kitchen')).toBe('Kitchenette');
  });

  it('reads a child device’s area from its parent', () => {
    expect(
      formatName(
        kitchen,
        { type: 'area' },
        house({
          entities: {
            'light.kitchen': { entity_id: 'light.kitchen', name: 'Light', device_id: 'c' },
          },
          devices: {
            c: device('c', 'Bulb', { parent_device_id: 'p' }),
            p: device('p', 'Hub', { area_id: 'k' }),
          },
          areas: { k: { area_id: 'k', name: 'Kitchen' } },
        }),
      ),
    ).toBe('Kitchen');
  });

  it('says nothing for a part it does not know, never an object', () => {
    expect(formatName(kitchen, { type: 'nonsense' } as unknown as EntityName, {})).toBe('');
    expect(formatName(kitchen, [], {})).toBe('');
  });
});

describe('entityName', () => {
  // #125: a Govee light, its device "EG_GA_L_Baum", its entity "Baum"; Home Assistant's friendly name is both
  const baum = {
    states: { 'light.baum': state('light.baum', { friendly_name: 'EG_GA_L_Baum Baum' }) },
    entities: { 'light.baum': { entity_id: 'light.baum', name: 'Baum', device_id: 'tree' } },
    devices: { tree: device('tree', 'EG_GA_L_Baum', { area_id: 'garden' }) },
    areas: { garden: { area_id: 'garden', name: 'Garten' } },
  } as unknown as HomeAssistant;
  const view = resolveEntity(baum, 'light.baum');

  it('reads the entity’s own name for {type: entity}, its friendly name with none (#125)', () => {
    expect(entityName(baum, view, { type: 'entity' })).toBe('Baum');
    expect(entityName(baum, view, [{ type: 'device' }, { type: 'entity' }])).toBe(
      'EG_GA_L_Baum Baum',
    );
    expect(entityName(baum, view, [{ type: 'entity' }, { type: 'area' }])).toBe('Baum Garten');
    expect(entityName(baum, view, undefined)).toBe('EG_GA_L_Baum Baum');
    expect(entityName(baum, view, null)).toBe('EG_GA_L_Baum Baum');
  });

  it('keeps the person’s words as they are, a figure among them', () => {
    expect(entityName(baum, view, 'Tree')).toBe('Tree');
    expect(entityName(baum, view, '')).toBe('');
    expect(entityName(baum, view, 2024 as unknown as EntityName)).toBe('2024');
  });

  it('asks Home Assistant’s own formatEntityName where the frontend has it', () => {
    const asked: unknown[] = [];
    const own = {
      ...baum,
      formatEntityName: (stateObj: HassEntity, name: unknown) => {
        asked.push([stateObj.entity_id, name]);
        return 'from the frontend';
      },
    } as HomeAssistant;
    expect(entityName(own, view, { type: 'entity' })).toBe('from the frontend');
    expect(asked).toEqual([['light.baum', { type: 'entity' }]]);
    // words never ask it (its placeholder, before its formatters load, would say the friendly name)
    expect(entityName(own, view, 'Tree')).toBe('Tree');
    expect(asked).toHaveLength(1);
  });

  it('reads an entity that is not there by its registries and the name it last had', () => {
    const gone = { ...baum, states: {} } as unknown as HomeAssistant;
    const missing = resolveEntity(gone, 'light.baum');
    expect(missing.status).toBe('missing');
    expect(entityName(gone, missing, { type: 'entity' })).toBe('Baum');
    expect(entityName(gone, missing, { type: 'device' })).toBe('EG_GA_L_Baum');
    expect(entityName(undefined, resolveEntity(undefined, 'light.baum'), { type: 'area' })).toBe(
      '',
    );
  });
});

describe('textName', () => {
  it('reads words as they are, parts by their words alone, none where there are none', () => {
    expect(textName('Living room')).toBe('Living room');
    expect(textName(undefined)).toBeUndefined();
    expect(textName({ type: 'area' })).toBeUndefined();
    expect(
      textName([{ type: 'text', text: 'Up' }, { type: 'area' }, { type: 'text', text: 'stairs' }]),
    ).toBe('Up stairs');
  });
});
