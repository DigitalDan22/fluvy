/**
 * The automatic dashboard and the appliance cards read a house by the words people name things with, in every
 * language Fluvy ships at once (a house is named in its own language, not the UI's). This writes those words, from
 * every language's naming words (`packages/core/src/i18n/words/<code>.json`: build input, never shipped), as the
 * regular expressions two modules export:
 *
 *   - `packages/cards/src/strategy/words.generated.ts`: the strategy's rules (lights, solar, the grid, …), in its chunk;
 *   - `packages/cards/src/appliance/words.generated.ts`: an appliance's kind by its name (the `appliance_*` words), in
 *     the appliances' chunk.
 *
 *   pnpm i18n build       (also part of `pnpm build`); the language tools' tests fail when either file is stale
 *
 * A stem is matched as a substring; a stem may carry regex of its own (a boundary: `pv\b`, `mode$`; a lookaround:
 * `(?<!ガス)レンジ`). `light` matches whole words between separators, `generic` matches the whole name, `place_noise`
 * whole words, no Latin letter beside them whatever its marks — for a stem in Latin letters. A stem in kana or kanji
 * is matched as a substring whatever its category's shape (Japanese writes no spaces between words): its alternation
 * follows the word-shaped one. The appliance words are plain lower-case letters, matched against a name with its
 * accents taken off and its width made ordinary ("Kühlschrank" is read as "kuhlschrank", as Home Assistant writes it
 * into an entity's id; "ＬＥＤ" as "led"); a kana's voicing mark stays (が is not か). The place words are read so too,
 * plain at build (`snimac`, `temperature` for `température`), on a name made plain letter by letter where it stands
 * (`placeName` in packages/cards/src/strategy/home-registry.ts: "Snímač" is read as "snimac").
 *
 * Every regex captures the stem it found as the first group that takes part in the match — the alternation of its
 * stems, never the separator a word shape consumes around them (a stem's own groups are numbered after it). Where
 * classes of words compete for one name (a light's against the appliances', the kinds' against each other), the
 * matcher (`packages/cards/src/shared/words.ts`) reads that group: of two words that overlap in the name the longer
 * wins, whatever the lists' order (電気ケトル is a kettle, not the light 電気; ガスレンジ a hob, not the microwave レンジ),
 * so a stem needs no lookaround against a longer word another list carries. Inside one list the order is the build's:
 * a stem is tried after every longer stem that begins with it (温度計 before 温度, "frigorifero" before "frigo"), so
 * stems that nest need no care in the words; a stem of its own regex keeps its place.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { catalogueCodes, readCatalogue, ROOT, type Words } from './lib.js';

export const OUT = join(ROOT, 'packages', 'cards', 'src', 'strategy', 'words.generated.ts');
export const APPLIANCE_OUT = join(
  ROOT,
  'packages',
  'cards',
  'src',
  'appliance',
  'words.generated.ts',
);

type Shape = 'substring' | 'word' | 'whole' | 'words';

/** Each category's shape, and the constant it becomes. */
const CATEGORIES: ReadonlyArray<{ category: string; name: string; shape: Shape }> = [
  { category: 'light', name: 'LIGHT_WORDS', shape: 'word' },
  { category: 'outdoor', name: 'OUTDOOR', shape: 'substring' },
  { category: 'solar', name: 'SOLAR', shape: 'substring' },
  { category: 'grid', name: 'GRID', shape: 'substring' },
  { category: 'grid_export', name: 'GRID_EXPORT', shape: 'substring' },
  { category: 'battery', name: 'BATTERY_POWER', shape: 'substring' },
  { category: 'charger', name: 'CHARGER', shape: 'substring' },
  { category: 'home', name: 'HOME_POWER', shape: 'substring' },
  { category: 'today', name: 'TODAY', shape: 'substring' },
  { category: 'not_appliance', name: 'NOT_APPLIANCE', shape: 'substring' },
  { category: 'generic', name: 'GENERIC', shape: 'whole' },
  { category: 'place_noise', name: 'PLACE_NOISE', shape: 'words' },
];

/**
 * The appliance kinds a name can say, in the order they win where a name says two that stand apart (where their
 * words overlap, the longer wins): the more particular first — a washer-dryer before a washer and a dryer, a
 * dishwasher before a washer, a microwave before an oven, a wine cooler ("wine fridge") before a fridge, a fridge
 * (a fridge freezer is one) before a freezer, a sandwich maker (a "Sandwichtoaster") before a toaster; the pets'
 * feeder, fountain and litter box last, none of their words an appliance's.
 */
