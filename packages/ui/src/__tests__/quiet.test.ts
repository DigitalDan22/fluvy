import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inlineImports, parseRules } from '../../scripts/build-styles.js';

/**
 * A card quiet out of reach (1.16, #126): `styles/quiet.css` answers the unavailable skin rule by rule. Every rule of the
 * sheets that draws the dashed hairline of something out of reach has its answer there, at its own selector and so at
 * its specificity (the mark, `:where(…)`, weighs nothing), and no answer moves a pixel of layout.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'styles');
const MARK = ":where([data-unavailable='quiet'], [data-unavailable='quiet'] *)";
/** A card with nothing to show (no config, no entity) draws the hairline too: nothing of it is out of reach. */
const NOT_OUT_OF_REACH = new Set(['.fv-card--empty']);

/** A rule's selectors, split at its own commas (never at those inside `:is()`, `:where()` or `:not()`). */
function selectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(prelude.slice(from, i));
      from = i + 1;
    }
  }
  out.push(prelude.slice(from));
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const rulesOf = async (file: string) => parseRules(await inlineImports(join(SRC, file)));

describe('the quiet sheet', () => {
  it('answers every dashed hairline of the unavailable skin in the sheets, at its own selector', async () => {
    const quiet = new Set(
      (await rulesOf('quiet.css'))
        .flatMap((rule) => selectors(rule.prelude))
        .map((selector) => selector.replace(MARK, '')),
    );
    const files = (await readdir(SRC)).filter((f) => f.endsWith('.css') && f !== 'quiet.css');
    const dashed: string[] = [];
    for (const file of files)
      for (const rule of await rulesOf(file))
        if (/outline\s*:[^;]*dashed/.test(rule.body))
          dashed.push(...selectors(rule.prelude).filter((s) => !NOT_OUT_OF_REACH.has(s)));
    expect(dashed.length).toBeGreaterThan(6);
    for (const selector of dashed) expect(quiet.has(selector), selector).toBe(true);
  });

  it('marks every selector, and gives back paint alone: no layout of its own', async () => {
    const LAYOUT =
      /(^|;)\s*(display|position|width|height|min-|max-|margin|padding|gap|flex|grid|inset|top|left|right|bottom|font-size|line-height)/;
    for (const rule of await rulesOf('quiet.css')) {
      for (const selector of selectors(rule.prelude))
        expect(selector.endsWith(MARK), selector).toBe(true);
      expect(LAYOUT.test(rule.body), rule.prelude).toBe(false);
    }
  });
});
