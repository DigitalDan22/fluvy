import { describe, expect, it } from 'vitest';
import { accentFamily, paletteAccent } from '../build/accent-family.js';
import { derivePalette, GATES } from '../build/derive.js';
import { LIMITS } from '../build/derive/limits.js';
import { derivePalettes } from '../build/palettes.js';
import {
  composite,
  contrastRatio,
  deltaE,
  fromHex,
  minPairwiseDeltaE,
  toHex,
} from '../color/index.js';
import { PALETTE_MODES } from '../config.js';
import {
  accentFamilyVars,
  LIT_FLOOR,
  litFlip,
  litFull,
  litSurface,
  surfaceInset,
  surfaceWash,
} from '../emit/vars.js';
import { HA_COLOR_NAMES, NAMED_COLORS } from '../ha/named.js';
import { COMMUNITY_PALETTES } from '../palettes/community/index.js';
import { CUSTOM_BASES, customSeed, type CustomPalette } from '../palettes/custom.js';
import { lookDeclarations } from '../runtime.js';
import { seeds } from '../palettes/index.js';
import { RAMP_STEPS, type Palette, type PaletteMode, type PaletteSeed } from '../types.js';

/** Colours a card may be given that a palette has to survive: yellow on white, pure blue, grey, lime, near-black… */
const HARD_PICKS = [
  '#ffd400',
  '#0000ff',
  '#808080',
  '#c6ff00',
  '#111111',
  '#ff4a1a',
  '#00b894',
  '#ffffff',
];
/** …and a walk round the wheel: deep, mid, light and very pale; electric, dusty and nearly grey. */
const WHEEL = Array.from({ length: 12 }, (_, i) => i * 30).flatMap((h) =>
  [0.45, 0.65, 0.85, 0.92].flatMap((l) => [0.03, 0.1, 0.3].map((c) => toHex({ l, c, h }))),
);

const palettes = derivePalettes();

/** What a lamp glows: Home Assistant's own colours (its picker's `THEME_COLORS`) and its whites, 2200 K to 6500 K. */
const BULBS = [
  '#f44336',
  '#e91e63',
  '#926bc7',
  '#3f51b5',
  '#2196f3',
  '#00bcd4',
  '#4caf50',
  '#cddc39',
  '#ffeb3b',
  '#ff9800',
  '#ff5722',
  '#795548',
];
const KELVIN = ['#ff932c', '#ffa757', '#ffcea6', '#ffe4ce', '#fffefa'];

