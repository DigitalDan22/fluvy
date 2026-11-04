/**
 * The catalogues checked against English — every key, none extra, none empty, the same placeholders, every count in
 * each form its language says of a whole number, every naming-word category — English's counts in its own two forms,
 * and, for every language the registry names, the integration's translation file and its line in the docs. Warnings
 * (missing keys) become errors with `--release`.
 *
 *   pnpm i18n              what `pnpm check` runs
 *   pnpm i18n --release    before a release: nothing may be missing
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  catalogueCodes,
  compare,
  compareIntegration,
  DOCS_TABLE,
  englishCounts,
  readCatalogue,
  ROOT,
  type Problem,
} from './lib.js';

const strict = process.argv.includes('--release');
const english = await readCatalogue('en');
const codes = await catalogueCodes();

/** The registry's codes, read from the source (the tools cannot import the browser package). */
const registry = await readFile(
  join(ROOT, 'packages', 'core', 'src', 'i18n', 'languages.ts'),
  'utf8',
);
const registered =
  /LANGUAGE_CODES = \[([^\]]+)\]/
    .exec(registry)?.[1]
    ?.match(/'([^']+)'/g)
    ?.map((s) => s.slice(1, -1)) ?? [];

const problems: Problem[] = [...englishCounts(english)];
for (const code of codes) {
  if (!registered.includes(code))
    problems.push({
      level: 'error',
      language: code,
      text: 'a catalogue the registry does not name',
    });
  if (code === 'en') continue;
  problems.push(...compare(code, await readCatalogue(code), english, strict));
}
for (const code of registered) {
  if (!codes.includes(code))
    problems.push({ level: 'error', language: code, text: 'named in the registry, no catalogue' });
  problems.push(...(await compareIntegration(code)));
}
const docs = await readFile(DOCS_TABLE, 'utf8').catch(() => '');
for (const code of registered)
  if (!new RegExp(`\\|\\s*\`${code}\`\\s*\\|`).test(docs))
    problems.push({
      level: 'error',
      language: code,
      text: `not in the table of ${DOCS_TABLE.replace(ROOT, '.')}`,
    });

const errors = problems.filter((p) => p.level === 'error');
const warnings = problems.filter((p) => p.level === 'warning');
for (const p of problems)
  console.log(`${p.level === 'error' ? '✗' : '!'} ${p.language}: ${p.text}`);

const total = Object.entries(english)
  .filter(([ns]) => ns !== 'words')
  .reduce((n, [, table]) => n + Object.keys(table).length, 0);
for (const code of codes) {
  if (code === 'en') continue;
  const catalogue = await readCatalogue(code);
  const present = Object.entries(english)
    .filter(([ns]) => ns !== 'words')
    .reduce(
      (n, [ns, table]) =>
        n +
        Object.keys(table).filter((k) => (catalogue[ns] as Record<string, string> | undefined)?.[k])
          .length,
      0,
    );
  console.log(`${code}: ${present}/${total} keys`);
}
console.log(
  `${errors.length ? '✗' : '✓'} ${codes.length} catalogues, ${total} keys in English, ${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
