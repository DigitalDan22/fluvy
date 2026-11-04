#!/usr/bin/env node
/**
 * Every card's declared height (`static layoutHeight`, what the automatic dashboard lays columns out with) against
 * what it measures in the playground at a 360 column: the sheets' frames at their natural width (a card of 360;
 * a frame with a width of its own, or a card showing its empty state, is not a sample). The declaration is read as
 * the dashboard reads it (`houseHeightOf`, the cards' `house-heights.ts`), with the house the frame shows (`hass`),
 * so it counts what the entity's capabilities draw.
 *
 * A drift over 8 px fails the run (exit 1) unless the known heights (`tools/render/known-heights.json`) list it:
 * the frame, the card, what it declares and what it draws, and why — the few cards whose drawing depends on live
 * content the config cannot know (a printer's job, a calendar's events, the house's appliances). A known drift no
 * longer seen as listed fails too (remove it: the file only shrinks), and `--write-known` rewrites the file from
 * what the run saw, keeping the reasons.
 *
 * The pages are read under reduced motion, as the measurer reads them: a card is never read mid-entrance (at its
 * entrance's 0.985 scale), whatever the machine's load.
 *
 * A frame that says its heights hold under the full-card floor too (`heights` in its spec: half a section, 152 and
 * 172) is drawn again at those card widths, in every language, and there no drift is known: what it declares is what
 * it draws (a strip that wraps where a word runs long would move every card under it).
 *   PLAYGROUND=http://127.0.0.1:5183/ node tools/render/heights.mjs [--only climate,home] [--json out.json] [--write-known]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { everyLanguage } from './lib.mjs';
import { HOUSE_HEIGHTS, startSuite } from './lib/suite.mjs';

const TOLERANCE = 8;
const here = dirname(fileURLToPath(import.meta.url));
const option = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const only = option('--only')?.split(',');
const jsonOut = option('--json');
const writeKnown = process.argv.includes('--write-known');
const knownFile = join(here, 'known-heights.json');
const ABOUT = [
  'Drifts a card draws from live content its config cannot know: heights.mjs passes while what it sees is listed here, and fails when a listed one is no longer seen as listed (remove it: this file only shrinks).',
  'An entry is a frame (sheet/title), the card, its declared height, the height it drew (the nth card of that tag in the frame when there are several) and the reason; the declared height is the one the automatic dashboard reserves.',
  'Rewrite it with `node tools/render/heights.mjs --write-known` (a new entry asks for its reason: `triage`); see docs/development.md.',
];

const sheets = readdirSync(join(here, '..', '..', 'apps', 'playground', 'src', 'sheets'))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
  .map((file) => file.slice(0, -3))
  .filter((sheet) => !only || only.includes(sheet))
  .sort();

/** The known drifts, by frame, tag and ordinal. */
const keyOf = (row) => `${row.frame}\u0000${row.tag}\u0000${row.n ?? 1}`;
const known = (() => {
  try {
    return JSON.parse(readFileSync(knownFile, 'utf8')).drifts;
  } catch {
    return [];
  }
})();
const knownBy = new Map(known.map((entry) => [keyOf(entry), entry]));

/**
 * The cards a page draws `width` wide, with what they declare: every frame's, or (`narrow`) only those of the frames
 * whose heights hold at that width (`data-heights`).
 */
const sample = (page, width, narrow = false) =>
  page.evaluate(
    async ({ module, width, narrow }) => {
      const { houseHeightOf } = await import(module);
      const out = [];
      for (const frame of document.querySelectorAll('[data-frame]')) {
        if (frame.getAttribute('data-measure') === 'false') continue;
        if (narrow && !(frame.dataset.heights ?? '').split(',').includes(String(width))) continue;
        const seen = new Map(); // the nth card of a tag in the frame
        for (const el of frame.querySelectorAll('*')) {
          const tag = el.tagName.toLowerCase();
          if (!tag.startsWith('fluvy-') || !tag.endsWith('-card')) continue;
          if (
            el.closest('fluvy-tiles-card, fluvy-scenes-card') &&
            !/^fluvy-(tiles|scenes)-card$/.test(tag)
          )
            continue; // a tile inside a set is the set's
          // a card that declares a height (`static layoutHeight`), read as the dashboard plans it
          if (typeof el.constructor.layoutHeight !== 'function' || !el.config) continue;
          // the card's own box (what it renders at its root), not the host a frame's grid row may have stretched
          const card = [...(el.renderRoot?.children ?? [])].find(
            (node) => node.tagName !== 'STYLE',
          );
          const rect = (card ?? el).getBoundingClientRect();
          if (Math.round(rect.width) !== width) continue; // a half tile, a frame of its own width: not this column
          if (el.renderRoot?.querySelector('.fv-card--empty')) continue; // "no entity": not the card's height
          const n = (seen.get(tag) ?? 0) + 1;
          seen.set(tag, n);
          out.push({
            frame: frame.getAttribute('data-frame'),
            tag,
            n,
            declared: houseHeightOf({ ...el.config, type: `custom:${tag}` }, -1, el.hass),
            measured: Math.round(rect.height),
            config: el.config,
          });
        }
      }
      return out;
    },
    { module: HOUSE_HEIGHTS, width, narrow },
  );