describe('a card’s own colour on every palette', () => {
  it('clears the gates the palette’s accent clears, whatever the pick', () => {
    for (const palette of palettes) {
      const seed = seeds[palette.name as keyof typeof seeds];
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card, page } = colors.surface;
        const picks = [
          ...HARD_PICKS,
          ...WHEEL,
          ...HA_COLOR_NAMES.map((name) => NAMED_COLORS[name](colors)),
        ];
        for (const pick of picks) {
          const label = `${palette.name}/${mode} ${pick}`;
          const family = accentFamily(seed, colors, pick);
          const at = (fg: string, bg: string, min: number, what: string): void =>
            expect(contrastRatio(fg, bg), `${label} ${what}`).toBeGreaterThanOrEqual(min);
          at(family.ink, card, GATES.icon, 'ink on card');
          at(family.ink, page, GATES.icon, 'ink on page');
          at(family.text, card, GATES.text, 'text on card');
          at(family.text, page, GATES.text, 'text on page');
          at(family.onFill, family.fill, GATES.onFill, 'ink on fill');
          at(family.fillBorder, family.fill, GATES.borderVsCard, 'fill border');
          at(family.onAccent, family.ink, GATES.text, 'ink on the solid accent');
          at(family.primary.on, family.primary.fill, GATES.text, 'primary');
          at(family.primary.on, family.primary.hover, GATES.text, 'primary hover');
          for (const [index, hex] of family.graph.entries())
            at(hex, card, GATES.icon, `graph ${index + 1} on card`);
          expect(
            minPairwiseDeltaE(family.graph),
            `${label} graph separation`,
          ).toBeGreaterThanOrEqual(GATES.graphSeparation);
          const ramp = RAMP_STEPS.map((step) => family.ramp[step]);
          expect(new Set(ramp).size, `${label} ramp`).toBe(RAMP_STEPS.length);
        }
      }
    }
  });

  it('is the same family every time', () => {
    const palette = palettes[0]!;
    const seed = seeds[palette.name as keyof typeof seeds];
    for (const mode of PALETTE_MODES as readonly PaletteMode[]) {
      const a = accentFamily(seed, palette[mode], '#ff4a1a');
      const b = accentFamily(seed, palette[mode], '#ff4a1a');
      expect(a).toEqual(b);
    }
  });

  it('washes an item’s colour at rest so its words read on it, and as far from the card as the words allow', () => {
    for (const palette of palettes) {
      const seed = seeds[palette.name as keyof typeof seeds];
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card } = colors.surface;
        for (const pick of [...HARD_PICKS, ...HA_COLOR_NAMES.map((n) => NAMED_COLORS[n](colors))]) {
          const vars = new Map(accentFamilyVars(accentFamily(seed, colors, pick), colors));
          const rest = vars.get('--fluvy-accent-rest')!;
          const fill = vars.get('--fluvy-accent-fill')!;
          const at = `${palette.name} ${mode} ${pick}`;
          // the words: the title and the state line, at 4.5
          expect(contrastRatio(colors.text.primary, rest), at).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.text.secondary, rest), at).toBeGreaterThanOrEqual(4.5);
          // it is a wash of the fill, never louder than it, and visibly not the card where the fill is far from it
          expect(contrastRatio(rest, card), at).toBeLessThan(contrastRatio(fill, card) + 0.001);
          if (contrastRatio(fill, card) >= 1.6)
            expect(contrastRatio(rest, card), at).toBeGreaterThanOrEqual(1.18);
        }
      }
    }
  });

  it('washes a card’s own surface so its words and its hairline read on it, never louder than the fill', () => {
    for (const palette of palettes) {
      const seed = seeds[palette.name as keyof typeof seeds];
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card } = colors.surface;
        for (const pick of [
          ...HARD_PICKS,
          ...WHEEL,
          ...HA_COLOR_NAMES.map((n) => NAMED_COLORS[n](colors)),
        ]) {
          const family = accentFamily(seed, colors, pick);
          const wash = surfaceWash(family, colors);
          const at = `${palette.name} ${mode} ${pick}`;
          // the words on the card: the title and the state line, at 4.5
          expect(contrastRatio(colors.text.primary, wash), at).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.text.secondary, wash), at).toBeGreaterThanOrEqual(4.5);
          // the card's edge and dividers, now the fill's hairline, still read on it (or the wash is the card itself)
          if (wash !== card)
            expect(contrastRatio(family.fillBorder, wash), at).toBeGreaterThanOrEqual(1.35);
          // a wash of the fill, never louder than it
          expect(contrastRatio(wash, card), at).toBeLessThan(
            contrastRatio(family.fill, card) + 0.001,
          );
          // the same every time
          expect(surfaceWash(family, colors), at).toBe(wash);
        }
      }
    }
  });

  it('writes the palette’s own accent as the theme does, for an item that asks for it by name', () => {
    for (const palette of palettes)
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const theme = new Map(lookDeclarations(palette, mode));
        for (const [name, value] of accentFamilyVars(paletteAccent(colors), colors)) {
          // the rest washes (`tint: always`) and the ring are the cards' own: the theme writes none, and the palette's
          // accent has no ring
          if (name === '--fluvy-accent-ring') expect(value).toBe('transparent');
          else if (!name.startsWith('--fluvy-accent-rest'))
            expect(value, `${palette.name} ${mode} ${name}`).toBe(theme.get(name));
        }
      }
  });

  it('writes what the accent owns and nothing else', () => {
    const linen = palettes.find((p) => p.name === 'linen')!;
    const volt = palettes.find((p) => p.name === 'volt')!;
    const names = (vars: readonly (readonly [string, string])[]): string[] =>
      vars.map(([name]) => name);
    const soft = names(
      accentFamilyVars(accentFamily(seeds.linen, linen.light, '#0000ff'), linen.light),
    );
    expect(soft).toContain('--fluvy-accent');
    expect(soft).toContain('--fluvy-text-on-accent');
    expect(soft).toContain('--fluvy-highlight'); // Linen has no highlight of its own: the colour is it
    expect(soft).toContain('--fluvy-graph-12');
    expect(soft).toContain('--fluvy-accent-95');
    expect(soft).toContain('--fluvy-state-light-active-fill');
    expect(soft).not.toContain('--fluvy-primary-edge'); // a tint's primary is its ink: no edge
    for (const name of soft) {
      expect(name.startsWith('--fluvy-'), name).toBe(true);
      expect(
        /--fluvy-(page|card|text$|text-secondary|neutral-|state-climate|warning|selected|mark|wash)/.test(
          name,
        ),
        name,
      ).toBe(false);
    }
    // Volt: a solid fill with a lime of its own
    const vivid = names(
      accentFamilyVars(accentFamily(seeds.volt, volt.light, '#0000ff'), volt.light),
    );
    expect(vivid).not.toContain('--fluvy-highlight'); // it keeps its own second colour
    expect(vivid).toContain('--fluvy-primary-edge'); // a solid primary draws its edge in light
    expect(
      names(accentFamilyVars(accentFamily(seeds.volt, volt.dark, '#0000ff'), volt.dark)),
    ).not.toContain('--fluvy-primary-edge');
    expect(soft.length).toBeGreaterThanOrEqual(38);
  });
  it('washes a card’s own surface’s inner fills a step deeper, its words still reading on them', () => {
    for (const palette of palettes) {
      const seed = seeds[palette.name as keyof typeof seeds];
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card, page } = colors.surface;
        for (const pick of [...HARD_PICKS, ...HA_COLOR_NAMES.map((n) => NAMED_COLORS[n](colors))]) {
          const family = accentFamily(seed, colors, pick);
          const inset = surfaceInset(family, colors);
          const at = `${palette.name} ${mode} ${pick}`;
          expect(contrastRatio(colors.text.primary, inset), at).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.text.secondary, inset), at).toBeGreaterThanOrEqual(4.5);
          // the page where the card is the card: a card without a colour of its own has no wash to step from
          if (surfaceWash(family, colors) === card) expect(inset, at).toBe(page);
        }
      }
    }
  });
});

