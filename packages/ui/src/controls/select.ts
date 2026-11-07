import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { glyph } from '../glyphs.js';
import { haptic } from '../haptics.js';
import { reducedMotion } from '../motion.js';
import { baseStyles } from '../styles/index.js';
import { textWidth } from '../text.js';
import { zoomOf } from './zoom.js';

/** One thing the field may hold: its value, the label the list shows, a hint beside it ("Portuguese (Brazil)"). */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

/** `fluvy-change`: the value chosen, sent only when it differs from the one before. */
export interface SelectChangeDetail {
  readonly value: string;
}

/* the menu's geometry (menus.css): rows of 44 in a 4 padding, 4 under the field, 16 from the viewport's edges */
const ROW = 44;
const PAD = 4;
const GAP = 4;
const MARGIN = 16;
const MIN_WIDTH = 192;
/** A row's sides (12 each), the gap and the check beside its name (menus.css): an anchored list holds its names. */
const ROW_CHROME = 12 + 12 + 12 + 20;
/**
 * Every row up to nine is shown whole; from ten, eight rows and 24 of the ninth — the cut row says there is more, and
 * the menu stays on the 4 grid (half a row would not: the language menu has ten rows since Japanese).
 */
const MAX_ROWS = 9;
const CUT = 24;
const capHeight = (count: number): number =>
  count <= MAX_ROWS ? ROW * count : ROW * (MAX_ROWS - 1) + CUT;
const LEAVE_MS = 160;
/** Letters typed closer than this spell one word. */
const TYPE_AHEAD_MS = 500;
const PAGE = 5;

/** Letters as typed for matching: no case, no diacritics ("espanol" finds Español). */
const plain = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The menu element, which may or may not know the Popover API (older WebViews do not). */
type MenuElement = HTMLElement & { showPopover?: () => void };
/** Whether this browser has a top layer to put the menu in; asked at render time (a page may lose it for tests). */
const topLayer = (): boolean =>
  typeof (HTMLElement.prototype as MenuElement).showPopover === 'function';

/**
 * The dropdown: a field (`.fv-field`, as a button) holding the chosen label, opening a list of what it may hold.
 * The list is a popover in the top layer — over cards, columns, dialogs and Home Assistant's sidebar — placed
 * under the field, or over it near the foot of the page, as wide as the field; where the browser has no top
 * layer it is the same box, fixed in place. Dismissal is the field's own (a tap outside, a scroll, a resize,
 * Escape), so both worlds behave alike.
 *
 * Keys: closed, ↓ ↑ Enter Space Home End and any letter open it; open, ↓ ↑ move without wrapping, Home End
 * PageUp PageDown jump, Enter and Space choose, Tab chooses and moves on, Escape closes without a change,
 * letters find the next name that starts with them (a repeated letter cycles). The pointer activates the row
 * under it and a click chooses. Choosing ticks the haptics once.
 *
 * `value`, `options` (`SelectOption`), `label` (the accessible name; the visible label sits above, as a field's
 * does), `disabled`, `on-page` (the card's fill on the page's ground), `open` (reflected). Event: `fluvy-change`.
 *
 * `anchored`: no field of its own — the list opens from the element just before it (a card row's value button, which
 * keeps its face and opens it by setting `open`), from that element's end where it ends its row (else its start), and
 * is as wide as its longest name (192 at the least). The element lays out as nothing (`display: contents`); while the
 * list is open it has the focus and the keys, and gives the focus back to the button as it closes; the button says
 * whether it is open (`aria-expanded`, written here).
 */
