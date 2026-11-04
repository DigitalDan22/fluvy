import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build, TONES_SHEET, transformStylesheet } from '../../scripts/build-styles.js';
import { ALL_TONES, renderTonesCss, TONE_CARRIERS } from '../tones.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('stylesheet transform', () => {
  it('turns the lab frame into the host and the dark frame into the dark host', () => {
    const css = transformStylesheet(
      `.fv-frame { color: red; } .fv-frame * { margin: 0; } [data-mode='dark'] .fv-knob { opacity: 1; } .lab-sheet { width: 900px; }`,
    );
    expect(css).toBe(':host{color:red}*{margin:0}:host([dark]) .fv-knob{opacity:1}');
  });

  it('sets the dark mode’s custom properties on the dark host, where they reach inside a control’s shadow root', () => {
    expect(transformStylesheet(`[data-mode='dark'] { --fv-tick-glow: 3px; }`)).toBe(
      ':host([dark]){--fv-tick-glow:3px}',
    );
  });

  it('drops frame widths and makes full-width px grids proportional', () => {
    expect(transformStylesheet('.cl-card { width: 360px; height: 10px; }')).toBe(
      '.cl-card{height:10px}',
    );
    expect(
      transformStylesheet(
        '.g { display: grid; grid-template-columns: 96px 96px 96px; gap: 16px; }',
      ),
    ).toBe(
      '.g{display:grid;grid-template-columns:minmax(0,96fr) minmax(0,96fr) minmax(0,96fr);gap:16px}',
    );
    // a grid that does not fill its column keeps its pixels (a 264 px keypad stays a keypad)
    expect(
      transformStylesheet('.k { grid-template-columns: 72px 72px 72px; gap: 24px; }'),
    ).toContain('72px 72px 72px');
  });

  it('keeps keyframes and media queries intact', () => {
    const css = transformStylesheet(
      '@keyframes a { from { opacity: 0; } to { opacity: 1; } } @media (hover: hover) { .x:hover { color: blue; } }',
    );
    expect(css).toContain(
      '@keyframes a{from { opacity:0;} to { opacity:1;}}'.replace('from {', 'from {'),
    );
    expect(css).toContain('@media (hover: hover){.x:hover{color:blue}}');
  });

  it('the committed generated files are in sync with styles/*.css and the tokens', async () => {
    const expected = await build();
    const dir = join(ROOT, 'src', 'styles', 'generated');
    expect((await readdir(dir)).sort()).toEqual(Object.keys(expected).sort());
    for (const [file, content] of Object.entries(expected))
      expect(
        await readFile(join(dir, file), 'utf8'),
        `${file} is stale: run pnpm --filter @fluvy/ui build:styles`,
      ).toBe(content);
  });

  it('the committed tones sheet is the table, and names every carrier of every tone', async () => {
    const css = renderTonesCss();
    expect(await readFile(TONES_SHEET, 'utf8'), 'tones.css is stale: run build:styles').toBe(css);
    for (const tone of ALL_TONES) {
      for (const carrier of TONE_CARRIERS) expect(css).toContain(carrier.replace('{t}', tone));
      expect(css).toContain(`.fv-bar--${tone} {`);
    }
    // nothing outside the generated sheet declares a tone's variables by its carrier
    const others = (await readdir(join(ROOT, 'styles', 'fluvy')))
      .filter((f) => f.endsWith('.css') && f !== 'tones.css')
      .map((f) => join(ROOT, 'styles', 'fluvy', f));
    for (const file of others) {
      const source = await readFile(file, 'utf8');
      expect(
        /\.fv-(ico|badge|tile|ruler|dial|knob|switch|bar)--(accent|light|heat|cool|dry|fan|water|solar|grid|media|warning)\b/.test(
          source,
        ),
        file,
      ).toBe(false);
    }
  });
});
