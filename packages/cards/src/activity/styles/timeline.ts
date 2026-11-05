import { css } from 'lit';

/**
 * The timeline: "N new" in the pinned hour's band, the hours, the rows on their spine, the pills, and the start of
 * the day with the way on to the day before.
 */
export const timelineStyles = css`
  .av-fresh {
    position: sticky;
    top: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    height: 40px;
    margin-bottom: -40px;
    pointer-events: none;
  }
  .av-fresh__pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: var(--fluvy-radius-pill, 9999px);
    background: var(--fluvy-primary, var(--fluvy-accent));
    color: var(--fluvy-on-primary, var(--fluvy-text-on-accent));
    box-shadow:
      inset 0 0 0 1px var(--fluvy-primary-edge, transparent),
      var(--fluvy-shadow-lift);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    animation: av-pill 320ms var(--fv-spring, var(--fv-ease-out, ease-out)) both;
    cursor: pointer;
    pointer-events: auto;
  }
  .av-fresh__pill svg {
    width: 16px;
    height: 16px;
  }

  /* ---------- the timeline ---------- */
  .av-list {
    margin-top: 12px;
  }
  .av-list.is-filter {
    animation: av-dim 180ms var(--fv-ease, ease) both;
  }
  /* another period: the list leaves the way the page goes */
  .av-list.is-leaving.is-next {
    animation: av-leave-next 160ms var(--fv-ease-in, ease-in) both;
  }
  .av-list.is-leaving.is-prev {
    animation: av-leave-prev 160ms var(--fv-ease-in, ease-in) both;
  }
  /* an hour off screen is not laid out; its rows keep the room they will take */
  .av-section {
    margin: 0 -8px;
    padding: 0 8px;
    content-visibility: auto;
  }
  .av-section.is-last {
    content-visibility: visible;
  }
  .av-dayhead {
    margin: 12px 0 0;
    padding: 8px 0;
    font-size: 15px;
    line-height: 20px;
    font-weight: 600;
  }
  .av-dayhead::first-letter {
    text-transform: uppercase;
  }
  /* an hour: its time in the time column, a small node on the spine, its count and a hairline in the text column */
  .av-hour {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: var(--av-time) 40px minmax(0, 1fr);
    column-gap: 12px;
    align-items: center;
    height: 40px;
    margin: 0 -8px;
    padding: 0 8px;
    background: var(--av-ground);
    font-size: 13px;
    line-height: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    transition: box-shadow 180ms var(--fv-ease, ease);
  }
  .av-hour.is-stuck {
    box-shadow: 0 1px 0 var(--fluvy-border);
  }
  /* "N new" takes the pinned header's band: its count steps aside meanwhile */
  .av-hour__count {
    transition: opacity 160ms var(--fv-ease, ease);
  }
  .has-fresh .av-hour.is-stuck .av-hour__count {
    opacity: 0;
  }
  .av-hour__time {
    text-align: right;
    white-space: nowrap;
  }
  .av-hour__count {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-weight: 500;
    color: var(--fluvy-text-secondary);
    white-space: nowrap;
  }
  .av-hour__count::after {
    content: '';
    flex: 1 1 auto;
    height: 1px;
    background: var(--fluvy-border);
  }
  :host([compact]) .av-hour {
    display: flex;
    column-gap: 12px;
  }
  :host([compact]) .av-hour > .av-node {
    order: -1;
    flex: 0 0 40px;
  }
  :host([compact]) .av-hour__time {
    flex: 0 0 auto;
    text-align: left;
    margin-right: -4px;
  }
  :host([compact]) .av-hour__count {
    flex: 1 1 auto;
  }
  .av-hour__node {
    width: 8px;
    height: 8px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 2px solid var(--fluvy-border-strong);
    background: var(--av-ground);
    box-shadow: 0 0 0 4px var(--av-ground);
  }
  .av-row {
    --av-row: var(--av-ground);
    position: relative;
    display: grid;
    grid-template-columns: var(--av-time) 40px minmax(0, 1fr) auto;
    column-gap: 12px;
    align-items: center;
    min-height: 64px;
    box-sizing: border-box;
    margin: 0 -8px;
    padding: 12px 8px;
    border-radius: var(--fluvy-radius-control);
    background: var(--av-row);
    cursor: pointer;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color 180ms var(--fv-ease, ease),
      box-shadow 180ms var(--fv-ease, ease);
  }
  :host([compact]) .av-row {
    grid-template-columns: 40px minmax(0, 1fr) auto;
  }
  :host([compact]) .av-row > .av-time {
    display: none;
  }
  .av-row:focus-visible {
    box-shadow: inset 0 0 0 2px var(--fluvy-accent);
  }
  .av-row:active {
    --av-row: var(--fluvy-page-alt, var(--fluvy-card));
  }
  @media (hover: hover) {
    .av-row:hover {
      --av-row: var(--av-hover);
    }
    .av-day__titles:hover {
      background: color-mix(in srgb, var(--fluvy-text) 6%, transparent);
    }
  }
  /* the spine: each row's upper half joins what is above, its lower half what is below; one thread through the day */
  .av-row::before,
  .av-row::after,
  .av-hour::before,
  .av-hour::after,
  .av-detail::before,
  .av-end::before {
    content: '';
    position: absolute;
    left: var(--av-spine);
    width: 2px;
    background: var(--fluvy-border);
  }
  .av-row::before,
  .av-hour::before,
  .av-end::before {
    top: 0;
    height: 50%;
  }
  .av-row::after,
  .av-hour::after {
    top: 50%;
    bottom: 0;
  }
  .av-hour.is-top::before {
    display: none;
  }
  .av-row.is-gap::before,
  .av-row.is-gap-after::after,
  .av-hour.is-gap::before,
  .av-hour.is-gap::after,
  .av-detail.is-gap::before,
  .av-end.is-gap::before {
    background: repeating-linear-gradient(
      to bottom,
      var(--fluvy-border) 0 3px,
      transparent 3px 7px
    );
  }
  .av-row.is-entering {
    animation: av-rise 380ms var(--fv-ease-out, ease-out) both;
    animation-delay: calc(var(--i, 0) * 30ms);
  }
  /* a live entry opens its place from nothing (its clip has no vertical padding), the rows below slide down; the
     clip reaches the row's own margins, so the row — and its spine — is where every other row is */
  .av-grow {
    display: grid;
    grid-template-rows: 1fr;
    animation: av-open-row 320ms var(--fv-ease-out, ease-out) both;
  }
  .av-grow > * {
    min-height: 0;
    overflow: hidden;
  }
  .av-grow__clip {
    margin: 0 -8px;
    padding: 0 8px;
  }
  .av-row.is-fresh .av-node::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--fluvy-accent);
    animation: av-ring 1400ms var(--fv-ease-out, ease-out) both;
  }
  .av-time {
    font-size: 13px;
    line-height: 20px;
    font-weight: 500;
    color: var(--fluvy-text-secondary);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .av-node {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
  }
  .av-hour > .av-node {
    height: 40px;
  }
  .av-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--fluvy-border-strong);
    box-shadow: 0 0 0 4px var(--av-row);
    transition: box-shadow 180ms var(--fv-ease, ease);
  }
  /* the halo keeps the spine 4 px off the circle (the dots below wear the same one) and follows the row's colour */
  .fv-ico.av-circle {
    flex: 0 0 40px;
    width: 40px;
    height: 40px;
    box-shadow: 0 0 0 4px var(--av-row);
    transition: box-shadow 180ms var(--fv-ease, ease);
  }
  .fv-ico.av-circle svg,
  .fv-ico.av-circle ha-icon {
    width: 20px;
    height: 20px;
    --mdc-icon-size: 20px;
  }
  .fv-ico--neutral.av-circle {
    background: var(--fluvy-card);
    box-shadow:
      inset 0 0 0 1px var(--fluvy-border),
      0 0 0 4px var(--av-row);
  }
  .av-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .av-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 8px;
    row-gap: 4px;
    min-width: 0;
  }
  .av-name {
    min-width: 0;
    max-width: 100%;
    font-size: 15px;
    line-height: 20px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* "from › to" is one unit: it wraps as a whole; only a unit wider than its whole line breaks, after the arrow */
  .av-change {
    display: inline-flex;
    flex: none;
    flex-wrap: wrap;
    row-gap: 4px;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    white-space: nowrap;
  }
  /* the arrow is drawn 16 px in the 20 px line box (its box sits on the line, as the pills do) */
  .av-change > svg {
    flex: 0 0 auto;
    width: 16px;
    height: 20px;
    color: var(--fluvy-text-secondary);
  }
  /* the timeline's state pill: 20 tall on the name's line, 8 sides, the state's tone when it is on */
  .av-state {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-width: 0;
    max-width: 100%;
    height: 20px;
    box-sizing: border-box;
    padding: 0;
    border-radius: var(--fluvy-radius-pill, 9999px);
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
    color: var(--fluvy-text-secondary);
    font-size: 12px;
    line-height: 16px;
    font-weight: 600;
  }
  /* a value never ends in an ellipsis: its pill is sized to it (measured in layout) */
  .av-state__text {
    padding-inline: 8px;
    white-space: nowrap;
  }
  .av-state.is-on {
    background: var(--tone-fill);
    box-shadow: inset 0 0 0 1px var(--tone-border, transparent);
    color: var(--tone-on);
  }
  .av-state.is-off {
    outline: none;
    box-shadow: none;
    background: transparent;
    border: 1px dashed var(--fluvy-unavailable-border);
    color: var(--fluvy-unavailable);
  }
  /* the dashed edge is drawn inside the pill's width: its sides give up that pixel, the text keeps its room */
  .av-state.is-off .av-state__text {
    padding-inline: 7px;
  }
  .av-msg {
    min-width: 0;
    max-width: 100%;
    font-size: 13px;
    line-height: 20px;
    font-weight: 500;
    color: var(--fluvy-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .av-sub {
    display: flex;
    min-width: 0;
    font-size: 13px;
    line-height: 16px;
    font-weight: 500;
    color: var(--fluvy-text-secondary);
    font-variant-numeric: tabular-nums;
  }
  /* the time never gives way; the parts before the last keep their width (up to half the line); the last one — who
     did it — is the one that ends in an ellipsis on a short line */
  .av-sub__part {
    flex: 0 0 auto;
    min-width: 0;
    max-width: 50%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .av-sub__part:first-child {
    max-width: none;
  }
  .av-sub__part:last-child:not(:first-child) {
    flex: 0 1 auto;
    max-width: none;
  }
  .av-sub__sep {
    flex: 0 0 auto;
    margin: 0 4px;
  }
  .av-cause {
    color: var(--fluvy-text);
  }
  .av-cause svg {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-right: 4px;
    vertical-align: -1px;
    color: var(--fluvy-text-secondary);
  }
  .av-ago {
    font-size: 13px;
    line-height: 20px;
    font-weight: 500;
    color: var(--fluvy-text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .av-chevron {
    display: inline-flex;
    color: var(--fluvy-text-secondary);
    transition: transform 260ms var(--fv-ease-out, ease-out);
  }
  .av-chevron svg {
    width: 20px;
    height: 20px;
  }
  .av-row.is-open .av-chevron {
    transform: rotate(90deg);
  }

  /* ---------- the start of the day, and the room under it (the last hour can reach the top) ---------- */
  .av-end {
    position: relative;
    display: grid;
    grid-template-columns: var(--av-time) 40px minmax(0, 1fr);
    column-gap: 12px;
    align-items: center;
    height: 40px;
    margin: 0 -8px;
    padding: 0 8px;
  }
  :host([compact]) .av-end {
    grid-template-columns: 40px minmax(0, 1fr);
  }
  :host([compact]) .av-end > .av-time {
    display: none;
  }
  .av-end__node {
    width: 8px;
    height: 8px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 2px solid var(--fluvy-border-strong);
    background: var(--av-ground);
  }
  .av-end__text {
    font-size: 13px;
    line-height: 20px;
    font-weight: 600;
    color: var(--fluvy-text-secondary);
  }
  /* the way on to the day before, on the text column under the start of the day */
  .av-earlier {
    display: flex;
    margin: 16px 0 0 calc(var(--av-body) - 8px);
  }
  .av-earlier .fv-btn {
    max-width: 100%;
    gap: 4px;
  }
  .av-earlier svg {
    width: 20px;
    height: 20px;
    margin-left: -4px;
  }
  /* under the column (and under its card): the room that lets the last screen be the oldest hour and the start of
     the day (--av-tail: that hour and the cap, measured) */
  .av-foot {
    grid-column: 1;
    height: max(0px, calc(var(--av-view) - var(--av-pad) - var(--av-tail, 80px) - var(--av-inset)));
  }
`;
