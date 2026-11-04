import { describe, expect, it } from 'vitest';
import {
  activityOf,
  cabinOf,
  chargeOf,
  chargeWord,
  convertDistance,
  lineOf,
  lowRange,
  plugged,
  pluggedWord,
} from './state.js';

describe('a car’s charge', () => {
  it.each([
    // Tesla's six
    ['charging', 'charging'],
    ['complete', 'complete'],
    ['stopped', 'stopped'],
    ['starting', 'waiting'],
    ['disconnected', 'unplugged'],
    ['no_power', 'stopped'],
    // Renault's
    ['charge_in_progress', 'charging'],
    ['waiting_for_a_planned_charge', 'waiting'],
    ['charge_ended', 'complete'],
    ['not_in_charge', 'idle'],
    ['charge_error', 'error'],
    // Volvo's and Polestar's
    ['done', 'complete'],
    ['scheduled', 'waiting'],
    ['idle', 'idle'],
    ['Smart Charging', 'charging'],
    ['Smart Charging Paused', 'waiting'],
    ['Fault', 'error'],
    // Škoda's
    ['connect_cable', 'unplugged'],
    ['ready_for_charging', 'stopped'],
    ['conserving', 'complete'],
    ['charging_interrupted', 'stopped'],
    // MG's
    ['Charging (AC)', 'charging'],
    ['Charging Finished', 'complete'],
    ['Charging Stopped', 'stopped'],
    ['Scheduled Charging', 'waiting'],
    ['Unplugged', 'unplugged'],
    // Volkswagen's two, in words and run together
    ['Charge purpose reached and conservation charging', 'complete'],
    ['chargePurposeReachedAndNotConservationCharging', 'complete'],
    ['readyForCharging', 'stopped'],
    ['Ready', 'stopped'],
    ['Off', 'idle'],
    // BMW's CarData
    ['NOCHARGING', 'idle'],
    ['CHARGINGACTIVE', 'charging'],
    ['CHARGINGENDED', 'complete'],
    ['INITIALIZATION', 'waiting'],
  ])('reads “%s” as %s', (word, charge) => {
    expect(chargeWord(word)).toBe(charge);
  });

  it('says nothing of a word it does not know', () => {
    expect(chargeWord('Unsupported')).toBeNull();
    expect(chargeWord('')).toBeNull();
  });

  it('reads a charging binary sensor and the cable beside it (Kia’s, Nissan’s)', () => {
    expect(chargeOf({ state: { word: 'on', binary: true }, plugged: true })).toBe('charging');
    expect(chargeOf({ state: { word: 'off', binary: true }, plugged: true })).toBe('stopped');
    expect(chargeOf({ state: { word: 'off', binary: true }, plugged: false })).toBe('unplugged');
  });

  it('is complete where it stops at its limit, plugged in', () => {
    expect(chargeOf({ state: { word: 'stopped', binary: false }, level: 80, limit: 80 })).toBe(
      'complete',
    );
    expect(chargeOf({ plugged: true, level: 90, limit: 80 })).toBe('complete');
  });

  it('lets the cable say what an idle word does not, and the power where nothing else speaks', () => {
    expect(chargeOf({ state: { word: 'idle', binary: false }, plugged: true })).toBe('stopped');
    expect(chargeOf({ state: { word: 'idle', binary: false }, plugged: false })).toBe('unplugged');
    expect(chargeOf({ state: { word: 'idle', binary: false } })).toBe('idle');
    expect(chargeOf({ watts: 7200, plugged: true })).toBe('charging');
    expect(chargeOf({ watts: 20, plugged: true })).toBe('stopped');
    expect(chargeOf({})).toBeNull();
  });

  it('is told unplugged by the cable, whatever an older word said, but a failure stays one', () => {
    expect(chargeOf({ state: { word: 'stopped', binary: false }, plugged: false })).toBe(
      'unplugged',
    );
    expect(chargeOf({ state: { word: 'error', binary: false }, plugged: false })).toBe('error');
  });

  it('says the cable is in only where the charge needs one', () => {
    expect(plugged('stopped')).toBe(true);
    expect(plugged('idle')).toBe(false);
    expect(plugged('unplugged')).toBe(false);
    expect(plugged(null)).toBe(false);
  });

  it('reads a plug state’s words', () => {
    expect(pluggedWord('plugged')).toBe(true);
    expect(pluggedWord('Connected')).toBe(true);
    expect(pluggedWord('disconnected')).toBe(false);
    expect(pluggedWord('plug_unknown')).toBeNull();
  });
});

