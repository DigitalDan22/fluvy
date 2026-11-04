import { NAMED_COLORS, statusRamp, THEME_COLOR_NAMES } from './named.js';
import { cssVar, THEME_SENTINEL } from '../config.js';
import { fontFamily, fontSize, fontWeight, lineHeight, type RadiusName } from '../scales/index.js';
import { RAMP_STEPS, STATE_KEYS, type PaletteModeColors, type StateKey } from '../types.js';
import type { CssDeclaration, VarGroup } from '../emit/vars.js';

/**
 * Home Assistant's variables, set from the brand layer — the whole mapping in one place, grouped by
 * what it styles. Each group owns its two halves: `shared` (mode-independent, written once at the
 * theme's top level) and `perMode` (written into `modes.light` and `modes.dark`, from that mode's
 * colours). The theme file, `lab.css` and the tests all read this one list.
 *
 * Rules every value follows:
 * - colours are plain `#rrggbb` (or `#rrggbbaa`): Home Assistant reads many from JavaScript, and its
 *   `theme2hex` mangles `oklch()`, `color-mix()` and `rgba()`;
 * - `--ha-animation-duration-*` is never written: HA uses it to honour `prefers-reduced-motion`;
 * - `--ha-space-*` is left alone: it also drives control sizes.
 */
export interface HaGroup {
  readonly title: string;
  readonly shared?: readonly CssDeclaration[];
  readonly perMode?: (colors: PaletteModeColors) => readonly CssDeclaration[];
}

const dark = (colors: PaletteModeColors): boolean => colors.mode === 'dark';

/**
 * Ink on the accent's fill: a soft palette keeps its accent there (as Linen is approved); an electric one's
 * accent is a graphic colour that does not read as text on its own plate, so it takes the ink made for it.
 */
const onAccentFill = (c: PaletteModeColors): string =>
  c.character === 'vivid' ? c.accent.onFill : c.accent.ink;

/** One of our radii, by reference: `ours('card')` → `var(--fluvy-radius-card)`. */
const ours = (name: RadiusName): string => `var(${cssVar(`radius-${name}`)})`;

