import { stateText, type EntityView, type HomeAssistant } from '@fluvy/core';
import { html, nothing, type TemplateResult } from 'lit';
import { type TextRuler } from '../shared/fit.js';
import type { TemplateTexts } from '../shared/templates.js';

export interface HelperRowConfig {
  entity: string;
  name?: string;
  icon?: string;
  /** The line under the title: context or time, never the entity's domain; may be a template. Defaults to its area; '' hides it. */
  secondary?: string;
  /** Where its last change is read from (#67): a timestamp sensor, or `attribute:<name>` of its own; else Home Assistant's. */
  since?: string;
  /** Quick-set chips under a time-only helper, as "HH:MM" (the sheet's Wake-up row). */
  presets?: readonly string[];
  /** A select's options offered, in this order: those it lists (#96). */
  options?: readonly string[];
  /** A select's options in the owner's words (`gen_589828: AI Mode`), before Home Assistant's. */
  labels?: Readonly<Record<string, string>>;
  /** A select as chips or as a dropdown; `auto`: chips up to six options. */
  display?: 'auto' | 'chips' | 'dropdown';
}

/**
 * What a control needs from the card that draws it. The card's own helpers are protected, so the
 * controls (one module per kind of helper) receive this narrow view of it instead of the element.
 */
export interface HelperHost {
  readonly hass: HomeAssistant | undefined;
  /** Width of the card's content column: rulers are drawn to it. */
  readonly contentWidth: number;
  /** Widths laid out by the browser in the card's own classes: a filled chip row measures its columns with it. */
  readonly ruler: TextRuler;
  /** A row's own second line when it is a template: rendered by Home Assistant, live. */
  readonly texts: TemplateTexts;
  /** The rows have given their circles to their names: what ends one of them squeezed its name (`rowsKeepIcon`). */
  readonly bare: boolean;
  /** The state to draw: the expected one while a change is in flight. */
  state(view: EntityView): string;
  expect(entityId: string, state: string): void;
  call(domain: string, service: string, data: Record<string, unknown>, entityId: string): void;
  moreInfo(entityId: string): void;
  /** Value under the finger while a ruler drag is in flight. */
  preview(entityId: string): number | undefined;
  setPreview(entityId: string, value: number | null): void;
  /** Whether the text field of this entity has the focus (its value is the user's, not the state's). */
  editing(entityId: string): boolean;
  refresh(): void;
}

export const isUnusable = (view: EntityView): boolean =>
  view.status === 'unavailable' || view.status === 'missing';

export const nameOf = (view: EntityView, row: HelperRowConfig): string => row.name ?? view.name;

/** The second line the owner wrote, a template rendered; undefined when the row says nothing of its own. */
export const ownSecondary = (host: HelperHost, row: HelperRowConfig): string | undefined =>
  row.secondary === undefined ? undefined : host.texts.resolve(row.secondary, row.entity);

/** The context line: what the owner wrote, else why the entity cannot be used, else where it is. */
export function contextOf(host: HelperHost, view: EntityView, row: HelperRowConfig): string {
  const own = ownSecondary(host, row);
  if (own !== undefined) return own;
  if (view.status !== 'ok') return stateText(host.hass, view);
  return view.areaName;
}

/**
 * A field's line under its name: its context, where it has one. Why it cannot be used takes the place of the area,
 * never a line the field has not got live — a list out of reach keeps its size (1.9); the control says it then: its
 * value "—", its field's word, its chips at rest.
 */
export const fieldContext = (host: HelperHost, view: EntityView, row: HelperRowConfig): string =>
  ownSecondary(host, row) !== undefined || view.areaName ? contextOf(host, view, row) : '';

/** The sheet's field head: title and context on the left, the control (if it sits on the title's line) on the right. */
export function field(
  title: string,
  sub: string,
  control: TemplateResult | typeof nothing,
  unusable: boolean,
): TemplateResult {
  return html`<div
    class="in-field ${control === nothing ? 'in-field--top' : ''} ${unusable ? 'is-unavailable' : ''}"
  >
    <div class="in-field__text">
      <span class="fv-row__title">${title}</span
      >${sub ? html`<span class="fv-row__sub">${sub}</span>` : nothing}
    </div>
    ${control}
  </div>`;
}
