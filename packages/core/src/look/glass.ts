import { declarationsCss, type PaletteMode } from '@fluvy/tokens/runtime';
import { glassCss } from '@fluvy/ui/styles/glass';
import { colorsOf } from './accent.js';

/*
 * See-through cards (1.15, #121): what a card under 100 % wears, fetched by the first card that is one (`card.ts`), so
 * a dashboard of solid cards never pays for it — what writes its own sheet (`AccentSheet`): every fill in the card's
 * and the page's colours at the card's opacity (`--fv-glass`), its solid colour kept beside it (`--fv-solid-…`) for
 * what lies over the card and what a finger holds on it, then the rules of a see-through card (`ui/styles/glass.css`:
 * those solid ones, its blur).
 */

/** A palette's own surfaces, per palette × mode, kept (the last 32). */
const kept = new Map<string, string>();

/**
 * A palette's own surfaces, for a see-through card to take at its opacity: the card's, the lifted card's, the page's
 * and the sunken page's colours, the ground a resting circle washes into, and the plain card a lit wash keeps for its
 * circle (slider.css).
 */
function surfacesCss(paletteKey: string, mode: PaletteMode): string {
  const key = `${paletteKey}|${mode}`;
  let css = kept.get(key);
  if (css === undefined) {
    const colors = colorsOf(paletteKey, mode);
    const { card, cardElevated, page, pageAlt } = colors.surface;
    css = declarationsCss([
      ['--fluvy-card', card],
      ['--fluvy-card-elevated', cardElevated],
      ['--fluvy-page', page],
      ['--fluvy-page-alt', pageAlt],
      ['--fluvy-wash-base', colors.washBase],
      ['--fv-card-plain', card],
    ]);
    kept.set(key, css);
    if (kept.size > 32) kept.delete(kept.keys().next().value as string);
  }
  return css;
}

/** The fills a see-through card takes at its opacity, wherever its sheet writes one. */
const FILL =
  /(--(?:fluvy|fv)-(?:card(?:-elevated|-plain)?|page(?:-alt)?|wash-base|inset|accent-rest(?:-inner)?)):(#[0-9a-f]{6});/g;

/**
 * A see-through card's own sheet from its solid one (`css`): the palette's surfaces on its children first (its own
 * colours after them win), each fill at the card's opacity with its solid colour beside it, then the rules of a
 * see-through card.
 */
export const seeThrough = (paletteKey: string, mode: PaletteMode, css: string): string =>
  `:host > *{${surfacesCss(paletteKey, mode)}}${css}`.replace(
    FILL,
    (_, name: string, hex: string) =>
      `${name.replace(/^--(fluvy|fv)-/, '--fv-solid-')}:${hex};${name}:color-mix(in srgb,${hex} var(--fv-glass),transparent);`,
  ) + glassCss;
