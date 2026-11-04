// @vitest-environment happy-dom
import type { HassEntity, HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawEditor, type FormStub } from '../shared/fixtures/editor.js';
import { FluvyEntitiesCard, type EntitiesCardConfig } from './entities-card.js';

if (!customElements.get('fluvy-entities-card'))
  customElements.define('fluvy-entities-card', FluvyEntitiesCard);

const hass = {
  states: {
    'lock.front_door': {
      entity_id: 'lock.front_door',
      state: 'locked',
      attributes: { friendly_name: 'Front door' },
      last_changed: '',
      last_updated: '',
    },
  },
  entities: {},
  devices: {},
  areas: {},
  language: 'en',
  locale: { language: 'en' },
  config: { unit_system: { temperature: '°C' } },
} as unknown as HomeAssistant;

async function mount(
  config: Omit<EntitiesCardConfig, 'type'>,
  house: HomeAssistant = hass,
): Promise<ShadowRoot> {
  const card = document.createElement('fluvy-entities-card') as FluvyEntitiesCard;
  card.setConfig({ type: 'custom:fluvy-entities-card', ...config });
  card.hass = house;
  document.body.append(card);
  await card.updateComplete;
  return card.shadowRoot as ShadowRoot;
}

describe('the entities card’s "N more" row (#78)', () => {
  it('ends the rows with the house’s fold row, how many more, the chevron to where they are', async () => {
    const root = await mount({
      title: 'Security',
      rows: ['lock.front_door'],
      more: 4,
      more_path: '/fluvy-auto/home-security',
    });
    const rows = root.querySelectorAll('.fv-row');
    expect(rows.length).toBe(2);
    const more = rows[1] as HTMLElement;
    expect(more.querySelector('.fv-row__title')?.textContent).toBe('4 more');
    expect(more.querySelector('.fv-row__chevron')).not.toBeNull();
    expect(more.getAttribute('role')).toBe('button');
  });

  it('is a card of its own with the row alone, its height counted with the row', async () => {
    const root = await mount({ more: 9, more_path: '/fluvy-auto/climate-humidity' });
    expect(root.querySelector('.fv-empty')).toBeNull();
    expect(root.querySelectorAll('.fv-row').length).toBe(1);
    const alone = { type: 'custom:fluvy-entities-card', more: 9, more_path: '/x' };
    expect(FluvyEntitiesCard.layoutHeight(alone)).toBe(24 + 60);
    expect(FluvyEntitiesCard.layoutHeight({ ...alone, title: 'Security', rows: ['lock.a'] })).toBe(
      92 + 2 * 60,
    );
    // without where to go, there is no row
    expect(
      FluvyEntitiesCard.layoutHeight({ ...alone, more_path: '', title: 'T', rows: ['lock.a'] }),
    ).toBe(92 + 60);
  });
});

/*
 * #96: a select's row ends in its value, which opens Fluvy's dropdown (the helpers card's), offering the row's options
 * in its order and words and choosing with `select_option`; a row with a tap of its own keeps it.
 */
