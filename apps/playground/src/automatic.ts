import type { HomeAssistant } from '@fluvy/core';
import { generate } from '../../../packages/cards/src/strategy/generate.js';
import type { FrameSpec } from './scenes.js';

/**
 * A view of the automatic dashboard (`?dashboard=auto&view=home`), as its own strategy builds it from the house of
 * every sheet: each section a frame of its cards, each card at the columns the strategy gives it. The page's other
 * views are reached through `fluvyAutomaticView` (main.ts), as a phone opens another tab.
 */
export async function automaticFrames(
  hass: HomeAssistant,
  path: string,
): Promise<readonly FrameSpec[]> {
  const { views } = await generate({ type: 'custom:fluvy-home' }, hass);
  const view = views.find((candidate) => candidate.path === path) ?? views[0];
  if (!view) return [];
  return view.sections
    .filter((section) => section.cards.length)
    .map((section, index) => ({
      title: `${view.title} · ${index + 1}`,
      cards: section.cards.map((card) =>
        typeof card.grid_options?.columns === 'number'
          ? { ...card, cols: card.grid_options.columns }
          : card,
      ),
    }));
}

/** The automatic dashboard's views as its strategy builds them from the house: each by its path, its tabs first. */
export async function automaticViews(
  hass: HomeAssistant,
): Promise<readonly { readonly path: string; readonly tab: boolean }[]> {
  const { views } = await generate({ type: 'custom:fluvy-home' }, hass);
  return views.map((view) => ({ path: view.path, tab: !view.subview }));
}
