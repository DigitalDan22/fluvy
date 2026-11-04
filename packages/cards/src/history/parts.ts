/**
 * The History page's chrome and body: its bar, the period it shows with the ways to move it, the search and sources,
 * and under them the charts, the state lines and whatever the window had nothing to draw.
 */
import { emptyState, glyph } from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';

import { goBack } from '@fluvy/core';
import { countFilters, countTargets } from '@fluvy/core/sources';
import { describePeriod } from '../shared/period.js';
import { dayRange, sameRange } from '../shared/range.js';

import { renderChart } from './chart.js';
import { renderPopoverDates } from './layers.js';
import { renderStates } from './states.js';
import type { FluvyHistory } from './view.js';

/** The page's bar: the way back (or the menu on a phone), the page's name, and the data as a file. */
export function renderBar(page: FluvyHistory): TemplateResult {
  const lead = page.back
    ? html`<button
        class="fv-round fv-round--bare"
        aria-label=${page.t('back')}
        @click=${() => goBack()}
      >
        ${glyph('chevronLeft')}
      </button>`
    : page.narrow
      ? html`<button
          class="fv-round fv-round--bare"
          aria-label=${page.t('menu')}
          @click=${() =>
            page.dispatchEvent(
              new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }),
            )}
        >
          ${glyph('menu')}
        </button>`
      : nothing;
  return html`<header class="fv-page-bar">
    ${lead}
    <h1 class="fv-page-bar__title">${page.t('title')}</h1>
    <button
      class="fv-round fv-round--bare"
      aria-label=${page.t('csv')}
      ?disabled=${!page.entityIds.length}
      @click=${() => page.download()}
    >
      ${glyph('download')}
    </button>
  </header>`;
}

/** The period's name and what it holds, the ways to move it, and the tools that narrow it. */
export function renderHead(page: FluvyHistory): TemplateResult {
  const { eyebrow, title } = describePeriod({
    range: page.range,
    now: page.now,
    language: page.language,
    time: (ms) => page.time(ms),
    words: {
      today: page.t('today'),
      yesterday: page.t('yesterday'),
      period: page.t('period'),
      week: page.t('preset.week'),
      lastDay: page.t('last_day'),
      days: (n) => page.t('days', { n }),
      since: (when) => page.t('since', { when }),
    },
  });
  const shown = page.shown;
  const sources = countTargets(page.target) + countFilters(page.sourceFilters);
  // "Today" takes the page back to the window it opened on; it is not offered while the page is already on today,
  // whether it followed the clock there or the calendar picked it
  const isToday = page.following || sameRange(page.range, dayRange(new Date(page.now)));
  const facts = [
    sources === 1 ? page.t('sources_one') : page.t('sources_count', { n: sources }),
    ...(shown.tracks
      ? [shown.tracks === 1 ? page.t('measures_one') : page.t('measures', { n: shown.tracks })]
      : []),
    ...(shown.lines.length
      ? [
          shown.lines.length === 1
            ? page.t('states_one')
            : page.t('states_count', { n: shown.lines.length + shown.hidden }),
        ]
      : []),
  ];
  return html`<header class="hs-head">
    <div class="hs-head__titles">
      <p class="hs-head__eyebrow">${eyebrow}</p>
      <h2 class="hs-head__title">${title}</h2>
      <p class="hs-head__sub">
        ${sources && page.entityIds.length ? facts.join(' · ') : page.t('start_hint')}
      </p>
    </div>
    <div class="hs-head__controls">
      <button
        class="fv-round fv-round--on-page"
        aria-label=${page.t('previous')}
        @click=${() => page.shift(-1)}
      >
        ${glyph('chevronLeft')}
      </button>
      <button
        class="fv-btn fv-btn--pill fv-btn--on-page ${isToday ? '' : 'is-on'}"
        style="width:${page.pill(page.t('today'))}px"
        ?disabled=${isToday}
        @click=${() => page.today()}
      >
        ${page.t('today')}
      </button>
      <button
        class="fv-round fv-round--on-page"
        aria-label=${page.t('next')}
        ?disabled=${!page.canGoLater}
        @click=${() => page.shift(1)}
      >
        ${glyph('chevron')}
      </button>
      <button
        class="fv-round fv-round--on-page hs-pick"
        aria-label=${page.t('pick')}
        aria-haspopup="dialog"
        aria-expanded=${String(page.layers.is('picking'))}
        @click=${() => page.pickDates()}
      >
        ${glyph('calendar')}
      </button>
      ${page.layers.is('picking') && !page.compact ? renderPopoverDates(page) : nothing}
    </div>
    <div class="hs-tools">
      <label class="fv-field fv-field--on-page hs-search">
        ${glyph('search')}
        <input
          id="hs-search"
          class="fv-field__input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder=${page.t('search_short')}
          aria-label=${page.t('search')}
          .value=${page.search}
          @input=${(event: InputEvent) => {
            page.search = (event.target as HTMLInputElement).value;
          }}
        />
        ${
          page.search
            ? html`<button
                class="fv-round fv-round--bare"
                aria-label=${page.t('clear')}
                @click=${() => {
                  page.search = '';
                }}
              >
                ${glyph('close')}
              </button>`
            : nothing
        }
      </label>
      <button
        class="fv-round fv-round--on-page hs-sources ${sources ? 'is-on' : ''}"
        aria-label=${page.t('sources')}
        aria-haspopup="dialog"
        @click=${() => page.layers.show('sourcing')}
      >
        ${glyph('sliders')}${
          sources
            ? html`<span class="hs-badge" style="width:${badgeWidth(sources)}px">${sources}</span>`
            : nothing
        }
      </button>
    </div>
  </header>`;
}

