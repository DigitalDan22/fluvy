import {
  isUsable,
  relativeTime,
  stateText,
  type EntityView,
  type HomeAssistant,
} from '@fluvy/core';
import type { Secondary } from './config.js';
import { stateWord } from './domain.js';
import { changedAt } from './since.js';
import { asText, isTemplate, type TemplateTexts } from './templates.js';

/**
 * The line under a row's name, the same on every card that lists entities: the area when the row has one, else when
 * the entity last changed (the default); its state; nothing; an attribute by name; or a template, rendered live by
 * the card's `texts` (a blank line until Home Assistant answers, nothing without them, never the template itself).
 * A state that cannot be read is said as such whatever was asked (the row must never look fine), but for an unknown
 * one under a template: the person's own line reads it (a button never pressed is `unknown`, its normal state, #92).
 * `stateShown` is the row already showing the state elsewhere (a trailing value): `state` then says the area or the
 * time instead of repeating it. `short`: the line's shorter form, for a row too narrow for it — a time's ("32 d ago"),
 * a state's one word ("Not found"). `since`: where the row's last change is read from (#67), a timestamp sensor or
 * `attribute:<name>`; Home Assistant's own without it.
 */
export function secondaryText(
  hass: HomeAssistant | undefined,
  view: EntityView,
  secondary: Secondary | undefined,
  stateShown = false,
  texts?: TemplateTexts,
  short = false,
  since?: string,
): string {
  const mode = secondary ?? (view.areaName ? 'area' : 'last-changed');
  if (mode === 'none') return '';
  if (isTemplate(mode) && isUsable(view)) return texts?.line(mode, view.id) ?? '';
  if (view.status !== 'ok') return short ? stateWord(hass, view) : stateText(hass, view);
  if (mode === 'state')
    return stateShown ? fallback(hass, view, short, since) : stateText(hass, view);
  if (mode === 'area') return view.areaName || fallback(hass, view, short, since);
  if (mode === 'last-changed') return changed(hass, view, short, since);
  return attribute(hass, view, mode);
}

/** The area, or the time: what a row says when what was asked has nothing to say. */
const fallback = (
  hass: HomeAssistant | undefined,
  view: EntityView,
  short: boolean,
  since: string | undefined,
): string => view.areaName || changed(hass, view, short, since);

const changed = (
  hass: HomeAssistant | undefined,
  view: EntityView,
  short: boolean,
  since: string | undefined,
): string => {
  const at = changedAt(hass, view, since);
  return at ? relativeTime(hass, at, new Date(), short) : '';
};

/** An attribute as Home Assistant would write it (its unit, its translation), or as it is. */
function attribute(hass: HomeAssistant | undefined, view: EntityView, name: string): string {
  const value = view.attr<unknown>(name);
  if (value === undefined || value === null || value === '') return '';
  if (hass?.formatEntityAttributeValue && view.stateObj) {
    try {
      const text = hass.formatEntityAttributeValue(view.stateObj, name, value);
      if (typeof text === 'string' && text !== '') return text;
    } catch {
      /* the raw value below */
    }
  }
  return asText(value);
}