describe('a lit white by its warmth (1.10, #58)', () => {
  /** Home Assistant's colour for a white (`rgb_color` in `color_temp`): a candle, warm, neutral, daylight and cool. */
  const LADDER = [
    [2200, '#ff9227'],
    [2700, '#ffa757'],
    [3000, '#ffb16e'],
    [4000, '#ffcea6'],
    [5000, '#ffe4ce'],
    [6500, '#fffefa'],
    [8000, '#dde6ff'],
  ] as const;
  /** How warm a colour reads: its chroma towards a candle's hue (a cool white's is below nothing). */
  const CANDLE_HUE = fromHex('#ff9227').h;
  const warmth = (hex: string): number => {
    const { c, h } = fromHex(hex);
    return c * Math.cos(((h - CANDLE_HUE) * Math.PI) / 180);
  };

  it('clears the gates every colour clears, on every palette, a candle to a cool white', () => {
    for (const palette of palettes) {
      const seed = seeds[palette.name as keyof typeof seeds];
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card, page } = colors.surface;
        for (const [kelvin, pick] of LADDER) {
          const family = accentFamily(seed, colors, pick, true);
          const at = (fg: string, bg: string, min: number, what: string): void =>
            expect(
              contrastRatio(fg, bg),
              `${palette.name}/${mode} ${kelvin} K ${what}`,
            ).toBeGreaterThanOrEqual(min);
          at(family.ink, card, GATES.icon, 'ink on card');
          at(family.ink, page, GATES.icon, 'ink on page');
          at(family.text, card, GATES.text, 'text on card');
          at(family.text, page, GATES.text, 'text on page');
          at(family.onFill, family.fill, GATES.onFill, 'ink on fill');
          at(family.fillBorder, family.fill, GATES.borderVsCard, 'fill border');
          at(family.onAccent, family.ink, GATES.text, 'ink on the solid accent');
          at(family.primary.on, family.primary.fill, GATES.text, 'primary');
        }
      }
    }
  });

  it('reads as a scale in Linen and Dusk, light and dark: candle, warm, neutral, cool — every step a step', () => {
    for (const name of ['linen', 'dusk'] as const) {
      const palette = palettes.find((p) => p.name === name)!;
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const families = LADDER.map(([, pick]) => accentFamily(seeds[name], colors, pick, true));
        const at = `${name}/${mode}`;
        for (const part of ['fill', 'ink'] as const) {
          const warmths = families.map((family) => warmth(family[part]));
          // ordered: each white cooler than the one before, a candle the warmest, 8,000 K on the cool side
          for (let i = 1; i < LADDER.length; i += 1) {
            expect(warmths[i], `${at} ${part} ${LADDER[i]![0]} K`).toBeLessThan(warmths[i - 1]!);
            // every step a step: at least a just-noticeable difference side by side
            expect(
              deltaE(families[i - 1]![part], families[i]![part]),
              `${at} ${part} ${LADDER[i - 1]![0]} → ${LADDER[i]![0]} K`,
            ).toBeGreaterThanOrEqual(1);
          }
          expect(warmths.at(-1), `${at} ${part} 8000 K`).toBeLessThan(0);
        }
        const chroma = (index: number): number => fromHex(families[index]!.fill).c;
        // 2,700 K plainly warmer than 4,000 K: as far apart as a plate that answers the pointer
        expect(deltaE(families[1]!.fill, families[3]!.fill), at).toBeGreaterThanOrEqual(
          GATES.feedback,
        );
        // 5,000 K nearly neutral, daylight neutral
        expect(chroma(4), at).toBeLessThan(chroma(0) / 3);
        expect(chroma(5), at).toBeLessThan(0.003);
      }
    }
  });
});