describe('what a car does', () => {
  it('drives in a gear, at a speed, or by its sensor; sleeps by its state; is out of reach where nothing reads', () => {
    expect(activityOf({ shift: 'd', reachless: false })).toBe('driving');
    expect(activityOf({ shift: 'p', speed: 0, reachless: false })).toBe('parked');
    expect(activityOf({ speed: 40, reachless: false })).toBe('driving');
    expect(activityOf({ moving: true, reachless: false })).toBe('driving');
    expect(activityOf({ state: 'asleep', reachless: false })).toBe('asleep');
    expect(activityOf({ state: 'likely_asleep', reachless: false })).toBe('asleep');
    expect(activityOf({ state: 'power_saving_mode', reachless: false })).toBe('asleep');
    expect(activityOf({ state: 'car_in_use', reachless: false })).toBe('driving');
    expect(activityOf({ state: 'unreachable', reachless: false })).toBe('offline');
    expect(activityOf({ shift: 'd', reachless: true })).toBe('offline');
  });
});

describe('the line under the battery', () => {
  it('is low under the card’s range, else at a fifth of its charge', () => {
    expect(lowRange(40, 60, 50)).toBe(true);
    expect(lowRange(80, 10, 50)).toBe(false);
    expect(lowRange(null, 20, undefined)).toBe(true);
    expect(lowRange(null, 21, undefined)).toBe(false);
    expect(lowRange(null, null, undefined)).toBe(false);
  });

  it('finds a cabin too cold or too hot, in either unit', () => {
    expect(cabinOf(2, '°C')).toBe('cold');
    expect(cabinOf(38, '°C')).toBe('hot');
    expect(cabinOf(20, '°C')).toBeNull();
    expect(cabinOf(39, '°F')).toBe('cold');
    expect(cabinOf(70, '°F')).toBeNull();
    expect(cabinOf(null, '°C')).toBeNull();
  });

  it('says the most pressing first', () => {
    const at = (o: Partial<Parameters<typeof lineOf>[0]>) =>
      lineOf({ charge: null, low: false, open: null, cabin: null, ...o });
    expect(at({ charge: 'error', low: true })).toBe('error');
    expect(at({ charge: 'charging', low: true, open: 'windows' })).toBe('charging');
    expect(at({ low: true, open: 'windows' })).toBe('low');
    expect(at({ open: 'trunk', charge: 'complete' })).toBe('open');
    expect(at({ charge: 'complete', cabin: 'cold' })).toBe('complete');
    expect(at({ charge: 'waiting' })).toBe('waiting');
    expect(at({ charge: 'stopped', cabin: 'hot' })).toBe('stopped');
    expect(at({ charge: 'unplugged', cabin: 'cold' })).toBe('cabin');
    expect(at({ charge: 'unplugged' })).toBe('unplugged');
    expect(at({ charge: 'idle' })).toBe('none');
  });
});

describe('a distance', () => {
  it('goes from kilometres to miles and back; a unit it does not know stays', () => {
    expect(convertDistance(160.9344, 'km', 'mi')).toBeCloseTo(100);
    expect(convertDistance(100, 'mi', 'km')).toBeCloseTo(160.9344);
    expect(convertDistance(5, 'km', 'km')).toBe(5);
    expect(convertDistance(5, 'furlong', 'km')).toBe(5);
  });
});