/** "#716345" → "113, 99, 69": the few `--rgb-*` names Home Assistant feeds to rgba(). */
function rgbTriplet(hex: string): string {
  const value = hex.replace('#', '');
  const n = Number.parseInt(
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value,
    16,
  );
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** HA's status scales and the role of ours each one takes. */
const STATUS_SCALES = [
  ['green', 'success'],
  ['orange', 'warning'],
  ['red', 'danger'],
] as const;

/**
 * Home Assistant's named palette (`--amber-color`, `--blue-color` …), each name the colour of ours it stands for
 * (`ha/named.ts`, the one table a card's `color` reads too). Every per-domain state colour, the timelines, logbook
 * dots, tile icons, the 2026 summary cards and the weather timeline resolve through these names, so mapping them
 * moves the whole Material palette onto the brand in one place.
 */
function namedPalette(colors: PaletteModeColors): readonly CssDeclaration[] {
  return THEME_COLOR_NAMES.map((name) => [`--${name}-color`, NAMED_COLORS[name](colors)]);
}

/**
 * The state names Home Assistant reads per domain, and the state of ours each one takes. The energy
 * names are the stand-ins HA's energy dashboard reads for its flow: `--energy-grid-return-color` is what
 * flows back out of the house, so it takes our house ('energy-home') tone.
 */
const HA_STATE_VARS: Readonly<Record<StateKey, readonly string[]>> = {
  'light-active': ['--state-light-active-color', '--state-light-on-color'],
  'climate-heat': ['--state-climate-heat-color'],
  'climate-cool': ['--state-climate-cool-color'],
  'climate-dry': ['--state-climate-dry-color'],
  'climate-fan': ['--state-climate-fan_only-color'],
  'media-playing': ['--state-media_player-playing-color'],
  'presence-home': ['--state-person-home-color', '--state-device_tracker-home-color'],
  'security-armed': [
    '--state-alarm_control_panel-armed_away-color',
    '--state-alarm_control_panel-armed_home-color',
  ],
  'energy-grid': ['--energy-grid-consumption-color'],
  'energy-solar': ['--energy-solar-color'],
  'energy-battery': ['--energy-battery-in-color', '--energy-battery-out-color'],
  'energy-home': ['--energy-grid-return-color'],
  'energy-gas': ['--energy-gas-color'],
  'energy-water': ['--energy-water-color'],
};

export const HA_GROUPS: readonly HaGroup[] = [
  {
    title:
      'Sentinel — lets a fluvy card tell that the theme is active here (the token fallback never defines it)',
    shared: [[THEME_SENTINEL, '1']],
  },
  {
    title: "Shape and type — our radii and faces under HA's names",
    shared: [
      // HA's radius names mean other sizes than ours. Its sm and md land on its small tappables (list rows,
      // search fields, tooltips, expanders): our md and our one tappable radius, control. lg is our control,
      // xl our lg, 2xl our card. They refer to ours (HA reads radii only from CSS), so a shape moves them all.
      ['--ha-border-radius-sm', ours('md')],
      ['--ha-border-radius-md', ours('control')],
      ['--ha-border-radius-lg', ours('control')],
      ['--ha-border-radius-xl', ours('lg')],
      ['--ha-border-radius-2xl', ours('card')],
      ['--ha-border-radius-pill', ours('pill')],
      ['--ha-font-family-body', fontFamily.sans],
      ['--ha-font-family-heading', fontFamily.sans],
      ['--ha-font-family-code', fontFamily.mono],
      // HA multiplies its sizes by --ha-font-size-scale (the user's text size): ours keep that hook. Its
      // 10 px step (floating field labels, tags, badge labels) lands on the language's 11 px floor.
      ...Object.entries({ ...fontSize, xs: '11px' }).map(([name, value]): CssDeclaration => [
        `--ha-font-size-${name}`,
        `calc(${value} * var(--ha-font-size-scale, 1))`,
      ]),
      ['--ha-font-weight-normal', fontWeight.regular],
      ['--ha-font-weight-medium', fontWeight.medium],
      // the interface stops at semibold: HA's "bold" (section titles, table headers) reads as our 600
      ['--ha-font-weight-bold', fontWeight.semibold],
      ['--ha-line-height-condensed', lineHeight.condensed],
      ['--ha-line-height-normal', lineHeight.normal],
      ['--ha-line-height-expanded', lineHeight.expanded],
    ],
  },
  {
    title:
      "Cards — the card radius and surface, a hairline, no resting shadow, no glass; headers at the section title's 20",
    shared: [
      ['--ha-card-border-radius', ours('card')],
      ['--ha-card-border-width', '1px'],
      ['--ha-card-box-shadow', 'none'],
      ['--ha-card-backdrop-filter', 'none'],
      ['--ha-card-header-font-size', '20px'],
    ],
    perMode: (c) => [
      ['--ha-card-background', c.surface.card],
      ['--ha-card-border-color', c.surface.border],
    ],
  },
  {
    // Surfaces Home Assistant draws outside a view (more-info, its bottom sheet, pickers) only take the theme when it is
    // the user's theme (profile → theme): a theme set on a view stops at the view. Dark sheets use the elevated card.
    title:
      "Dialogs and bottom sheets — the language's sheet shape: radius 24, 600 titles, the card surface",
    shared: [
      ['--ha-dialog-border-radius', ours('xl')],
      ['--ha-bottom-sheet-border-radius', ours('xl')],
      ['--ha-dialog-header-title-font-weight', '600'],
      ['--ha-dialog-surface-backdrop-filter', 'none'],
      ['--ha-bottom-sheet-surface-backdrop-filter', 'none'],
    ],
    perMode: (c) => {
      const surface = dark(c) ? c.surface.cardElevated : c.surface.card;
      return [
        ['--ha-dialog-surface-background', surface],
        ['--ha-bottom-sheet-surface-background', surface],
        ['--ha-bottom-sheet-handle-color', c.surface.borderStrong],
        ['--ha-bottom-sheet-border-color', c.surface.border],
        ['--ha-dialog-header-title-color', c.text.primary],
        ['--ha-dialog-header-subtitle-color', c.text.secondary],
      ];
    },
  },
  {
    // The cards' own geometry and colours: the 48 × 28 switch with its 20 thumb (off: the page fill in a strong hairline
    // with a card-white thumb; dark: a lifted track, the secondary ink as thumb; on: the solid accent), 6-radius checkboxes
    // and 1.5 px rings, buttons on the one radius of every rectangular tappable (12), fields and search fields as fields.
    title: 'Form controls and fields',
    shared: [
      ['--ha-switch-width', '48px'],
      ['--ha-switch-size', '28px'],
      ['--ha-switch-thumb-size', '20px'],
      // the entities' own toggles (a device's controls, HA's entities card): the same switch, not HA's 38 × 20
      ['--ha-entity-toggle-switch-width', '48px'],
      ['--ha-entity-toggle-switch-size', '28px'],
      ['--ha-entity-toggle-switch-thumb-size', '20px'],
      ['--ha-checkbox-border-radius', '6px'],
      ['--ha-checkbox-border-width', '1.5px'],
      ['--ha-radio-option-border-width', '1.5px'],
      ['--ha-radio-option-checked-icon-scale', '0.4'],
      // a radio's circle on its group's label column (HA leads it with 12)
      ['--ha-radio-option-control-margin', '12px 8px 12px 0'],
      ['--ha-button-border-radius', ours('control')],
      ['--ha-slider-track-size', '6px'],
      // a field without a hint keeps no empty 8 px under it (editors alternated 24 and 32 px gaps); hints have their own row
      ['--ha-input-padding-bottom', '0px'],
      // search fields are fields (12, the 44 of a text field); chips are pills; bars are soft
      ['--ha-input-search-border-radius', ours('control')],
      ['--ha-input-search-height', '44px'],
      ['--ha-assist-chip-container-shape', '9999px'],
      ['--ha-bar-border-radius', '6px'],
    ],
    perMode: (c) => [
      ['--ha-switch-background-color', dark(c) ? c.surface.borderStrong : c.surface.page],
      ['--ha-switch-border-color', c.surface.borderStrong],
      ['--ha-switch-thumb-background-color', dark(c) ? c.text.secondary : c.surface.card],
      ['--ha-switch-thumb-border-color', dark(c) ? c.text.secondary : c.surface.card],
      ['--ha-switch-thumb-box-shadow', dark(c) ? 'none' : '0 1px 2px #0000002e'], // black at 18 %, as #rrggbbaa like every shadow the theme writes
      ['--ha-switch-checked-background-color', c.accent.ink],
      ['--ha-switch-checked-border-color', c.accent.ink],
      ['--ha-switch-checked-background-color-hover', c.accent.hover],
      ['--ha-switch-checked-border-color-hover', c.accent.hover],
      ['--ha-switch-checked-thumb-background-color', c.surface.card],
      ['--ha-switch-checked-thumb-border-color', c.surface.card],
      ['--ha-checkbox-border-color', c.surface.borderStrong],
      ['--ha-checkbox-checked-background-color', c.accent.ink],
      ['--ha-checkbox-checked-background-color-hover', c.accent.hover],
      ['--ha-checkbox-checked-icon-color', c.text.onAccent],
      ['--ha-radio-option-border-color', c.surface.borderStrong],
      ['--ha-radio-option-active-color', c.accent.ink],
      ['--ha-slider-track-color', dark(c) ? c.surface.borderStrong : c.surface.pageAlt],
      // form fields and disabled controls: the page fill, and the disabled ink instead of HA's white-on-grey
      ['--ha-color-form-background', c.surface.page],
      ['--ha-color-form-background-hover', c.surface.pageAlt],
      ['--ha-color-form-background-disabled', c.surface.pageAlt],
      // the field palette the older inputs read (floating labels, dropdown arrows, table headers); HA's defaults are neutral greys
      ['--input-fill-color', c.surface.page],
      ['--input-disabled-fill-color', c.surface.pageAlt],
      ['--input-ink-color', c.text.primary],
      ['--input-label-ink-color', c.text.secondary],
      ['--input-disabled-ink-color', c.text.disabled],
      ['--input-dropdown-icon-color', c.text.secondary],
      ['--input-idle-line-color', c.surface.borderStrong],
      ['--input-hover-line-color', c.text.secondary],
      ['--input-disabled-line-color', c.surface.border],
      ['--input-outlined-idle-border-color', c.surface.borderStrong],
      ['--input-outlined-hover-border-color', c.text.secondary],
      ['--input-outlined-disabled-border-color', c.surface.border],
    ],
  },
  {
    title:
      "HA's tiles (the 2026 dashboards, summaries) — the compact tile's type: name 15/600 over state 13/500, no tracking",
    shared: [
      ['--ha-tile-info-primary-font-size', '15px'],
      ['--ha-tile-info-primary-font-weight', '600'],
      ['--ha-tile-info-primary-letter-spacing', '0'],
      ['--ha-tile-info-secondary-font-size', '13px'],
      ['--ha-tile-info-secondary-font-weight', '500'],
      ['--ha-tile-info-secondary-letter-spacing', '0'],
    ],
    perMode: (c) => [['--ha-tile-info-secondary-color', c.text.secondary]],
  },
  {
    title: 'Sections grid — the 16 px rhythm of the design (two 172 tiles in a 360 column)',
    shared: [
      ['--ha-section-grid-row-gap', '16px'],
      ['--ha-section-grid-column-gap', '16px'],
      ['--ha-view-sections-row-gap', '24px'],
      ['--ha-view-sections-column-gap', '24px'],
      ['--ha-view-sections-narrow-column-gap', '16px'],
      ['--ha-view-sections-column-max-width', '480px'],
    ],
  },
  {
    // keys in the accent, values in the text ink, numbers and constants in the info ink, punctuation in the disabled ink,
    // comments secondary — instead of HA's magenta and cyan (and its neon dark set). HA reads `string2` in light and
    // `string-2` in dark: both are written.
    title: 'Code editor — syntax',
    perMode: ({ accent, text, semantic }) => [
      ['--codemirror-property', accent.text],
      ['--codemirror-attribute', accent.text],
      ['--codemirror-keyword', accent.hover],
      ['--codemirror-builtin', accent.hover],
      ['--codemirror-tag', accent.hover],
      ['--codemirror-string', text.primary],
      ['--codemirror-string2', text.primary],
      ['--codemirror-string-2', text.primary],
      ['--codemirror-variable', text.primary],
      ['--codemirror-variable-2', text.secondary],
      ['--codemirror-variable-3', text.secondary],
      ['--codemirror-def', text.secondary],
      ['--codemirror-qualifier', text.secondary],
      ['--codemirror-type', text.secondary],
      ['--codemirror-meta', text.secondary],
      ['--codemirror-comment', text.secondary],
      ['--codemirror-operator', text.disabled],
      ['--codemirror-atom', semantic.info.ink],
      ['--codemirror-number', semantic.info.ink],
    ],
  },
  {
    title: 'HA 2026 — core ramps',
    perMode: (c) => [
      ...RAMP_STEPS.map((step): CssDeclaration => [
        `--ha-color-primary-${step}`,
        c.accentRamp[step],
      ]),
      ...RAMP_STEPS.map((step): CssDeclaration => [
        `--ha-color-neutral-${step}`,
        c.neutralRamp[step],
      ]),
    ],
  },
  {
    // HA's success / warning / danger tokens (79 of them, and raw uses such as the automation live-test badge) read these
    // three scales; left to HA they are its saturated green, orange and red. Each is built like the accent ramp, from the
    // hue and chroma of our role's ink.
    title: 'HA 2026 — status ramps',
    perMode: (c) =>
      STATUS_SCALES.flatMap(([scale, role]) => {
        const ramp = statusRamp(c, role);
        return RAMP_STEPS.map((step): CssDeclaration => [
          `--ha-color-${scale}-${step}`,
          ramp[step] as string,
        ]);
      }),
  },
  {
    title: 'HA 2026 — semantic layer',
    perMode: (c) => [
      ['--ha-color-text-primary', c.text.primary],
      ['--ha-color-text-secondary', c.text.secondary],
      ['--ha-color-text-disabled', c.text.disabled],
      ['--ha-color-text-link', c.accent.text],
      ['--ha-color-surface-default', c.surface.card],
      ['--ha-color-surface-low', c.surface.page],
      // HA's third surface is `lower` (sunken below the page), not `high`: the page-alt fill
      ['--ha-color-surface-lower', c.surface.pageAlt],
      ['--ha-color-border-neutral-quiet', c.surface.border],
      ['--ha-color-border-neutral-normal', c.surface.borderStrong],
      ['--ha-color-border-primary-quiet', c.accent.fillBorder],
      ['--ha-color-fill-neutral-quiet-resting', c.surface.pageAlt],
      [
        '--ha-color-fill-primary-quiet-resting',
        c.character === 'vivid' ? c.buttons.rest : c.accent.fill,
      ],
      // the loud primary (Save, Create, Add) is our primary action; an electric one also for its hover and press,
      // which Home Assistant otherwise takes from dark steps of the ramp (a dark label on a dark fill)
      [
        '--ha-color-fill-primary-loud-resting',
        c.character === 'vivid' ? c.primary.fill : c.accent.ink,
      ],
      ...(c.character === 'vivid'
        ? ([
            ['--ha-color-fill-primary-loud-hover', c.primary.hover],
            ['--ha-color-fill-primary-loud-active', c.primary.fill],
            // the lesser buttons and quiet surfaces (a filled Save, a plain Cancel's hover and press, a hovered
            // day, an autofilled field): two plates on Home Assistant's own ramp steps under one ink that reads on
            // both and on the dialog (its defaults would put a light text on a light plate in dark)
            ['--ha-color-fill-primary-quiet-hover', c.buttons.rest],
            ['--ha-color-fill-primary-quiet-active', c.buttons.press],
            ['--ha-color-fill-primary-normal-resting', c.buttons.rest],
            ['--ha-color-fill-primary-normal-hover', c.buttons.press],
            ['--ha-color-fill-primary-normal-active', c.buttons.press],
            ['--ha-color-on-primary-normal', c.buttons.on],
          ] as const)
        : []),
      ['--ha-color-fill-success-quiet-resting', c.semantic.success.fill],
      ['--ha-color-fill-warning-quiet-resting', c.semantic.warning.fill],
      ['--ha-color-fill-danger-quiet-resting', c.semantic.danger.fill],
      ['--ha-color-on-primary-quiet', c.character === 'vivid' ? c.buttons.on : c.accent.onFill],
      ['--ha-color-on-primary-loud', c.character === 'vivid' ? c.primary.on : c.text.onAccent],
      ['--ha-color-on-neutral-quiet', c.text.primary],
      ['--ha-color-on-success-quiet', c.semantic.success.onFill],
      ['--ha-color-on-warning-quiet', c.semantic.warning.onFill],
      ['--ha-color-on-danger-quiet', c.semantic.danger.onFill],
      ['--ha-color-focus', c.accent.ink],
      ['--ha-color-fill-disabled-quiet-resting', c.surface.page],
      ['--ha-color-fill-disabled-normal-resting', c.surface.page],
      ['--ha-color-fill-disabled-loud-resting', c.surface.pageAlt],
      ['--ha-color-on-disabled-quiet', c.text.disabled],
      ['--ha-color-on-disabled-normal', c.text.disabled],
      ['--ha-color-on-disabled-loud', c.text.disabled],
    ],
  },
  {
    title: 'HA legacy globals — declared in both modes, because they do not derive',
    perMode: (c) => [
      ['--primary-color', c.accent.ink],
      ['--dark-primary-color', c.accent.hover],
      ['--light-primary-color', c.accent.fill],
      // a person's initials on that fill (the user's and the person's badge), its own ink in either mode: Home
      // Assistant's near black would sit on a dark mode's dark fill
      ['--text-light-primary-color', c.accent.onFill],
      ['--accent-color', c.accent.ink],
      ['--primary-text-color', c.text.primary],
      ['--secondary-text-color', c.text.secondary],
      ['--disabled-text-color', c.text.disabled],
      ['--text-primary-color', c.text.onAccent],
      ['--text-accent-color', c.text.onAccent],
      ['--primary-background-color', c.surface.page],
      ['--secondary-background-color', c.surface.pageAlt],
      ['--card-background-color', c.surface.card],
      ['--divider-color', c.surface.border],
      ['--error-color', c.semantic.danger.ink],
      ['--warning-color', c.semantic.warning.ink],
      ['--success-color', c.semantic.success.ink],
      ['--info-color', c.semantic.info.ink],
      // the more-info controls (the big switch, the light slider) read these for their resting state; without them HA falls
      // back to its own grey inside our dialog
      ['--disabled-color', c.unavailable.ink],
      ['--icon-color', c.text.secondary],
      ['--focus-color', c.accent.ink],
      // the page's scrollbar (the shell reads it too)
      ['--scrollbar-thumb-color', c.surface.borderStrong],
      // a triplet, not a colour: it is only ever used inside rgba()
      ['--rgb-secondary-text-color', rgbTriplet(c.text.secondary)],
      // the hairlines HA draws around chips, outlined panels and the date navigator (its default is rgba black)
      ['--outline-color', c.surface.border],
      ['--outline-hover-color', c.surface.borderStrong],
    ],
  },
  {
    title: 'App chrome — header, sidebar, the phone status bar',
    perMode: (c) => [
      // Opaque on purpose: --app-theme-color derives from this and feeds <meta name="theme-color">, and the Android
      // companion rejects non-hex values.
      ['--app-header-background-color', c.surface.card],
      ['--app-header-text-color', c.text.primary],
      // a dashboard in edit mode: the selected pill's cream instead of Material's blue-grey (#455a64), where the accent icons read
      ['--app-header-edit-background-color', c.accent.fill],
      ['--app-header-edit-text-color', c.character === 'vivid' ? c.accent.onFill : c.text.primary],
      ['--app-theme-color', c.surface.card],
      ['--sidebar-background-color', c.surface.card],
      ['--sidebar-text-color', c.text.primary],
      ['--sidebar-icon-color', c.text.secondary],
      // the selected item sits on the accent's fill (the shell's pill)
      ['--sidebar-selected-icon-color', onAccentFill(c)],
      ['--sidebar-selected-text-color', onAccentFill(c)],
    ],
  },
  {
    title: 'States, the named palette, weather glyphs, energy and graph series',
    perMode: (c) => [
      // Home Assistant's resting icon colour is a fixed blue (#44739e): more-info rows, entity lists, pickers
      ['--state-icon-color', c.text.secondary],
      // not read by HA 2026 itself: kept for the community cards that still colour their icons with it
      ['--paper-item-icon-color', c.text.secondary],
      ['--state-active-color', c.accent.ink],
      // off is quiet: the switch's resting track, the timeline's "off" bar (HA's own default is a light grey)
      ['--state-inactive-color', c.surface.borderStrong],
      ['--state-unavailable-color', c.unavailable.ink],
      ...namedPalette(c),
      ...STATE_KEYS.flatMap((key) =>
        HA_STATE_VARS[key].map((name): CssDeclaration => [name, c.state[key].ink]),
      ),
      // the per-domain names whose meaning our palette states differently from HA's named colour
      ['--state-switch-active-color', c.accent.ink],
      ['--state-binary_sensor-active-color', c.accent.ink],
      ['--state-update-active-color', c.semantic.warning.ink],
      ['--state-media_player-active-color', c.state['media-playing'].ink],
      ['--state-sensor-battery-high-color', c.semantic.success.ink],
      ['--state-sensor-battery-medium-color', c.semantic.warning.ink],
      ['--state-sensor-battery-low-color', c.semantic.danger.ink],
      ['--history-unknown-color', c.unavailable.ink],
      // HA's own weather glyphs (more-info, forecasts) are filled shapes, not our outline glyphs: the sun a light warm disc
      // (the solar ink read as a brown ball), the moon a step deeper, neutral clouds, the info rain. An electric accent
      // is no sun colour (a periwinkle or pink sun): there the sun and the moon are the solar state's, as on our cards
      [
        '--weather-icon-sun-color',
        c.character === 'vivid' ? c.state['energy-solar'].ink : c.accentRamp['70'],
      ],
      [
        '--weather-icon-moon-color',
        c.character === 'vivid' ? c.state['energy-solar'].ink : c.accentRamp[dark(c) ? '80' : '60'],
      ],
      ['--weather-icon-cloud-front-color', c.neutralRamp[dark(c) ? '80' : '95']],
      ['--weather-icon-cloud-back-color', c.neutralRamp[dark(c) ? '60' : '80']],
      ['--weather-icon-rain-color', c.semantic.info.ink],
      ['--weather-icon-snow-color', c.neutralRamp[dark(c) ? '90' : '95']],
      ['--weather-icon-snow-stroke-color', c.neutralRamp['70']],
      ['--energy-non-fossil-color', c.semantic.success.ink],
      ...c.graph.map((hex, index): CssDeclaration => [`--graph-color-${index + 1}`, hex]),
    ],
  },
];

/** The mode-independent half of every group (the theme's top level). */
export function haSharedVars(): readonly VarGroup[] {
  return HA_GROUPS.flatMap((group) =>
    group.shared ? [{ title: group.title, declarations: group.shared }] : [],
  );
}

/** The per-mode half of every group, from one mode's colours (`modes.light` / `modes.dark`). */
export function haModeVars(colors: PaletteModeColors): readonly VarGroup[] {
  return HA_GROUPS.flatMap((group) =>
    group.perMode ? [{ title: group.title, declarations: group.perMode(colors) }] : [],
  );
}