const MINUTE = 60_000;

/** A badge's width by its digits: 20, 28, 36 — the grid, never the odd width its text happens to take. */
const badgeWidth = (count: number): number => 20 + Math.max(0, String(count).length - 1) * 8;

/** The charts, the state lines, and what to say when there is nothing to draw. */
export function renderBody(page: FluvyHistory): TemplateResult {
  if (!page.entityIds.length)
    return html`<div class="hs-empty">
      ${emptyState('chart', page.t('start'), page.t('start_hint'))}
      <button
        class="fv-btn fv-btn--accent hs-empty__action"
        style="width:${page.button(page.t('sources'))}px"
        @click=${() => page.layers.show('sourcing')}
      >
        ${page.t('sources')}
      </button>
    </div>`;
  if (page.loading && !page.ready) return renderSkeleton(page);
  // a window that has not happened yet holds no readings: one carried-over sample is not a min, a max and an average
  if (page.drawnEnd - page.range.start < MINUTE)
    return html`<div class="hs-empty">
      ${emptyState('chart', page.t('not_yet'), page.t('not_yet_hint'))}
    </div>`;
  const { charts, lines, hidden } = page.shown;
  if (!charts.length && !lines.length)
    return html`<div class="hs-empty">
      ${emptyState(
        'chart',
        page.search ? page.t('nothing_found') : page.t('empty'),
        page.search ? page.t('nothing_found_hint') : page.t('empty_hint'),
      )}
      ${
        page.search
          ? html`<button
              class="fv-btn fv-btn--on-page hs-empty__action"
              style="width:${page.button(page.t('clear'))}px"
              @click=${() => {
                page.search = '';
              }}
            >
              ${page.t('clear')}
            </button>`
          : html`<button
              class="fv-btn fv-btn--on-page hs-empty__action"
              style="width:${page.button(page.t('sources'))}px"
              @click=${() => page.layers.show('sourcing')}
            >
              ${page.t('sources')}
            </button>`
      }
    </div>`;
  return html`${charts.map((chart) => renderChart(page, chart))}
  ${lines.length ? renderStates(page, lines, hidden) : nothing}`;
}

/** While the first window is read: a card of the height the first chart will take. */
function renderSkeleton(page: FluvyHistory): TemplateResult {
  return html`<article class="fv-card hs-card hs-card--loading" aria-label=${page.t('loading')}>
    <div class="fv-skeleton hs-skeleton"></div>
  </article>`;
}
