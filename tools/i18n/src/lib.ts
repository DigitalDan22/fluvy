/**
 * What the language tools share: the catalogues on disk, their flattening, the comparison of a language with
 * English (missing, extra, empty, placeholders, the naming words), and the languages the registry
 * names. Used by the check (`pnpm i18n`) and by the vitest suite in core, so both say the same.
 *
 * The layout: every language but English is one catalogue, `locales/<code>.json`, with every namespace (a language
 * is fetched whole, the first time it is spoken). English is in parts, `locales/en/<part>.json`: `core.json` ships
 * inline, and each lazy family's part travels with that family's chunk. The naming words the automatic dashboard
 * reads a house by are build input only, `words/<code>.json`, never shipped. A tool reads a language whole, its words
 * under `words` (`readCatalogue`), and writes it back to that layout (`writeCatalogue`).
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const I18N = join(ROOT, 'packages', 'core', 'src', 'i18n');
export const LOCALES = join(I18N, 'locales');
/** English's parts: `core.json`, and one per lazy family. */
export const ENGLISH = join(LOCALES, 'en');
/** Every language's naming words: the strategy's build input. */
export const WORDS = join(I18N, 'words');
export const INTEGRATION = join(ROOT, 'custom_components', 'fluvy');
export const DOCS_TABLE = join(ROOT, 'docs', 'translating.md');

export type Table = Readonly<Record<string, string>>;
export type Words = Readonly<Record<string, readonly string[]>>;
export type Catalogue = Readonly<Record<string, Table | Words>>;

export interface Problem {
  readonly level: 'error' | 'warning';
  readonly language: string;
  readonly text: string;
}

const readJson = async <T>(file: string): Promise<T> =>
  JSON.parse(await readFile(file, 'utf8')) as T;

/** English's parts on disk, `core.json` first: each part's file name and its tables. */
export async function englishParts(): Promise<
  { readonly part: string; readonly tables: Readonly<Record<string, Table>> }[]
> {
  const parts = (await readdir(ENGLISH)).filter((file) => file.endsWith('.json'));
  const rank = (part: string): string => (part === 'core.json' ? '' : part);
  return Promise.all(
    parts
      .sort((a, b) => rank(a).localeCompare(rank(b)))
      .map(async (part) => ({
        part,
        tables: await readJson<Record<string, Table>>(join(ENGLISH, part)),
      })),
  );
}

/**
 * A language whole, as a translator keeps it: every namespace (English's parts together; a namespace two parts hold
 * stops the read) and its naming words under `words`.
 */
export async function readCatalogue(code: string): Promise<Catalogue> {
  const words = await readJson<Words>(join(WORDS, `${code}.json`)).catch(() => ({}));
  if (code !== 'en')
    return { ...(await readJson<Catalogue>(join(LOCALES, `${code}.json`))), words };
  const tables: Record<string, Table> = {};
  const holder = new Map<string, string>();
  for (const { part, tables: own } of await englishParts())
    for (const [namespace, table] of Object.entries(own)) {
      const other = holder.get(namespace);
      if (other) throw new Error(`en: ${namespace} is in ${other} and in ${part}`);
      holder.set(namespace, part);
      tables[namespace] = table;
    }
  return { ...tables, words };
}

/**
 * Writes a language whole back to the layout: its naming words to `words/<code>.json`; each English namespace to the
 * part that holds it (a new one to `core.json`), every other language to `<code>.json`. Returns the files written;
 * Prettier lays them out after.
 */
export async function writeCatalogue(code: string, catalogue: Catalogue): Promise<string[]> {
  const { words, ...tables } = catalogue;
  const files: [file: string, value: unknown][] = [];
  if (words) files.push([join(WORDS, `${code}.json`), words]);
  if (code !== 'en') files.push([join(LOCALES, `${code}.json`), tables]);
  else {
    const parts = await englishParts();
    const holder = new Map(
      parts.flatMap(({ part, tables: own }) => Object.keys(own).map((ns) => [ns, part] as const)),
    );
    for (const { part } of parts)
      files.push([
        join(ENGLISH, part),
        Object.fromEntries(
          Object.entries(tables).filter(([ns]) => (holder.get(ns) ?? 'core.json') === part),
        ),
      ]);
  }
  for (const [file, value] of files) await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return files.map(([file]) => file);
}

