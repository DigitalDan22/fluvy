import { resolveEntity, type HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
// the energy family's units, registered as its chunk registers them
import '../history-bars/units.js';
import {
  decimalsOf,
  figuresOf,
  ladderOf,
  scaleFor,
  scaleNamed,
  unitClass,
  writeFigure,
  writesZero,
} from './units.js';

/** A house with one sensor, its registry precision when given. */
const house = (unit: string, state: string, precision?: number): HomeAssistant =>
  ({
    states: {
      'sensor.x': { entity_id: 'sensor.x', state, attributes: { unit_of_measurement: unit } },
    },
    entities: precision === undefined ? {} : { 'sensor.x': { display_precision: precision } },
    language: 'en',
  }) as unknown as HomeAssistant;

describe('the classes Home Assistant converts between', () => {
  it('knows a unit by its class, and nothing else', () => {
    expect(unitClass('kWh')).toBe('energy');
    expect(unitClass(' W ')).toBe('power');
    expect(unitClass('gal')).toBe('volume');
    expect(unitClass('mi')).toBe('distance');
    expect(unitClass('°C')).toBeUndefined();
    expect(ladderOf('MJ')).toEqual(['Wh', 'kWh', 'MWh']);
    expect(ladderOf('mi')).toEqual([]);
    expect(ladderOf('%')).toEqual([]);
  });
});

describe('the one rule for units and decimals', () => {
  it('names a scale of the base’s class, and none for another class', () => {
    expect(scaleNamed('kW', 'W')).toEqual({ unit: 'kW', divisor: 1000 });
    expect(scaleNamed('W', 'W')).toEqual({ unit: 'W', divisor: 1 });
    expect(scaleNamed('MWh', 'Wh')).toEqual({ unit: 'MWh', divisor: 1e6 });
    expect(scaleNamed('W', 'kW')).toEqual({ unit: 'W', divisor: 0.001 });
    expect(scaleNamed('gal', 'L')?.divisor).toBeCloseTo(3.785411784, 9);
    expect(scaleNamed('kWh', 'W')).toBeUndefined();
    expect(scaleNamed('auto', 'W')).toBeUndefined();
    expect(scaleNamed('kW', 'VA')).toBeUndefined();
  });

  it('takes the unit asked where it converts, else the one the peak asks for', () => {
    expect(figuresOf(undefined, { unit: 'W' }, 'W', 2308)).toEqual({ unit: 'W', divisor: 1 });
    expect(figuresOf(undefined, {}, 'W', 2308)).toEqual({ unit: 'kW', divisor: 1000 });
    expect(figuresOf(undefined, { unit: 'kWh' }, 'W', 2308)).toEqual({ unit: 'kW', divisor: 1000 });
    expect(figuresOf(undefined, { unit: 'auto' }, 'W', 450)).toEqual({ unit: 'W', divisor: 1 });
    expect(scaleFor(2.5e9, 'Wh')).toEqual({ unit: 'GWh', divisor: 1e9 });
  });

  it('reads the decimals asked, as a number or the editor’s word, auto as none', () => {
    expect(decimalsOf(2)).toBe(2);
    expect(decimalsOf('0')).toBe(0);
    expect(decimalsOf('auto')).toBeUndefined();
    expect(decimalsOf('')).toBeUndefined();
    expect(decimalsOf(undefined)).toBeUndefined();
    expect(decimalsOf(7)).toBe(3);
  });

  it('writes decimals asked over the sensor’s precision over the figure’s size', () => {
    const hass = house('W', '2308', 2);
    const view = resolveEntity(hass, 'sensor.x');
    // asked: fixed, the width stable
    expect(writeFigure(hass, 2308, figuresOf(hass, { decimals: 0 }, 'W', 2308, view))).toBe('2');
    expect(
      writeFigure(hass, 2308, figuresOf(hass, { unit: 'W', decimals: 1 }, 'W', 2308, view)),
    ).toBe('2,308.0');
    // the sensor's own precision, in its own unit only
    expect(writeFigure(hass, 45, figuresOf(hass, {}, 'W', 45, view))).toBe('45.00');
    expect(writeFigure(hass, 2308, figuresOf(hass, {}, 'W', 2308, view))).toBe('2.3');
    // without either: three significant places at most, a scaled figure keeping its decimal
    expect(writeFigure(undefined, 45.3, figuresOf(undefined, {}, 'W', 45.3))).toBe('45.3');
    expect(writeFigure(undefined, 3000, figuresOf(undefined, {}, 'W', 3000))).toBe('3.0');
    expect(writeFigure(undefined, 250, figuresOf(undefined, {}, 'W', 3000))).toBe('0.25');
    expect(writeFigure(undefined, 5, figuresOf(undefined, {}, 'W', 5))).toBe('5');
    expect(writeFigure(undefined, -1200, figuresOf(undefined, {}, 'W', 1200))).toBe('−1.2');
  });
});

describe('a figure its decimals write as nothing', () => {
  const kWh = (digits?: number) => ({
    unit: 'kWh',
    divisor: 1000,
    ...(digits === undefined ? {} : { digits }),
  });

  it('is one they round to zero, never one they round up', () => {
    expect(writesZero(0, kWh(2))).toBe(true);
    expect(writesZero(4, kWh(2))).toBe(true);
    expect(writeFigure(undefined, 4, kWh(2))).toBe('0.00');
    expect(writesZero(5, kWh(2))).toBe(false);
    expect(writesZero(49.999999999997, kWh(2))).toBe(false);
    expect(writeFigure(undefined, 49.999999999997, kWh(2))).toBe('0.05');
    expect(writesZero(400, kWh(0))).toBe(true);
    expect(writesZero(500, kWh(0))).toBe(false);
  });

  it('without decimals asked, at three significant places', () => {
    expect(writesZero(20, kWh())).toBe(false);
    expect(writeFigure(undefined, 20, kWh())).toBe('0.02');
    expect(writesZero(4, kWh())).toBe(true);
    expect(writesZero(4, { unit: 'Wh', divisor: 1 })).toBe(false);
  });
});
