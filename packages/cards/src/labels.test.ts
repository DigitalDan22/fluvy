import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const STYLES = fileURLToPath(new URL('../../ui/styles/', import.meta.url));
const LABELS = join(STYLES, 'fluvy', 'labels.css');

/** Every file under `dir` whose name ends in `suffix`. */
const files = (dir: string, suffix: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith(suffix) && !name.endsWith('.test.ts'))
    .map((name) => join(dir, name));

/** A sheet's rules, `selector { body }`, comments left out. */
const rules = (css: string): { selector: string; body: string }[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1]!.trim(),
    body: match[2]!,
  }));

describe('the labels trimmed to their capitals (#122)', () => {
  // the classes `fluvy/labels.css` trims (a selector's subject, never the box it is in): its own rule pads their block
  // back to their line
  const trim = rules(readFileSync(LABELS, 'utf8')).find(({ body }) => body.includes('text-box'))!;
  const trimmed = [...trim.selector.matchAll(/\.([\w-]+)(?![\w-]*\s*[>+~]|[\w-]*\s+[.\w])/g)].map(
    (m) => m[1]!,
  );
  const named = new RegExp(`\\.(${trimmed.join('|')})(?![\\w-])[^\\s>+~]*$`);

  it('keep the block padding their rule gives them: a control’s sides are its inline padding', () => {
    // a rule that pads such a label's block outranks the trim's wherever it comes later (a card's sheet does) or is
    // more specific, and the words sit where an engine's rounding puts them again; two lines keep their line boxes
    const sheets = [
      ...files(STYLES, '.css')
        .filter((file) => file !== LABELS)
        .map((file) => readFileSync(file, 'utf8')),
      ...files(SRC, '.ts').flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/css`([\s\S]*?)`/g)].map((m) => m[1]!),
      ),
    ];
    const padded = sheets
      .flatMap(rules)
      .filter(
        ({ selector, body }) =>
          selector.split(',').some((part) => named.test(part.trim())) &&
          /(^|[;\s])padding(-top|-bottom|-block[\w-]*)?\s*:/.test(body) &&
          !/text-box:\s*normal/.test(body),
      )
      .map(({ selector }) => selector);
    expect(padded).toEqual([]);
  });
});
