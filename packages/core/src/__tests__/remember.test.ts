import { describe, expect, it } from 'vitest';
import { remember } from '../remember.js';

describe('remember', () => {
  it('answers the object it made last while every input is the same, and makes another when one is not', () => {
    let made = 0;
    const overlay = remember((real: object, own: object) => {
      made++;
      return { ...real, ...own };
    });
    const real = { a: 1 };
    const own = { b: 2 };
    const first = overlay(real, own);
    expect(overlay(real, own)).toBe(first);
    expect(made).toBe(1);
    // an equal object is another object: what compares by reference would see a change
    const next = overlay({ a: 1 }, own);
    expect(next).not.toBe(first);
    expect(next).toEqual(first);
    expect(overlay(real, own)).not.toBe(first); // only the last answer is kept
    expect(made).toBe(3);
  });

  it('tells a value by its value, undefined among them', () => {
    const themed = remember((dark: boolean | undefined) => ({ dark }));
    const day = themed(undefined);
    expect(themed(undefined)).toBe(day);
    expect(themed(true)).not.toBe(day);
  });
});
