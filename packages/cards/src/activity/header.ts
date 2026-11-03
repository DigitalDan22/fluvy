/** The Activity page's bar and day header: the period's title (never cut: it steps down, then wraps), its controls, the dates. */
import { describePeriod, type PeriodTitle } from '../shared/period.js';

import { html, nothing, type TemplateResult } from 'lit';

import { keyed } from 'lit/directives/keyed.js';

import { goBack, resolveEntity } from '@fluvy/core';

import { faceOf, glyph, textWidth } from '@fluvy/ui';
import { download } from './csv.js';

import { type ActivityModel, dayRange, sameRange } from './model.js';

import { isCurrent } from './rail.js';

import { singleEntity } from './sources.js';

import type { FluvyActivity } from './view.js';

import { drawer, popover } from '../shared/layer.js';

export function renderBar(page: FluvyActivity): TemplateResult {
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
  const { title } = describeRange(page);
  return html`<header class="fv-page-bar">
    ${lead}
    <h1 class="fv-page-bar__title">
      <span class="av-swap ${page.scrolled ? '' : 'is-shown'}">${page.t('title')}</span>
      <span class="av-swap ${page.scrolled ? 'is-shown' : ''}" aria-hidden="true">${title}</span>
    </h1>
    <button
      class="fv-round fv-round--bare"
      aria-label=${page.t('download')}
      ?disabled=${!page.events.length}
      @click=${() => download(page)}
    >
      ${glyph('download')}
    </button>
  </header>`;
}