describe('a lit light card’s surface (1.9, #41)', () => {
  const lit = (
    role: Parameters<typeof litSurface>[0],
    colors: Parameters<typeof litSurface>[1],
    level: number,
  ): Map<string, string> => new Map(litSurface(role, colors, level));

  it('reads on every palette, in its bulb’s colour, its white or the palette’s lit light, at every level', () => {
    for (const palette of palettes) {
      const seed = seeds[palette.name as keyof typeof seeds];
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const roles = [
          ['light-active', colors.state['light-active']] as const,
          ['accent', colors.accent] as const,
          ...BULBS.map((hex) => [hex, accentFamily(seed, colors, hex)] as const),
          ...KELVIN.map((hex) => [hex, accentFamily(seed, colors, hex, true)] as const),
        ];
        for (const [name, role] of roles)
          for (const level of [0, 0.1, LIT_FLOOR, 0.75, 1]) {
            const vars = lit(role, colors, level);
            const wash = vars.get('--fluvy-card')!;
            const at = (fg: string, bg: string, min: number, what: string): void =>
              expect(
                contrastRatio(fg, bg),
                `${palette.name}/${mode} ${name} ${level}: ${what}`,
              ).toBeGreaterThanOrEqual(min);
            at(colors.text.primary, wash, 4.5, 'the title');
            // the state line, and a ruler's labels (the light card draws them in the secondary ink on a wash)
            at(colors.text.secondary, wash, 4.5, 'the state line and the ruler’s labels');
            at(role.ink, wash, 3, 'the glyph, the switch and the ruler');
            // the card's edge, and a ruler's resting ticks (the wash's hairline on a wash)
            if (wash !== colors.surface.card)
              at(role.fillBorder, wash, 1.35, 'the card’s edge and the resting ticks');
            at(colors.text.primary, vars.get('--fluvy-inset')!, 4.5, 'the words on an inner fill');
            expect(vars.get('--fluvy-border')).toBe(role.fillBorder);
            // a wash of the fill, never louder than it
            expect(contrastRatio(wash, colors.surface.card)).toBeLessThan(
              contrastRatio(role.fill, colors.surface.card) + 0.001,
            );
          }
      }
    }
  });

  it('a dim lamp reads lit and lit never reads as rest; brighter is never nearer the card', () => {
    for (const palette of palettes)
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card } = colors.surface;
        const role = colors.state['light-active'];
        const off = (level: number): number =>
          contrastRatio(lit(role, colors, level).get('--fluvy-card')!, card);
        const at = `${palette.name}/${mode}`;
        // a lamp at 10 % takes the floor: as lit as one at 60 %, and further from the card than rest
        expect(off(0.1), at).toBe(off(LIT_FLOOR));
        expect(lit(role, colors, 0.1).get('--fluvy-card'), at).not.toBe(
          lit(role, colors, 0).get('--fluvy-card'),
        );
        expect(off(LIT_FLOOR), at).toBeGreaterThan(off(0));
        expect(off(0.75), at).toBeGreaterThanOrEqual(off(LIT_FLOOR));
        expect(off(1), at).toBeGreaterThanOrEqual(off(0.75));
        // the same every time
        expect(litSurface(role, colors, 0.75)).toEqual(litSurface(role, colors, 0.75));
      }
  });
});

