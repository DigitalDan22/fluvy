import { glyph } from '@fluvy/ui';
import { css, html, nothing, type TemplateResult } from 'lit';
import { type TextRuler } from './fit.js';

/*
 * What ends a list row where it is a button: an action's word ("Run", "Install"), a value ("06:45"), a select's option
 * that opens its list (#96). What ends a row is never cut, so the rows' circles give way first, then the button goes
 * under the name. The helpers' and the updates' rows, and a select's row on any card that lists entities.
 */

/** A row button's sides: its words plus 16 on either side, on the 4 grid (`fitPills`). */
export const BUTTON_SIDES = 32;
/** A value's chevron where its list opens from it, 4 after its words (`rowEndStyles`). */
const CHEVRON = 4 + 16;
/** A row's 44 circle and the 12 gaps on either side of its words. */
const ROW_SIDES = 44 + 12 + 12;
/** The least a row's name may have beside an action before the circles give way to it (the name itself when shorter). */
const NAME_MIN = 96;

/** What ends a list row: a button's words ("Run", "06:45", "Kitchen"), or the width of what else does (a switch). */
export interface RowEnd {
  readonly name: string;
  readonly button?: string;
  readonly end?: number;
  /** The line under the name: its first segment holds the same room as the name ("Sets at 20:12"). */
  readonly sub?: string;
  /** The button is a value's, capped at `valueCap`: it holds within the cap too, or the row gives way as for its name. */
  readonly capped?: boolean;
  /** The button opens a list (a long select's): its chevron beside its words. */
  readonly menu?: boolean;
}

/** A row button as `fitPills` lays it out: its words and its sides, and its chevron where a list opens from it. */
export const buttonWidth = (ruler: TextRuler, text: string, menu = false): number =>
  ruler.pill('fv-btn > in-value__text', text, BUTTON_SIDES + (menu ? CHEVRON : 0));

/**
 * The most a row's value button may take, as `rowEndStyles` caps `.in-value`: 68 % of the row less the circle's room
 * (68, the circle and its gaps), less the one gap once the row gave the circle to its name — down to the 4 grid, as
 * the browser rounds it.
 */
export const valueCap = (width: number, bare: boolean): number =>
  Math.floor((0.68 * width - (bare ? 12 : ROW_SIDES)) / 4) * 4;

/**
 * Whether a list's rows keep their circles. What ends a row is never cut — an action's word, a value's button, a
 * switch — so a row whose end would leave its name under 96 (or under the name itself) gives the circle's room to the
 * name, and every row of the list with it, so the names keep one column: the rows' rule (`HeadFit.rowsKeepIcon`).
 */
export function rowsKeepIcon(ruler: TextRuler, width: number, rows: readonly RowEnd[]): boolean {
  return rows.every((row) => holds(ruler, width, false, row));
}

/**
 * Whether a row puts its end under its name: where even without its circle the end would leave the name — or its
 * line's first segment — under 96 (or under itself), or would not hold within its cap: a German "Installieren" at
 * 211, the sun's "Above horizon", a date at a third of a section. The words then have the row, the end the line under
 * them, as wide as it is.
 */
export const rowStacks = (ruler: TextRuler, width: number, row: RowEnd): boolean =>
  !holds(ruler, width, true, row) ||
  !holds(ruler, width, true, { ...row, name: row.sub?.split(' · ')[0] ?? '' }, 'fv-row__sub');

/**
 * Whether a row's name keeps its room beside what ends it, with its circle (the end has the row less the circle and
 * the gaps) or without (`bare`: less the one gap), and a capped end holds within its cap.
 */
const holds = (
  ruler: TextRuler,
  width: number,
  bare: boolean,
  { name, button = '', end, capped, menu }: RowEnd,
  cls = 'fv-row__title',
): boolean => {
  const pill = end ?? buttonWidth(ruler, button, menu);
  return (
    (!capped || pill <= valueCap(width, bare)) &&
    width - (bare ? 12 : ROW_SIDES) - pill >= Math.min(NAME_MIN, ruler.width(cls, name))
  );
};

/**
 * The sheet's content-sized row button (44 in a row, text + 16 px sides on the 4 grid). `label` is the
 * accessible name: a card holds several "Run" and several "Install", each must say what it acts on.
 * `name`: the words are a name (a select's chosen option) and may end in an ellipsis where the row is narrow;
 * otherwise they are an action's word, never cut: the row's name gives way to it. `menu`: a list opens from it, its
 * chevron after the words unless `chevron` says it gave way (the list says on it whether it is open).
 */
export function rowButton(
  kind: 'quiet' | 'link',
  text: string,
  label: string,
  onClick: (event: Event) => void,
  disabled = false,
  name = false,
  menu = false,
  chevron = menu,
): TemplateResult {
  return html`<button
    class="fv-btn fv-btn--${kind} in-value ${name ? '' : 'in-value--action'}"
    data-control
    data-target
    data-fit=${BUTTON_SIDES}
    aria-label=${label}
    aria-haspopup=${menu ? 'listbox' : nothing}
    aria-expanded=${menu ? 'false' : nothing}
    ?disabled=${disabled}
    @click=${onClick}
  >
    <span class="in-value__text" data-name=${name ? '' : nothing}>${text}</span
    >${chevron ? glyph('down') : nothing}
  </button>`;
}

/** A row button, on any card's rows: its 44, its cap, a value's chevron and the list that opens from it. */
export const rowEndStyles = css`
  /* an editable value wears the link-button shape, 44 tall in its row; a very long one gives way to the name, never
     the reverse — its cap on the 4 grid, so a capped button keeps whole pixels (valueCap mirrors the two caps: a date
     takes its figures where its month's name would not hold) */
  .in-value {
    height: 44px;
    max-width: round(down, calc(68% - 68px), 4px);
  }

  /* a row that gave its circle to its name gives the button the circle's room too */
  .fv-row--bare > .in-value:not(.in-value--action) {
    max-width: round(down, calc(68% - 12px), 4px);
  }

  /* …and under the name, the whole row (after the cap's rule, which it ties on specificity) */
  .fv-row--bare.fv-row--stack > .in-value {
    max-width: 100%;
  }

  /* where even without its circle the button would leave the name under its room, it goes under the name, at the
     words' start, 8 under them: the row grows */
  .fv-row--stack:has(> .in-value) {
    flex-wrap: wrap;
    row-gap: 8px;
    height: auto;
    min-height: 60px;
    padding: 8px 0;
  }

  .fv-row--stack:has(> .in-value) > .fv-row__text {
    flex-basis: 100%;
  }

  /* an action's word ("Install", "Run") is never cut: its button keeps its measured width, uncapped */
  .in-value--action {
    flex: none;
    max-width: none;
  }

  .in-value__text {
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }

  /* a value its list opens from (#96): a 16 chevron 4 after its words, turned over while the list is open; the list
     itself lays out as nothing, before and after its file arrives */
  .in-value[aria-haspopup] {
    gap: 4px;
  }

  .in-value[aria-haspopup] > svg {
    width: 16px;
    height: 16px;
    transition: transform 180ms var(--fv-ease, ease);
  }

  .in-value[aria-expanded='true'] > svg {
    transform: rotate(180deg);
  }

  [anchored] {
    display: contents;
  }
`;
