import { LIMITS } from '../build/derive/limits.js';
import { SECONDARY_ON_FILL } from '../build/derive/profiles.js';
import { meshOf } from '../build/mesh.js';
import { composite, contrastRatio } from '../color/contrast.js';
import { ensureContrast } from '../color/fit.js';
import { fromHex, toHex } from '../color/oklch.js';
import { cssVar, DEFAULT_MODE, DEFAULT_PALETTE, PALETTE_TOKEN } from '../config.js';
import type { AccentFamily } from '../build/derive/accent.js';
import {
  DEFAULT_PILL,
  DEFAULT_SHAPE,
  PILLS,
  type PillName,
  type ShapeName,
} from '../scales/radius.js';
import {
  density,
  duration,
  easing,
  fontFamily,
  fontSize,
  fontWeight,
  iconBox,
  lineHeight,
  numericVariant,
  SHAPES,
  spacing,
  SPACING_STEPS,
} from '../scales/index.js';
import { haModeVars } from '../ha/groups.js';
import {
  RAMP_STEPS,
  SEMANTIC_ROLES,
  STATE_KEYS,
  type Hex,
  type Palette,
  type PaletteModeColors,
  type RoleColors,
} from '../types.js';

/**
 * The brand names only some palettes write: a solid primary's edge, and a highlight's mark. A look applied inside
 * another (the settings panel wearing the look being chosen, a dashboard inside a themed page) declares them empty
 * when it has none, so nothing of the outer look's shows through.
 */
export const OPTIONAL_BRAND_VARS: readonly string[] = [
  cssVar('primary-edge'),
  cssVar('mark'),
  cssVar('on-mark'),
  cssVar('mark-edge'),
];

export type CssDeclaration = readonly [name: string, value: string];

export interface VarGroup {
  readonly title: string;
  readonly declarations: readonly CssDeclaration[];
}

/**
 * Mode-independent tokens: shape, rhythm, type and motion. Emitted once on `:root`
 * so a palette switch never re-declares them.
 */
export function scaleVars(
  shape: ShapeName = DEFAULT_SHAPE,
  pill: PillName = DEFAULT_PILL,
): readonly VarGroup[] {
  const radius = { ...SHAPES[shape], pill: PILLS[pill] };
  return [
    {
      title: 'Spacing — 4px base grid',
      declarations: [
        ...SPACING_STEPS.map((step): CssDeclaration => [cssVar(`space-${step}`), spacing[step]]),
        [cssVar('pad-comfortable'), density.comfortable.padding],
        [cssVar('gap-comfortable'), density.comfortable.gap],
        [cssVar('pad-compact'), density.compact.padding],
        [cssVar('gap-compact'), density.compact.gap],
      ],
    },
    {
      title: 'Radius',
      declarations: [
        ...Object.entries(radius).map(([name, value]): CssDeclaration => [
          cssVar(`radius-${name}`),
          value,
        ]),
        [cssVar('icon-box-size'), iconBox.size],
        [cssVar('icon-box-radius'), `var(${cssVar('radius-control')})`],
      ],
    },
    {
      title: 'Typography',
      declarations: [
        [cssVar('font-sans'), fontFamily.sans],
        [cssVar('font-mono'), fontFamily.mono],
        ...Object.entries(fontSize).map(([name, value]): CssDeclaration => [
          cssVar(`text-${name}`),
          value,
        ]),
        ...Object.entries(fontWeight).map(([name, value]): CssDeclaration => [
          cssVar(`weight-${name}`),
          value,
        ]),
        ...Object.entries(lineHeight).map(([name, value]): CssDeclaration => [
          cssVar(`leading-${name}`),
          value,
        ]),
        [cssVar('numeric'), numericVariant],
      ],
    },
    {
      title: 'Motion',
      declarations: [
        ...Object.entries(duration).map(([name, value]): CssDeclaration => [
          cssVar(`duration-${name}`),
          value,
        ]),
        ...Object.entries(easing).map(([name, value]): CssDeclaration => [
          cssVar(`ease-${name}`),
          value,
        ]),
      ],
    },
  ];
}

