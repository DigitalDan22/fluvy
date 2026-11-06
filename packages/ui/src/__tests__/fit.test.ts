// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fitPills } from '../parts.js';

/*
 * A pill's width as `fitPills` gives it, in a layout of 8 px a letter where a glyph and the gap after it take 28: what a
 * range over the pill's content measures (happy-dom lays nothing out).
 */
const measure = Range.prototype.getBoundingClientRect;
let perLetter = 8;
beforeEach(() => {
  Range.prototype.getBoundingClientRect = function (this: Range) {
    const box = this.startContainer as Element;
    const width = (box.textContent?.length ?? 0) * perLetter + (box.querySelector('i') ? 28 : 0);
    return { width } as DOMRect;
  };
});
afterEach(() => {
  Range.prototype.getBoundingClientRect = measure;
  perLetter = 8;
  document.body.replaceChildren();
});

describe('a fitted pill', () => {
  it('is measured again when its glyph comes or goes beside the same words, and only then', () => {
    const pill = document.createElement('span');
    pill.dataset['fit'] = '28';
    pill.innerHTML = '<span class="fv-chip__name">Garten</span>';
    document.body.append(pill);
    fitPills(document.body);
    // "Garten" (48) and its 28, on the 4 grid
    expect(pill.style.width).toBe('76px');
    // the room gives the glyph room: the pill holds it, the name whole beside it
    pill.prepend(document.createElement('i'));
    fitPills(document.body);
    expect(pill.style.width).toBe('104px');
    pill.querySelector('i')!.remove();
    fitPills(document.body);
    expect(pill.style.width).toBe('76px');
    // the same words, nothing beside them that changed: kept as fitted (a web font's arrival forces it)
    perLetter = 9;
    fitPills(document.body);
    expect(pill.style.width).toBe('76px');
    fitPills(document.body, true);
    expect(pill.style.width).toBe('84px');
  });
});