const suite = await startSuite();
const all = [];
/** The card widths under the floor each sheet's frames hold their heights at. */
const narrowWidths = new Map();
for (const sheet of sheets) {
  const page = await suite.page(`sheet=${sheet}`, {
    viewport: { width: 1400, height: 1200 },
    reducedMotion: 'reduce',
  });
  all.push(...(await sample(page, 360)));
  const widths = await page.evaluate(() =>
    [...document.querySelectorAll('[data-frame][data-heights]')].flatMap((frame) =>
      frame.dataset.heights.split(',').map(Number),
    ),
  );
  if (widths.length) narrowWidths.set(sheet, [...new Set(widths)]);
  await page.close();
}

/** Half a section, in every language: the section twice the card and Fluvy's 16 between them. */
const narrow = [];
for (const [sheet, widths] of narrowWidths)
  for (const width of widths)
    for (const lang of await everyLanguage()) {
      const page = await suite.page(`sheet=${sheet}&width=${2 * width + 16}&lang=${lang}`, {
        viewport: { width: 1400, height: 1200 },
        reducedMotion: 'reduce',
      });
      narrow.push(...(await sample(page, width, true)).map((row) => ({ ...row, width, lang })));
      await page.close();
    }
await suite.browser.close();

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));
const drifts = all.filter((row) => Math.abs(row.declared - row.measured) > TOLERANCE);
/** A drift listed as it is seen: the same declared and drawn heights. */
const asKnown = (row) => {
  const entry = knownBy.get(keyOf(row));
  return entry && entry.declared === row.declared && entry.drawn === row.measured;
};
const fresh = drifts.filter((row) => !asKnown(row));
const measuredFrames = new Set(all.map((row) => row.frame.split('/')[0]));
/** A known drift on a sheet this run measured, and did not see as listed there. */
const gone = known.filter((entry) => {
  const sheet = entry.frame.split('/')[0];
  if (!measuredFrames.has(sheet) && !(only ?? sheets).includes(sheet)) return false;
  const row = all.find((r) => keyOf(r) === keyOf(entry));
  return !row || !asKnown(row) || Math.abs(row.declared - row.measured) <= TOLERANCE;
});

const narrowDrifts = narrow.filter((row) => Math.abs(row.declared - row.measured) > TOLERANCE);
for (const { frame, tag, n, declared, measured, width, lang } of narrowDrifts)
  console.log(
    `  ${frame} · ${tag}${n > 1 ? ` #${n}` : ''} @ ${width} (${lang}): declared ${declared}, measured ${measured}`,
  );
for (const { frame, tag, n, declared, measured } of fresh)
  console.log(
    `  ${frame} · ${tag}${n > 1 ? ` #${n}` : ''}: declared ${declared}, measured ${measured}`,
  );
for (const { frame, tag, n, declared, drawn } of gone)
  console.log(
    `  ${frame} · ${tag}${n > 1 ? ` #${n}` : ''}: known (declared ${declared}, drawn ${drawn}) is no longer seen so: remove it from known-heights.json`,
  );
console.log(
  `${all.length} cards measured at 360; ${drifts.length} drift over ${TOLERANCE} px, ${drifts.length - fresh.length} known; ${fresh.length} new, ${gone.length} known no longer seen`,
);
console.log(
  `${narrow.length} cards measured at half a section (${[...new Set([...narrowWidths.values()].flat())].join(', ') || 'none asked'}) in every language; ${narrowDrifts.length} drift`,
);

if (writeKnown) {
  const entries = drifts
    .map((row) => ({
      frame: row.frame,
      tag: row.tag,
      ...(row.n > 1 ? { n: row.n } : {}),
      declared: row.declared,
      drawn: row.measured,
      reason: knownBy.get(keyOf(row))?.reason ?? 'triage',
    }))
    .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
  const prettier = await import('prettier');
  const body = JSON.stringify({ about: ABOUT, drifts: entries });
  const config = (await prettier.resolveConfig(knownFile)) ?? {};
  writeFileSync(knownFile, await prettier.format(body, { ...config, filepath: knownFile }));
  console.log(`${knownFile}: ${entries.length} entries`);
  process.exit(0);
}
process.exit(fresh.length || gone.length || narrowDrifts.length ? 1 : 0);