/** Which palette this is, in both modes alike: what a card reads to derive its own colour on this very palette. */
export function identityVars(palette: Pick<Palette, 'key'>): readonly VarGroup[] {
  return [{ title: 'Identity', declarations: [[PALETTE_TOKEN, palette.key]] }];
}

/** Whether a page's words read on a wash: the primary and the secondary ink at 4.5. */
const wordsRead = (colors: PaletteModeColors, wash: Hex): boolean =>
  contrastRatio(colors.text.secondary, wash) >= 4.5 &&
  contrastRatio(colors.text.primary, wash) >= 4.5;

/** The most of `fill` over `ground`, in fiftieths from `from` down, at which `reads` holds; 0: none. */
function washStep(fill: Hex, ground: Hex, from: number, reads: (wash: Hex) => boolean): number {
  let step = from;
  while (step > 0 && !reads(composite(fill, ground, step / 50))) step--;
  return step;
}

/**
 * An item's colour at rest (`tint: always`): its fill washed into the ground it sits on, as much of it as keeps the
 * words on it — the primary and the secondary ink — at 4.5, up to 40 %. A tint palette's fill is pale enough to take
 * the 40 %; a solid one in dark gives a quarter or so. With none to spare, the ground: the fill's hairline says it.
 */
export function restWash(fill: Hex, ground: Hex, colors: PaletteModeColors): Hex {
  // from 40 % down, two points a step
  return composite(
    fill,
    ground,
    washStep(fill, ground, 20, (wash) => wordsRead(colors, wash)) / 50,
  );
}

/** The share of a card's own surface (`surfaceWash`), in fiftieths. */
const surfaceStep = (family: AccentFamily, colors: PaletteModeColors): number =>
  washStep(
    family.fill,
    colors.surface.card,
    20,
    (wash) => wordsRead(colors, wash) && contrastRatio(family.fillBorder, wash) >= 1.35,
  );

/**
 * A card's own surface (`card_color`, 1.7): its fill washed into the palette's card as far as everything on it still
 * reads — the words at 4.5, the fill's hairline (the card's edges and dividers then) at 1.35 over it — up to 40 %.
 * With none to spare, the card itself: the hairline alone says the colour. The page, the inner tiles and the inks stay
 * the palette's, so what is on a tinted card reads as it does on any other.
 */
export function surfaceWash(family: AccentFamily, colors: PaletteModeColors): Hex {
  return composite(family.fill, colors.surface.card, surfaceStep(family, colors) / 50);
}

/**
 * What sits inside a washed surface where the page's fill would (`--fluvy-inset`, 1.9: a round, an action, the
 * stepper, an option, a chip, a resting neutral circle): the same share of the fill over the page — the wash's own
 * deeper step, never a hole of the page's colour in it. Where the words would not read on it at 4.5, it gives up some
 * of its colour while it keeps half of it (a grey, any of it: it has only its depth to keep); past that — a page as
 * deep as Volt's light one leaves a colour no room over it — it keeps the colour whole and gives up depth instead:
 * the share over a ground lifted from the page toward the card, as far as the words need (at the most, flush).
 */
function insetWash(fill: Hex, step: number, colors: PaletteModeColors): Hex {
  const { page, card } = colors.surface;
  const reads = (wash: Hex): boolean => wordsRead(colors, wash);
  const kept = washStep(fill, page, step, reads);
  if (kept * 2 >= step || (kept > 0 && fromHex(fill).c < COLOUR))
    return composite(fill, page, kept / 50);
  const lift = washStep(page, card, 50, (ground) => reads(composite(fill, ground, step / 50)));
  return composite(fill, composite(page, card, lift / 50), step / 50);
}

/** The least chroma a colour has (a soft palette's accent band starts here): under it, a grey. */
const COLOUR = LIMITS.soft.accentChroma[0];

/** A card's own surface's inner fill (`card_color`): its wash's deeper step (`insetWash`). */
export const surfaceInset = (family: AccentFamily, colors: PaletteModeColors): Hex =>
  insetWash(family.fill, surfaceStep(family, colors), colors);

