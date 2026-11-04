import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { contrastRatio, derivePalette, derivePalettes, GATES, type Hex } from '@fluvy/tokens';
import { COMMUNITY_PALETTES } from '@fluvy/tokens/community';
import { seedOf } from '@fluvy/tokens/runtime';
import { emitThemeYaml, THEME_NAME } from '../emit.js';
import { validateThemeYaml } from '../validate.js';

const linen = derivePalettes().find((p) => p.name === 'linen')!;

describe('theme yaml', () => {
  const yaml = emitThemeYaml(linen);
  const doc = parse(yaml) as Record<string, Record<string, unknown>>;
  const theme = doc[THEME_NAME]!;

  it('is named for the palette and declares both modes with the same keys', () => {
    expect(Object.keys(doc)).toEqual(['Fluvy']);
    const modes = theme['modes'] as Record<string, Record<string, string>>;
    expect(Object.keys(modes)).toEqual(['light', 'dark']);
    expect(Object.keys(modes['light']!).sort()).toEqual(Object.keys(modes['dark']!).sort());
  });

  it('passes the offline validator', () => {
    expect(validateThemeYaml(yaml)).toEqual([]);
  });

  it('writes keys without the leading dashes and values as strings', () => {
    // Home Assistant's radii refer to ours, so a shape moves them all
    expect(theme['ha-card-border-radius']).toBe('var(--fluvy-radius-card)');
    expect(theme['fluvy-radius-card']).toBe('20px');
    const light = (theme['modes'] as Record<string, Record<string, unknown>>)['light']!;
    expect(light['primary-color']).toMatch(/^#[0-9a-f]{6}$/);
    expect(light['fluvy-card']).toMatch(/^#[0-9a-f]{6}$/);
    for (const value of Object.values(light)) expect(typeof value).toBe('string');
  });

  it('carries a build stamp that follows the declarations', () => {
    expect(theme['fluvy-theme-build']).toMatch(/^[0-9a-f]{8}$/);
    expect(emitThemeYaml(linen)).toBe(yaml);
  });

  it('never touches the animation durations Home Assistant uses for reduced motion', () => {
    expect(yaml).not.toMatch(/ha-animation-duration/);
  });

  it('is the reviewed file (a change to any value shows up here as a diff to accept with -u)', () => {
    // the header names the release; a release is not a change to the theme
    expect(yaml.replace(/^# Fluvy v[^ ]+/, '# Fluvy v<version>')).toMatchSnapshot();
  });

  it('writes only names Home Assistant has (vendored from the frontend: scripts/ha-vars.mjs)', () => {
    const known = new Set(
      (
        JSON.parse(readFileSync(new URL('./ha-vars.json', import.meta.url), 'utf8')) as {
          names: string[];
        }
      ).names,
    );
    // names HA builds at run time from a pattern, never spelled out in its source
    const dynamic = [/^--graph-color-\d+$/, /^--state-[a-z_]+-[a-z_]+-color$/];
    // kept on purpose although HA 2026 no longer reads it: community cards still colour their icons with it
    const deliberate = new Set(['--paper-item-icon-color']);
    const modes = theme['modes'] as Record<string, Record<string, string>>;
    const names = [...Object.keys(theme), ...Object.keys(modes['light']!)]
      .filter((key) => key !== 'modes' && !key.startsWith('fluvy'))
      .map((key) => `--${key}`);
    const unknown = names.filter(
      (name) =>
        !known.has(name) && !deliberate.has(name) && !dynamic.some((pattern) => pattern.test(name)),
    );
    expect(unknown).toEqual([]);
  });
});

describe('a person’s badge', () => {
  it('writes their initials in an ink that reads on its fill, in every palette and both modes', () => {
    const palettes = [
      ...derivePalettes(),
      ...COMMUNITY_PALETTES.map((entry) => derivePalette(seedOf(entry.palette))),
    ];
    for (const palette of palettes) {
      const modes = (parse(emitThemeYaml(palette)) as Record<string, Record<string, unknown>>)[
        THEME_NAME
      ]!['modes'] as Record<string, Record<string, Hex>>;
      for (const [mode, vars] of Object.entries(modes)) {
        const ink = vars['text-light-primary-color'];
        const fill = vars['light-primary-color'];
        expect(
          ink && fill && contrastRatio(ink, fill),
          `${palette.name} ${mode}`,
        ).toBeGreaterThanOrEqual(GATES.onFill);
      }
    }
  });
});

describe('validator', () => {
  it('rejects the fatal shapes', () => {
    expect(
      validateThemeYaml('Fluvy:\n  primary-color: null\n  modes:\n    light: {}\n    dark: {}\n')
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateThemeYaml('Fluvy:\n  primary-color: "#fff"\n').some((p) =>
        p.message.includes('light-only'),
      ),
    ).toBe(true);
    expect(
      validateThemeYaml(
        'Fluvy:\n  modes:\n    light:\n      primary-color: "oklch(0.5 0.1 80)"\n    dark:\n      primary-color: "#aabbcc"\n',
      ).some((p) => p.message.includes('#rrggbb')),
    ).toBe(true);
    expect(validateThemeYaml('- a\n- b\n')[0]?.message).toMatch(/top level/);
    expect(
      validateThemeYaml(
        'Fluvy:\n  --primary-color: "#aabbcc"\n  modes:\n    light: {}\n    dark: {}\n',
      ).some((p) => p.message.includes('leading')),
    ).toBe(true);
  });
});
