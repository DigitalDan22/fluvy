/** The Activity page's sources: Home Assistant's picker in a drawer, the narrowed line, and the quick "Only this". */

import { html, nothing, type TemplateResult } from 'lit';

import { resolveEntity, writeStored } from '@fluvy/core';
import {
  countFilters,
  countTargets,
  type SourceFilters,
  type SourceTarget,
} from '@fluvy/core/sources';

import { emptyState } from '@fluvy/ui';
import { glide } from './rail.js';

import { FILTERS, logbookEntity, PICKED } from './shared.js';

import type { FluvyActivity } from './view.js';
import { drawer } from '../shared/layer.js';

export function renderSources(page: FluvyActivity): TemplateResult {
  const picker = customElements.get('ha-sources-picker');
  const hass = page.hass!;
  const description = hass.localize?.('ui.panel.logbook.no_targets');
  return drawer({
    title: page.t('sources'),
    close: page.t('close'),
    leaving: page.leaving === 'sourcing',
    grabber: page.compact,
    tall: true,
    variant: 'av-sources-drawer',
    autofocus: 'sourcing',
    onDismiss: () => page.dismiss('sourcing'),
    onLeft: page.onLeft,
    body: html`${
      picker
        ? html`<ha-sources-picker
            .hass=${hass}
            .value=${page.target}
            .filters=${page.sourceFilters}
            .entitySources=${page.entitySources}
            .entityFilter=${logbookEntity}
            .description=${
              description && description !== 'ui.panel.logbook.no_targets' ? description : ''
            }
            @value-changed=${(event: CustomEvent<{ value?: SourceTarget }>) =>
              setTarget(page, event.detail.value ?? {})}
            @source-filters-changed=${(event: CustomEvent<{ value: SourceFilters }>) =>
              setSourceFilters(page, event.detail.value ?? {})}
          ></ha-sources-picker>`
        : emptyState('sliders', page.t('sources_none'))
    }`,
    foot: html`<footer class="fv-drawer__foot" data-fill-row>
      <button
        class="fv-btn fv-btn--quiet"
        ?disabled=${!countTargets(page.target) && !countFilters(page.sourceFilters)}
        @click=${() => clearSources(page)}
      >
        ${page.t('sources_clear')}
      </button>
      <button class="fv-btn fv-btn--accent" @click=${() => page.dismiss('sourcing')}>
        ${page.t('done')}
      </button>
    </footer>`,
  });
}

export function renderNarrowed(page: FluvyActivity): TemplateResult | typeof nothing {
  const sources = countTargets(page.target) + countFilters(page.sourceFilters);
  if (!sources) return nothing;
  const quick = !!page.quick;
  return html`<p class="av-narrowed">
    <span class="av-narrowed__text">${sourceSummary(page)}</span>
    <button class="fv-link" @click=${() => (quick ? unfocus(page) : clearSources(page))}>
      ${page.t(quick ? 'sources_back' : 'sources_clear')}
    </button>
  </p>`;
}

/** "Only Living room, Kitchen, +2 filters". */
export function sourceSummary(page: FluvyActivity): string {
  const hass = page.hass!;
  const floors = (hass as { floors?: Record<string, { name?: string }> }).floors;
  const list = (value: string | readonly string[] | undefined): readonly string[] =>
    value === undefined ? [] : typeof value === 'string' ? [value] : value;
  const names = [
    ...list(page.target.floor_id).map((id) => floors?.[id]?.name ?? id),
    ...list(page.target.area_id).map((id) => hass.areas?.[id]?.name ?? id),
    ...list(page.target.device_id).map((id) => {
      const device = hass.devices?.[id];
      return device?.name_by_user ?? device?.name ?? id;
    }),
    ...list(page.target.entity_id).map((id) => resolveEntity(hass, id).name),
  ];
  const labels = list(page.target.label_id).length;
  const filters = countFilters(page.sourceFilters);
  const shown = names.slice(0, 3);
  const more = names.length - shown.length + labels;
  const parts = [...shown];
  if (more) parts.push(`+${more}`);
  if (filters) parts.push(page.t('sources_filters'));
  return page.t('narrowed', { what: parts.join(', ') });
}

export function openSources(page: FluvyActivity): void {
  page.sourcing = true;
  if (!page.entitySources && page.hass)
    page.hass
      .callWS<Record<string, unknown>>({ type: 'entity/source' })
      .then((sources) => {
        page.entitySources = sources;
      })
      .catch(() => undefined);
}

/** Sources chosen in the drawer: remembered as the stock panel remembers them (a quick narrowing is then over). */
export function setTarget(page: FluvyActivity, target: SourceTarget): void {
  page.quick = undefined;
  page.target = target;
  writeStored(PICKED, countTargets(target) ? target : undefined);
  page.writeAddress();
  page.resubscribe();
}

export function setSourceFilters(page: FluvyActivity, filters: SourceFilters): void {
  page.quick = undefined;
  page.sourceFilters = filters;
  writeStored(FILTERS, countFilters(filters) ? filters : undefined);
  page.resubscribe();
}

/**
 * Only page device (or entity) on the period on screen: everything of it shown. A quick look, not a choice of
 * sources: nothing is remembered, and the narrowed line's Back returns to what was shown before.
 */
export function focusOn(page: FluvyActivity, target: SourceTarget): void {
  page.quick ??= { target: page.target, sourceFilters: page.sourceFilters, filter: page.filter };
  page.open = new Set();
  page.closing = new Set();
  page.target = target;
  page.sourceFilters = {};
  page.filter = 'all';
  page.writeAddress();
  page.resubscribe();
  glide(page, 0);
}

/** Back from "Only page": the sources and the filter as they were. */
export function unfocus(page: FluvyActivity): void {
  const quick = page.quick;
  if (!quick) return;
  page.quick = undefined;
  page.open = new Set();
  page.closing = new Set();
  page.target = quick.target;
  page.sourceFilters = quick.sourceFilters;
  page.filter = quick.filter;
  page.writeAddress();
  page.resubscribe();
  glide(page, 0);
}

export function clearSources(page: FluvyActivity): void {
  page.quick = undefined;
  page.target = {};
  page.sourceFilters = {};
  writeStored(PICKED, undefined);
  writeStored(FILTERS, undefined);
  page.writeAddress();
  page.resubscribe();
}

/** The one entity the page is narrowed to (a more-info's "Show more"), if it is exactly one. */
export function singleEntity(page: FluvyActivity): string | undefined {
  const { entity_id: entities, ...rest } = page.target;
  const list = typeof entities === 'string' ? [entities] : (entities ?? []);
  return list.length === 1 && !countTargets(rest) && !countFilters(page.sourceFilters)
    ? list[0]
    : undefined;
}
