/** The Activity page's timeline: the hours, the rows (an entry, a burst, a repeat), the start of the day and the way on. */
import { html, nothing, type TemplateResult } from 'lit';
import { guard } from 'lit/directives/guard.js';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';
import {
  dateFormat,
  domainOf,
  type EntityView,
  formatDate,
  isActive,
  relativeTime,
  resolveEntity,
} from '@fluvy/core';
import {
  type ActivityEvent,
  type ActivityItem,
  type ActivityRow,
  type ActivitySection,
  causeOf,
} from '@fluvy/core/activity';
import { activateKey, emptyState, firstFit, glyph, icon, linesNeeded, textWidth } from '@fluvy/ui';
import { currentTone } from '../shared/domain.js';
import { detailWidth, foldDetail, renderDetail, textColumn } from './detail.js';
import { type ActivityModel, dayRange, sameRange, shiftRange } from './model.js';
import { glide, isCurrent } from './rail.js';
import { HOUR, HOUR_HEAD, INNER, type Look, MINUTE, type Place, QUIET, STAGGER } from './shared.js';
import type { FluvyActivity } from './view.js';
import {
  causeTag,
  dayMonth,
  isMoment,
  lookOf,
  momentWord,
  nameOf,
  pastView,
  stateWord,
  triggerWords,
  withNames,
} from './words.js';

/** "N new": sticky over the column, back to the top on a tap. */
export function renderFresh(page: FluvyActivity): TemplateResult | typeof nothing {
  if (!page.freshCount) return nothing;
  const text = page.count('new', page.freshCount);
  const width = page.pill([text], 14, 52);
  return html`<div class="av-fresh">
    <button
      class="av-fresh__pill"
      style="width:${width}px;margin-left:round(down, calc(50% - ${width / 2}px), 1px)"
      @click=${() => glide(page, 0)}
    >
      ${glyph('up')}${text}
    </button>
  </div>`;
}

export function renderList(page: FluvyActivity, model: ActivityModel): unknown {
  const exit = page.exiting ? `is-leaving is-${page.exiting}` : '';
  if (!model.sections.length) {
    if (page.loading || page.exiting)
      return html`<div class="av-list ${exit}" aria-busy="true" aria-label=${page.t('loading')}>
        ${Array.from(
          { length: 7 },
          () => html`<div class="av-skeleton"><span></span><span></span><span></span></div>`,
        )}
      </div>`;
    const filtered = page.events.length > 0;
    const day = sameRange(page.range, dayRange(new Date(page.range.start)));
    const text = page.t(filtered ? 'no_match' : day ? 'empty' : 'empty_period');
    const action = page.t('show_everything');
    return html`<div class="av-empty">
      ${emptyState(filtered ? 'search' : 'clock', text)}
      ${
        filtered
          ? html`<button
              class="fv-btn fv-btn--quiet av-empty__action"
              style="width:${page.pill([action], 15, 32)}px"
              @click=${() => {
                page.search = '';
                page.setFilter('all');
              }}
            >
              ${action}
            </button>`
          : nothing
      }
    </div>`;
  }
  const list = guard(
    [
      model,
      page.language,
      page.open,
      page.closing,
      page.full,
      page.fresh,
      page.entering,
      page.compact,
      page.mainWidth,
      page.card,
      page.fontEpoch,
      Math.floor(page.now / MINUTE),
    ],
    () => {
      let index = 0;
      const sections = model.sections;
      return repeat(
        sections,
        (section) => section.start,
        (section, k) => {
          const template = renderSection(page, section, index, sections[k - 1], sections[k + 1]);
          index += section.rows.length;
          return template;
        },
      );
    },
  );
  const oldest = model.sections[model.sections.length - 1]!;
  const lastRow = oldest.rows[oldest.rows.length - 1]!;
  const capGap = lastRow.when * 1000 - page.range.start > QUIET;
  const day = sameRange(page.range, dayRange(new Date(page.range.start)));
  // a period's start is dated when the list crosses midnight ("Start of the period · 16 Sept")
  const cap = day
    ? page.t('day_start')
    : crossesMidnight(page)
      ? `${page.t('period_start')} · ${dayMonth(page, page.range.start, 'short')}`
      : page.t('period_start');
  return html`${keyed(
      `${page.range.start}|${page.range.end}`,
      html`<div class="av-list ${page.entering === 'filter' ? 'is-filter' : ''} ${exit}">
        ${list}
      </div>`,
    )}
    <div class="av-end ${capGap ? 'is-gap' : ''}">
      <time class="av-time">${page.time(page.range.start)}</time>
      <span class="av-node"><span class="av-end__node"></span></span>
      <span class="av-end__text">${cap}</span>
    </div>
    ${renderEarlier(page, day)}`;
}