/** The languages that have a catalogue on disk (English's is the folder of its parts). */
export async function catalogueCodes(): Promise<string[]> {
  return (await readdir(LOCALES, { withFileTypes: true }))
    .flatMap((entry) =>
      entry.isDirectory()
        ? [entry.name]
        : entry.name.endsWith('.json')
          ? [entry.name.slice(0, -5)]
          : [],
    )
    .sort();
}

export const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

const isWords = (namespace: string): boolean => namespace === 'words';

/** A count's form: its key and the CLDR category the suffix names (`devices_one`, `devices_few`). */
const FORM = /^(.+)_(zero|one|two|few|many|other)$/;

/** The categories English's rules give a whole number: what its counts are written in. */
const ENGLISH_FORMS = new Set(['one', 'other']);

/**
 * A table's counts: each key said with a number in its forms by number, `plural()`'s families. `devices_one` with the
 * bare `devices` (the other form) is a count of any number; `days_other` alone, one English says only of two or more.
 * Each maps to its other form and the least number it is said of.
 */
export function counts(
  table: Table,
): Map<string, { readonly other: string; readonly from: number }> {
  const found = new Map<string, { readonly other: string; readonly from: number }>();
  for (const key of Object.keys(table)) {
    const [, base, category] = FORM.exec(key) ?? [];
    if (!base || !ENGLISH_FORMS.has(category ?? '') || found.has(base)) continue;
    found.set(base, {
      other: `${base}_other` in table ? `${base}_other` : base,
      from: `${base}_one` in table ? 0 : 2,
    });
  }
  return found;
}

/**
 * The categories a language's rules give the whole numbers from `from` to 1000, each with the first number it gives:
 * the forms a count needs. A million's `many` (French, Italian, Portuguese, Spanish) and a fraction's (Slovak) are
 * never written: a house counts its things in ones.
 */
export function reached(language: string, from: number): Map<string, number> {
  const rules = new Intl.PluralRules(language);
  const first = new Map<string, number>();
  for (let n = from; n <= 1000; n++) {
    const category = rules.select(n);
    if (!first.has(category)) first.set(category, n);
  }
  return first;
}

/**
 * What a language's counts hold beside English's keys: the forms its rules have that English does not write (Slovak's
 * `_few`), each with the English form whose placeholders it keeps (the other form); and every form it needs, English's
 * or its own, with the number that needs it.
 */
function countForms(
  language: string,
  table: Table,
): { readonly forms: Map<string, string>; readonly needed: Map<string, number> } {
  const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
  const forms = new Map<string, string>();
  const needed = new Map<string, number>();
  for (const [base, { other, from }] of counts(table)) {
    for (const category of categories)
      if (category !== 'other' && !(`${base}_${category}` in table))
        forms.set(`${base}_${category}`, other);
    for (const [category, n] of reached(language, from))
      needed.set(category === 'other' ? other : `${base}_${category}`, n);
  }
  return { forms, needed };
}

/**
 * English's counts as `plural()` reads them: a form only in the categories English says (`one`, `other`), and every
 * count with its other form.
 */
export function englishCounts(english: Catalogue): Problem[] {
  const problems: Problem[] = [];
  for (const [namespace, table] of Object.entries(english)) {
    if (isWords(namespace)) continue;
    for (const key of Object.keys(table)) {
      const category = FORM.exec(key)?.[2];
      if (category && !ENGLISH_FORMS.has(category))
        problems.push({
          level: 'error',
          language: 'en',
          text: `${namespace}.${key}: a form English never says (its counts are _one and the other form)`,
        });
    }
    for (const [base, { other }] of counts(table as Table))
      if (!(other in table))
        problems.push({
          level: 'error',
          language: 'en',
          text: `${namespace}.${base}_one: a count without its other form (${base})`,
        });
  }
  return problems;
}

/**
 * A language against English: every key present (missing ones are warnings, or errors when `strict`), none that
 * English lacks, none empty, the same placeholders, every word category present; and every count in each form the
 * language's rules give a whole number (a missing one is always an error: the count would say another number's words),
 * its own forms beside English's allowed.
 */
