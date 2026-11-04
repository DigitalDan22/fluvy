import type { EntityView, HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import type { TextRuler } from '../shared/fit.js';
import type { HelperHost, HelperRowConfig } from './context.js';
import { rowsKeepIcon, rowStacks } from '../shared/row-end.js';
import { momentValue } from './rows.js';

/** A ruler that lays every glyph 8 px wide; a pill adds its sides on the 4 grid, as `fitPills` does. */
const ruler = {
  width: (_cls: string, text: string) => text.length * 8,
  pill: (_cls: string, text: string, sides: number) => Math.ceil((text.length * 8 + sides) / 4) * 4,
} as unknown as TextRuler;

/* A date takes the form that holds within its pill's cap (`valueCap`, as `rowEndStyles` caps a value's button). */
describe("a date's pill within its cap", () => {
  const hass = {
    language: 'pt-BR',
    locale: { language: 'pt-BR', number_format: 'language', time_format: '24' },
  } as unknown as HomeAssistant;
  const host = (contentWidth: number, bare: boolean): HelperHost =>
    ({
      hass,
      contentWidth,
      ruler,
      bare,
      texts: { resolve: (text: string) => text },
      state: (view: EntityView) => view.state,
    }) as unknown as HelperHost;
  const helper = (state: string, name: string): EntityView =>
    ({ id: 'input_datetime.x', domain: 'input_datetime', status: 'ok', state, name }) as EntityView;
  const config: HelperRowConfig = { entity: 'input_datetime.x', secondary: 'Soon' };
  /** "10 de nov." is a pill of 112 (ten glyphs and the sides), "10/11" one of 72. */
  const date = (name: string) => helper('2026-11-10', name);
  const end = (width: number, name: string) => ({
    name,
    button: momentValue(host(width, true), date(name), config),
    sub: 'Soon',
    capped: true,
  });

  it("names the month where the pill holds it: a bare row's 168 at 266", () => {
    expect(momentValue(host(266, true), date('Holiday start'), config)).toBe('10 de nov.');
    expect(rowStacks(ruler, 266, end(266, 'Holiday start'))).toBe(false);
  });

  it('takes the figures where the name would not hold at 171 (the cap is 104), the row keeping its line', () => {
    expect(momentValue(host(171, true), date('Trip'), config)).toBe('10/11');
    expect(rowStacks(ruler, 171, end(171, 'Trip'))).toBe(false);
  });

  it('stacks the figures under a name that has no room beside them either', () => {
    // 171 − 12 − 72 leaves 87 beside "10/11", under the 96 "Holiday start" (104) is held to: the row stacks
    expect(momentValue(host(171, true), date('Holiday start'), config)).toBe('10/11');
    expect(rowStacks(ruler, 171, end(171, 'Holiday start'))).toBe(true);
  });

  it('stacks where even the figures run over the cap (100: a cap of 56), the pill uncapped under the name', () => {
    expect(momentValue(host(100, true), date('Trip'), config)).toBe('10/11');
    expect(rowStacks(ruler, 100, end(100, 'Trip'))).toBe(true);
  });

  it('weighs the cap for the circles too: a short name keeps its circle beside the figures at 211', () => {
    // with its circle the cap is 72 at 211: the month's name (112) runs over it, the figures (72) hold, and beside
    // them "Trip" (32) keeps its room (211 − 68 − 72 = 71); at 171 the cap is 48 and the circles go
    const trip = (width: number) => ({
      name: 'Trip',
      button: momentValue(host(width, false), date('Trip'), config),
      capped: true,
    });
    expect(trip(211).button).toBe('10/11');
    expect(rowsKeepIcon(ruler, 211, [trip(211)])).toBe(true);
    expect(rowsKeepIcon(ruler, 171, [trip(171)])).toBe(false);
  });

  it('leaves a time as it is', () => {
    expect(momentValue(host(171, true), helper('06:45:00', 'Wake-up'), config)).toBe('06:45');
    expect(momentValue(host(100, false), helper('06:45:00', 'Wake-up'), config)).toBe('06:45');
  });
});