/** Under the start of the day, the way on to the day before (the last screen's room has a use). */
export function renderEarlier(page: FluvyActivity, day: boolean): TemplateResult {
  const previous = new Date(shiftRange(page.range, -1).start);
  const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
  const short = (): string =>
    dateFormat(page.language, { weekday: 'short', day: 'numeric', month: 'short' }).format(
      previous,
    );
  // the fullest wording the text column holds: the date, its short form, then the words alone
  const candidates = day
    ? [capital(formatDate(page.hass, previous, 'full')), capital(short()), page.t('previous_day')]
    : [page.t('previous')];
  const room = textColumn(page) - 52; // the glyph, its gap and the button's 16 px sides
  page.family ||= getComputedStyle(page).fontFamily || 'Inter, sans-serif';
  const label = !page.mainWidth
    ? candidates[candidates.length - 1]!
    : firstFit(candidates, room, { size: 15, weight: 600, family: page.family });
  return html`<div class="av-earlier">
    <button class="fv-btn fv-btn--on-page" data-fit="32" @click=${() => page.shift(-1)}>
      ${glyph('chevronLeft')}${label}
    </button>
  </div>`;
}

export function renderSection(
  page: FluvyActivity,
  section: ActivitySection,
  offset: number,
  newer: ActivitySection | undefined,
  older: ActivitySection | undefined,
): TemplateResult {
  const hass = page.hass;
  const hour = new Date(section.start);
  const rows = section.rows;
  // a period across midnight: each day's name above its first hour (the list never seems to run backwards)
  const newDay =
    crossesMidnight(page) && (!newer || new Date(newer.start).getDate() !== hour.getDate());
  const lastOfNewer = newer?.rows[newer.rows.length - 1];
  const gapAbove = !!lastOfNewer && lastOfNewer.when - rows[0]!.when > QUIET / 1000;
  const nextFirst = older?.rows[0];
  const gapBelow = !!nextFirst && rows[rows.length - 1]!.when - nextFirst.when > QUIET / 1000;
  // an hour not laid out keeps the room its rows will take (the oldest is always laid out: the foot measures it)
  return html`<section
    class="av-section ${older ? '' : 'is-last'}"
    style="contain-intrinsic-size: auto ${HOUR_HEAD + rows.length * page.pitch}px"
    @contentvisibilityautostatechange=${page.onSkipped}
  >
    ${newDay ? html`<p class="av-dayhead">${formatDate(hass, hour, 'full')}</p>` : nothing}
    <h2 class="av-hour ${newer ? '' : 'is-top'} ${gapAbove ? 'is-gap' : ''}">
      <span class="av-hour__time">${page.time(section.start)}</span>
      <span class="av-node"><span class="av-hour__node"></span></span>
      <span class="av-hour__count"
        ><span
          >${page.num(page.number(section.count))}${page
            .count('changes', section.count)
            .slice(page.number(section.count).length)}</span
        ></span
      >
    </h2>
    ${repeat(
      rows,
      (row) => row.key,
      (row, k) => {
        const up = rows[k - 1];
        const down = rows[k + 1];
        const place: Place = {
          gap: up ? up.when - row.when > QUIET / 1000 : gapAbove,
          gapAfter: down ? row.when - down.when > QUIET / 1000 : gapBelow,
          index: offset + k,
        };
        return row.kind === 'event'
          ? renderEvent(page, row.item, place)
          : renderGroup(page, row, place);
      },
    )}
  </section>`;
}