describe('a light card in its light’s whole colour, with the brightness (`full_brightness`, 1.17, #131)', () => {
  /** Every 5 % step the card takes: 0 is a lamp at 1 or 2 %. */
  const LEVELS = Array.from({ length: 21 }, (_, i) => i / 20);
  /** What a lamp glows: its whites, a warm colour, a saturated red, green and blue, a pale yellow, Home Assistant's. */
  const LAMPS = ['#ff9800', '#ff0000', '#00ff00', '#0000ff', '#fff3a0', ...BULBS];
  const LIGHT = ['state-light-active'];
  /** A step as drawn: its surface, its hairline, and whether its inks are the fill's (a lit tile's skin). */
  const stepOf = (
    role: Parameters<typeof litFull>[0],
    colors: Parameters<typeof litFull>[1],
    level: number,
  ) => {
    const vars = new Map(litFull(role, colors, level, LIGHT));
    const wash = vars.get('--fluvy-card');
    return wash
      ? { onFill: false, surface: wash, border: vars.get('--fluvy-border')!, vars }
      : {
          onFill: true,
          surface: vars.get('--fluvy-state-light-active-fill')!,
          border: vars.get('--fluvy-state-light-active-fill-border')!,
          vars,
        };
  };
  const everyRole = (palette: Palette, mode: PaletteMode) => {
    const seed = seeds[palette.name as keyof typeof seeds];
    const colors = palette[mode];
    return [
      ['light-active', colors.state['light-active']] as const,
      ['accent', colors.accent] as const,
      ...KELVIN.map((hex) => [`white ${hex}`, accentFamily(seed, colors, hex, true)] as const),
      ...LAMPS.map((hex) => [hex, accentFamily(seed, colors, hex)] as const),
    ];
  };

  it('reads at every step on every palette, in either set of inks: the card’s own, or the fill’s once they read as well', () => {
    for (const palette of palettes)
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const solid = colors.fillStyle === 'solid';
        for (const [name, role] of everyRole(palette, mode))
          for (const level of LEVELS) {
            const { onFill, surface, border, vars } = stepOf(role, colors, level);
            const at = (fg: string, min: number, what: string): void =>
              expect(
                contrastRatio(fg, surface),
                `${palette.name}/${mode} ${name} ${level}: ${what}`,
              ).toBeGreaterThanOrEqual(min);
            at(border, 1.35, 'the card’s edge');
            if (onFill) {
              // a lit tile's skin: its words, its state line and labels at 80 %, its switch and rulers, resting ticks
              at(role.onFill, 4.5, 'the title and the level');
              at(composite(role.onFill, surface, 0.8), 4.5, 'the state line and the labels');
              at(solid ? role.onFill : role.ink, 3, 'the switch and the rulers');
              at(
                solid ? composite(role.onFill, surface, 0.28) : colors.surface.borderStrong,
                1.35,
                'the resting ticks',
              );
            } else {
              // a wash's: the page's words, the role's ink, the ticks half the hairline
              at(colors.text.primary, 4.5, 'the title and the level');
              at(colors.text.secondary, 4.5, 'the state line and the labels');
              at(role.ink, 3, 'the glyph, the switch and the rulers');
              at(
                composite(colors.surface.borderStrong, role.fillBorder, 0.5),
                1.35,
                'the resting ticks',
              );
              expect(
                contrastRatio(colors.text.primary, vars.get('--fluvy-inset')!),
                `${palette.name}/${mode} ${name} ${level}: the words on an inner fill`,
              ).toBeGreaterThanOrEqual(4.5);
            }
          }
      }
  });

  it('goes from the soft wash to the whole fill, never nearer the card as it brightens, its inks changing once', () => {
    for (const palette of palettes)
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card } = colors.surface;
        for (const [name, role] of everyRole(palette, mode)) {
          const at = `${palette.name}/${mode} ${name}`;
          const steps = LEVELS.map((level) => stepOf(role, colors, level));
          // the lowest step is the soft wash; 100 % the role's own colours, a lit tile's
          expect(steps[0]!.surface, at).toBe(
            new Map(litSurface(role, colors, LIT_FLOOR)).get('--fluvy-card'),
          );
          expect([steps[20]!.onFill, steps[20]!.surface, steps[20]!.border], at).toEqual([
            true,
            role.fill,
            role.fillBorder,
          ]);
          // each step a share of the fill over the card, in fiftieths, never less than the one under it
          const shares = Array.from({ length: 51 }, (_, share) =>
            composite(role.fill, card, share / 50),
          );
          const flip = litFlip(role, colors);
          steps.forEach((step, i) => {
            expect(step.onFill, `${at} ${LEVELS[i]}`).toBe(LEVELS[i]! >= flip);
            expect(shares.indexOf(step.surface), `${at} ${LEVELS[i]}`).toBeGreaterThanOrEqual(
              i ? shares.indexOf(steps[i - 1]!.surface) : 1,
            );
          });
          // the card's inks, then the fill's: one change, at one level, the same up and down
          expect(
            steps.filter((step, i) => i && step.onFill !== steps[i - 1]!.onFill).length,
            at,
          ).toBeLessThanOrEqual(1);
        }
      }
  });

  it('redefines what the role is drawn by from the flip, the fill and its hairline: a colour’s accent and lit light both', () => {
    const colors = palettes[0]!.dark;
    const role = accentFamily(seeds[palettes[0]!.name as keyof typeof seeds], colors, '#ff0000');
    expect(litFull(role, colors, 1, ['accent', 'state-light-active'])).toEqual([
      ['--fluvy-accent-fill', role.fill],
      ['--fluvy-accent-fill-border', role.fillBorder],
      ['--fluvy-state-light-active-fill', role.fill],
      ['--fluvy-state-light-active-fill-border', role.fillBorder],
    ]);
  });
});

