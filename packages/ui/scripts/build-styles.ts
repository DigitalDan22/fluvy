/**
 * Turns the approved design-lab stylesheets (`styles/*.css`, the single source of truth that the
 * lab sheets link directly) into the strings the cards adopt in their shadow roots.
 *
 *   .fv-frame { … }            → :host { … }            (the frame reset becomes the host reset)
 *   .fv-frame <descendant>     → <descendant>
 *   [data-mode='dark'] <sel>   → :host([dark]) <sel>    (cards reflect Home Assistant's dark mode on the host)
 *   [data-mode='dark']         → :host([dark])          (the mode's custom properties, which reach into a control's shadow root)
 *   [data-motion='reduced'] <sel> → :host([reduced-motion]) <sel>  (a person chose reduced motion in fluvy's settings)
 *   .lab-* rules               → dropped                (sheet scaffolding, never shipped)
 *
 * It also writes the token fallback block used when the fluvy theme is not active on the view.
 * Output is committed (`src/styles/generated/*.ts`); `pnpm --filter @fluvy/ui build:styles` refreshes it
 * and the `styles.test.ts` suite fails when it is stale.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  brandColorVars,
  derivePalettes,
  identityVars,
  scaleVars,
  DEFAULT_PALETTE,
  type VarGroup,
} from '@fluvy/tokens';
import { renderTonesCss } from '../src/tones.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'styles');
const OUT = join(ROOT, 'src', 'styles', 'generated');
/** The one sheet written into `styles/` rather than read from it: the tones, from `src/tones.ts`. */
export const TONES_SHEET = join(SRC, 'fluvy', 'tones.css');

interface Rule {
  readonly prelude: string;
  readonly body: string;
  readonly nested: readonly Rule[] | null;
}

/** Splits a stylesheet into top-level rules; at-rules with blocks keep their children. */
export function parseRules(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    rules.push(
      prelude.startsWith('@media') || prelude.startsWith('@supports')
        ? { prelude, body: '', nested: parseRules(body) }
        : { prelude, body: body.trim(), nested: null },
    );
    i = j;
  }
  return rules;
}

