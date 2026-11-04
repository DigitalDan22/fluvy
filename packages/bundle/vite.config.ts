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

/** The static parts of every template tagged `tag` in a module's syntax tree, one list a template. */
function taggedQuasis(node: unknown, tag: string, found: (readonly Quasi[])[] = []) {
  if (Array.isArray(node)) for (const child of node) taggedQuasis(child, tag, found);
  else if (node && typeof node === 'object') {
    const { type, tag: name, quasi } = node as Node;
    if (type === 'TaggedTemplateExpression' && name?.type === 'Identifier' && name.name === tag)
      found.push(quasi!.quasis);
    for (const child of Object.values(node)) taggedQuasis(child, tag, found);
  }
  return found;
}

/**
 * Lit `css` literals are written for reading (Prettier lays them out rule by rule); the bundle carries them
 * compact. Only their static text changes — comments go, whitespace runs become one space, none is kept
 * beside `{`, `}` or `;`, none opens or closes the literal — never an interpolation, and only in fluvy's own
 * sources. The literals are found by the parser, so a `.css` named in a comment or a string is never taken for one.
 */
function compactCssLiterals(): Plugin {
  const compact = (text: string): string =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{};])\s*/g, '$1');
  return {
    name: 'fluvy-compact-css-literals',
    transform(code, id) {
      if (!id.includes('/packages/') || id.includes('/node_modules/') || !code.includes('css`'))
        return null;
      const edits = taggedQuasis(this.parse(code), 'css').flatMap((quasis) =>
        quasis.map(({ start, end }, i) => {
          let text = compact(code.slice(start, end));
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
  plugins: [compactCssLiterals()],
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
