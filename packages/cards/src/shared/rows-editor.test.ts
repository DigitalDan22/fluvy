// @vitest-environment happy-dom
import { setCardDefaults, type HaFormSchemaItem, type HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cardForm,
  drawEditor,
  listTitles,
  nextConfig,
  shownNames,
  type FormStub,
} from './fixtures/editor.js';
import {
  boolField,
  colourFields,
  entityField,
  fieldRow,
  holdsLight,
  nameIconFields,
  NUMBER_DEFAULTS,
  numberFields,
  onlyWhen,
  selectField,
  textField,
} from './form.js';
import {
  FluvyRowsEditor,
  compact,
  editorDefaults,
  entryOf,
  itemOf,
  itemsOf,
  moved,
  toItem,
  withList,
  withoutUntouchedDefaults,
  itemHelpers,
  listsEditor,
  withChoices,
  withEntities,
  type RowsListSpec,
} from './rows-editor.js';
import { inverted } from './config.js';

/** A list with a grammar of its own: a word or a hex alone, or `{ color, name }`; a hex is edited as Custom. */
const colours: RowsListSpec = {
  key: 'colors',
  idKey: 'color',
  title: 'editor.colors',
  schema: [{ name: 'color', selector: { text: {} } }],
  read: (raw) => {
    if (typeof raw === 'string')
      return raw ? { color: raw.startsWith('#') ? 'custom' : raw } : null;
    const { color, name } = (raw ?? {}) as { color?: unknown; name?: unknown };
    return typeof color === 'string' && color ? { color, ...(name ? { name } : {}) } : null;
  },
  write: (item) => {
    const color = item['color'] === 'custom' ? '#ff9800' : item['color'];
    if (typeof color !== 'string' || !color) return null;
    return item['name'] ? { color, name: item['name'] } : color;
  },
};

const rows: RowsListSpec = {
  key: 'rows',
  alias: 'entities',
  title: 'editor.rows',
  schema: [{ name: 'entity', selector: { entity: {} } }],
};
const chips: RowsListSpec = {
  key: 'chips',
  idKey: 'label',
  title: 'editor.rows',
  schema: [{ name: 'label', selector: { text: {} } }],
};