describe('an inner fill on a washed surface (`--fluvy-inset`, 1.9)', () => {
  /** Every palette a card can sit on: the presets, the community's, and a custom one of each character, base and fill. */
  const everyPalette: [string, PaletteSeed, Palette][] = [
    ...palettes.map((palette): [string, PaletteSeed, Palette] => [
      palette.name,
      seeds[palette.name as keyof typeof seeds],
      palette,
    ]),
    ...[
      ...COMMUNITY_PALETTES.map((entry) => entry.palette),
      ...CUSTOM_BASES.flatMap((base): CustomPalette[] => [
        { character: 'soft', base, accent: '#3a7bd5' },
        { character: 'vivid', base, accent: '#3a7bd5', fill: 'tint' },
        { character: 'vivid', base, accent: '#e2ff3d', fill: 'solid' },
      ]),
    ].map((custom): [string, PaletteSeed, Palette] => {
      const seed = customSeed(custom);
      return [seed.key ?? seed.name, seed, derivePalette(seed)];
    }),
  ];
  /** The least chroma a colour has: under it a grey, which has only its depth to keep. */
  const COLOUR = LIMITS.soft.accentChroma[0];

  it('is the wash’s deeper step on every palette: its words read, never the bare page, a colour keeps its colour', () => {
    for (const [name, seed, palette] of everyPalette)
      for (const mode of PALETTE_MODES) {
        const colors = palette[mode];
        const { card, page } = colors.surface;
        // a card's own colour, and a lit light card in its bulb's colour, its white or the palette's lit light
        const picks = [...HARD_PICKS, ...HA_COLOR_NAMES.map((n) => NAMED_COLORS[n](colors))];
        const roles = [
          ['light-active', colors.state['light-active']] as const,
          ...[...BULBS, ...KELVIN].map((hex) => [hex, accentFamily(seed, colors, hex)] as const),
        ];
        const surfaces = [
          ...picks.map((pick) => {
            const family = accentFamily(seed, colors, pick);
            const [fill, wash, inset] = [
              family.fill,
              surfaceWash(family, colors),
              surfaceInset(family, colors),
            ];
            return { what: pick, fill, wash, inset };
          }),
          ...roles.flatMap(([role, colours]) =>
            [0, 0.12, LIT_FLOOR, 1].map((level) => {
              const vars = new Map(litSurface(colours, colors, level));
              const [wash, inset] = [vars.get('--fluvy-card')!, vars.get('--fluvy-inset')!];
              return { what: `lit ${role} ${level}`, fill: colours.fill, wash, inset };
            }),
          ),
        ];
        for (const { what, fill, wash, inset } of surfaces) {
          const at = `${name}/${mode} ${what}`;
          expect(contrastRatio(colors.text.primary, inset), at).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.text.secondary, inset), at).toBeGreaterThanOrEqual(4.5);
          if (wash === card) continue;
          // never a hole of the page's colour in a washed card (Volt's light page leaves a colour no room over it)
          expect(inset, at).not.toBe(page);
          // a colour keeps at least half of its wash's colour over the page: a step of the card, not of the page
          if (fromHex(fill).c >= COLOUR)
            expect(deltaE(inset, page), at).toBeGreaterThanOrEqual(deltaE(wash, card) / 2);
        }
      }
  });
});