function transformSelector(selector: string): string | null {
  let s = selector.trim().replace(/\s+/g, ' ');
  if (/(^|[\s>+~])\.lab-/.test(s)) return null;
  if (s === '.fv-frame .fv-card + .fv-card') return null; // stacking inside a lab frame; the dashboard grid owns the gaps
  if (s === '.fv-frame') return ':host';
  s = s.replace(/^\.fv-frame (?=[*:.\w[])/, '');
  if (/^\[data-mode=['"]dark['"]\]$/.test(s)) return ':host([dark])';
  s = s.replace(/^\[data-mode=['"]dark['"]\] /, ':host([dark]) ');
  s = s.replace(/^\[data-mode=['"]light['"]\] /, ':host(:not([dark])) ');
  s = s.replace(/^\[data-motion=['"]reduced['"]\] /, ':host([reduced-motion]) ');
  return s;
}

/** Widths the lab gives its frames (a card is 360, a phone or sheet 392) and the content columns inside them. */
const FRAME_WIDTHS = new Set(['360px', '392px']);
const COLUMN_WIDTHS = new Set([320, 360, 352, 312, 140]);

/**
 * The sheets are drawn at one width; a dashboard column is not. Two mechanical rules make the same
 * CSS fluid without changing a pixel at the design width:
 *   - a frame's own width is dropped (the dashboard grid decides it);
 *   - a px column grid that fills its content column becomes proportional (`96px 96px 96px` with a
 *     16 gap → `minmax(0,96fr) …`): identical at 320, scaling everywhere else.
 */
function makeFluid(body: string): string {
  const declarations = body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  const gapDecl = declarations.find((d) => /^(column-)?gap\s*:/.test(d));
  const gapValues = gapDecl ? gapDecl.split(':')[1]!.trim().split(/\s+/) : ['0px'];
  const gap = parseFloat(gapValues[gapValues.length - 1] ?? '0') || 0;
  return declarations
    .filter((d) => !(d.startsWith('width') && FRAME_WIDTHS.has(d.split(':')[1]!.trim())))
    .map((d) => {
      const match = /^grid-template-columns\s*:\s*((?:\d+(?:\.\d+)?px\s*)+)$/.exec(d);
      if (!match) return d;
      const columns = match[1]!.trim().split(/\s+/).map(parseFloat);
      const total = columns.reduce((a, b) => a + b, 0) + gap * (columns.length - 1);
      if (columns.length < 2 || !COLUMN_WIDTHS.has(Math.round(total))) return d;
      return `grid-template-columns:${columns.map((c) => `minmax(0,${c}fr)`).join(' ')}`;
    })
    .join(';');
}

function minifyBody(body: string): string {
  return body
    .replace(/\s*\n\s*/g, '')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*;\s*/g, ';')
    .replace(/;$/, '')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ');
}

export function emitRules(rules: readonly Rule[]): string {
  let out = '';
  for (const rule of rules) {
    if (rule.nested) {
      const inner = emitRules(rule.nested);
      if (inner) out += `${rule.prelude.replace(/\s+/g, ' ')}{${inner}}`;
      continue;
    }
    if (rule.prelude.startsWith('@')) {
      out += `${rule.prelude}{${minifyBody(rule.body)}}`;
      continue;
    }
    const selectors = rule.prelude
      .split(',')
      .map(transformSelector)
      .filter((s): s is string => s !== null);
    if (selectors.length === 0 || rule.body === '') continue;
    out += `${selectors.join(',')}{${minifyBody(makeFluid(rule.body))}}`;
  }
  return out;
}

export function transformStylesheet(source: string): string {
  return emitRules(parseRules(source));
}

function declarations(groups: readonly VarGroup[]): string {
  return groups
    .flatMap((g) => g.declarations)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
}

/** Fallback tokens: only when the host carries `no-theme` (the fluvy theme is not active on this view). */
export function tokenFallback(): string {
  const palette = derivePalettes().find((p) => p.name === DEFAULT_PALETTE);
  if (!palette) throw new Error(`palette ${DEFAULT_PALETTE} not found`);
  const scale = declarations([...scaleVars(), ...identityVars(palette)]);
  return `:host([no-theme]){${scale};${declarations(brandColorVars(palette.light))}}:host([no-theme][dark]){${declarations(brandColorVars(palette.dark))}}`;
}

const camel = (name: string): string => name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

/**
 * A stylesheet with its `@import url('…')` lines replaced by the files they name (relative to it, recursively): a
 * sheet split into family files (`fluvy.css` → `fluvy/*.css`) ships as one string, and the lab still links it.
 */
export async function inlineImports(file: string): Promise<string> {
  const source = await readFile(file, 'utf8');
  const parts: string[] = [];
  let last = 0;
  for (const match of source.matchAll(/@import url\(['"]?([^'")]+)['"]?\);\n?/g)) {
    parts.push(source.slice(last, match.index));
    parts.push(await inlineImports(join(dirname(file), match[1]!)));
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(source.slice(last));
  return parts.join('');
}

export async function build(): Promise<Record<string, string>> {
  const files = (await readdir(SRC)).filter((f) => f.endsWith('.css')).sort();
  const outputs: Record<string, string> = {};
  for (const file of files) {
    const name = file.replace(/\.css$/, '');
    const css = transformStylesheet(await inlineImports(join(SRC, file)));
    outputs[`${name}.ts`] =
      `// Generated from packages/ui/styles/${file} by scripts/build-styles.ts — do not edit.\nexport const ${camel(name)}Css = ${JSON.stringify(css)};\n`;
  }
  outputs['tokens.ts'] =
    `// Generated from @fluvy/tokens (palette: ${DEFAULT_PALETTE}) by scripts/build-styles.ts — do not edit.\nexport const tokensCss = ${JSON.stringify(tokenFallback())};\n`;
  return outputs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(TONES_SHEET, renderTonesCss(), 'utf8');
  const outputs = await build();
  await mkdir(OUT, { recursive: true });
  for (const [file, content] of Object.entries(outputs))
    await writeFile(join(OUT, file), content, 'utf8');
  console.log(
    Object.entries(outputs)
      .map(([f, c]) => `${f} ${(c.length / 1024).toFixed(1)} KB`)
      .join(' · '),
  );
}