/** The share of its cap a lit surface takes at rest (`tint: always`), and the least it takes lit (a dim lamp). */
export const LIT_REST = 0.4;
export const LIT_FLOOR = 0.6;

/**
 * Whether a wash of a role reads in the card's own inks: the words at 4.5 (a ruler's labels then take the secondary
 * ink), the role's ink (the glyph, the switch's track, the ruler) at 3, the fill's hairline (the card's edge, a ruler's
 * resting ticks) at 1.35.
 */
const washReads =
  (role: RoleColors, colors: PaletteModeColors) =>
  (wash: Hex): boolean =>
    wordsRead(colors, wash) &&
    contrastRatio(role.ink, wash) >= 3 &&
    contrastRatio(role.fillBorder, wash) >= 1.35;

/** A wash of a role `step` fiftieths over the card: the card's fill, the fill's hairline, its inner fills' step. */
const washVars = (
  role: RoleColors,
  colors: PaletteModeColors,
  step: number,
): readonly CssDeclaration[] => [
  ['--fluvy-card', composite(role.fill, colors.surface.card, step / 50)],
  ['--fluvy-border', role.fillBorder],
  ['--fluvy-inset', insetWash(role.fill, step, colors)],
];

/** The share of its cap a lit surface takes at `level` (0 at rest). */
const litShare = (level: number): number =>
  level > 0 ? LIT_REST + (1 - LIT_REST) * Math.min(1, Math.max(LIT_FLOOR, level)) : LIT_REST;

/**
 * A light card's lit surface (`tint_strength: soft | brightness`, 1.9): the role's fill washed into the card. Its cap
 * is the most of the fill at which everything on it reads in the card's own inks (`washReads`); at rest (`level` 0)
 * it takes two fifths of the cap, lit `rest + (cap − rest) × max(0.6, level)`, so a dim lamp reads lit and lit never
 * reads as rest. Its inner fills take the wash's deeper step.
 */
export function litSurface(
  role: RoleColors,
  colors: PaletteModeColors,
  level: number,
): readonly CssDeclaration[] {
  const { card } = colors.surface;
  const reads = washReads(role, colors);
  const cap = washStep(role.fill, card, 50, reads);
  return washVars(
    role,
    colors,
    washStep(role.fill, card, Math.round(cap * litShare(level)), reads),
  );
}

/** How far a set of inks clears its gates on a wash: the least of its words' (4.5) and its ink's (3); from 1, it reads. */
const clears = (words: Hex, secondary: Hex, ink: Hex, wash: Hex): number =>
  Math.min(
    contrastRatio(words, wash) / 4.5,
    contrastRatio(secondary, wash) / 4.5,
    contrastRatio(ink, wash) / 3,
  );

/**
 * How a light card in its light's whole colour follows the lamp (`tint_strength: full_brightness`, 1.17), in fiftieths
 * of the role's fill over the card: from the soft wash (`litSurface`'s floor) at the lowest level to the whole fill at
 * 100 %. Two sets of inks take turns on it: the card's (its words, the role's ink, the fill's hairline: a wash's,
 * `washReads`) and the fill's (its on-fill ink, the state line in it at 80 %, the ink a solid fill's switch and rulers
 * take: a lit tile's). The card wears the fill's from the share where they clear their gates at least as well as its
 * own (`flip`), at `at` of the levels: once, at one level, the same up and down. Where neither reads there (a solid
 * palette in dark: light words on a dim wash, dark ones on a bright fill), the shares from the last the card's read on
 * (`top`) to the first from which the fill's read on to the fill (`bottom`) are left out, and the levels on each side
 * spread over what reads there.
 */
