import { css } from 'lit';

/** A row unfolded: its labels and values, the cause, the actions, and a burst's or a repeat's entries. */
export const detailStyles = css`
  .av-detail {
    position: relative;
    display: grid;
    grid-template-rows: 1fr;
    margin: 0 -8px;
    padding: 4px 8px 12px var(--av-body);
    animation: av-open 300ms var(--fv-ease-out, ease-out) both;
  }
  .av-detail::before {
    top: 0;
    bottom: 0;
  }
  .av-detail.is-closing {
    animation: av-shut 220ms var(--fv-ease-in, ease-in) both;
  }
  .av-detail__clip {
    min-height: 0;
    overflow: hidden;
  }
  .av-detail__inner {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border-radius: var(--fluvy-radius-lg);
    background: var(--fluvy-card);
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
  }
  .av-facts {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
  }
  .av-fact {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    column-gap: 12px;
    align-items: center;
    min-height: 20px;
  }
  /* a phone: each label over its value, at full width */
  :host([compact]) .av-fact {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .av-fact dt {
    font-size: 12px;
    line-height: 16px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fluvy-text-secondary);
  }
  .av-fact dd {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-width: 0;
    min-height: 20px;
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  /* the cause, a way in: its glyph, its name and what it is, a chevron (a 44 target over a 20 line) */
  .av-link-row {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    height: 20px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--fluvy-accent-text, var(--fluvy-accent));
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
    cursor: pointer;
  }
  /* its target is 44 tall, reaching over the lines above and below */
  .av-link-row::before {
    content: '';
    position: absolute;
    inset: -12px 0;
  }
  .av-link-row.is-plain {
    color: var(--fluvy-text);
    cursor: default;
  }
  .av-link-row.is-plain::before {
    display: none;
  }
  /* the name, then what it is when the line has room for it (else it is left out, and the chevron follows the name) */
  .av-link-row__text {
    display: flex;
    column-gap: 4px;
    min-width: 0;
  }
  .av-link-row__name {
    min-width: 0;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .av-link-row__kind {
    white-space: nowrap;
  }
  .av-link-row__kind[hidden] {
    display: none;
  }
  .av-link-row svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
  }
  .av-actions {
    display: grid;
    grid-template-columns: repeat(
      var(--n),
      round(down, calc((100% - (var(--n) - 1) * 8px) / var(--n) + 0.01px), 1px)
    );
    gap: 8px;
  }
  .av-actions .fv-btn,
  .fv-drawer__foot .fv-btn {
    min-width: 0;
    padding-inline: 12px;
  }
  /* a label that cannot keep its 12 px sides even alone (a 320 phone): 8, then two balanced lines (their line boxes
     whole: only a label of one line is trimmed to its capitals) */
  .av-actions .fv-btn.is-tight {
    padding-inline: 8px;
  }
  .av-actions .fv-btn.is-wrap {
    height: auto;
    min-height: 48px;
    padding: 6px 8px;
    white-space: normal;
    line-height: 18px;
    text-align: center;
    text-wrap: balance;
    text-box: normal;
  }
  .av-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .av-inner {
    display: flex;
    flex-direction: column;
  }
  /* a burst's or a repeat's entry: its time, then what changed (on a short line the change goes under the time) */
  .av-mini {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 12px;
    row-gap: 4px;
    min-height: 32px;
  }
  .av-mini .av-time {
    flex: 0 0 auto;
    min-width: 40px;
    text-align: left;
  }
  .av-mini__name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13px;
    line-height: 20px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .av-mini .av-change {
    flex: 0 0 auto;
  }
  .av-mini .av-msg {
    flex: 0 1 auto;
  }
  /* a phone's burst: the name is the content (it may take two lines), its time under it */
  :host([compact]) .av-mini:not(.is-repeat) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'name state'
      'time state';
    column-gap: 12px;
    padding: 4px 0;
  }
  /* the name needs the entry's width: the change goes under it, on the time's line (or on its own, under the time,
     when the two do not fit one line with 12 between them) */
  :host([compact]) .av-mini.is-stacked:not(.is-repeat) {
    grid-template-areas:
      'name name'
      'time state';
  }
  :host([compact]) .av-mini.is-stacked.is-apart:not(.is-repeat) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'name'
      'time'
      'state';
    justify-items: start;
  }
  :host([compact]) .av-mini:not(.is-repeat) .av-mini__name {
    grid-area: name;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
    /* no number alone on the last line ("bombilla / 18") */
    text-wrap: pretty;
  }
  :host([compact]) .av-mini:not(.is-repeat) .av-time {
    grid-area: time;
    font-size: 12px;
    line-height: 16px;
  }
  :host([compact]) .av-mini:not(.is-repeat) > .av-change,
  :host([compact]) .av-mini:not(.is-repeat) > .av-msg {
    grid-area: state;
  }
  .av-more {
    width: 100%;
    margin-top: 8px;
  }
`;
