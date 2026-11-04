/** The Activity page's tools: the search and the filters (one or two rows of equal chips, or a strip). */
import { html, nothing, type TemplateResult } from 'lit';

import { keyed } from 'lit/directives/keyed.js';

import { type KeyOf } from '@fluvy/core';
import { countFilters, countTargets } from '@fluvy/core/sources';

import { faceOf, firstFit, glyph, reducedMotion, sideScroll, zoomOf } from '@fluvy/ui';
import type { ActivityModel } from './model.js';
import { openSources, singleEntity } from './sources.js';

import type { FluvyActivity } from './view.js';

type ActivityString = KeyOf<'activity' | 'page'>;

export function renderTools(page: FluvyActivity): TemplateResult {
  const sources = countTargets(page.target) + countFilters(page.sourceFilters);
  return html`<div class="av-tools">
    <label class="fv-field fv-field--on-page av-search">
      ${glyph('search')}
      <input
        id="av-search"
        class="fv-field__input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder=${searchHint(page)}
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
      class="fv-round fv-round--on-page av-sources ${sources ? 'is-on' : ''}"
      aria-label=${page.t('sources')}
      aria-haspopup="dialog"
      @click=${() => openSources(page)}
    >
      ${glyph('sliders')}${sources ? html`<span class="av-badge">${sources}</span>` : nothing}
    </button>
  </div>`;
}

/**
 * The filters. On a desktop, one or two balanced rows of equal cells sharing the column; when two rows cannot hold
 * the labels (and on a phone), a strip of content-sized pills that scrolls (finger, wheel, mouse drag). Loading,
 * grey pills hold the place. A filter that would change nothing is not offered: with one entity asked for, on an
 * empty day, or when every filter shows the same entries (one device's day). While searching, the counts are the
 * search's.
 */
export function renderFilters(page: FluvyActivity, model: ActivityModel): unknown {
  if (singleEntity(page)) return nothing;
  if (page.loading && !page.events.length)
    return html`<div class="av-filters av-filters--loading" aria-hidden="true">
      ${ghosts(page).map((width) => html`<span class="av-ghost" style="width:${width}px"></span>`)}
    </div>`;
  if (!page.search && new Set(model.filters.map((filter) => model.counts[filter])).size < 2)
    return nothing;
  const items = model.filters.map((filter) => ({
    filter,
    label: page.t(`filter.${filter}` as ActivityString),
    count: page.number(model.counts[filter]),
  }));
  const widths = items.map(({ label, count }) => page.pill([label, count], 13, 28, 6));
  const chip = (item: (typeof items)[number], width?: number): TemplateResult =>
    html`<button
      class="fv-chip ${item.filter === page.filter ? 'is-active' : ''}"
      data-fit=${width ? '28' : nothing}
      aria-pressed=${String(item.filter === page.filter)}
      @click=${() => page.setFilter(item.filter)}
    >
      <span class="fv-chip__pill">${item.label}<b>${page.num(item.count)}</b></span>
    </button>`;
  // as many equal cells a row as the widest label allows: one row, or two balanced ones (10 → 5 · 5)
  const n = items.length;
  const inner = page.mainWidth - (page.card ? 48 : 0);
  const fit = Math.max(1, Math.floor((inner + 8) / (Math.max(...widths) + 8)));
  const lines = fit >= n ? 1 : fit >= Math.ceil(n / 2) ? 2 : 0;
  if (page.compact || !page.mainWidth || !lines)
    return keyed(
      'strip',
      html`<div
        class="av-filters av-filters--strip"
        role="toolbar"
        aria-label=${page.t('title')}
        data-scroll-row
      >
        ${items.map((item, i) => chip(item, widths[i]))}
      </div>`,
    );
  const first = Math.ceil(n / lines);
  const rows = lines === 1 ? [items] : [items.slice(0, first), items.slice(first)];
  return keyed(
    `rows|${rows.map((row) => row.length).join('.')}`,
    html`<div class="av-filters av-filters--rows" role="toolbar" aria-label=${page.t('title')}>
      ${rows.map(
        (row) =>
          html`<div class="av-filters__row fv-chips--fill" style="--n:${row.length}" data-fill-row>
            ${row.map((item) => chip(item))}
          </div>`,
      )}
    </div>`,
  );
}

/** The search field's hint: its fullest wording that fits with 12 px to spare ("Search activity" → "Search"). */
export function searchHint(page: FluvyActivity): string {
  const full = page.t('search');
  if (!page.mainWidth) return full;
  // the column, less Sources (44 + 8) and the field's sides (16, its leading glyph 2 out), glyph and gap
  const room =
    page.mainWidth - (page.card ? (page.compact ? 32 : 48) : 0) - 52 - (14 + 20 + 12 + 16);
  // measured in the face the hint is drawn in: the input's (15, or 16 under a finger) at the placeholder's 400
  const input = page.renderRoot.querySelector('#av-search');
  page.family ||= getComputedStyle(page).fontFamily || 'Inter, sans-serif';
  const face = input ? faceOf(input) : { size: 15, family: page.family };
  return firstFit([full, page.t('search_short')], room, { ...face, weight: 400 });
}

/** The loading filters' grey pills: as many as the column holds whole. */
export function ghosts(page: FluvyActivity): number[] {
  const room = page.mainWidth ? page.mainWidth - (page.card ? (page.compact ? 32 : 48) : 0) : 0;
  const shown: number[] = [];
  let used = 0;
  for (const width of [88, 104, 72]) {
    if (room && used + width > room) break;
    shown.push(width);
    used += width + 8;
  }
  return shown;
}

export function showFilter(page: FluvyActivity, smooth: boolean): void {
  const row = page.renderRoot.querySelector<HTMLElement>('.av-filters[data-scroll-row]');
  const chip = row?.querySelector<HTMLElement>('.fv-chip.is-active');
  if (!row || !chip) return;
  const offset =
    (chip.getBoundingClientRect().left - row.getBoundingClientRect().left) / zoomOf(row) +
    row.scrollLeft;
  const left = offset - (row.clientWidth - chip.offsetWidth) / 2;
  row.scrollTo({
    left: Math.max(0, left),
    behavior: smooth && !reducedMotion() ? 'smooth' : 'auto',
  });
}

/**
 * The filter strip turns with the wheel and a mouse drag too (a finger and a trackpad already do), and says
 * whether more lies to its right (its fade then runs into a chip).
 */
export function wireStrip(page: FluvyActivity): void {
  const strip = page.renderRoot.querySelector<HTMLElement>('.av-filters[data-scroll-row]');
  if (strip) markStrip(strip);
  if (strip?.dataset['wired']) return;
  page.stopStrip?.();
  page.stopStrip = undefined;
  if (!strip) return;
  strip.dataset['wired'] = '1';
  const stop = sideScroll(strip);
  const onScroll = (): void => markStrip(strip);
  strip.addEventListener('scroll', onScroll, { passive: true });
  page.stopStrip = () => {
    stop();
    strip.removeEventListener('scroll', onScroll);
  };
}

export function markStrip(strip: HTMLElement): void {
  strip.toggleAttribute('data-more', strip.scrollLeft < strip.scrollWidth - strip.clientWidth - 1);
}