function litRamp(role: RoleColors, colors: PaletteModeColors) {
  const { card } = colors.surface;
  const reads = washReads(role, colors);
  const wash = (step: number): Hex => composite(role.fill, card, step / 50);
  const ink = colors.fillStyle === 'solid' ? role.onFill : role.ink;
  const fills = (step: number): number => {
    const on = wash(step);
    return clears(role.onFill, composite(role.onFill, on, SECONDARY_ON_FILL), ink, on);
  };
  const own = (step: number): number =>
    clears(colors.text.primary, colors.text.secondary, role.ink, wash(step));
  const cap = washStep(role.fill, card, 50, reads);
  const soft = washStep(role.fill, card, Math.round(cap * litShare(LIT_FLOOR)), reads);
  let from = 50;
  while (from > 0 && fills(from - 1) >= 1) from--;
  let flip = soft;
  while (flip < 50 && fills(flip) < own(flip)) flip++;
  return {
    reads,
    soft,
    top: Math.min(cap, flip),
    bottom: Math.max(from, flip),
    at: (flip - soft) / (50 - soft),
  };
}

/** From which level (0 to 1) a light card in its light's whole colour wears the fill's inks (`litRamp`). */
export const litFlip = (role: RoleColors, colors: PaletteModeColors): number =>
  litRamp(role, colors).at;

/**
 * A light card in its light's whole colour at `level` (`tint_strength: full_brightness`, 1.17, `litRamp`). Under the
 * flip, a wash in the card's own inks, as `litSurface`'s; from it, the fill at the level's share in its own inks, what
 * the role is drawn by (`names`: `accent`, `state-light-active`) redefined there — its fill, and its hairline kept 1.35
 * from it on the side it sits at 100 % — so the lit tile's skin and every part of it that takes the fill (a switch's
 * thumb, a knob, a quick colour's edge) wear it. At 100 %, the role's own colours: a lit tile's.
 */
export function litFull(
  role: RoleColors,
  colors: PaletteModeColors,
  level: number,
  names: readonly string[],
): readonly CssDeclaration[] {
  const { card } = colors.surface;
  const { reads, soft, top, bottom, at } = litRamp(role, colors);
  if (level < at)
    return washVars(
      role,
      colors,
      washStep(role.fill, card, Math.round(soft + ((top - soft) * level) / at), reads),
    );
  const step = at < 1 ? Math.round(bottom + ((50 - bottom) * (level - at)) / (1 - at)) : 50;
  const fill = composite(role.fill, card, step / 50);
  const border =
    contrastRatio(role.fillBorder, fill) >= 1.35
      ? role.fillBorder
      : toHex(
          ensureContrast(
            fromHex(role.fillBorder),
            fill,
            1.35,
            fromHex(role.fillBorder).l < fromHex(role.fill).l ? 'darker' : 'lighter',
          ),
        );
  return names.flatMap((name): CssDeclaration[] => [
    [cssVar(`${name}-fill`), fill],
    [cssVar(`${name}-fill-border`), border],
  ]);
}

/**
 * What a card's own colour redefines inside it: the accent's seven, the ink on the solid accent, the primary
 * action, the highlight where the palette has none of its own, the accent ramp, the twelve graph series and the
 * lit light (the accent's twin) — and nothing else: surfaces, text, the neutral ramp, the other states, the marks
 * and every Home Assistant name stay the palette's.
 */
export function accentFamilyVars(
  family: AccentFamily,
  colors: PaletteModeColors,
): readonly CssDeclaration[] {
  const wash =
    colors.fillStyle === 'solid'
      ? composite(family.fill, colors.washBase, colors.washShare)
      : family.fill;
  return [
    [cssVar('text-on-accent'), family.onAccent],
    [cssVar('accent'), family.ink],
    [cssVar('accent-hover'), family.hover],
    [cssVar('accent-text'), family.text],
    [cssVar('accent-fill'), family.fill],
    [cssVar('accent-fill-border'), family.fillBorder],
    [cssVar('accent-wash'), wash],
    [cssVar('accent-rest'), restWash(family.fill, colors.surface.card, colors)],
    [cssVar('accent-rest-inner'), restWash(family.fill, colors.surface.page, colors)],
    [cssVar('accent-on-fill'), family.onFill],
    [cssVar('primary'), family.primary.fill],
    [cssVar('primary-hover'), family.primary.hover],
    ...(colors.fillStyle === 'solid' && colors.mode === 'light'
      ? ([[cssVar('primary-edge'), family.fillBorder]] as const)
      : []),
    [cssVar('on-primary'), family.primary.on],
    ...(colors.mark
      ? []
      : ([
          [cssVar('highlight'), family.ink],
          [cssVar('highlight-fill'), family.fill],
          [cssVar('highlight-fill-border'), family.fillBorder],
          [cssVar('highlight-on-fill'), family.onFill],
        ] as const)),
    ...RAMP_STEPS.map((step): CssDeclaration => [cssVar(`accent-${step}`), family.ramp[step]]),
    ...family.graph.map((hex, index): CssDeclaration => [cssVar(`graph-${index + 1}`), hex]),
    [cssVar('state-light-active'), family.ink],
    [cssVar('state-light-active-fill'), family.fill],
    [cssVar('state-light-active-fill-border'), family.fillBorder],
    [cssVar('state-light-active-on-fill'), family.onFill],
    // always said, so an item inside a white card takes no ring of the card's
    [cssVar('accent-ring'), family.ring ?? 'transparent'],
  ];
}

