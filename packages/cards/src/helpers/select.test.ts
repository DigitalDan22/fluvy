// @vitest-environment happy-dom
import type { EntityView, HassEntity, HomeAssistant } from '@fluvy/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { TextRuler } from '../shared/fit.js';
import { html, render } from 'lit';
import { drawEditor, type FormStub } from '../shared/fixtures/editor.js';
import type { HelperHost, HelperRowConfig } from './context.js';
import { FluvyHelpersCard, helpersHeight } from './helpers-card.js';
import { rowsKeepIcon } from './rows.js';
import { asChips, offered, selectEnd, selectPiece } from './select.js';

/*
 * #96: a select offers the row's own options in their order (of those it lists), in the row's words before Home
 * Assistant's, as chips up to six or as Fluvy's dropdown past them, or as the row says (`display`).
 */

const OVEN = Array.from({ length: 30 }, (_, i) => `mode_${i + 1}`);

describe('the options a select offers', () => {
  it("is the row's own in its order, of those the select lists", () => {
    expect(offered(OVEN, ['mode_9', 'mode_2', 'nope', 'mode_23'])).toEqual([
      'mode_9',
      'mode_2',
      'mode_23',
    ]);
  });

  it('is all it lists where the row names none of them, or nothing', () => {
    expect(offered(['a', 'b'], undefined)).toEqual(['a', 'b']);
    expect(offered(['a', 'b'], [])).toEqual(['a', 'b']);
    expect(offered(['a', 'b'], ['x', 'y'])).toEqual(['a', 'b']);
    expect(offered(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it("keeps the row's own while the select has not been read, and reads a figure as its text", () => {
    expect(offered([], ['grill', 'steam'])).toEqual(['grill', 'steam']);
    expect(offered(['1', '2', '3'], [3, 1])).toEqual(['3', '1']);
  });

  it('is chips up to six, a dropdown past them, or as the row says', () => {
    expect(asChips({}, 6)).toBe(true);
    expect(asChips({}, 7)).toBe(false);
    expect(asChips({ display: 'auto' }, 7)).toBe(false);
    expect(asChips({ display: 'chips' }, 30)).toBe(true);
    expect(asChips({ display: 'dropdown' }, 2)).toBe(false);
  });
});

describe("the helpers card's height with a select's own options", () => {
  const oven = (row: Partial<HelperRowConfig>) =>
    helpersHeight(
      { type: 'custom:fluvy-helpers-card', rows: [{ entity: 'select.oven', ...row }] },
      () => ({ options: OVEN }),
    );
  it('is a row of 60 for a long list, and chips for a part of it', () => {
    expect(oven({})).toBe(84 + 16 + 60);
    // four short options fill one row of four chips (28 above them, 44 a row)
    expect(oven({ options: ['mode_1', 'mode_2', 'mode_3', 'mode_4'] })).toBe(84 + 16 + 28 + 44);
  });

  it('is a row for a short list shown as a dropdown, and chips for a long one shown as chips', () => {
    expect(oven({ options: ['mode_1', 'mode_2'], display: 'dropdown' })).toBe(84 + 16 + 60);
    expect(oven({ display: 'chips' })).toBeGreaterThan(84 + 16 + 28 + 4 * 44);
  });

  it('counts the same select twice as two rows of their own, by position (an oven and its upper zone)', () => {
    const config = {
      type: 'custom:fluvy-helpers-card',
      rows: [
        { entity: 'select.oven' },
        { entity: 'select.oven', options: ['mode_1', 'mode_2', 'mode_3', 'mode_4'] },
      ],
    };
    expect(helpersHeight(config, () => ({ options: OVEN }))).toBe(84 + 16 + 60 + 16 + 28 + 44);
  });

  it("counts the row's own options from its config alone where the house is not there to say", () => {
    const config = {
      type: 'custom:fluvy-helpers-card',
      rows: [{ entity: 'select.oven', options: OVEN.slice(0, 8) }],
    };
    expect(helpersHeight(config)).toBe(84 + 16 + 60);
  });
});

const ruler = {
  width: (_cls: string, text: string) => text.length * 8,
  pill: (_cls: string, text: string, sides: number) => Math.ceil((text.length * 8 + sides) / 4) * 4,
} as unknown as TextRuler;

const state = (options: readonly string[], value: string): HassEntity =>
  ({
    entity_id: 'select.tv',
    state: value,
    attributes: { friendly_name: 'Picture mode', options },
    last_changed: '',
    last_updated: '',
  }) as unknown as HassEntity;

const viewOf = (stateObj: HassEntity): EntityView =>
  ({
    id: stateObj.entity_id,
    domain: 'select',
    status: 'ok',
    stateObj,
    state: stateObj.state,
    name: 'Picture mode',
    areaName: '',
    attr: (key: string) => stateObj.attributes[key],
  }) as unknown as EntityView;

function hostOf(calls: unknown[][]): HelperHost {
  return {
    hass: {
      language: 'en',
      formatEntityState: (s: HassEntity) => s.state.charAt(0).toUpperCase() + s.state.slice(1),
    } as unknown as HomeAssistant,
    contentWidth: 320,
    ruler,
    bare: false,
    texts: { resolve: (text: string) => text },
    state: (view: EntityView) => view.state,
    expect: () => undefined,
    call: (...args: unknown[]) => calls.push(args),
    moreInfo: () => undefined,
  } as unknown as HelperHost;
}

describe('a select in the card', () => {
  afterEach(() => document.body.replaceChildren());

  const TV = ['standard', 'dynamic', 'movie', 'gen_589828'];
  const draw = (row: HelperRowConfig, value = 'gen_589828') => {
    const calls: unknown[][] = [];
    const host = hostOf(calls);
    const view = viewOf(state(TV, value));
    const piece = selectPiece(host, view, row);
    const root = document.createElement('div');
    document.body.append(root);
    render('blocks' in piece ? html`${piece.blocks}` : piece.row, root);
    return { root, calls, host, view };
  };

  it("says an option in the row's words, before Home Assistant's", () => {
    const { root } = draw({ entity: 'select.tv', labels: { gen_589828: 'AI Mode' } });
    const chips = [...root.querySelectorAll('.fv-chip')].map((chip) => chip.textContent?.trim());
    expect(chips).toEqual(['Standard', 'Dynamic', 'Movie', 'AI Mode']);
  });

  it("offers the row's own options in its order, and chooses one with select_option", () => {
    const { root, calls } = draw({ entity: 'select.tv', options: ['movie', 'standard'] }, 'movie');
    const chips = [...root.querySelectorAll<HTMLElement>('.fv-chip')];
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual(['Movie', 'Standard']);
    chips[1]?.click();
    expect(calls).toEqual([['select', 'select_option', { option: 'standard' }, 'select.tv']]);
  });

  it('is a row whose value opens the dropdown, in its words, when the row says so', () => {
    const row: HelperRowConfig = {
      entity: 'select.tv',
      display: 'dropdown',
      labels: { gen_589828: 'AI Mode' },
    };
    const { root, calls, host, view } = draw(row);
    expect(root.querySelector('.fv-chip')).toBeNull();
    const button = root.querySelector<HTMLButtonElement>('.in-value')!;
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.querySelector('.in-value__text')?.textContent).toBe('AI Mode');
    // the dropdown lays out as nothing after the button, its options the row's words
    const menu = button.nextElementSibling as HTMLElement & {
      options: readonly { value: string; label: string }[];
    };
    expect(menu.localName).toBe('fluvy-select');
    expect(menu.hasAttribute('anchored')).toBe(true);
    expect(menu.options.map((option) => option.label)).toEqual([
      'Standard',
      'Dynamic',
      'Movie',
      'AI Mode',
    ]);
    menu.dispatchEvent(new CustomEvent('fluvy-change', { detail: { value: 'movie' } }));
    expect(calls).toEqual([['select', 'select_option', { option: 'movie' }, 'select.tv']]);
    // the row's end is the pill and its chevron
    expect(selectEnd(host, view, row)).toEqual({ button: 'AI Mode', menu: true, capped: true });
  });

  it('lets the chevron give way under the name before the words would be cut', () => {
    const row: HelperRowConfig = {
      entity: 'select.tv',
      display: 'dropdown',
      labels: { gen_589828: 'AI Mode' },
    };
    const chevron = (contentWidth: number): boolean => {
      const host = { ...hostOf([]), contentWidth, bare: true };
      const piece = selectPiece(host, viewOf(state(TV, 'gen_589828')), row);
      const root = document.createElement('div');
      render('row' in piece ? piece.row : html``, root);
      const button = root.querySelector('.in-value')!;
      expect(button.getAttribute('aria-haspopup')).toBe('listbox');
      return button.querySelector('svg') !== null;
    };
    // "AI Mode" is 56: with its sides and chevron 108, without the chevron 88
    expect(chevron(108)).toBe(true);
    expect(chevron(100)).toBe(false);
  });

  it('counts the chevron in what ends the row', () => {
    // "Picture mode" (96) keeps its circle beside "AI Mode" and its chevron (56 + 32 + 20) from 272; beside the
    // words alone it would from 252
    const end = { name: 'Picture mode', button: 'AI Mode', menu: true };
    expect(rowsKeepIcon(ruler, 272, [end])).toBe(true);
    expect(rowsKeepIcon(ruler, 252, [end])).toBe(false);
    expect(rowsKeepIcon(ruler, 252, [{ ...end, menu: false }])).toBe(true);
  });
});

describe("a select row's editor", () => {
  afterEach(() => document.body.replaceChildren());

  it('shows a select its options in their words, chips or a dropdown and its names; a time its presets', async () => {
    const editor = await FluvyHelpersCard.getConfigElement();
    const tv = state(['standard', 'gen_589828'], 'standard');
    Object.assign(editor, {
      hass: {
        language: 'en',
        states: { 'select.tv': tv },
        formatEntityState: (_s: HassEntity, value: string) =>
          value === 'standard' ? 'Standard' : value,
        localize: (key: string) => key,
      },
    });
    const drawn = await drawEditor(editor, {
      type: 'custom:fluvy-helpers-card',
      rows: ['select.tv', 'input_datetime.wake_up'],
    });
    const [select, time] = [...drawn.shadowRoot!.querySelectorAll<FormStub>('.item ha-form')];
    const names = (form: FormStub | undefined): string[] =>
      (form?.schema ?? [])
        .flatMap((item) => (item.schema ? item.schema : [item]))
        .map((item) => item.name);
    expect(names(select)).toEqual(expect.arrayContaining(['options', 'display', 'labels']));
    expect(names(select)).not.toContain('presets');
    expect(names(time)).toContain('presets');
    expect(names(time)).not.toContain('options');
    const options = select?.schema.find((item) => item.name === 'options')?.selector?.[
      'select'
    ] as {
      options: { value: string; label: string }[];
      reorder: boolean;
    };
    expect(options.reorder).toBe(true);
    expect(options.options).toEqual([
      { value: 'standard', label: 'Standard' },
      { value: 'gen_589828', label: 'gen_589828' },
    ]);
  });
});