/** Whether the period runs over more than one day (its days are then named in the list). */
export function crossesMidnight(page: FluvyActivity): boolean {
  return dayRange(new Date(page.range.start)).end < page.range.end;
}

export function rowClass(page: FluvyActivity, key: string, place: Place, fresh: boolean): string {
  const classes = ['av-row'];
  if (place.gap) classes.push('is-gap');
  if (place.gapAfter) classes.push('is-gap-after');
  if (page.open.has(key) && !page.closing.has(key)) classes.push('is-open');
  if (fresh) classes.push('is-fresh');
  else if (page.entering === 'load' && place.index < STAGGER) classes.push('is-entering');
  return classes.join(' ');
}

export function rowNode(look: Look): TemplateResult {
  return html`<span class="av-node"
    >${
      look.major
        ? html`<span class="fv-ico fv-ico--${look.tone} av-circle"
            >${icon(look.glyph, 'dots')}</span
          >`
        : html`<span class="av-dot"></span>`
    }</span
  >`;
}

export function statePill(
  page: FluvyActivity,
  view: EntityView | undefined,
  state: string,
  strong: boolean,
): TemplateResult {
  const past = view?.stateObj ? pastView(view, state) : undefined;
  const off = state === 'unavailable' || state === 'unknown';
  const on = strong && !!past && isActive(past);
  const tone = past ? currentTone(past) : 'neutral';
  const word = stateWord(page, view, state);
  return html`<span
    class="av-state fv-badge--${tone} ${on ? 'is-on' : ''} ${off ? 'is-off' : ''}"
    data-pill="16"
    style="width:${page.pill([word], 12, 16)}px"
    ><span class="av-state__text">${word}</span></span
  >`;
}

export function changeOf(
  page: FluvyActivity,
  event: ActivityEvent,
  from: string | undefined,
  view: EntityView | undefined,
): TemplateResult {
  const domain = event.domain ?? (event.entity_id ? domainOf(event.entity_id) : '');
  if (domain === 'homeassistant')
    return html`<span class="av-msg"
      >${/stop/i.test(event.message ?? '') ? page.t('stopped') : page.t('started')}</span
    >`;
  if (event.state !== undefined && event.entity_id && isMoment(event))
    return html`<span class="av-msg">${momentWord(page, event)}</span>`;
  if (domain === 'automation' && event.state === undefined)
    return html`<span class="av-msg"
      >${page.ha('ui.components.logbook.automation_triggered', 'msg.triggered')}</span
    >`;
  if (domain === 'script' && event.state === undefined)
    return html`<span class="av-msg"
      >${page.ha('ui.components.logbook.script_ran', 'msg.ran')}</span
    >`;
  if (event.state !== undefined && event.entity_id)
    // "from › to" is one unit: it wraps as a whole, never leaving the arrow at a line's end
    return html`<span class="av-change"
      >${
        from !== undefined && from !== event.state
          ? html`${statePill(page, view, from, false)}${glyph('chevron')}`
          : nothing
      }${statePill(page, view, event.state, true)}</span
    >`;
  return html`<span class="av-msg">${withNames(page, event.message ?? '')}</span>`;
}

/**
 * The second line: its parts side by side, each its own box — the time never gives way, the last part (who did
 * it) is the one that ends in an ellipsis when the line is short.
 */