/** The brand layer: every colour the product owns, complete for one palette × mode. */
export function brandColorVars(colors: PaletteModeColors): readonly VarGroup[] {
  const mesh = meshOf(colors.surface.page, colors.mode);
  return [
    {
      title: 'Surfaces',
      declarations: [
        [cssVar('page'), colors.surface.page],
        [cssVar('page-alt'), colors.surface.pageAlt],
        [cssVar('card'), colors.surface.card],
        [cssVar('card-elevated'), colors.surface.cardElevated],
        [cssVar('border'), colors.surface.border],
        [cssVar('border-strong'), colors.surface.borderStrong],
      ],
    },
    {
      title:
        'Mesh — three stops over the page in its own hue (`.fv-bg--mesh`), and one step deeper for a wall (`.fv-bg--wall`)',
      declarations: [
        ...mesh.mesh.map((hex, index): CssDeclaration => [cssVar(`mesh-${index + 1}`), hex]),
        ...mesh.wall.map((hex, index): CssDeclaration => [cssVar(`mesh-wall-${index + 1}`), hex]),
      ],
    },
    {
      // what lifts off the page (menus, popovers, the dial's disc) and the knob's own drop; dark needs a deeper shadow to read at all
      title: 'Elevation',
      declarations: [
        // black at an alpha, written as #rrggbbaa: the one colour notation every reader of the theme parses
        [
          cssVar('shadow-lift'),
          colors.mode === 'dark'
            ? '0 16px 40px -16px #000000cc, 0 2px 6px -2px #00000066'
            : '0 16px 40px -16px #00000059, 0 2px 6px -2px #0000001f',
        ],
        [
          cssVar('shadow-knob'),
          colors.mode === 'dark' ? '0 4px 10px -2px #00000099' : '0 4px 10px -2px #00000040',
        ],
      ],
    },
    {
      title: 'Text',
      declarations: [
        [cssVar('text'), colors.text.primary],
        [cssVar('text-secondary'), colors.text.secondary],
        [cssVar('text-disabled'), colors.text.disabled],
        [cssVar('text-on-accent'), colors.text.onAccent],
      ],
    },
    {
      title: 'Accent',
      declarations: [
        [cssVar('accent'), colors.accent.ink],
        [cssVar('accent-hover'), colors.accent.hover],
        [cssVar('accent-text'), colors.accent.text],
        [cssVar('accent-fill'), colors.accent.fill],
        [cssVar('accent-fill-border'), colors.accent.fillBorder],
        [cssVar('accent-wash'), colors.accent.wash],
        [cssVar('accent-on-fill'), colors.accent.onFill],
      ],
    },
    {
      title:
        'Roles — where you are, the primary action, you and today; how a resting icon circle and a solid fill are drawn',
      declarations: [
        [cssVar('selected'), colors.selected.fill],
        [cssVar('on-selected'), colors.selected.on],
        [cssVar('primary'), colors.primary.fill],
        [cssVar('primary-hover'), colors.primary.hover],
        // a solid primary is a light disc: on a white card in light mode it draws its edge (Noir's lime is 1.16:1)
        ...(colors.fillStyle === 'solid'
          ? ([
              [
                cssVar('primary-edge'),
                colors.mode === 'light' ? colors.accent.fillBorder : 'transparent',
              ],
            ] as const)
          : []),
        [cssVar('on-primary'), colors.primary.on],
        ...(colors.mark
          ? ([
              [cssVar('mark'), colors.mark.fill],
              [cssVar('on-mark'), colors.mark.on],
              // a lime mark on a white card in light mode draws its edge, as a solid primary does
              [
                cssVar('mark-edge'),
                colors.mode === 'light' ? colors.highlight.fillBorder : 'transparent',
              ],
            ] as const)
          : []),
        [cssVar('wash'), `${Math.round(colors.washShare * 100)}%`],
        [cssVar('wash-base'), colors.washBase],
        // on a solid fill, what sits on it (a switch, a ruler, a label) takes the fill's own ink: 100 %; 0 % keeps the tint's
        [cssVar('solid'), colors.fillStyle === 'solid' ? '100%' : '0%'],
        // an electric palette's placeholders (an avatar, an artwork) are its primary; 0 % keeps the soft line's sphere
        [cssVar('electric'), colors.character === 'vivid' ? '100%' : '0%'],
      ],
    },
    {
      title: 'Highlight — the second brand colour (the accent where a palette has none)',
      declarations: [
        [cssVar('highlight'), colors.highlight.ink],
        [cssVar('highlight-fill'), colors.highlight.fill],
        [cssVar('highlight-fill-border'), colors.highlight.fillBorder],
        [cssVar('highlight-on-fill'), colors.highlight.onFill],
      ],
    },
    {
      title: 'Ramps (higher number = lighter)',
      declarations: [
        ...RAMP_STEPS.map((step): CssDeclaration => [
          cssVar(`neutral-${step}`),
          colors.neutralRamp[step],
        ]),
        ...RAMP_STEPS.map((step): CssDeclaration => [
          cssVar(`accent-${step}`),
          colors.accentRamp[step],
        ]),
      ],
    },
    {
      // and information as a tone (`notice`): the accent where it stands apart from the warning and the danger
      title: 'Status',
      declarations: [
        ...SEMANTIC_ROLES.map((role) => [role, colors.semantic[role]] as const),
        ['notice', colors.notice] as const,
      ].flatMap(([role, value]): CssDeclaration[] => [
        [cssVar(role), value.ink],
        [cssVar(`${role}-fill`), value.fill],
        [cssVar(`${role}-fill-border`), value.fillBorder],
        [cssVar(`${role}-on-fill`), value.onFill],
      ]),
    },
    {
      title: 'Domain states',
      declarations: STATE_KEYS.flatMap((key): CssDeclaration[] => {
        const value = colors.state[key];
        return [
          [cssVar(`state-${key}`), value.ink],
          [cssVar(`state-${key}-fill`), value.fill],
          [cssVar(`state-${key}-fill-border`), value.fillBorder],
          [cssVar(`state-${key}-on-fill`), value.onFill],
        ];
      }),
    },
    {
      title: 'Unavailable — neutral ink at 70%, dashed hairline, never red',
      declarations: [
        [cssVar('unavailable'), colors.unavailable.ink],
        [cssVar('unavailable-border'), colors.unavailable.border],
        [cssVar('unavailable-border-style'), 'dashed'],
      ],
    },
    {
      title: 'Graph series',
      declarations: colors.graph.map((hex, index): CssDeclaration => [
        cssVar(`graph-${index + 1}`),
        hex,
      ]),
    },
  ];
}

/** One palette × mode as the theme writes it: the brand layer, then Home Assistant's names (`../ha/groups.ts`). */
export function allPaletteVars(colors: PaletteModeColors): readonly VarGroup[] {
  return [...brandColorVars(colors), ...haModeVars(colors)];
}

/** The palette × mode that `:root` falls back to when no data attributes are present. */
export function defaultColors(palettes: readonly Palette[]): PaletteModeColors {
  const palette = palettes.find((entry) => entry.name === DEFAULT_PALETTE);
  if (palette === undefined) {
    throw new Error(`Default palette "${DEFAULT_PALETTE}" is not in the registry`);
  }
  return palette[DEFAULT_MODE];
}