const KINDS = [
  'washer_dryer',
  'dishwasher',
  'washer',
  'dryer',
  'air_fryer',
  'microwave',
  'oven',
  'hob',
  'hood',
  'wine',
  'fridge',
  'freezer',
  'coffee',
  'kettle',
  'sandwich_maker',
  'toaster',
  'blender',
  'feeder',
  'fountain',
  'litter_box',
] as const;

/** A stem that carries regex of its own (a class, a boundary, an anchor, a lookaround); any other is its letters. */
const OWN_REGEX = /[\\[\]$^]|\(\?/;

/** A stem as a regex fragment: escaped, unless it carries regex of its own. */
const fragment = (stem: string): string =>
  OWN_REGEX.test(stem) ? stem : stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The letters every match of a stem begins with: a plain stem's are the stem; a stem of its own regex's, those before
 * its first special character, without one that a `?`, `*` or `{` after it makes optional (`secadora[ _-]de[ _-]roupas`
 * begins with "secadora"; `(?<!ガス)レンジ` with none that it is sure of).
 */
function lead(stem: string): string {
  if (!OWN_REGEX.test(stem)) return stem;
  const at = stem.search(/[\\()[\]?*+|^${.]/);
  return stem.slice(0, /[?*{]/.test(stem.charAt(at)) ? Math.max(at - 1, 0) : at);
}

/**
 * Stems in the order an alternation tries them. An alternation takes the first of its stems that matches where a
 * match begins, so a stem tried before a longer one that begins with it would hide it (温度 before 温度計 leaves 計
 * behind; "frigo" before "frigorifero" reads a fridge by five letters of eleven): each plain stem comes after every
 * longer stem that begins with it (`secadora` after `secadora[ _-]de[ _-]roupas`, too), and otherwise the listed order
 * holds — among the stems of their own regex always, since one is never taken for the shorter. Stable: the stems are
 * taken in their listed order, each as soon as every stem it waits for is in.
 */
export function ordered(stems: readonly string[]): string[] {
  const waits = stems.map((stem) =>
    OWN_REGEX.test(stem)
      ? []
      : stems.flatMap((other, at) =>
          other.length > stem.length && lead(other).startsWith(stem) ? [at] : [],
        ),
  );
  const taken = new Set<number>();
  while (taken.size < stems.length) {
    const next = stems.findIndex(
      (_, at) => !taken.has(at) && waits[at]!.every((other) => taken.has(other)),
    );
    taken.add(next);
  }
  return [...taken].map((at) => stems[at]!);
}

/** A character of a stem written in kana or kanji: Japanese has no word boundaries, so such a stem is a substring whatever the shape. */
export const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]/u;

/**
 * What a whole word in Latin letters never touches: a Latin letter whatever its marks (`\b` knows ASCII's alone, where
 * Großes would hold an "es" and Spálňa an "a"), a digit or an underscore; kana and kanji bound a word, Japanese writing
 * no spaces. A pattern with it compiles with the `u` flag.
 */
const IN_A_WORD = '[\\p{Script=Latin}\\d_]';

/**
 * A category's regex source: its Latin stems in the category's shape, its kana and kanji stems as substrings after
 * them (`(?:^|[\s_.-])(light|lamp)(?:[\s_.-]|$)|(照明|ライト)`); a whole-name match takes both scripts alike. Each
 * script's alternation is a capture group, the separators around a word are not: the first group that takes part in
 * a match is the stem found, which the matcher measures. Each alternation is `ordered`: no stem hides a longer one.
 */
export function pattern(stems: readonly string[], shape: Shape): string {
  const unique = [...new Set(stems)];
  const latin = ordered(unique.filter((stem) => !CJK.test(stem)));
  const kana = ordered(unique.filter((stem) => CJK.test(stem)));
  const worded = latin.map(fragment).join('|');
  const cjk = kana.map(fragment).join('|');
  // one alternation of both scripts: a Latin stem may begin one in kana or kanji ("ev" and "ev充電")
  const both = ordered([...latin, ...kana])
    .map(fragment)
    .join('|');
  switch (shape) {
    case 'word':
      return [worded && `(?:^|[\\s_.-])(${worded})(?:[\\s_.-]|$)`, cjk && `(${cjk})`]
        .filter(Boolean)
        .join('|');
    case 'whole':
      return `^(${both})$`;
    case 'words':
      return [worded && `(?<!${IN_A_WORD})(${worded})(?!${IN_A_WORD})`, cjk && `(${cjk})`]
        .filter(Boolean)
        .join('|');
    default:
      return `(${both})`;
  }
}

/**
 * A stem as the appliance words read a name (`plain` in packages/cards/src/appliance/kinds.ts, the same): lower-case,
 * in ordinary width, its accents taken off ("ladesäule" is "ladesaule", "ＬＥＤ" is "led"); a kana keeps its voicing
 * mark (が is not か) and is composed again.
 */
export const plain = (stem: string): string =>
  stem
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/(?![\u3099\u309a])\p{M}/gu, '')
    .normalize('NFC')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .toLowerCase();

/** A pattern as a regex literal, compiled first: a stem that does not compile stops the build here, not in a browser. */
function literal(source: string, flags: string): string {
  new RegExp(source, flags);
  return `/${source.replace(/\//g, '\\/')}/${flags}`;
}

/** Every language's stems of each category asked for, and the languages they came from. */
async function stemsOf(
  categories: readonly string[],
): Promise<{ codes: string[]; lists: Map<string, string[]> }> {
  const codes = await catalogueCodes();
  const lists = new Map<string, string[]>();
  for (const code of codes) {
    const words = (await readCatalogue(code))['words'] as Words | undefined;
    for (const category of categories)
      lists.set(category, [...(lists.get(category) ?? []), ...(words?.[category] ?? [])]);
  }
  return { codes, lists };
}

/** The strategy's word rules. */
export async function generate(): Promise<string> {
  const { codes, lists } = await stemsOf(CATEGORIES.map(({ category }) => category));
  const lines = CATEGORIES.map(({ category, name, shape }) => {
    const stems = lists.get(category) ?? [];
    // the place words read a plain name, so are written plain; every one in it is taken out
    const source = shape === 'words' ? pattern(stems.map(plain), shape) : pattern(stems, shape);
    const flags = shape === 'words' ? 'giu' : 'i';
    return `/** ${category}: ${stems.length} stems in ${codes.join(', ')}. */\nexport const ${name} = ${literal(source, flags)};`;
  });
  return `// Generated by tools/i18n/src/build.ts from every language's naming words (packages/core/src/i18n/words/) — do not edit; run \`pnpm i18n build\`.\n\n${lines.join('\n\n')}\n`;
}

/**
 * The appliance's: each kind's words in the order they are tried, what is never an appliance (a vacuum, a hair dryer,
 * a warming drawer, LG's Styler and kimchi fridge), and a charger by the strategy's own words.
 */
export async function generateAppliance(): Promise<string> {
  const categories = ['appliance_never', 'charger', ...KINDS.map((kind) => `appliance_${kind}`)];
  const { codes, lists } = await stemsOf(categories);
  const stems = (category: string): string[] => lists.get(category) ?? [];
  const never = [...stems('appliance_never'), ...stems('charger').map(plain)];
  const rows = KINDS.map((kind) => {
    const own = stems(`appliance_${kind}`);
    return `  /** ${kind}: ${own.length} stems. */\n  ['${kind}', ${literal(pattern(own, 'substring'), 'i')}],`;
  });
  return [
    `// Generated by tools/i18n/src/build.ts from every language's naming words (packages/core/src/i18n/words/) — do not edit; run \`pnpm i18n build\`.`,
    '',
    `/** What a name says is never an appliance: ${never.length} stems in ${codes.join(', ')} (a charger's are the strategy's); an appliance's name with one of them is none, whatever kind's word overlaps it, and a switch's weighs them with the kinds. */`,
    `export const NOT_AN_APPLIANCE = ${literal(pattern(never, 'substring'), 'i')};`,
    '',
    `/** The kind a name says, in ${codes.join(', ')}: of two kinds whose words overlap in a name the longer wins, of two that stand apart the first listed (the more particular first). */`,
    `export const KIND_WORDS = [`,
    ...rows,
    `] as const;`,
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  await writeFile(OUT, await generate());
  await writeFile(APPLIANCE_OUT, await generateAppliance());
  console.log(`${OUT.replace(ROOT, '.')}: ${CATEGORIES.length} word rules`);
  console.log(`${APPLIANCE_OUT.replace(ROOT, '.')}: ${KINDS.length} kinds`);
}