export function describeRange(page: FluvyActivity): PeriodTitle {
  page.family ||= getComputedStyle(page).fontFamily || 'Inter, sans-serif';
  const entity = singleEntity(page);
  return describePeriod({
    range: page.range,
    now: page.now,
    language: page.language,
    family: page.family,
    room: titleRoom(page),
    time: (ms) => page.time(ms),
    named: entity ? resolveEntity(page.hass, entity).name : undefined,
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
}

/**
 * The day: its titles (a button that opens the dates), the way back and on, Today and the dates. Today is quiet while
 * on today (it would do nothing) and switched on (the accent) as the way back from elsewhere.
 */
export function renderDay(page: FluvyActivity, model: ActivityModel): TemplateResult {
  const { eyebrow, title, short, range } = describeRange(page);
  const isToday = sameRange(page.range, dayRange(new Date(page.now)));
  const isDay = sameRange(page.range, dayRange(new Date(page.range.start)));
  const summary = [
    [model.total, 'changes'],
    [model.automations, 'automations'],
    [model.restarts, 'restarts'],
  ] as const;
  const pick = (): void => {
    if (page.picking) page.dismiss('picking');
    else page.picking = true;
  };
  const parts = summary
    .filter(([n, key]) => n > 0 || key === 'changes')
    .map(([n, key]) => {
      const text = page.count(key, n);
      const figure = page.number(n);
      const rest = text.slice(text.indexOf(figure) + figure.length);
      return html`<span class="av-part">${page.num(figure)}${rest}</span>`;
    });
  // a day's title is never cut: it steps down (32, then 24) and, on a phone, to its short form (24, then 20)
  const size = range ? '' : titleSize(page, title, short);
  // a period's two ends each stay whole: the line breaks only between them; a title too wide even at the last
  // step goes on two balanced lines (its two ends, or its words split nearest the middle)
  const wrap = size.includes('is-wrap');
  const lines = (text: string, px: number): TemplateResult => {
    if (range && !wrap) {
      const [a, b] = text.split(' – ');
      return b
        ? html`<span class="av-end-part">${a}</span> <span class="av-end-part">– ${b}</span>`
        : html`${text}`;
    }
    if (!wrap) return html`${text}`;
    const [a, b] = twoLines(page, text, px);
    return html`<span class="av-line-part">${a}</span><span class="av-line-part">${b}</span>`;
  };
  return html`<header class="av-day">
    <button
      class="av-day__titles"
      aria-haspopup="dialog"
      aria-expanded=${String(page.picking)}
      @click=${pick}
    >
      ${keyed(
        `${page.range.start}|${page.range.end}`,
        html`<span
            class="av-day__eyebrow av-turn is-${page.direction}"
            ?data-name=${singleEntity(page) !== undefined}
            >${eyebrow}</span
          >
          <span class="av-day__date av-turn is-${page.direction} ${range ? 'is-range' : ''} ${size}"
            ><span class="av-long">${lines(title, 24)}</span
            ><span class="av-short">${lines(short, 20)}</span
            ><span class="av-day__caret" aria-hidden="true">${glyph('down')}</span></span
          >`,
      )}
      <span class="av-day__summary" data-parts>
        ${(page.loading && !page.events.length) || page.exiting ? page.t('loading') : parts}
      </span>
    </button>
    <button
      class="fv-round fv-round--on-page av-day__prev"
      aria-label=${page.t(isDay ? 'previous_day' : 'previous')}
      @click=${() => page.shift(-1)}
    >
      ${glyph('chevronLeft')}
    </button>
    <button
      class="fv-btn fv-btn--pill fv-btn--on-page av-day__today ${isToday ? '' : 'is-on'}"
      style="width:${page.pill([page.t('today')], 14, 36)}px"
      ?disabled=${isToday}
      @click=${() => page.today()}
    >
      ${page.t('today')}
    </button>
    <button
      class="fv-round fv-round--on-page av-day__next"
      aria-label=${page.t(isDay ? 'next_day' : 'next')}
      ?disabled=${isCurrent(page)}
      @click=${() => page.shift(1)}
    >
      ${glyph('chevron')}
    </button>
    <button
      class="fv-round fv-round--on-page av-day__pick"
      aria-label=${page.t('pick')}
      aria-haspopup="dialog"
      aria-expanded=${String(page.picking)}
      @click=${pick}
    >
      ${glyph('calendar')}
    </button>
    ${
      page.compact && !isToday
        ? html`<div class="av-day__back">
            <button
              class="fv-btn fv-btn--pill fv-btn--on-page is-on"
              style="width:${page.pill([page.t('today')], 14, 36)}px"
              @click=${() => page.today()}
            >
              ${page.t('today')}
            </button>
          </div>`
        : nothing
    }
    ${page.picking && !page.compact ? renderPopover(page) : nothing}
  </header>`;
}

/** A title in two balanced lines: at its " – " when it has one, else at the space nearest its middle. */
export function twoLines(page: FluvyActivity, text: string, px: number): [string, string] {
  if (text.includes(' – ')) {
    const [a, b] = text.split(' – ');
    return [a ?? text, `– ${b ?? ''}`];
  }
  const spaces = [...text.matchAll(/ /g)].map((match) => match.index ?? 0);
  if (!spaces.length) return [text, ''];
  const half = titleWidth(page, text, px) / 2;
  const at = spaces.reduce((best, index) =>
    Math.abs(titleWidth(page, text.slice(0, index), px) - half) <
    Math.abs(titleWidth(page, text.slice(0, best), px) - half)
      ? index
      : best,
  );
  return [text.slice(0, at), text.slice(at + 1)];
}

/**
 * The day title's step: '' (32 px, the long form), `is-smaller` (24) or `is-smallest` (a phone's 20), measured
 * against the room beside the day's controls; `is-wrap` when even the last step needs two lines.
 */
export function titleSize(page: FluvyActivity, title: string, short: string): string {
  const room = titleRoom(page);
  if (!room) return '';
  if (page.compact) {
    // and its caret
    if (titleWidth(page, short, 24) <= room - 20) return '';
    return titleWidth(page, short, 20) <= room - 20 ? 'is-smallest' : 'is-smallest is-wrap';
  }
  if (titleWidth(page, title, 32) <= room) return '';
  return titleWidth(page, title, 24) <= room ? 'is-smaller' : 'is-smaller is-wrap';
}

/**
 * The room the day's titles have: the column (inside its card) less ‹ and › either side on a phone, ‹ Today › and
 * the calendar on a desktop, their gaps and the titles' 8 px sides. 0 until the column is measured.
 */
export function titleRoom(page: FluvyActivity): number {
  const width = page.mainWidth - (page.card ? (page.compact ? 32 : 48) : 0);
  if (!page.mainWidth) return 0;
  return page.compact
    ? width - 2 * 44 - 2 * 4 - 16
    : width - (3 * 44 + page.pill([page.t('today')], 14, 36)) - 4 * 8 - 24;
}

/** A title's own width, as it is drawn: 600 with its tracking, its real figures. */
export function titleWidth(page: FluvyActivity, text: string, size: number): number {
  page.family ||= getComputedStyle(page).fontFamily || 'Inter, sans-serif';
  return textWidth(text, { size, weight: 600, tracking: -0.02, family: page.family });
}

/**
 * Lines of parts, once laid out: in "135 changes · 3 runs", a part that starts a line drops its separator; in a
 * one-line box (`data-one-line`), a part that wrapped out of it is not there at all (the cause's kind).
 */
export function markLineStarts(page: FluvyActivity): void {
  for (const line of page.renderRoot.querySelectorAll<HTMLElement>('[data-parts]')) {
    let top = Number.NaN;
    for (const part of line.children) {
      const node = part as HTMLElement;
      node.classList.toggle('is-start', node.offsetTop !== top);
      top = node.offsetTop;
    }
  }
  // a one-line box: its last part stays only while the line holds it whole (measured from the texts, so hiding
  // it never changes the answer)
  for (const line of page.renderRoot.querySelectorAll<HTMLElement>('[data-one-line]')) {
    const name = line.firstElementChild as HTMLElement | null;
    const last = line.lastElementChild as HTMLElement | null;
    const row = line.parentElement;
    const box = row?.parentElement;
    if (!name || !last || name === last || !row || !box) continue;
    const extras = row.offsetWidth - line.offsetWidth;
    const room = box.clientWidth - extras;
    const need = name.scrollWidth + 4 + textWidth(last.textContent ?? '', faceOf(last));
    last.hidden = need > room;
  }
}

export function renderPickerBody(page: FluvyActivity): TemplateResult {
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

export function renderPopover(page: FluvyActivity): TemplateResult {
  return popover({
    label: page.t('dates'),
    leaving: page.leaving === 'picking',
    autofocus: 'picking',
    body: renderPickerBody(page),
    onDismiss: () => page.dismiss('picking'),
    onLeft: page.onLeft,
  });
}

/** A phone's dates: a bottom sheet with a grabber, its title and a close button. */
export function renderPickerSheet(page: FluvyActivity): TemplateResult {
  return drawer({
    title: page.t('dates'),
    close: page.t('close'),
    leaving: page.leaving === 'picking',
    grabber: true,
    variant: 'av-dates',
    autofocus: 'picking',
    body: renderPickerBody(page),
    onDismiss: () => page.dismiss('picking'),
    onLeft: page.onLeft,
  });
}