export function subLine(
  parts: readonly (string | TemplateResult)[],
): TemplateResult | typeof nothing {
  const kept = parts.filter((part) => part !== '');
  if (!kept.length) return nothing;
  return html`<span class="av-sub"
    >${kept.map(
      (part, i) =>
        html`${i ? html`<span class="av-sub__sep" aria-hidden="true">·</span>` : nothing}${
          typeof part === 'string' ? html`<span class="av-sub__part">${part}</span>` : part
        }`,
    )}</span
  >`;
}

export function agoText(page: FluvyActivity, ms: number): string {
  if (page.compact || !isCurrent(page) || page.now - ms > HOUR) return '';
  return page.now - ms < MINUTE
    ? page.t('now')
    : relativeTime(page.hass, new Date(ms), new Date(page.now));
}

export function renderEvent(page: FluvyActivity, item: ActivityItem, place: Place): TemplateResult {
  const { event, key } = item;
  const hass = page.hass!;
  const when = event.when * 1000;
  const view = event.entity_id ? resolveEntity(hass, event.entity_id) : undefined;
  const look = lookOf(page, event, view);
  const cause = causeOf(event, hass, page.people);
  const open = page.open.has(key);
  const fresh = page.fresh.has(key);
  const trigger =
    event.entity_id && domainOf(event.entity_id) === 'automation'
      ? triggerWords(page, event.source)
      : '';
  const sub = subLine([
    page.compact ? page.time(when) : '',
    view?.areaName ?? '',
    cause ? causeTag(page, cause) : trigger ? page.t('trigger', { what: trigger }) : '',
  ]);
  const row = html`<div
    class=${rowClass(page, key, place, fresh)}
    style=${place.index < STAGGER ? `--i:${place.index}` : ''}
    data-t=${when}
    role="button"
    tabindex="0"
    aria-expanded=${String(open)}
    @click=${() => page.toggle(key)}
    @keydown=${activateKey(() => page.toggle(key))}
  >
    <time class="av-time">${page.time(when)}</time>
    ${rowNode(look)}
    <span class="av-body">
      <span class="av-line"
        ><span class="av-name">${nameOf(event, view)}</span
        >${changeOf(page, event, item.from, view)}</span
      >
      ${sub}
    </span>
    <span class="av-ago">${agoText(page, when)}</span>
  </div>`;
  // a new entry opens a place for itself (from nothing: its clip has no padding), the rows below slide down
  return html`${fresh ? html`<div class="av-grow"><div class="av-grow__clip">${row}</div></div>` : row}
  ${open ? renderDetail(page, item, view, cause, place) : nothing}`;
}

export function renderGroup(
  page: FluvyActivity,
  row: Exclude<ActivityRow, { kind: 'event' }>,
  place: Place,
): TemplateResult {
  const hass = page.hass!;
  const newest = row.items[0]!;
  const oldest = row.items[row.items.length - 1]!;
  // the row's moment (a restart's is when Home Assistant started); its span, from the first entry to the last
  const when = row.when * 1000;
  const since = oldest.event.when * 1000;
  const until = newest.event.when * 1000;
  const open = page.open.has(row.key);
  const span =
    page.time(since) === page.time(until)
      ? page.time(until)
      : `${page.time(since)} – ${page.time(until)}`;
  let name: string;
  let look: Look;
  let change: TemplateResult;
  let area = '';
  if (row.kind === 'burst') {
    const minutes = Math.max(1, Math.round((until - since) / MINUTE));
    const n = row.items.length;
    name = row.restart
      ? page.t('restart')
      : until - since >= MINUTE
        ? page.count('burst', n, { m: minutes })
        : page.count('burst_short', n);
    look = { glyph: row.restart ? 'ha' : 'bolt', tone: 'neutral', major: true };
    change = countPill(page, page.count('changes', n));
  } else {
    const view = resolveEntity(hass, row.entityId);
    name = nameOf(newest.event, view);
    look = lookOf(page, newest.event, view);
    area = view.areaName;
    change = html`<span class="av-change"
      >${countPill(page, page.count('changes', row.items.length))}${
        newest.event.state !== undefined ? statePill(page, view, newest.event.state, true) : nothing
      }</span
    >`;
  }
  const fresh = row.items.some((item) => page.fresh.has(item.key));
  return html`<div
      class=${rowClass(page, row.key, place, fresh)}
      style=${place.index < STAGGER ? `--i:${place.index}` : ''}
      data-t=${when}
      role="button"
      tabindex="0"
      aria-expanded=${String(open)}
      @click=${() => page.toggle(row.key)}
      @keydown=${activateKey(() => page.toggle(row.key))}
    >
      <time class="av-time">${page.time(when)}</time>
      ${rowNode(look)}
      <span class="av-body">
        <span class="av-line"><span class="av-name">${name}</span>${change}</span>
        ${subLine([span, area])}
      </span>
      <span class="av-chevron">${glyph('chevron')}</span>
    </div>
    ${open ? renderInner(page, row, place) : nothing}`;
}

