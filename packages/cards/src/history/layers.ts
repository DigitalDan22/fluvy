/**
 * The History page's floating layers: the dates (a popover on a desktop, a sheet on a phone) and the sources, both
 * the pages' shared ones — the picker and the drawer know nothing about this page.
 */
import {
  countFilters,
  countTargets,
  type SourceFilters,
  type SourceTarget,
} from '@fluvy/core/sources';
import { emptyState } from '@fluvy/ui';
import { html, type TemplateResult } from 'lit';

import { drawer, popover } from '../shared/layer.js';
import type { FluvyHistory } from './view.js';

/** The dates: our picker, with the page's period in it. */
function dates(page: FluvyHistory): TemplateResult {
  return html`<fluvy-date-picker
    ?reduced-motion=${page.reduced}
    .hass=${page.hass}
    .range=${page.range}
    .now=${page.now}
    .language=${page.language}
    .t=${page.t}
    @fluvy-dates=${page.onDates}
  ></fluvy-date-picker>`;
}

/** A desktop's dates, under the button that opened them. */
export const renderPopoverDates = (page: FluvyHistory): TemplateResult =>
  popover({
    label: page.t('dates'),
    leaving: page.layers.leaving === 'picking',
    autofocus: 'picking',
    body: dates(page),
    onDismiss: () => page.layers.dismiss('picking'),
    onLeft: page.layers.onLeft,
  });

/** A phone's dates: the sheet from the bottom. */
export const renderDates = (page: FluvyHistory): TemplateResult =>
  drawer({
    title: page.t('dates'),
    close: page.t('close'),
    leaving: page.layers.leaving === 'picking',
    grabber: true,
    variant: 'hs-dates',
    autofocus: 'picking',
    body: dates(page),
    onDismiss: () => page.layers.dismiss('picking'),
    onLeft: page.layers.onLeft,
  });

/** The sources: Home Assistant's own picker in our drawer, and the way to clear what it narrowed. */
export function renderSources(page: FluvyHistory): TemplateResult {
  const picker = customElements.get('ha-sources-picker');
  const hass = page.hass!;
  const description = hass.localize?.('ui.panel.history.no_targets');
  const narrowed = countTargets(page.target) + countFilters(page.sourceFilters);
  return drawer({
    title: page.t('sources'),
    close: page.t('close'),
    leaving: page.layers.leaving === 'sourcing',
    grabber: page.compact,
    tall: true,
    variant: 'hs-sources-drawer',
    autofocus: 'sourcing',
    onDismiss: () => page.layers.dismiss('sourcing'),
    onLeft: page.layers.onLeft,
    body: picker
      ? html`<ha-sources-picker
          .hass=${hass}
          .value=${page.target}
          .filters=${page.sourceFilters}
          .entitySources=${page.entitySources}
          .description=${description && description !== 'ui.panel.history.no_targets' ? description : ''}
          @value-changed=${(event: CustomEvent<{ value?: SourceTarget }>) =>
            page.setTarget(event.detail.value ?? {})}
          @source-filters-changed=${(event: CustomEvent<{ value: SourceFilters }>) =>
            page.setFilters(event.detail.value ?? {})}
        ></ha-sources-picker>`
      : emptyState('sliders', page.t('sources_none')),
    foot: html`<footer class="fv-drawer__foot" data-fill-row>
      <button
        class="fv-btn fv-btn--quiet"
        ?disabled=${!narrowed}
        @click=${() => page.clearSources()}
      >
        ${page.t('sources_clear')}
      </button>
      <button class="fv-btn fv-btn--accent" @click=${() => page.layers.dismiss('sourcing')}>
        ${page.t('done')}
      </button>
    </footer>`,
  });
}