describe('rows editor lists', () => {
  it('reads bare ids and objects, drops entries without an id', () => {
    expect(toItem('sensor.a', 'entity')).toEqual({ entity: 'sensor.a' });
    expect(toItem({ entity: 'sensor.b', tone: 'solar' }, 'entity')).toEqual({
      entity: 'sensor.b',
      tone: 'solar',
    });
    expect(toItem('', 'entity')).toBeNull();
    expect(toItem({ name: 'no id' }, 'entity')).toBeNull();
  });

  it('keeps an entry identified by another field (a battery read by two sensors has no power)', () => {
    const batteries: RowsListSpec = {
      key: 'batteries',
      idKey: 'power',
      also: ['phases', 'import', 'export', 'level'],
      title: 'editor.rows',
      schema: [{ name: 'power', selector: { entity: {} } }],
    };
    expect(toItem({ import: 'sensor.in', export: 'sensor.out' }, 'power', batteries.also)).toEqual({
      import: 'sensor.in',
      export: 'sensor.out',
    });
    expect(toItem({ phases: ['sensor.l1'] }, 'power', batteries.also)).toEqual({
      phases: ['sensor.l1'],
    });
    expect(toItem({ phases: [], name: 'none' }, 'power', batteries.also)).toBeNull();
    expect(
      itemsOf(
        { type: 't', batteries: [{ power: 'sensor.a' }, { level: 'sensor.soc' }, { name: 'x' }] },
        batteries,
      ),
    ).toEqual([{ power: 'sensor.a' }, { level: 'sensor.soc' }]);
  });

  it('writes an entity with nothing else back as its bare id, and drops empty fields', () => {
    expect(compact({ entity: 'sensor.a', name: '', icon: undefined }, 'entity')).toBe('sensor.a');
    // a number's Automatic is what an absent key does: dropped as an empty field is
    expect(compact({ entity: 'sensor.a', unit: 'auto', decimals: 'auto' }, 'entity')).toBe(
      'sensor.a',
    );
    expect(compact({ entity: 'sensor.a', unit: 'auto', decimals: '1' }, 'entity')).toEqual({
      entity: 'sensor.a',
      decimals: '1',
    });
    expect(compact({ entity: 'sensor.a', name: 'Sun' }, 'entity')).toEqual({
      entity: 'sensor.a',
      name: 'Sun',
    });
    expect(compact({ label: 'Home' }, 'label')).toEqual({ label: 'Home' }); // a chip stays an object
  });

  it('reads the list under its key, or under the alias while the key is empty', () => {
    expect(itemsOf({ type: 't', entities: ['sensor.a'] }, rows)).toEqual([{ entity: 'sensor.a' }]);
    expect(itemsOf({ type: 't', rows: ['sensor.b'], entities: ['sensor.a'] }, rows)).toEqual([
      { entity: 'sensor.b' },
    ]);
    expect(itemsOf({ type: 't', chips: [{ label: 'Home' }, 'Energy'] }, chips)).toEqual([
      { label: 'Home' },
      { label: 'Energy' },
    ]);
  });

  it('writes the list under its own key and drops the alias', () => {
    expect(
      withList({ type: 't', entities: ['sensor.a'], title: 'x' }, rows, ['sensor.a', 'sensor.b']),
    ).toEqual({ type: 't', title: 'x', rows: ['sensor.a', 'sensor.b'] });
  });

  it('moves one entry and keeps the others in order', () => {
    expect(moved(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moved(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('reads and writes a list by its own grammar when it has one, by the id rule otherwise', () => {
    expect(itemOf('sensor.a', rows)).toEqual({ entity: 'sensor.a' });
    expect(entryOf({ entity: 'sensor.a', name: '' }, rows)).toBe('sensor.a');
    expect(itemOf('#ff2d55', colours)).toEqual({ color: 'custom' });
    expect(itemOf({ color: 'amber', name: 'Honey' }, colours)).toEqual({
      color: 'amber',
      name: 'Honey',
    });
    expect(itemOf({ name: 'Nameless' }, colours)).toBeNull();
    expect(entryOf({ color: 'custom' }, colours)).toBe('#ff9800');
    expect(entryOf({ color: 'warm', name: 'Evening' }, colours)).toEqual({
      color: 'warm',
      name: 'Evening',
    });
    expect(entryOf({ color: '' }, colours)).toBeNull();
    expect(itemsOf({ type: 't', colors: ['warm', '#ff2d55', 7, { name: 'x' }] }, colours)).toEqual([
      { color: 'warm' },
      { color: 'custom' },
    ]);
  });

  it('shows a list’s default as rows only while the config names neither the key nor the alias', () => {
    const fallback = ['warm', 'cool'];
    expect(itemsOf({ type: 't' }, colours, fallback)).toEqual([
      { color: 'warm' },
      { color: 'cool' },
    ]);
    expect(itemsOf({ type: 't', colors: [] }, colours, fallback)).toEqual([]); // named empty: empty
    expect(itemsOf({ type: 't', colors: ['red'] }, colours, fallback)).toEqual([{ color: 'red' }]);
    expect(itemsOf({ type: 't' }, colours)).toEqual([]);
    expect(itemsOf({ type: 't', entities: ['sensor.a'] }, rows, ['sensor.z'])).toEqual([
      { entity: 'sensor.a' },
    ]);
    expect(itemsOf({ type: 't', rows: [] }, rows, ['sensor.z'])).toEqual([]);
  });
});

describe('an editor with a list default', () => {
  const editor = (config: Record<string, unknown>): FluvyRowsEditor => {
    const element = listsEditor({ schema: [] }, [colours], () => ({
      colors: ['warm', 'cool'],
    })) as FluvyRowsEditor;
    element.setConfig({ type: 'custom:x', ...config });
    return element;
  };
  const written = (element: FluvyRowsEditor): Promise<Record<string, unknown>> =>
    new Promise((resolve) =>
      element.addEventListener('config-changed', (event) =>
        resolve((event as CustomEvent<{ config: Record<string, unknown> }>).detail.config),
      ),
    );
  type Private = {
    onAdd(list: RowsListSpec, event: CustomEvent<{ value: Record<string, unknown> }>): void;
    onItem(
      list: RowsListSpec,
      index: number,
      event: CustomEvent<{ value: Record<string, unknown> }>,
    ): void;
  };
  const change = (value: Record<string, unknown>) =>
    new CustomEvent('value-changed', { detail: { value } });

  it('writes the default rows with the first addition, never before', async () => {
    const element = editor({});
    expect(element.config).toEqual({ type: 'custom:x' });
    const next = written(element);
    (element as unknown as Private).onAdd(colours, change({ color: 'custom' }));
    expect(await next).toEqual({ type: 'custom:x', colors: ['warm', 'cool', '#ff9800'] });
  });

  it('edits a default row in place once touched, and drops a row that says nothing any more', async () => {
    const element = editor({});
    const next = written(element);
    (element as unknown as Private).onItem(colours, 1, change({ color: 'cool', name: 'Day' }));
    expect(await next).toEqual({
      type: 'custom:x',
      colors: ['warm', { color: 'cool', name: 'Day' }],
    });
    const cleared = editor({ colors: ['warm', 'cool'] });
    const after = written(cleared);
    (cleared as unknown as Private).onItem(colours, 0, change({ color: '' }));
    expect(await after).toEqual({ type: 'custom:x', colors: ['cool'] });
  });

  it('leaves a list the config names empty alone', async () => {
    const element = editor({ colors: [] });
    const next = written(element);
    (element as unknown as Private).onAdd(colours, change({ color: 'pink' }));
    expect(await next).toEqual({ type: 'custom:x', colors: ['pink'] });
  });
});

describe('editor defaults', () => {
  it('writes back what the user set, never a default that was only shown', () => {
    const config = { type: 't', variant: 'dial' };
    const defaults = { variant: 'dial', fan_style: 'full', show_fan: true, modes: ['off', 'heat'] };
    expect(
      withoutUntouchedDefaults(
        { variant: 'dial', fan_style: 'full', show_fan: true, modes: ['off', 'heat'] },
        config,
        defaults,
      ),
    ).toEqual({ variant: 'dial' });
    expect(
      withoutUntouchedDefaults(
        { variant: 'dial', fan_style: 'chips', show_fan: false, modes: ['off'] },
        config,
        defaults,
      ),
    ).toEqual({ variant: 'dial', fan_style: 'chips', show_fan: false, modes: ['off'] });
    expect(withoutUntouchedDefaults({ title: 'x' }, config, defaults)).toEqual({ title: 'x' });
  });

  it('shows the house’s opacity on a card with a surface, as the house says it when asked, and never writes it (1.15)', () => {
    const form = { schema: colourFields() };
    const shown = editorDefaults(form)!;
    expect(shown({ type: 't' }, undefined)).toMatchObject({ card_opacity: 100 });
    setCardDefaults({ opacity: 80, blur: true });
    expect(shown({ type: 't' }, undefined)).toMatchObject({ card_opacity: 80 });
    setCardDefaults({ opacity: 100, blur: true });
    // untouched, nothing written; moved, its own
    expect(
      withoutUntouchedDefaults({ card_opacity: 100 }, { type: 't' }, { card_opacity: 100 }),
    ).toEqual({});
    expect(
      withoutUntouchedDefaults({ card_opacity: 60 }, { type: 't' }, { card_opacity: 100 }),
    ).toEqual({
      card_opacity: 60,
    });
    // a card without a surface shows none
    expect(editorDefaults({ schema: [textField('title')] })).toBeUndefined();
  });

  it('never writes a number’s Automatic, even chosen after a value the config held', () => {
    const config = { type: 't', unit: 'kWh', decimals: 2 };
    expect(
      withoutUntouchedDefaults({ unit: 'auto', decimals: '2' }, config, NUMBER_DEFAULTS),
    ).toEqual({ decimals: '2' });
    expect(
      withoutUntouchedDefaults({ unit: 'kWh', decimals: 'auto' }, config, NUMBER_DEFAULTS),
    ).toEqual({ unit: 'kWh' });
    // another key's "auto" is a word of its own
    expect(
      withoutUntouchedDefaults({ show_icon: 'auto' }, { type: 't', show_icon: 'never' }, {}),
    ).toEqual({
      show_icon: 'auto',
    });
  });

  it('takes the key out of the card and of an item when Automatic is chosen in the editor', async () => {
    const list: RowsListSpec = { ...rows, schema: [...rows.schema, numberFields()] };
    const element = await drawEditor(
      listsEditor({ schema: [numberFields()] }, [list], () => NUMBER_DEFAULTS),
      {
        type: 'custom:x',
        unit: 'kWh',
        decimals: 2,
        rows: [{ entity: 'sensor.a', unit: 'Wh', decimals: 0 }],
      },
    );
    const card = nextConfig(element);
    cardForm(element).change('unit', 'auto');
    expect(await card).toEqual({
      type: 'custom:x',
      decimals: '2',
      rows: [{ entity: 'sensor.a', unit: 'Wh', decimals: 0 }],
    });
    await element.updateComplete;
    const item = nextConfig(element);
    const forms = element.shadowRoot!.querySelectorAll<FormStub>('ha-form');
    (forms[1] as FormStub).change('unit', 'auto');
    // the item's select hands its number back as its word, as the card's does
    expect(await item).toEqual({
      type: 'custom:x',
      decimals: '2',
      rows: [{ entity: 'sensor.a', decimals: '0' }],
    });
    element.remove();
  });
});

describe('an editor with aliases', () => {
  it('shows an older name in its newer field and writes the newer one on the first change', () => {
    const editor = listsEditor(
      {
        schema: [
          { name: 'subtitle', selector: { text: {} } },
          { name: 'show_done', selector: { boolean: {} } },
        ],
      },
      [],
      undefined,
      [{ keys: [{ from: 'sub', to: 'subtitle' }, inverted('hide_done', 'show_done')] }],
    ) as FluvyRowsEditor;
    editor.setConfig({ type: 'custom:x', sub: 'Upstairs', hide_done: true });
    expect(editor.config).toEqual({ type: 'custom:x', subtitle: 'Upstairs', show_done: false });
  });
});

describe('a select’s options as the house has them', () => {
  const modes = {
    name: 'modes',
    selector: {
      select: { multiple: true, reorder: true, options: [{ value: 'off', label: 'Off' }] },
    },
  };
  const style = {
    name: 'style',
    selector: { select: { options: [{ value: 'tiles', label: 'Tiles' }] } },
  };
  const schema: HaFormSchemaItem[] = [
    { name: '', type: 'grid', schema: [modes, style] },
    { name: 'title', selector: { text: {} } },
  ];
  const heat = [
    { value: 'off', label: 'Aus' },
    { value: 'heat', label: 'Heizen' },
  ];

  it('swaps in the options of the field it names, through grids, and leaves the rest as they were', () => {
    const chosen = withChoices(schema, { modes: heat });
    expect(chosen[0]?.schema?.[0]?.selector).toEqual({
      select: { multiple: true, reorder: true, options: heat },
    });
    expect(chosen[0]?.schema?.[1]).toBe(style);
    expect(chosen[1]).toBe(schema[1]);
    // a name that is no select keeps its field
    expect(withChoices(schema, { title: heat })[1]).toBe(schema[1]);
  });

  it('draws the form with them, the same schema while they say the same', () => {
    let house = 'heat';
    const editor = listsEditor({ schema }, [], undefined, undefined, () =>
      house === 'heat' ? { modes: heat } : {},
    ) as FluvyRowsEditor;
    editor.setConfig({ type: 'custom:x' });
    const formOf = (): unknown =>
      (
        editor as unknown as { schema(spec: unknown, data: unknown, choices: unknown): unknown }
      ).schema(editor.spec, {}, editor.spec?.choices?.({ type: 'custom:x' }, undefined) ?? {});
    const first = formOf();
    expect(formOf()).toBe(first);
    expect(first).not.toEqual(editor.spec?.schema);
    // a house that says nothing of them leaves the form as the card wrote it
    house = 'none';
    expect(formOf()).toEqual(editor.spec?.schema);
  });

  it('reaches the lists’ items too (a row’s since): the same form while they say the same', async () => {
    const since = { name: 'since', selector: { select: { custom_value: true, options: [] } } };
    const list: RowsListSpec = { ...rows, schema: [rows.schema[0]!, since] };
    let house = 'heat';
    const editor = await drawEditor(
      listsEditor({ schema: [] }, [list], undefined, undefined, () =>
        house === 'heat' ? { since: heat } : {},
      ),
      { type: 'custom:x', rows: ['sensor.a', 'sensor.b'] },
    );
    const forms = (): readonly HaFormSchemaItem[][] =>
      [...editor.shadowRoot!.querySelectorAll<FormStub>('.item ha-form')].map(
        (form) => form.schema as HaFormSchemaItem[],
      );
    const [a, b] = forms();
    expect(a?.[1]?.selector).toEqual({ select: { custom_value: true, options: heat } });
    expect(b).toBe(a);
    editor.requestUpdate();
    await editor.updateComplete;
    expect(forms()[0]).toBe(a);
    house = 'none';
    editor.requestUpdate();
    await editor.updateComplete;
    expect(forms()[0]).toEqual(list.schema);
    expect(forms()[0]).not.toBe(a);
  });

  it('shows a toggle a select grew out of as its word, and writes it back only when another is picked', async () => {
    // 1.10's `show_grid: true` and `false` on a select of Automatic, None and the axes
    const schema = [
      selectField('show_grid', ['auto', 'none', 'x', 'y', 'both']),
      textField('title'),
    ];
    for (const [held, word] of [
      [true, 'auto'],
      [false, 'none'],
    ] as const) {
      const editor = await drawEditor(listsEditor({ schema }, []), {
        type: 'custom:x',
        show_grid: held,
      });
      expect(cardForm(editor).data['show_grid']).toBe(word);
      // another field changed: the toggle stays as the config holds it
      let next = nextConfig(editor);
      cardForm(editor).change('title', 'Power');
      expect(await next).toEqual({ type: 'custom:x', show_grid: held, title: 'Power' });
      await editor.updateComplete;
      // a word picked is written
      next = nextConfig(editor);
      cardForm(editor).change('show_grid', 'y');
      expect((await next)['show_grid']).toBe('y');
      editor.remove();
    }
  });

  it('shows a toggle among a select’s own choices as its word, and writes a pick back as the toggle (#124)', async () => {
    // a light card's `show_brightness`: true, false or when_on
    const schema = [
      {
        name: 'show_brightness',
        selector: {
          select: { options: ['true', 'when_on', 'false'].map((v) => ({ value: v, label: v })) },
        },
      },
      textField('title'),
    ];
    const editor = await drawEditor(listsEditor({ schema }, []), {
      type: 'custom:x',
      show_brightness: false,
    });
    expect(cardForm(editor).data['show_brightness']).toBe('false');
    let next = nextConfig(editor);
    cardForm(editor).change('title', 'Lamp');
    expect(await next).toEqual({ type: 'custom:x', show_brightness: false, title: 'Lamp' });
    await editor.updateComplete;
    next = nextConfig(editor);
    cardForm(editor).change('show_brightness', 'true');
    expect((await next)['show_brightness']).toBe(true);
    await editor.updateComplete;
    next = nextConfig(editor);
    cardForm(editor).change('show_brightness', 'when_on');
    expect((await next)['show_brightness']).toBe('when_on');
  });

  it('shows an item’s number in its select as the select words it (a legend entry’s decimals: 2 in YAML)', async () => {
    const decimals = {
      name: 'decimals',
      selector: {
        select: { options: ['auto', '0', '1', '2', '3'].map((v) => ({ value: v, label: v })) },
      },
    };
    const list: RowsListSpec = { ...rows, schema: [rows.schema[0]!, decimals] };
    const editor = await drawEditor(listsEditor({ schema: [] }, [list]), {
      type: 'custom:x',
      rows: [{ entity: 'sensor.a', decimals: 2 }, { entity: 'sensor.b' }],
    });
    const items = [...editor.shadowRoot!.querySelectorAll<FormStub>('.item ha-form')];
    expect(items[0]!.data).toEqual({ entity: 'sensor.a', decimals: '2' });
    // an item that says nothing keeps saying nothing
    expect(items[1]!.data).toEqual({ entity: 'sensor.b' });
  });

  it('draws the card’s fields a list names over its items, edited as the card’s (an appliance’s scan, #98)', async () => {
    const schema = [textField('title'), boolField('scan')];
    const list: RowsListSpec = { ...rows, fields: ['scan'] };
    const editor = await drawEditor(
      listsEditor({ schema }, [list], () => ({ scan: true })),
      { type: 'custom:x', title: 'Washer', rows: ['sensor.a'] },
    );
    // out of the card's form, at the head of the list's section, the default shown
    expect(shownNames(cardForm(editor).schema)).toEqual(['title']);
    const fields = editor.shadowRoot!.querySelector<FormStub>('.list .list__fields')!;
    expect(shownNames(fields.schema)).toEqual(['scan']);
    expect(fields.data).toMatchObject({ title: 'Washer', scan: true });
    // its change is the card's: the rest of the config and the list kept
    const next = nextConfig(editor);
    fields.change('scan', false);
    expect(await next).toEqual({
      type: 'custom:x',
      title: 'Washer',
      scan: false,
      rows: ['sensor.a'],
    });
    // the same form while it is the same
    editor.requestUpdate();
    await editor.updateComplete;
    expect(editor.shadowRoot!.querySelector<FormStub>('.list__fields')!.schema).toBe(fields.schema);
  });

  it('a list that asks its items offers each its own answer, never the card’s (a legend entry’s units)', async () => {
    const unit = { name: 'unit', selector: { select: { custom_value: true, options: [] } } };
    const watts = [{ value: 'kW', label: 'kW' }];
    const hours = [{ value: 'kWh', label: 'kWh' }];
    const list: RowsListSpec = {
      ...rows,
      schema: [rows.schema[0]!, unit],
      choices: (item) => (item['entity'] === 'sensor.power' ? { unit: watts } : {}),
    };
    const editor = await drawEditor(
      listsEditor({ schema: [] }, [list], undefined, undefined, () => ({ unit: hours })),
      { type: 'custom:x', rows: ['sensor.power', 'sensor.rain', 'sensor.power'] },
    );
    const forms = (): readonly HaFormSchemaItem[][] =>
      [...editor.shadowRoot!.querySelectorAll<FormStub>('.item ha-form')].map(
        (form) => form.schema as HaFormSchemaItem[],
      );
    const [power, rain, again] = forms();
    expect(power?.[1]?.selector).toEqual({ select: { custom_value: true, options: watts } });
    // nothing of its own to offer: the list's options as they are, not the card's
    expect(rain).toEqual(list.schema);
    expect(again).toBe(power);
    editor.requestUpdate();
    await editor.updateComplete;
    expect(forms()[0]).toBe(power);
    expect(forms()[1]).toBe(rain);
  });
});

describe('a list’s own entities (`own`, an appliance’s device’s, #115)', () => {
  afterEach(() => document.body.replaceChildren());
  const roles: RowsListSpec = {
    key: 'roles',
    idKey: 'role',
    title: 'editor.rows',
    helper: 'appliance.editor_roles_helper',
    picker: { name: 'role', selector: { select: { options: [] } } },
    schema: [
      { name: 'role', selector: { select: { options: [] } } },
      { name: 'entity', selector: { entity: {} } },
    ],
    own: {
      entities: (config) => (config['device'] ? ['sensor.de1_state', 'switch.de1_on'] : []),
      label: 'appliance.editor_own_entities',
    },
  };
  const offered = [{ value: 'state', label: 'State' }];
  const editor = (config: Record<string, unknown>): Promise<FluvyRowsEditor> =>
    drawEditor(
      listsEditor({ schema: [] }, [roles], undefined, undefined, () => ({ role: offered })),
      {
        type: 'custom:x',
        roles: [{ role: 'watts', entity: 'sensor.plug_power' }],
        ...config,
      },
    );
  const forms = (element: FluvyRowsEditor): FormStub[] => [
    ...element.shadowRoot!.querySelectorAll<FormStub>('.list ha-form'),
  ];

  it('offers an item’s entity fields only those entities, and what the list names already', () => {
    expect(
      withEntities([{ name: 'row', type: 'grid', schema: roles.schema }], ['sensor.a'])[0]?.schema,
    ).toEqual([
      roles.schema[0],
      { name: 'entity', selector: { entity: { include_entities: ['sensor.a'] } } },
    ]);
    // none to offer: the schema as it is
    expect(withEntities(roles.schema, undefined)).toBe(roles.schema);
  });

  it('says what the list is for, and offers the device’s entities until its switch lets the house in', async () => {
    const element = await editor({ device: 'de1' });
    expect(element.shadowRoot!.querySelector('.list__helper')?.textContent).toBe(
      'Name the entities the card did not find, or None for one it should not use.',
    );
    const [own, item, picker] = forms(element);
    expect(own?.data).toEqual({ roles: true });
    expect(own?.schema).toEqual([{ name: 'roles', selector: { boolean: {} } }]);
    const include = ['sensor.de1_state', 'switch.de1_on', 'sensor.plug_power'];
    expect(item?.schema[1]?.selector).toEqual({ entity: { include_entities: include } });
    // the add-picker offers the card's roles for the appliance, as its items do
    expect(picker?.schema[0]?.selector).toEqual({ select: { options: offered } });
    expect(item?.schema[0]?.selector).toEqual({ select: { options: offered } });
    // the switch off, the house's entities; nothing is written
    let wrote = false;
    element.addEventListener('config-changed', () => (wrote = true));
    own?.change('roles', false);
    await element.updateComplete;
    expect(forms(element)[0]?.data).toEqual({ roles: false });
    expect(forms(element)[1]?.schema[1]?.selector).toEqual({ entity: {} });
    expect(wrote).toBe(false);
  });

  it('draws no switch where the card names no device: the house’s entities', async () => {
    const element = await editor({});
    const [item] = forms(element);
    expect(item?.schema[1]?.selector).toEqual({ entity: {} });
    expect(forms(element)).toHaveLength(2);
  });
});

describe('a field or a list that cannot act (`when`)', () => {
  afterEach(() => document.body.replaceChildren());
  // a card whose compact variant has no subtitle and no rows (a lock's): its form, its rows, what it does by default
  const full = ({ variant }: Readonly<Record<string, unknown>>): boolean => variant !== 'compact';
  const form = {
    schema: [
      selectField('variant', ['full', 'compact']),
      fieldRow(textField('title'), onlyWhen(full, textField('subtitle'))),
      onlyWhen(full, boolField('show_rows')),
    ],
  };
  const list: RowsListSpec = { ...rows, when: full };
  const editor = (): HTMLElement =>
    listsEditor(form, [list], () => ({ variant: 'full', show_rows: true }));

  it('shows a field while it can act, and takes it away as what the form holds changes', async () => {
    const element = await drawEditor(editor(), { type: 'custom:x' });
    expect(shownNames(cardForm(element).schema)).toEqual([
      'variant',
      'title',
      'subtitle',
      'show_rows',
    ]);
    const written = nextConfig(element);
    cardForm(element).change('variant', 'compact');
    expect(await written).toEqual({ type: 'custom:x', variant: 'compact' });
    await element.updateComplete;
    // the title is left alone on its row's line
    expect(cardForm(element).schema.map((item) => item.name)).toEqual(['variant', 'title']);
    cardForm(element).change('variant', 'full');
    await element.updateComplete;
    expect(shownNames(cardForm(element).schema)).toContain('show_rows');
  });

  it('draws each of two fields of one name as its turn comes, never the other’s options (a week’s first day)', async () => {
    const week = ({ variant }: Readonly<Record<string, unknown>>): boolean => variant === 'full';
    const turns = listsEditor(
      {
        schema: [
          selectField('variant', ['full', 'compact']),
          onlyWhen(week, selectField('first_weekday', ['language', 'today'])),
          onlyWhen((data) => !week(data), selectField('first_weekday', ['language'])),
        ],
      },
      [],
    );
    const offered = (element: FluvyRowsEditor): unknown[] =>
      (
        cardForm(element).schema[1]?.selector?.['select'] as { options: { value: unknown }[] }
      ).options.map((option) => option.value);
    const element = await drawEditor(turns, { type: 'custom:x', variant: 'compact' });
    expect(offered(element)).toEqual(['language']);
    cardForm(element).change('variant', 'full');
    await element.updateComplete;
    expect(offered(element)).toEqual(['language', 'today']);
    cardForm(element).change('variant', 'compact');
    await element.updateComplete;
    expect(offered(element)).toEqual(['language']);
  });

  it('keeps a hidden field’s value through an edit of another, and never writes a default it hid', async () => {
    const element = await drawEditor(editor(), {
      type: 'custom:x',
      variant: 'compact',
      subtitle: 'Hall',
      show_rows: false,
    });
    expect(shownNames(cardForm(element).schema)).toEqual(['variant', 'title']);
    const written = nextConfig(element);
    cardForm(element).change('title', 'Front door');
    expect(await written).toEqual({
      type: 'custom:x',
      variant: 'compact',
      subtitle: 'Hall',
      show_rows: false,
      title: 'Front door',
    });
    const quiet = await drawEditor(editor(), { type: 'custom:x', variant: 'compact' });
    const next = nextConfig(quiet);
    cardForm(quiet).change('title', 'Back door');
    expect(await next).toEqual({ type: 'custom:x', variant: 'compact', title: 'Back door' });
  });

  it('draws no list that cannot act, and keeps its entries', async () => {
    const element = await drawEditor(editor(), {
      type: 'custom:x',
      variant: 'compact',
      rows: ['sensor.door'],
    });
    expect(listTitles(element)).toEqual([]);
    const written = nextConfig(element);
    cardForm(element).change('title', 'Front door');
    expect(await written).toMatchObject({ rows: ['sensor.door'] });
    await element.updateComplete;
    cardForm(element).change('variant', 'full');
    await element.updateComplete;
    expect(listTitles(element)).toEqual(['Rows']);
  });

  it('asks what can act of the whole card, its lists too, which the form itself never holds', async () => {
    // a card of rows whose lights' colours act where a row is a light
    const lit = (): HTMLElement =>
      listsEditor(
        {
          schema: [
            textField('title'),
            onlyWhen(holdsLight('rows', 'entities'), boolField('light_colors')),
          ],
        },
        [rows],
      );
    const none = await drawEditor(lit(), { type: 'custom:x', rows: ['switch.kettle'] });
    expect(shownNames(cardForm(none).schema)).toEqual(['title']);
    expect(cardForm(none).data).not.toHaveProperty('rows');
    // under the list's alias too
    const aliased = await drawEditor(lit(), { type: 'custom:x', entities: ['light.desk'] });
    expect(shownNames(cardForm(aliased).schema)).toEqual(['title', 'light_colors']);
    expect(cardForm(aliased).data).not.toHaveProperty('entities');
    // a row turned into a light in its own form: the card's form asks again
    const element = await drawEditor(lit(), { type: 'custom:x', rows: ['switch.kettle'] });
    const row = element.shadowRoot!.querySelectorAll<FormStub>('ha-form')[1]!;
    row.change('entity', 'light.desk');
    await element.updateComplete;
    expect(shownNames(cardForm(element).schema)).toEqual(['title', 'light_colors']);
  });

  it('hands the form the same schema while nothing it shows changes, and never a function', async () => {
    const element = await drawEditor(editor(), { type: 'custom:x' });
    const first = cardForm(element).schema;
    element.hass = { language: 'en', states: {} } as unknown as HomeAssistant;
    await element.updateComplete;
    cardForm(element).change('title', 'Front door');
    await element.updateComplete;
    expect(cardForm(element).schema).toBe(first);
    expect(JSON.stringify(first)).not.toContain('when');
    expect(
      first.flatMap((item) => [item, ...(item.schema ?? [])]).some((item) => 'when' in item),
    ).toBe(false);
    cardForm(element).change('variant', 'compact');
    await element.updateComplete;
    expect(cardForm(element).schema).not.toBe(first);
  });
});

describe('a name in Home Assistant’s parts or in words (#125)', () => {
  const named: RowsListSpec = { ...rows, schema: [entityField(), nameIconFields()] };
  const parts = [{ type: 'device' }, { type: 'entity' }];
  const config = {
    type: 'custom:x',
    entity: 'light.baum',
    name: { type: 'entity' },
    rows: [{ entity: 'light.a', name: parts }, { entity: 'light.b', name: 'Tree' }, 'light.c'],
  };
  const items = (editor: FluvyRowsEditor): FormStub[] => [
    ...editor.shadowRoot!.querySelectorAll<FormStub>('.item ha-form'),
  ];

  afterEach(() => document.body.replaceChildren());

  it('shows the card’s and each item’s name as the config holds it, parts or words', async () => {
    const editor = await drawEditor(
      listsEditor({ schema: [entityField(), nameIconFields()] }, [named]),
      config,
    );
    expect(cardForm(editor).data['name']).toEqual({ type: 'entity' });
    expect(items(editor).map((form) => form.data['name'])).toEqual([parts, 'Tree', undefined]);
  });

  it('writes what the picker says, parts or words, and keeps the rest as they were', async () => {
    const editor = await drawEditor(
      listsEditor({ schema: [entityField(), nameIconFields()] }, [named]),
      config,
    );
    let next = nextConfig(editor);
    cardForm(editor).change('name', 'Baum');
    expect(await next).toEqual({ ...config, name: 'Baum' });
    await editor.updateComplete;
    next = nextConfig(editor);
    items(editor)[1]!.change('name', [{ type: 'entity' }, { type: 'area' }]);
    expect((await next)['rows']).toEqual([
      { entity: 'light.a', name: parts },
      { entity: 'light.b', name: [{ type: 'entity' }, { type: 'area' }] },
      'light.c',
    ]);
    await editor.updateComplete;
    // the picker cleared: the item goes back to its bare id
    next = nextConfig(editor);
    items(editor)[0]!.change('name', undefined);
    expect(((await next)['rows'] as unknown[])[0]).toBe('light.a');
  });
});

describe('what the editor says under a field', () => {
  const key = (k: string): string => k;
  it('explains the second line — a keyword or a template for its select, words or a template for a text field', () => {
    expect(itemHelpers({ name: 'secondary', selector: { select: {} } }, key)).toBe(
      "A keyword, or a template such as {{ states('sensor.x') }}",
    );
    expect(itemHelpers({ name: 'secondary', selector: { text: {} } }, key)).toBe(
      "Your own words, or a template such as {{ states('sensor.x') }}",
    );
    expect(itemHelpers({ name: 'name', selector: { text: {} } }, key)).toBeUndefined();
  });
  it('says a field’s own word where it has one — an item’s colour, what it wears while none is chosen', () => {
    expect(
      itemHelpers(
        { name: 'color', selector: { ui_color: {} }, helper: 'editor.item_color_card_helper' },
        key,
      ),
    ).toBe('Empty: the card’s colour');
    expect(
      itemHelpers(
        { name: 'color', selector: { ui_color: {} }, helper: 'editor.item_color_helper' },
        key,
      ),
    ).toBe('Empty: the light’s bulb colour where the card shows bulbs’ colours, else the card’s');
    // a colour with a default of its own (a card's) says nothing: the picker names the default
    expect(
      itemHelpers({ name: 'color', selector: { ui_color: { default_color: 'primary' } } }, key),
    ).toBeUndefined();
  });
});