describe('a select’s row', () => {
  afterEach(() => document.body.replaceChildren());

  const OVEN = Array.from({ length: 30 }, (_, i) => `mode_${i + 1}`);
  const state = (entity_id: string, value: string, options: readonly string[]): HassEntity =>
    ({
      entity_id,
      state: value,
      attributes: { friendly_name: entity_id.split('.')[1], options },
      last_changed: '',
      last_updated: '',
    }) as unknown as HassEntity;
  const house = () => {
    const callService = vi.fn(() => Promise.resolve());
    const states = {
      'select.oven': state('select.oven', 'mode_3', OVEN),
      'input_select.zone': state('input_select.zone', 'Kitchen', ['Kitchen', 'Office', 'Attic']),
      'select.ghost': state('select.ghost', 'unavailable', ['grill', 'steam']),
    };
    return {
      callService,
      hass: {
        ...hass,
        states,
        callService,
        formatEntityState: (s: HassEntity, value = s.state) => value.replace('mode_', 'Mode '),
      } as unknown as HomeAssistant,
    };
  };
  type Menu = HTMLElement & { options: readonly { value: string; label: string }[]; value: string };
  const parts = (root: ShadowRoot, index = 0) => {
    const row = root.querySelectorAll<HTMLElement>('.fv-row')[index]!;
    const button = row.querySelector<HTMLButtonElement>('.in-value');
    return { row, button, menu: button?.nextElementSibling as Menu | null | undefined };
  };

  it('ends in its value, which opens the dropdown, for a select and an input_select alike', async () => {
    const { hass: house_ } = house();
    const root = await mount({ rows: ['select.oven', 'input_select.zone'] }, house_);
    for (const [index, value] of [
      [0, 'Mode 3'],
      [1, 'Kitchen'],
    ] as const) {
      const { row, button, menu } = parts(root, index);
      expect(button?.getAttribute('aria-haspopup')).toBe('listbox');
      expect(button?.querySelector('.in-value__text')?.textContent).toBe(value);
      expect(button?.querySelector('svg')).not.toBeNull();
      expect(menu?.localName).toBe('fluvy-select');
      expect(menu?.hasAttribute('anchored')).toBe(true);
      // the value is the row's button: the row is none of its own
      expect(row.getAttribute('role')).toBeNull();
    }
    expect(parts(root).menu?.options).toHaveLength(30);
  });

  it('chooses with its own domain’s select_option, the value said at once', async () => {
    const { hass: house_, callService } = house();
    const root = await mount({ rows: ['select.oven', 'input_select.zone'] }, house_);
    const card = root.host as FluvyEntitiesCard;
    parts(root).menu!.dispatchEvent(
      new CustomEvent('fluvy-change', { detail: { value: 'mode_9' } }),
    );
    parts(root, 1).menu!.dispatchEvent(
      new CustomEvent('fluvy-change', { detail: { value: 'Attic' } }),
    );
    expect(callService.mock.calls).toEqual([
      ['select', 'select_option', { option: 'mode_9' }, { entity_id: 'select.oven' }],
      ['input_select', 'select_option', { option: 'Attic' }, { entity_id: 'input_select.zone' }],
    ]);
    await card.updateComplete;
    expect(parts(root).button?.textContent?.trim()).toBe('Mode 9');
    expect(parts(root, 1).button?.textContent?.trim()).toBe('Attic');
    // the option already chosen sends nothing
    parts(root).menu!.dispatchEvent(
      new CustomEvent('fluvy-change', { detail: { value: 'mode_9' } }),
    );
    expect(callService).toHaveBeenCalledTimes(2);
  });

  it('offers the row’s own options in its order, in its words', async () => {
    const { hass: house_ } = house();
    const root = await mount(
      {
        rows: [
          {
            entity: 'select.oven',
            options: ['mode_9', 'mode_3', 'nope'],
            labels: { mode_3: 'Fan oven' },
          },
        ],
      },
      house_,
    );
    const { button, menu } = parts(root);
    expect(button?.textContent?.trim()).toBe('Fan oven');
    expect(menu?.options).toEqual([
      { value: 'mode_9', label: 'Mode 9' },
      { value: 'mode_3', label: 'Fan oven' },
    ]);
    expect(menu?.value).toBe('mode_3');
  });

  it('keeps a tap of its own: its value in its words, the row its button', async () => {
    const { hass: house_ } = house();
    const root = await mount(
      {
        rows: [
          {
            entity: 'select.oven',
            labels: { mode_3: 'Fan oven' },
            tap_action: { action: 'more-info' },
          },
        ],
      },
      house_,
    );
    const { row, button } = parts(root);
    expect(button).toBeNull();
    expect(root.querySelector('fluvy-select')).toBeNull();
    expect(row.querySelector('.fv-row__value')?.textContent?.trim()).toBe('Fan oven');
    expect(row.getAttribute('role')).toBe('button');
    const opened: string[] = [];
    root.host.addEventListener('hass-more-info', (event) =>
      opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId),
    );
    row.click();
    expect(opened).toEqual(['select.oven']);
  });

  it('out of reach, says "—" on a button that does nothing, opens its details from the row, keeps its rows of 60', async () => {
    const { hass: house_ } = house();
    const root = await mount({ title: 'Oven', rows: ['select.ghost', 'select.oven'] }, house_);
    const { row, button, menu } = parts(root);
    expect(row.classList.contains('is-unavailable')).toBe(true);
    expect(button?.textContent?.trim()).toBe('—');
    expect(button?.disabled).toBe(true);
    // the list, not fetched yet, says it too
    expect(menu?.hasAttribute('disabled')).toBe(true);
    // its details, as before it had a dropdown; a row that can be read is no button of its own
    const opened: string[] = [];
    root.host.addEventListener('hass-more-info', (event) =>
      opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId),
    );
    row.click();
    expect(opened).toEqual(['select.ghost']);
    expect(parts(root, 1).row.getAttribute('role')).toBeNull();
    const config = { type: 'custom:fluvy-entities-card', title: 'Oven' };
    expect(
      FluvyEntitiesCard.layoutHeight({ ...config, rows: ['select.ghost', 'select.oven'] }),
    ).toBe(FluvyEntitiesCard.layoutHeight({ ...config, rows: ['switch.a', 'switch.b'] }));
  });

  it('shows a select’s row its options and their words in the editor, its words alone beside a tap of its own', async () => {
    const { hass: house_ } = house();
    const editor = await FluvyEntitiesCard.getConfigElement();
    Object.assign(editor, { hass: { ...house_, localize: (key: string) => key } });
    const drawn = await drawEditor(editor, {
      type: 'custom:fluvy-entities-card',
      rows: [
        'select.oven',
        { entity: 'input_select.zone', tap_action: { action: 'more-info' } },
        'switch.a',
      ],
    });
    const forms = [...drawn.shadowRoot!.querySelectorAll<FormStub>('.item ha-form')];
    const names = (form: FormStub | undefined): string[] =>
      (form?.schema ?? [])
        .flatMap((item) => (item.schema ? item.schema : [item]))
        .map((item) => item.name);
    const [oven, zone, plain] = forms.map(names);
    expect(oven).toEqual(expect.arrayContaining(['options', 'labels']));
    expect(zone).toContain('labels');
    expect(zone).not.toContain('options');
    expect(plain).not.toContain('options');
    expect(plain).not.toContain('labels');
    const options = forms[0]?.schema.find((item) => item.name === 'options')?.selector?.[
      'select'
    ] as {
      options: { value: string; label: string }[];
    };
    expect(options.options.slice(0, 2)).toEqual([
      { value: 'mode_1', label: 'Mode 1' },
      { value: 'mode_2', label: 'Mode 2' },
    ]);
  });
});
