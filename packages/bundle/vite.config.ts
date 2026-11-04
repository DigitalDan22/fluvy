import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { GROUPS } from './groups.mjs';

// Fluvy's one version and licence: the root package.json's (tokens and theme read the same)
const { version, license } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string; license: string };

/** A tagged template's static part, as the parser gives it: where its raw text starts and ends. */
interface Quasi {
  readonly start: number;
  readonly end: number;
}

/** A node of the parser's tree, as far as a tagged template is told from the rest. */
interface Node {
  readonly type?: string;
  readonly tag?: { readonly type: string; readonly name?: string };
  readonly quasi?: { readonly quasis: readonly Quasi[] };
}

/** A template tagged with one of the tags asked for: its tag, and its static parts in order. */
interface Tagged {
  readonly tag: string;
  readonly quasis: readonly Quasi[];
}

/** Every template in a module's syntax tree tagged with one of `tags`. */
function taggedTemplates(node: unknown, tags: ReadonlySet<string>, found: Tagged[] = []): Tagged[] {
  if (Array.isArray(node)) for (const child of node) taggedTemplates(child, tags, found);
  else if (node && typeof node === 'object') {
    const { type, tag, quasi } = node as Node;
    if (type === 'TaggedTemplateExpression' && tag?.type === 'Identifier' && tags.has(tag.name!))
      found.push({ tag: tag.name!, quasis: quasi!.quasis });
    for (const child of Object.values(node)) taggedTemplates(child, tags, found);
  }
  return found;
}

/** A `css` literal's static part, compact: comments go, a whitespace run is one space, none beside `{`, `}`, `;`. */
const compactCss = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1');

/** An `html` literal's static part, compact: each line's indentation goes, its line break stays. */
const compactHtml = (text: string): string => text.replace(/\n[ \t]+/g, '\n');

/** The tags whose literals the bundle compacts, and a quick test for a module that may hold one. */
const TAGS: ReadonlySet<string> = new Set(['css', 'html']);
const MAY_HOLD = /\b(css|html)`/;

/**
 * Lit's literals are written for reading (Prettier lays them out); the bundle carries them compact. Only their static
 * text changes, never an interpolation, and only in fluvy's own sources; the parser finds them, so a `.css` named in a
 * comment or a string is never taken for one. A `css` literal is compacted whole (`compactCss`), nothing opening or
 * closing it. An `html` literal loses its indentation alone (`compactHtml`): wherever white space collapses (between
 * attributes, between tags, in a card's text) a line break and the spaces after it draw as the line break does, and
 * the templates hold a line break nowhere else: never in a quoted value, and a `white-space: pre` box holds an
 * interpolation or one line of text.
 */
function compactLiterals(): Plugin {
  return {
    name: 'fluvy-compact-literals',
    transform(code, id) {
      if (!id.includes('/packages/') || id.includes('/node_modules/') || !MAY_HOLD.test(code))
        return null;
      const edits = taggedTemplates(this.parse(code), TAGS).flatMap(({ tag, quasis }) =>
        quasis.map(({ start, end }, i) => {
          const raw = code.slice(start, end);
          if (tag === 'html') return { start, end, text: compactHtml(raw) };
          let text = compactCss(raw);
          if (i === 0) text = text.trimStart();
          if (i === quasis.length - 1) text = text.trimEnd();
          return { start, end, text };
        }),
      );
      let out = code;
      // from the last part back, so every earlier part's offsets still hold
      for (const { start, end, text } of edits.sort((a, b) => b.start - a.start))
        out = out.slice(0, start) + text + out.slice(end);
      return { code: out, map: null };
    },
  };
}

/**
 * The build Home Assistant loads (the integration serves it from `custom_components/fluvy/frontend`, under a URL
 * named after the build) and what it shares with the pages loaded on demand. The entry keeps only its own code and
 * imports the rest from `chunks/core-<hash>.js`; the pages fetched on demand (Activity, History, the settings panel)
 * import the same file, so they all reach one copy of everything. Chunk names carry their content hash: they never
 * go stale. Lit is bundled (pinned to Home Assistant's 3.3.3).
 */
export default defineConfig({
  plugins: [compactLiterals()],
  define: { __FLUVY_VERSION__: JSON.stringify(version) },
  build: {
    target: 'es2022',
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'fluvy.js' },
    outDir: '../../custom_components/fluvy/frontend',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: { format: { comments: /^!/ }, compress: { passes: 2 } },
    rolldownOptions: {
      // the entry's exports stay as written (the loader reads `version`); a group may then hold only what its test names
      preserveEntrySignatures: 'allow-extension',
      output: {
        inlineDynamicImports: false,
        chunkFileNames: 'chunks/[name]-[hash].js',
        codeSplitting: {
          // the groups of `groups.mjs`: a group holds what its test names, nothing it imports (the old Rollup rule)
          includeDependenciesRecursively: false,
          groups: GROUPS.map((group, index) => ({ ...group, priority: GROUPS.length - index })),
        },
        banner: `/*! Fluvy v${version} · a theme and card library for Home Assistant · SPDX-License-Identifier: ${license} · https://github.com/acosta290/fluvy */`,
      },
    },
    sourcemap: false,
    reportCompressedSize: false,
  },
});
