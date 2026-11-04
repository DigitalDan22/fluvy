// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '../index.js';
import { setMotionPreference } from '../motion.js';

afterEach(() => {
  setMotionPreference('system');
  document.body.replaceChildren();
});

describe('a control in its own shadow root', () => {
  it('carries the person’s reduced motion itself, attached before or after the choice, and lets it go', async () => {
    const ruler = document.createElement('fluvy-ruler');
    document.body.append(ruler);
    expect(ruler.hasAttribute('reduced-motion')).toBe(false);
    setMotionPreference('reduced');
    expect(ruler.hasAttribute('reduced-motion')).toBe(true);
    // one attached while it holds wears it from the start
    const dial = document.createElement('fluvy-dial');
    document.body.append(dial);
    expect(dial.hasAttribute('reduced-motion')).toBe(true);
    setMotionPreference('system');
    expect([ruler, dial].map((node) => node.hasAttribute('reduced-motion'))).toEqual([
      false,
      false,
    ]);
    // one taken away is no longer marked
    ruler.remove();
    setMotionPreference('reduced');
    expect(ruler.hasAttribute('reduced-motion')).toBe(false);
    expect(dial.hasAttribute('reduced-motion')).toBe(true);
  });
});