export function compare(
  language: string,
  catalogue: Catalogue,
  english: Catalogue,
  strict = false,
): Problem[] {
  const problems: Problem[] = [];
  const problem = (level: Problem['level'], text: string): void => {
    problems.push({ level, language, text });
  };
  for (const [namespace, table] of Object.entries(english)) {
    const own = catalogue[namespace];
    if (isWords(namespace)) {
      const categories = Object.keys(table);
      for (const category of categories) {
        const list = (own as Words | undefined)?.[category];
        if (!Array.isArray(list)) problem('error', `words.${category}: missing`);
        else if (list.some((w) => typeof w !== 'string' || w.trim() === ''))
          problem('error', `words.${category}: an empty stem`);
      }
      for (const category of Object.keys(own ?? {}))
        if (!categories.includes(category)) problem('error', `words.${category}: not in English`);
      continue;
    }
    if (!own) {
      problem(strict ? 'error' : 'warning', `${namespace}: the whole namespace is missing`);
      continue;
    }
    const keys = Object.keys(table);
    const { forms, needed } = countForms(language, table as Table);
    const ownForms = [...forms.keys()].filter((form) => needed.has(form) || form in own);
    for (const key of [...keys, ...ownForms]) {
      const text = (own as Table)[key];
      if (text === undefined) {
        const n = needed.get(key);
        if (n !== undefined) problem('error', `${namespace}.${key}: missing, the form for ${n}`);
        else problem(strict ? 'error' : 'warning', `${namespace}.${key}: missing`);
        continue;
      }
      if (typeof text !== 'string' || text.trim() === '')
        problem('error', `${namespace}.${key}: empty`);
      else {
        const expected = placeholders((table as Table)[forms.get(key) ?? key] ?? '');
        const found = placeholders(text);
        if (expected.join(',') !== found.join(','))
          problem(
            'error',
            `${namespace}.${key}: placeholders {${found.join(', ')}} ≠ English {${expected.join(', ')}}`,
          );
      }
    }
    for (const key of Object.keys(own))
      if (!(key in table) && !forms.has(key))
        problem('error', `${namespace}.${key}: not in English`);
    const order = keys.filter((k) => k in own);
    const ownOrder = Object.keys(own).filter((k) => k in table);
    if (order.join('\n') !== ownOrder.join('\n'))
      problem('warning', `${namespace}: keys are not in English's order`);
  }
  for (const namespace of Object.keys(catalogue))
    if (!(namespace in english)) problem('error', `${namespace}: a namespace English lacks`);
  return problems;
}

/** Flattens `strings.json`-shaped translation files to dotted keys. */
export function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value && typeof value === 'object')
    return Object.assign(
      {},
      ...Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        flatten(v, prefix ? `${prefix}.${k}` : k),
      ),
    ) as Record<string, string>;
  return {};
}

/**
 * The integration's translation file for a language, where Home Assistant's code for it is not ours: Home Assistant
 * reads `translations/<its language>.json`, and its code for Portugal's Portuguese is `pt` (`pt-BR` is Brazil's).
 */
const INTEGRATION_FILE: Readonly<Record<string, string>> = { 'pt-PT': 'pt' };

/** The integration's translation file for a language: `translations/<code>.json`, under Home Assistant's code for it. */
export const integrationFile = (language: string): string =>
  `translations/${INTEGRATION_FILE[language] ?? language}.json`;

/** The integration's translation file for a language, against `strings.json`: the same keys and placeholders. */
export async function compareIntegration(language: string): Promise<Problem[]> {
  const problems: Problem[] = [];
  const source = flatten(
    JSON.parse(await readFile(join(INTEGRATION, 'strings.json'), 'utf8')) as unknown,
  );
  const file = integrationFile(language);
  let translated: Record<string, string>;
  try {
    translated = flatten(JSON.parse(await readFile(join(INTEGRATION, file), 'utf8')) as unknown);
  } catch {
    problems.push({ level: 'error', language, text: `${file}: missing` });
    return problems;
  }
  for (const [key, text] of Object.entries(source)) {
    const own = translated[key];
    if (own === undefined)
      problems.push({ level: 'error', language, text: `${file}: ${key} missing` });
    else if (placeholders(own).join(',') !== placeholders(text).join(','))
      problems.push({
        level: 'error',
        language,
        text: `${file}: ${key} placeholders differ from strings.json`,
      });
  }
  for (const key of Object.keys(translated))
    if (!(key in source))
      problems.push({ level: 'error', language, text: `${file}: ${key} is not in strings.json` });
  return problems;
}
