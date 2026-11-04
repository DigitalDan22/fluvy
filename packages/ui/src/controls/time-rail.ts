import { css, html, LitElement, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';
import { haptic } from '../haptics.js';
import { MotionMark, spring, type SpringHandle } from '../motion.js';
import { baseStyles } from '../styles/index.js';
import { clamp, trackDrag } from './pointer.js';
import { localPoint } from './zoom.js';

/** A moment picked on the rail: while the finger moves (`done` false) and where it lets go; `key` for the keyboard. */
export interface TimeRailDetail {
  readonly value: number;
  readonly done: boolean;
  readonly via: 'pointer' | 'key';
  /** The key that moved it (`Home`, `End`, the arrows, Page Up / Down). */
  readonly key?: string;
}

const QUARTER = 15 * 60 * 1000;
const HOUR = 4 * QUARTER;
const DAY = 24 * HOUR;
/** The knob (36, the vertical ruler's) stays whole inside the rail: half of it above the newest moment, half below. */
const KNOB = 36;
const INSET = KNOB / 2 + 4;
/** Ticks, bars and labels are whole or absent, never bitten by the knob: what reaches its ring, its 4 px halo and half
 * a stroke goes, as a whole. */
const HALO = KNOB / 2 + 5;
/** The lit stretch on the axis shows at least this far past the knob's halo (the part of the period on screen). */
const SPAN = 8;
/** The dotted future stops this far short of a tick it would cross. */
const CLEAR = 6;
/** A finger grabs the knob within its 52 px target; elsewhere on the rail it scrolls the page (and a tap jumps). */
const GRAB = 26;

/** A mark of the scale (a tick, a label, a bar) and the box it paints, in the rail's pixels. */
interface Mark {
  readonly node: SVGElement;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  under: boolean;
}

/**
 * The time rail: a period as a vertical ruler beside a timeline, the newest moment on top as the timeline reads. It
 * is the page's scrollbar: the part of the period on screen is the lit stretch of the ruler — drawn on the axis from
 * the knob down, and lighting the ticks and bars it covers — and the knob, the vertical ruler's 36, rides at the
 * moment at the top of the screen. Ticks every hour (a label every three) or, over a longer period, every day; on the
 * other side of the axis, how busy each stretch was. What the knob would cover is not bitten: it goes, whole, while
 * the knob is over it. Dragging the knob (a mouse anywhere on the rail) scrubs the period — the bubble says when and
 * how busy — and a tap jumps. It is felt as the lamps' rulers are: a touch when the knob is taken, a tick at every
 * hour it crosses (every day over a long period), a firmer one at either end. As a slider: ↑ ↓ a quarter of an hour,
 * Page Up / Page Down an hour, Home the newest, End the oldest.
 *
 * Times are milliseconds. `density` counts the entries per equal stretch of the period, oldest first; `densityKey`
 * names what it counts (a new key crossfades the histogram, the same key eases each bar to its new length). Events:
 * `fluvy-scrub` (`TimeRailDetail`) while scrubbing, on release and for each key.
 */
export class FluvyTimeRail extends LitElement {
  static override styles = [
    ...baseStyles,
    css`
      :host {
        position: relative;
        display: block;
        height: 100%;
        min-height: 240px;
        /* a finger scrolls the page over the rail; the knob takes it (see .fv-knob) */
        touch-action: pan-y;
        user-select: none;
        -webkit-user-select: none;
        cursor: pointer;
        outline: none;
        -webkit-tap-highlight-color: transparent;
        --knob-halo: var(--rail-ground, var(--primary-background-color, var(--fluvy-page)));
        /* the scale at rest: a quiet ink that still reads as a graphic (3 : 1 on the page); the lit part in the accent */
        --rail-mark: color-mix(in srgb, var(--fluvy-text-secondary) 80%, var(--knob-halo));
      }
      svg {
        position: absolute;
        inset: 0;
        overflow: visible;
      }
      .label {
        fill: var(--fluvy-text-secondary);
        font: 500 11px/16px var(--fluvy-font-sans);
        font-variant-numeric: tabular-nums;
        dominant-baseline: middle;
        text-anchor: end;
        transition:
          fill 180ms var(--fv-ease, ease),
          opacity 120ms var(--fv-ease, ease);
      }
      .label.is-near {
        fill: var(--fluvy-text);
      }
      .label.is-day {
        text-anchor: middle;
        font-weight: 600;
      }
      .tick {
        stroke: var(--rail-mark);
        stroke-width: 2;
        stroke-linecap: round;
        transition:
          stroke 140ms linear,
          opacity 120ms var(--fv-ease, ease);
      }
      .tick.is-on {
        stroke: var(--fluvy-accent);
      }
      /* the part of the period on screen, on the axis: from the knob to the foot of the screen */
      .span {
        stroke: var(--fluvy-accent);
        stroke-width: 2;
        stroke-linecap: round;
      }
      .future {
        stroke: var(--rail-mark);
        stroke-width: 2;
        stroke-linecap: round;
        stroke-dasharray: 0 6;
      }
      .now {
        fill: var(--fluvy-accent);
      }
      /* a bar is drawn at the stretch's full room and scaled to its count: a new count eases it to its length */
      .bar {
        fill: var(--rail-mark);
        transform-box: fill-box;
        transform-origin: left center;
        transition:
          fill 180ms var(--fv-ease, ease),
          opacity 120ms var(--fv-ease, ease),
          transform 280ms var(--fv-ease-out, ease-out);
      }
      .bar.is-on {
        fill: var(--fluvy-accent);
      }
      /* an outlier (a restart's hundreds) runs the whole room, broken by a notch: the day keeps its shape */
      .notch {
        fill: var(--knob-halo);
      }
      [data-under] {
        opacity: 0;
      }
      .bars {
        animation: fv-rail-in 420ms var(--fv-ease-out, ease-out) both;
      }
      .bars.is-old {
        animation: fv-rail-out 240ms var(--fv-ease, ease) both;
      }
      .fv-knob {
        top: 0;
        left: 0;
        width: ${KNOB}px;
        height: ${KNOB}px;
        --tone-ink: var(--fluvy-accent);
        touch-action: none;
        cursor: grab;
        will-change: transform;
        transition: box-shadow 180ms var(--fv-ease, ease);
      }
      /* the knob's target is 52: a finger that lands on its edge still holds it */
      .fv-knob::before {
        content: '';
        position: absolute;
        inset: -8px;
        border-radius: 50%;
      }
      :host([scrubbing]) .fv-knob {
        cursor: grabbing;
        box-shadow:
          0 0 0 2px var(--tone-ink),
          0 8px 18px -4px rgb(0 0 0 / 0.32),
          0 0 0 6px var(--knob-halo);
      }
      :host(:focus-visible) .fv-knob {
        box-shadow:
          0 0 0 2px var(--tone-ink),
          0 0 0 5px var(--knob-halo),
          0 0 0 7px var(--fluvy-accent);
      }
      /* the bubble on the knob's left, its tail on the knob */
      .fv-bubble {
        top: 0;
        left: auto;
        right: calc(100% - var(--axis) + ${KNOB / 2 + 12}px);
        padding: 0 12px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-50%) scale(0.92);
        transform-origin: right center;
        transition:
          opacity 160ms var(--fv-ease, ease),
          transform 220ms var(--fv-spring, ease),
          visibility 0s linear 160ms;
      }
      .fv-bubble::after {
        left: auto;
        right: -5px;
        top: 50%;
        bottom: auto;
        margin-top: -6px;
      }
      :host([scrubbing]) .fv-bubble,
      :host(:focus-visible) .fv-bubble {
        opacity: 1;
        visibility: visible;
        transform: translateY(-50%) scale(1);
        transition-delay: 0s;
      }
      /* a phone's rail: while a finger holds it, a strip of the page's ground widens it, the hours (a week's days) on it */
      .hours {
        position: absolute;
        top: 0;
        right: 100%;
        bottom: 0;
        width: 52px;
        /* what it covers fades into it, never cut on a hard edge */
        background: linear-gradient(to right, transparent, var(--knob-halo) 12px);
        pointer-events: none;
        opacity: 0;
        transform: translateX(6px);
        transition:
          opacity 160ms var(--fv-ease, ease),
          transform 220ms var(--fv-ease-out, ease-out);
      }
      :host([scrubbing]) .hours {
        opacity: 1;
        transform: none;
      }
      .hours span {
        position: absolute;
        right: 4px;
        height: 20px;
        padding: 0 6px;
        margin-top: -10px;
        border-radius: 10px;
        background: var(--fluvy-card);
        box-shadow: inset 0 0 0 1px var(--fluvy-border);
        color: var(--fluvy-text-secondary);
        font: 600 11px/20px var(--fluvy-font-sans);
        font-variant-numeric: tabular-nums;
      }
      @keyframes fv-rail-in {
        from {
          opacity: 0;
          transform: translateX(-6px);
        }
      }
      @keyframes fv-rail-out {
        to {
          opacity: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .bars,
        .bar,
        .fv-bubble,
        .hours {
          animation: none;
          transition: none;
        }
      }
    `,
  ];

  static override properties = {
    start: { type: Number },
    end: { type: Number },
    value: { type: Number },
    valueEnd: { type: Number, attribute: 'value-end' },
    now: { type: Number },
    density: { attribute: false },
    densityKey: { type: String, attribute: 'density-key' },
    compact: { type: Boolean, reflect: true },
    label: { type: String },
    formatLabel: { attribute: false },
    formatBubble: { attribute: false },
    height: { state: true },
    scrubbing: { type: Boolean, reflect: true },
    old: { state: true },
  };

  declare start: number;
  declare end: number;
  /** The moment at the top of what is on screen (where the knob rides). */
  declare value: number;
  /** The moment at the bottom of what is on screen (the lit stretch ends there); 0: nothing lit. */
  declare valueEnd: number;
  declare now: number;
  declare density: readonly number[];
  /** What the density counts (a period and its sources): another key is another histogram, and they crossfade. */
  declare densityKey: string;
  /** A phone's rail: 44 wide, no labels (they show while a finger holds it), a thinner histogram. */
  declare compact: boolean;
  /** The slider's accessible name. */
  declare label: string;
  /** A label for a tick: an hour ("06"), or a day's in a long period ("17"). */
  declare formatLabel: (time: number, day: boolean) => string;
  declare formatBubble: (time: number) => string;
  declare height: number;
  declare scrubbing: boolean;
  /** The histogram on its way out (a new one is coming in over it). */
  declare old: { readonly key: string; readonly density: readonly number[] } | undefined;

  private knobAt = 0;
  private knob?: SpringHandle;
  private resize?: ResizeObserver;
  private stopDrag?: () => void;
  /** How the last press began: a finger away from the knob scrolls the page, and its tap jumps on click. */
  private pressType = '';
  /** The tick the knob was last on while scrubbing (an hour, or a day), and whether it was at an end. */
  private tick = Number.NaN;
  private atEnd = false;
  /** The scale's marks, measured once drawn: the knob hides the ones it would cover. */
  private marks: Mark[] = [];
  /** Where the lit stretch ends on the axis (the foot of the screen). */
  private spanEnd = Number.NaN;
  private fading = 0;

  constructor() {
    super();
    // the person's reduced motion reaches inside this control's own shadow root
    new MotionMark(this);
    this.start = 0;
    this.end = HOUR;
    this.value = HOUR;
    this.valueEnd = 0;
    this.now = 0;
    this.density = [];
    this.densityKey = '';
    this.compact = false;
    this.label = '';
    this.formatLabel = (time) => String(new Date(time).getHours()).padStart(2, '0');
    this.formatBubble = (time) => new Date(time).toLocaleTimeString();
    this.height = 0;
    this.scrubbing = false;
    this.old = undefined;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.tabIndex = 0;
    // the knob's ring is the focus indicator: the shared sheet's outline would square the whole rail
    this.setAttribute('data-own-focus', '');
    this.setAttribute('role', 'slider');
    this.setAttribute('aria-orientation', 'vertical');
    this.resize = new ResizeObserver(([entry]) => {
      if (entry) this.height = Math.round(entry.contentRect.height);
    });
    this.resize.observe(this);
    this.stopDrag = trackDrag(this, {
      start: (sample) => {
        this.pressType = sample.event.pointerType;
        // a mouse scrubs from anywhere (a click in the track jumps, as in any scrollbar); a finger only from the knob
        if (sample.event.pointerType !== 'mouse' && !this.nearKnob(sample.event)) return false;
        this.scrubbing = true;
        this.tick = Number.NaN;
        this.atEnd = false;
        haptic(this, 'light');
        this.scrub(sample.event, false);
        return true;
      },
      move: (sample) => this.scrub(sample.event, false),
      end: (sample) => {
        this.scrubbing = false;
        this.scrub(sample.event, true);
      },
    });
    this.addEventListener('click', this.onTap);
    this.addEventListener('keydown', this.onKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resize?.disconnect();
    this.stopDrag?.();
    this.knob?.stop();
    window.clearTimeout(this.fading);
    this.removeEventListener('click', this.onTap);
    this.removeEventListener('keydown', this.onKey);
  }

  /* ---------- geometry ---------- */

  private get axis(): number {
    return this.compact ? 20 : 44;
  }

  private get days(): boolean {
    return this.end - this.start > 36 * HOUR;
  }

  /** The y of a moment: the newest on top. */
  private y(time: number): number {
    const span = Math.max(1, this.end - this.start);
    const usable = Math.max(1, this.height - 2 * INSET);
    return INSET + ((this.end - clamp(time, this.start, this.end)) / span) * usable;
  }

  private timeAt(y: number): number {
    const span = Math.max(1, this.end - this.start);
    const usable = Math.max(1, this.height - 2 * INSET);
    return this.end - (clamp(y - INSET, 0, usable) / usable) * span;
  }

  /** A pointer's height on the rail, in the rail's own pixels (what `timeAt` and the knob are measured in). */
  private railY(event: MouseEvent): number {
    return localPoint(this, event).y;
  }

  private nearKnob(event: PointerEvent): boolean {
    return Math.abs(this.railY(event) - this.knobAt) <= GRAB;
  }

  /** Each tick of the scale: an hour's (a day's over a long period), newest first. */
  private ticks(): number[] {
    const days = this.days;
    const step = (time: number): number => {
      const next = new Date(time);
      if (days) next.setDate(next.getDate() + 1);
      else next.setHours(next.getHours() + 1);
      return next.getTime();
    };
    const first = new Date(this.start);
    first.setMinutes(0, 0, 0);
    if (days) first.setHours(0);
    let time = first.getTime();
    if (time < this.start) time = step(time);
    const times: number[] = [];
    for (; time <= this.end; time = step(time)) times.push(time);
    return times;
  }

  /* ---------- interaction ---------- */

  private emit(detail: TimeRailDetail): void {
    this.dispatchEvent(
      new CustomEvent<TimeRailDetail>('fluvy-scrub', { detail, bubbles: true, composed: true }),
    );
  }

  /** The feel of a scrub: a tick at every hour (or day) the knob crosses, a firmer one when it reaches an end. */
  private feel(value: number): void {
    const end = value <= this.start || value >= this.end;
    if (end && !this.atEnd) haptic(this, 'medium');
    this.atEnd = end;
    const tick = Math.floor((this.end - value) / (this.days ? DAY : HOUR));
    if (!end && !Number.isNaN(this.tick) && tick !== this.tick) haptic(this, 'selection');
    this.tick = tick;
  }

  private scrub(event: PointerEvent, done: boolean): void {
    const value = this.timeAt(this.railY(event));
    if (!done) this.feel(value);
    // the knob follows the finger exactly while it moves; the timeline behind it glides
    this.moveKnob(this.y(value), false);
    this.value = value;
    this.emit({ value, done, via: 'pointer' });
  }

  /** A finger's tap away from the knob (it scrolled nothing): the period jumps there. */
  private readonly onTap = (event: MouseEvent): void => {
    if (this.pressType === 'mouse' || this.pressType === '') return;
    this.pressType = '';
    const value = this.timeAt(this.railY(event));
    haptic(this, 'light');
    this.value = value;
    this.emit({ value, done: true, via: 'pointer' });
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    const step =
      event.key === 'ArrowUp'
        ? QUARTER
        : event.key === 'ArrowDown'
          ? -QUARTER
          : event.key === 'PageUp'
            ? HOUR
            : event.key === 'PageDown'
              ? -HOUR
              : undefined;
    let value: number | undefined;
    if (step !== undefined) value = clamp(this.value + step, this.start, this.end);
    else if (event.key === 'Home') value = this.end;
    else if (event.key === 'End') value = this.start;
    if (value === undefined) return;
    event.preventDefault();
    this.value = value;
    this.emit({ value, done: true, via: 'key', key: event.key });
  };

  /**
   * Puts the knob (its bubble, the top of the lit stretch) at `at`, and hides — whole — every mark it would cover;
   * the nodes are looked up each time.
   */
  private readonly place = (at: number): void => {
    this.knobAt = at;
    // whole pixels: a knob between two is blurred (it moves a pixel at a time, which reads as smooth)
    const y = Math.round(at);
    const node = this.renderRoot.querySelector<HTMLElement>('.fv-knob');
    const bubble = this.renderRoot.querySelector<HTMLElement>('.fv-bubble');
    const span = this.renderRoot.querySelector<SVGLineElement>('.span');
    if (node) node.style.transform = `translate(${this.axis - KNOB / 2}px, ${y - KNOB / 2}px)`;
    if (bubble) bubble.style.top = `${y}px`;
    if (span) {
      span.setAttribute('y1', String(y));
      span.setAttribute('y2', String(this.spanFoot(y)));
    }
    this.cover(y);
  };

  /** Every mark within the knob's halo goes, as a whole (and comes back when the knob moves on). */
  private cover(y: number): void {
    const cx = this.axis;
    for (const mark of this.marks) {
      const dx = Math.max(mark.x0 - cx, 0, cx - mark.x1);
      const dy = Math.max(mark.y0 - y, 0, y - mark.y1);
      const under = dx * dx + dy * dy < HALO * HALO;
      if (under === mark.under) continue;
      mark.under = under;
      mark.node.toggleAttribute('data-under', under);
    }
  }

  /**
   * Where the lit stretch ends on the axis for a knob at `y`: the foot of the screen, and always past the knob's halo
   * (even when the screen holds less than that of the period). One formula for the template and for each frame, so
   * the line is never drawn at nothing.
   */
  private spanFoot(y: number): number {
    const end = Math.min(
      this.height - 1,
      Math.max(Number.isNaN(this.spanEnd) ? y : this.spanEnd, y + HALO + SPAN),
    );
    return Math.max(y, end);
  }

  /** The marks as drawn (their painted boxes), after each render. */
  private collect(): void {
    this.marks = [];
    for (const node of this.renderRoot.querySelectorAll<SVGGraphicsElement>('[data-box]')) {
      const [x0, y0, x1, y1] = (node.getAttribute('data-box') ?? '').split(' ').map(Number);
      if (x1! <= x0!) continue;
      this.marks.push({
        node,
        x0: x0!,
        y0: y0!,
        x1: x1!,
        y1: y1!,
        under: node.hasAttribute('data-under'),
      });
    }
    // a label's box is its glyphs' (measured, once drawn)
    for (const node of this.renderRoot.querySelectorAll<SVGTextElement>('text.label')) {
      if (typeof node.getBBox !== 'function') continue;
      const box = node.getBBox();
      if (!box.width) continue;
      this.marks.push({
        node,
        x0: box.x,
        y0: box.y,
        x1: box.x + box.width,
        y1: box.y + box.height,
        under: node.hasAttribute('data-under'),
      });
    }
  }

  /** The knob rides a spring towards where it belongs (at once while a finger holds it). */
  private moveKnob(y: number, glide: boolean): void {
    this.knob ??= spring(this.knobAt, this.place, { stiffness: 420, damping: 0.86 });
    if (glide) this.knob.set(y);
    else this.knob.jump(y);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // another histogram: the one on screen fades out under the new one coming in
    const before = changed.get('densityKey') as string | undefined;
    if (changed.has('densityKey') && before !== undefined) {
      const previous = (changed.get('density') as readonly number[] | undefined) ?? this.density;
      window.clearTimeout(this.fading);
      if (previous.some(Boolean)) {
        this.old = { key: before, density: previous };
        this.fading = window.setTimeout(() => {
          this.old = undefined;
        }, 260);
      }
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.setAttribute('aria-label', this.label);
    this.setAttribute('aria-valuemin', String(this.start));
    this.setAttribute('aria-valuemax', String(this.end));
    this.setAttribute('aria-valuenow', String(Math.round(this.value)));
    this.setAttribute('aria-valuetext', this.formatBubble(this.value));
    this.collect();
    // the knob follows the timeline on a spring, unless a finger holds it
    if (
      !this.scrubbing &&
      (changed.has('value') ||
        changed.has('height') ||
        changed.has('start') ||
        changed.has('end') ||
        changed.has('compact'))
    )
      this.moveKnob(this.y(this.value), changed.has('value') && !changed.has('height'));
    else this.place(this.knobAt);
  }

  /* ---------- drawing ---------- */

  /** The lit stretch: what is on screen, from the knob down to the bottom of the screen. */
  private lit(y: number): boolean {
    if (!this.valueEnd || this.valueEnd >= this.value) return false;
    return y >= this.y(this.value) - 0.5 && y <= this.y(this.valueEnd) + 0.5;
  }

  /**
   * How busy each stretch was, on the far side of the axis, growing outward (whole pixels). A square root keeps a
   * quiet quarter readable beside a busy one, and the scale is the busy stretches' (twice the 90th percentile), not an
   * outlier's: a restart's hundreds run the whole room, with a notch, and the rest of the day keeps its shape.
   */
  private drawDensity(counts: readonly number[], key: string, old: boolean): TemplateResult {
    const room = this.compact ? 12 : 26;
    const left = this.axis + (this.compact ? 10 : 18);
    const span = Math.max(1, this.end - this.start);
    const slot = counts.length ? span / counts.length : span;
    const busy = counts.filter(Boolean).sort((a, b) => a - b);
    const p90 = busy[Math.floor(0.9 * (busy.length - 1))] ?? 1;
    const scale = Math.max(1, Math.min(busy[busy.length - 1] ?? 1, 2 * p90));
    const bars = repeat(
      counts,
      (_, index) => index,
      (count, index) => {
        const from = this.start + index * slot;
        const top = Math.round(this.y(from + slot));
        const height = Math.max(1, Math.round(this.y(from)) - top - 1);
        const over = count > scale;
        const width = count
          ? over
            ? room
            : Math.max(2, Math.round(room * Math.sqrt(count / scale)))
          : 0;
        const on = !old && this.lit(top + height / 2);
        return svg`<rect class="bar ${on ? 'is-on' : ''}" x=${left} y=${top} width=${room} height=${height} rx="1"
            style="transform: scaleX(${width / room})"
            data-box=${old ? nothing : `${left} ${top} ${left + width} ${top + height}`} />${
              over
                ? svg`<rect class="notch" x=${left + room - 6} y=${top} width="2" height=${height} />`
                : nothing
            }`;
      },
    );
    // keyed by what it counts: a histogram held while the next period loads is the same group, not a new entrance
    return svg`${keyed(`${key}|${counts.length}`, svg`<g class="bars ${old ? 'is-old' : ''}">${bars}</g>`)}`;
  }

  /** Hour ticks (a day's over a long period) centred on the axis, lit where the screen is; labels on the near side. */
  private drawScale(times: readonly number[]): TemplateResult[] {
    const marks: TemplateResult[] = [];
    const axis = this.axis;
    const major = this.compact ? 12 : 16;
    const minor = this.compact ? 6 : 8;
    const days = this.days;
    for (const [index, time] of times.entries()) {
      const y = Math.round(this.y(time));
      const isMajor = days || new Date(time).getHours() % 3 === 0;
      const length = isMajor ? major : minor;
      const x0 = axis - length / 2;
      marks.push(
        svg`<line class="tick ${this.lit(y) ? 'is-on' : ''}" x1=${x0} x2=${x0 + length} y1=${y} y2=${y}
          data-box=${`${x0} ${y - 1} ${x0 + length} ${y + 1}`} />`,
      );
      if (this.compact) continue;
      if (!days && isMajor) {
        const near = Math.abs(this.value - time) < 1.5 * HOUR;
        marks.push(
          svg`<text class="label ${near ? 'is-near' : ''}" x=${axis - major / 2 - 8} y=${y}>${this.formatLabel(time, false)}</text>`,
        );
      }
      // a long period: each day's name in the middle of its band
      const next = times[index + 1];
      if (days && time < this.end) {
        const band = Math.min(next ?? this.end, this.end);
        const middle = band - Math.min(DAY, band - time) / 2;
        if (middle > this.start)
          marks.push(
            svg`<text class="label is-day" x=${(axis - major / 2) / 2} y=${Math.round(this.y(middle))}>${this.formatLabel(time, true)}</text>`,
          );
      }
    }
    return marks;
  }

  /** What is still to come today: dotted down the axis to now, stopping short of each tick it would cross. */
  private drawFuture(times: readonly number[], nowY: number): TemplateResult[] {
    const lines: TemplateResult[] = [];
    const axis = this.axis;
    const foot = nowY - CLEAR;
    let from = INSET;
    // from the top of the rail down to now, the newest ticks first: each one the line reaches (the last included, even
    // when it sits within the last stretch above now) is cleared by 6
    for (const time of [...times].reverse()) {
      const y = Math.round(this.y(time));
      if (y >= nowY) break;
      const to = Math.min(foot, y - CLEAR);
      if (to > from)
        lines.push(svg`<line class="future" x1=${axis} x2=${axis} y1=${from} y2=${to} />`);
      from = Math.max(from, y + CLEAR);
    }
    if (foot > from)
      lines.push(svg`<line class="future" x1=${axis} x2=${axis} y1=${from} y2=${foot} />`);
    return lines;
  }

  /** A phone's hours (a week's days), shown beside the rail while a finger holds it. */
  private drawHours(times: readonly number[]): TemplateResult | typeof nothing {
    if (!this.compact) return nothing;
    const days = this.days;
    const marks: TemplateResult[] = [];
    for (const [index, time] of times.entries()) {
      if (days) {
        if (time >= this.end) continue;
        const band = Math.min(times[index + 1] ?? this.end, this.end);
        const middle = band - (band - time) / 2;
        marks.push(
          html`<span style="top:${Math.round(this.y(middle))}px"
            >${this.formatLabel(time, true)}</span
          >`,
        );
      } else if (new Date(time).getHours() % 6 === 0)
        marks.push(
          html`<span style="top:${Math.round(this.y(time))}px"
            >${this.formatLabel(time, false)}</span
          >`,
        );
    }
    return html`<div class="hours" aria-hidden="true" data-measure="value">${marks}</div>`;
  }

  protected override render(): TemplateResult {
    if (!this.height) return html``;
    const axis = this.axis;
    const times = this.ticks();
    const nowY =
      this.now && this.now > this.start && this.now < this.end
        ? Math.round(this.y(this.now))
        : undefined;
    const lit = !!this.valueEnd && this.valueEnd < this.value;
    this.spanEnd = lit ? Math.round(this.y(this.valueEnd)) : Number.NaN;
    const y = Math.round(this.knobAt);
    return html`<svg width="100%" height=${this.height} aria-hidden="true">
        ${
          nowY !== undefined
            ? svg`${this.drawFuture(times, nowY)}<circle class="now" cx=${axis} cy=${nowY} r="3" />`
            : nothing
        }
        <line class="span" x1=${axis} x2=${axis} y1=${y} y2=${this.spanFoot(y)} />
        ${this.drawScale(times)}
        ${this.old ? this.drawDensity(this.old.density, this.old.key, true) : nothing}
        ${this.drawDensity(this.density, this.densityKey, false)}
      </svg>
      ${this.drawHours(times)}
      <span class="fv-knob" data-measure="value"></span>
      <span class="fv-bubble" style="--axis:${axis}px" data-measure="value"
        >${this.formatBubble(this.value)}</span
      >`;
  }
}

if (!customElements.get('fluvy-time-rail')) customElements.define('fluvy-time-rail', FluvyTimeRail);