export function countPill(page: FluvyActivity, text: string): TemplateResult {
  return html`<span class="av-state" data-pill="16" style="width:${page.pill([text], 12, 16)}px"
    ><span class="av-state__text">${text}</span></span
  >`;
}

/**
 * How a phone's burst entry lays out: its change beside its name while two lines of what is left hold the name
 * (`''`); else the name takes the entry's whole width and the change goes under it, on the time's line
 * (`is-stacked`), or on a line of its own when the time and the change do not fit one (`is-stacked is-apart`).
 */
export function burstLayout(
  page: FluvyActivity,
  event: ActivityEvent,
  view: EntityView | undefined,
  when: string,
): string {
  const room = detailWidth(page);
  if (!room) return '';
  page.family ||= getComputedStyle(page).fontFamily || 'Inter, sans-serif';
  const family = page.family;
  const change =
    event.state !== undefined && event.entity_id && !isMoment(event)
      ? page.pill([stateWord(page, view, event.state)], 12, 16)
      : 96;
  const name = nameOf(event, view);
  const face = { size: 13, weight: 600, family };
  if (linesNeeded(name, room - change - 12, (text) => textWidth(text, face)) <= 2) return '';
  const time = textWidth(when, { size: 12, weight: 500, tabular: true, family });
  return time + 12 + change <= room ? 'is-stacked' : 'is-stacked is-apart';
}

export function renderInner(
  page: FluvyActivity,
  row: Exclude<ActivityRow, { kind: 'event' }>,
  place: Place,
): TemplateResult {
  const hass = page.hass!;
  const all = page.full.has(row.key);
  const mini = (item: ActivityItem): TemplateResult => {
    const { event, from } = item;
    const view = event.entity_id ? resolveEntity(hass, event.entity_id) : undefined;
    const when = page.time(event.when * 1000, row.kind === 'burst');
    const layout = row.kind === 'burst' && page.compact ? burstLayout(page, event, view, when) : '';
    return html`<div class="av-mini ${row.kind === 'repeat' ? 'is-repeat' : ''} ${layout}">
      <time class="av-time">${when}</time>
      ${
        row.kind === 'burst'
          ? html`<span class="av-mini__name">${nameOf(event, view)}</span>`
          : nothing
      }
      ${changeOf(page, event, row.kind === 'repeat' ? from : undefined, view)}
    </div>`;
  };
  const first = row.items.slice(0, INNER);
  const rest = row.items.slice(INNER);
  return foldDetail(
    page,
    row.key,
    place,
    html`<div class="av-inner">
        ${first.map(mini)}
        ${
          all && rest.length
            ? html`<div class="av-grow"><div class="av-inner">${rest.map(mini)}</div></div>`
            : nothing
        }
      </div>
      ${
        !all && rest.length
          ? html`<button class="fv-btn fv-btn--quiet av-more" @click=${() => page.showAll(row.key)}>
              ${page.t('show_all', { n: page.number(row.items.length) })}
            </button>`
          : nothing
      }`,
  );
}