export class FluvySelect extends LitElement {
  static override styles = [
    ...baseStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      :host([anchored]) {
        display: contents;
      }

      /* an anchored list at its row's end unfolds from its button's end */
      .fv-menu[data-align='end'] {
        transform-origin: top right;
      }

      .fv-menu[data-align='end'][data-placement='above'] {
        transform-origin: bottom right;
      }
    `,
  ];

  static override properties = {
    value: { type: String },
    options: { attribute: false },
    label: { type: String },
    disabled: { type: Boolean, reflect: true },
    onPage: { type: Boolean, attribute: 'on-page' },
    open: { type: Boolean, reflect: true },
    anchored: { type: Boolean, reflect: true },
  };

  declare value: string;
  declare options: readonly SelectOption[];
  declare label: string;
  declare disabled: boolean;
  declare onPage: boolean;
  declare open: boolean;
  declare anchored: boolean;

  /** The row the keys or the pointer are on (−1: none). */
  private active = -1;
  /** The menu is on its way out: drawn until its leave animation ends. */
  private leaving = false;
  private placement: 'below' | 'above' = 'below';
  private typed = '';
  private typedAt = 0;
  private pointerAt = { x: NaN, y: NaN };
  private leaveTimer = 0;
  private listening = false;
  /** The frame loop that keeps the menu on its field while open (0: none). */
  private following = 0;
  /** What was last written to the menu's style, so a frame that changes nothing writes nothing. */
  private placed = '';

  constructor() {
    super();
    this.value = '';
    this.options = [];
    this.label = '';
    this.disabled = false;
    this.onPage = false;
    this.open = false;
    this.anchored = false;
  }

  /* ---------- the model ---------- */

  private get selected(): number {
    return this.options.findIndex((option) => option.value === this.value);
  }

  private enabled(from: number, step: 1 | -1): number {
    for (let i = from; i >= 0 && i < this.options.length; i += step)
      if (!this.options[i]?.disabled) return i;
    return -1;
  }

  private get first(): number {
    return this.enabled(0, 1);
  }

  private get last(): number {
    return this.enabled(this.options.length - 1, -1);
  }

  /** The next enabled row `by` steps away (a page: up to 5), without wrapping. */
  private step(by: number): number {
    const dir: 1 | -1 = by < 0 ? -1 : 1;
    let index = this.active < 0 ? (dir > 0 ? this.first : this.last) : this.active;
    for (let n = Math.abs(by); n > 0; n -= 1) {
      const next = this.enabled(index + dir, dir);
      if (next < 0) break;
      index = next;
    }
    return index;
  }

  /* ---------- opening, choosing, closing ---------- */

  private show(at: number = this.selected): void {
    if (this.disabled || this.open) return;
    this.active = at >= 0 && !this.options[at]?.disabled ? at : this.first;
    this.open = true;
  }

  private choose(index: number): void {
    const option = this.options[index];
    if (!option || option.disabled) return;
    if (option.value !== this.value) {
      this.value = option.value;
      this.dispatchEvent(
        new CustomEvent<SelectChangeDetail>('fluvy-change', {
          detail: { value: option.value },
          bubbles: true,
          composed: true,
        }),
      );
      haptic(this, 'selection');
    }
    this.hide();
  }

  /** Closes; an anchored list that had the focus gives it back to its button. */
  private hide(): void {
    this.open = false;
    if (this.anchored && this.shadowRoot?.activeElement === this.menu)
      this.anchor?.focus({ preventScroll: true });
  }

  private left(): void {
    window.clearTimeout(this.leaveTimer);
    if (!this.leaving) return;
    this.leaving = false;
    this.active = -1;
    this.requestUpdate();
  }

  /* ---------- placement ---------- */

  private get menu(): MenuElement | null {
    return this.renderRoot.querySelector<MenuElement>('.fv-menu');
  }

  private get field(): HTMLButtonElement | null {
    return this.renderRoot.querySelector<HTMLButtonElement>('.fv-select');
  }

  /** The button an anchored list opens from: the element before this one. */
  private get anchor(): HTMLElement | null {
    return this.anchored ? (this.previousElementSibling as HTMLElement | null) : null;
  }

  /**
   * Where the menu goes, from the field's box and the viewport — set before it is shown, so it never jumps: under
   * the field when its rows fit there, else on the side with more room, as tall as that side allows (the rest
   * scrolls; one row at the least), as wide as the field — an anchored list as its longest name, from its button's
   * edge on the side of the row the button stands on. Written only when something differs from the last time. The
   * menu is laid out in the field's own pixels (a zoomed view zooms its top layer too), so the field's box and the
   * viewport are read in those.
   */
  private place(menu: MenuElement): void {
    const field = this.anchor ?? this.field;
    if (!field) return;
    const zoom = zoomOf(field);
    const visual = field.getBoundingClientRect();
    const rect = {
      top: visual.top / zoom,
      bottom: visual.bottom / zoom,
      left: visual.left / zoom,
      right: visual.right / zoom,
      width: visual.width / zoom,
    };
    const viewport = { width: window.innerWidth / zoom, height: window.innerHeight / zoom };
    const wanted = PAD * 2 + capHeight(Math.max(1, this.options.length));
    const below = viewport.height - MARGIN - (rect.bottom + GAP);
    const above = rect.top - GAP - MARGIN;
    const placement = wanted <= below || below >= above ? 'below' : 'above';
    const room = placement === 'below' ? below : above;
    const height = Math.max(PAD * 2 + ROW, Math.min(wanted, room));
    const top = placement === 'below' ? rect.bottom + GAP : rect.top - GAP - height;
    const width = Math.max(
      MIN_WIDTH,
      Math.min(this.anchored ? this.namesWidth() : rect.width, viewport.width - MARGIN * 2),
    );
    // an anchored list keeps to the side of its row its button stands on: a value at the row's end, its end
    const row = this.anchored ? field.parentElement?.getBoundingClientRect() : undefined;
    const end = row !== undefined && row.right - visual.right < visual.left - row.left;
    const from = end ? rect.right - width : rect.left;
    const left = Math.max(MARGIN, Math.min(from, viewport.width - MARGIN - width));
    const box = [top, left, width, height].map((n) => `${Math.round(n)}px`);
    const placed = `${placement} ${end ? 'end' : 'start'} ${box.join(' ')}`;
    if (placed === this.placed) return;
    this.placed = placed;
    this.placement = placement;
    menu.dataset['placement'] = placement;
    menu.dataset['align'] = end ? 'end' : 'start';
    const [t, l, w, h] = box as [string, string, string, string];
    menu.style.setProperty('--fv-menu-top', t);
    menu.style.setProperty('--fv-menu-left', l);
    menu.style.setProperty('--fv-menu-w', w);
    menu.style.setProperty('--fv-menu-h', h);
  }

  /** What an anchored list needs to hold its longest name whole: the name at 15/500, its row's sides, gap and check. */
  private namesWidth(): number {
    const widest = Math.max(
      0,
      ...this.options.map((option) => textWidth(option.label, { size: 15, weight: 500 })),
    );
    return Math.ceil(PAD * 2 + ROW_CHROME + widest);
  }

  /** While the menu is open its field may still be moving (a card animating in, a font landing): it follows. */
  private follow(): void {
    this.following = requestAnimationFrame(() => {
      const menu = this.menu;
      if (!this.open || !menu) return;
      this.place(menu);
      this.follow();
    });
  }

  /* ---------- keys ---------- */

  private readonly onKey = (event: KeyboardEvent): void => {
    if (this.disabled || event.ctrlKey || event.metaKey || event.altKey) return;
    const { key } = event;
    const letter = key.length === 1 && key !== ' ';
    if (!this.open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
        event.preventDefault();
        this.show();
      } else if (key === 'Home' || key === 'End') {
        event.preventDefault();
        this.show(key === 'Home' ? this.first : this.last);
      } else if (letter) {
        event.preventDefault();
        this.show();
        this.typeAhead(key);
      }
      return;
    }
    switch (key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.activate(this.step(key === 'ArrowDown' ? 1 : -1));
        return;
      case 'PageDown':
      case 'PageUp':
        event.preventDefault();
        this.activate(this.step(key === 'PageDown' ? PAGE : -PAGE));
        return;
      case 'Home':
      case 'End':
        event.preventDefault();
        this.activate(key === 'Home' ? this.first : this.last);
        return;
      case 'Enter':
        event.preventDefault();
        this.choose(this.active);
        return;
      case ' ':
        event.preventDefault();
        // a space inside a word being typed spells; alone, it chooses
        if (this.typed && performance.now() - this.typedAt < TYPE_AHEAD_MS) this.typeAhead(' ');
        else this.choose(this.active);
        return;
      case 'Tab':
        // the focus moves on as it should; the row it left on is the choice
        this.choose(this.active);
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.hide();
        return;
      default:
        if (letter) {
          event.preventDefault();
          this.typeAhead(key);
        }
    }
  };

  /**
   * An anchored list's keys, on the list: the field's, kept from the page (a letter that finds a name never reaches
   * Home Assistant's shortcuts); Tab goes on, as the focus does.
   */
  private readonly onMenuKey = (event: KeyboardEvent): void => {
    this.onKey(event);
    if (event.key !== 'Tab') event.stopPropagation();
  };

  /** The next name starting with what has been typed; the same letter again goes on to the next such name. */
  private typeAhead(letter: string): void {
    const now = performance.now();
    if (now - this.typedAt > TYPE_AHEAD_MS) this.typed = '';
    this.typedAt = now;
    this.typed += letter.toLowerCase();
    const repeated = this.typed.length > 1 && [...this.typed].every((c) => c === this.typed[0]);
    const needle = plain(repeated ? this.typed[0]! : this.typed);
    const n = this.options.length;
    // the search starts after the active row when a letter repeats (cycling), on it when a word grows
    const from = repeated || this.typed.length === 1 ? this.active + 1 : this.active;
    for (let i = 0; i < n; i += 1) {
      const index = (from + i + n) % n;
      const option = this.options[index];
      if (option && !option.disabled && plain(option.label).startsWith(needle)) {
        this.activate(index);
        return;
      }
    }
  }

  private activate(index: number): void {
    if (index < 0 || index === this.active) return;
    this.active = index;
    this.requestUpdate();
  }

  /* ---------- the pointer ---------- */

  private readonly onRowMove = (event: PointerEvent): void => {
    // a pointer resting under a menu that has just opened must not take the keys' row
    if (event.clientX === this.pointerAt.x && event.clientY === this.pointerAt.y) return;
    this.pointerAt = { x: event.clientX, y: event.clientY };
    const index = Number((event.currentTarget as HTMLElement).dataset['index']);
    if (!Number.isNaN(index)) this.activate(index);
  };

  private readonly onOutside = (event: Event): void => {
    if (!this.open) return;
    if (event.type === 'scroll' && this.menu && event.composedPath().includes(this.menu)) return;
    // a tap on an anchored list's button is the button's to answer (its click sets `open`)
    const path = event.composedPath();
    const anchor = this.anchor;
    if (event.type === 'pointerdown' && (path.includes(this) || (anchor && path.includes(anchor))))
      return;
    this.hide();
  };

  private listen(on: boolean): void {
    if (on === this.listening) return;
    this.listening = on;
    const method = on ? 'addEventListener' : 'removeEventListener';
    document[method]('pointerdown', this.onOutside, true);
    document[method]('scroll', this.onOutside, true);
    window[method]('resize', this.onOutside);
    cancelAnimationFrame(this.following);
    if (on) this.follow();
    else this.placed = '';
  }

  /* ---------- lifecycle ---------- */

  /** Opening and closing are `open` changing, from a key, a click, a tap outside or whoever holds the element. */
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    if (this.open) {
      window.clearTimeout(this.leaveTimer);
      this.leaving = false;
      // opened from outside (a key or a click already chose a row): start from the chosen one
      if (this.active < 0) this.active = this.selected >= 0 ? this.selected : this.first;
      this.toggleAttribute('reduced-motion', reducedMotion());
    } else if (changed.get('open')) {
      this.typed = '';
      if (reducedMotion()) {
        this.leaving = false;
        this.active = -1;
      } else {
        // the leave animation ends the menu; a safety timer stands in where no animation runs
        this.leaving = true;
        this.leaveTimer = window.setTimeout(() => this.left(), LEAVE_MS + 40);
      }
    }
  }

  /**
   * The menu is drawn while open or leaving; leaving the document takes it out of the top layer by itself. Opened
   * again on its way out, it stays where it is and plays its entrance once more.
   */
  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('open')) {
      this.listen(this.open);
      if (changed.get('open') !== undefined || this.open)
        this.anchor?.setAttribute('aria-expanded', String(this.open));
    }
    const menu = this.menu;
    if (!menu) return;
    if (this.open) {
      this.place(menu);
      if (changed.has('open')) {
        this.pointerAt = { x: NaN, y: NaN };
        menu.classList.remove('is-leaving');
        try {
          if (menu.showPopover && !menu.matches(':popover-open')) menu.showPopover();
        } catch {
          /* no top layer here: the menu stays where it is, fixed under its field */
        }
        // an anchored list takes the keys from its button while it is open
        if (this.anchored) menu.focus({ preventScroll: true });
      }
      menu
        .querySelector<HTMLElement>(`[data-index="${this.active}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    } else if (changed.has('open')) {
      menu.classList.add('is-leaving');
      menu.addEventListener('animationend', () => this.left(), { once: true });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.listen(false);
    window.clearTimeout(this.leaveTimer);
    this.open = false;
    this.leaving = false;
  }

  /* ---------- markup ---------- */

  /**
   * The list; out of the tab order (a list that scrolls — fourteen languages — would otherwise be a tab stop of its own).
   * An anchored one holds the focus while open, and says which row the keys are on itself: its active row is its ring.
   */
  private renderMenu(): TemplateResult {
    const anchored = this.anchored;
    return html`<div
      id="menu"
      class="fv-menu"
      tabindex="-1"
      data-own-focus
      role="listbox"
      popover=${topLayer() ? 'manual' : nothing}
      aria-label=${this.label}
      aria-activedescendant=${anchored && this.open && this.active >= 0 ? `opt-${this.active}` : nothing}
      data-placement=${this.placement}
      @keydown=${anchored ? this.onMenuKey : nothing}
    >
      ${this.options.map((option, index) => {
        const selected = option.value === this.value;
        return html`<div
          id="opt-${index}"
          class="fv-menu__item ${index === this.active ? 'is-active' : ''}"
          role="option"
          data-index=${index}
          aria-selected=${selected ? 'true' : 'false'}
          aria-disabled=${option.disabled ? 'true' : nothing}
          aria-describedby=${option.hint ? `hint-${index}` : nothing}
          @pointermove=${this.onRowMove}
          @click=${() => this.choose(index)}
        >
          <span class="fv-menu__name">${option.label}</span>
          ${
            option.hint
              ? html`<span id="hint-${index}" class="fv-menu__hint">${option.hint}</span>`
              : nothing
          }
          ${selected ? glyph('check') : nothing}
        </div>`;
      })}
    </div>`;
  }

  protected override render(): TemplateResult {
    const list = this.open || this.leaving ? this.renderMenu() : nothing;
    if (this.anchored) return html`${list}`;
    const chosen = this.options[this.selected];
    return html`<button
        class="fv-field fv-select ${this.onPage ? 'fv-field--on-page' : ''}"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-controls="menu"
        aria-activedescendant=${this.open && this.active >= 0 ? `opt-${this.active}` : nothing}
        aria-label=${this.label}
        ?disabled=${this.disabled}
        @click=${() => (this.open ? this.hide() : this.show())}
        @keydown=${this.onKey}
      >
        <span class="fv-field__input fv-select__value">${chosen?.label ?? this.value}</span>
        ${glyph('down')}
      </button>
      ${list}`;
  }
}

if (!customElements.get('fluvy-select')) customElements.define('fluvy-select', FluvySelect);

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-select': FluvySelect;
  }
}
